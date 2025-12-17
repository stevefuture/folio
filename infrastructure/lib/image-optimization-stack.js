"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageOptimizationStack = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const iam = require("aws-cdk-lib/aws-iam");
class ImageOptimizationStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // S3 bucket for processed images cache
        const processedBucket = new s3.Bucket(this, 'ProcessedImagesBucket', {
            versioned: false,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            lifecycleRules: [
                {
                    id: 'DeleteProcessedImages',
                    status: s3.LifecycleRuleStatus.ENABLED,
                    expiration: cdk.Duration.days(30) // Cache processed images for 30 days
                }
            ]
        });
        // IAM role for image processing Lambda
        const imageProcessingRole = new iam.Role(this, 'ImageProcessingRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ],
            inlinePolicies: {
                S3Access: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:GetObjectVersion'
                            ],
                            resources: [`${props.sourceBucket.bucketArn}/*`]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:PutObject',
                                's3:PutObjectAcl'
                            ],
                            resources: [`${processedBucket.bucketArn}/*`]
                        })
                    ]
                })
            }
        });
        // Image processing Lambda function
        this.imageFunction = new lambda.Function(this, 'ImageOptimizationFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('../backend/image-optimization'),
            role: imageProcessingRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 1024,
            environment: {
                SOURCE_BUCKET: props.sourceBucket.bucketName,
                PROCESSED_BUCKET: processedBucket.bucketName,
                ENABLE_WEBP: 'true',
                ENABLE_AVIF: 'true',
                MAX_WIDTH: '2048',
                MAX_HEIGHT: '2048',
                QUALITY: '85'
            },
            layers: [
                // Sharp layer for image processing
                lambda.LayerVersion.fromLayerVersionArn(this, 'SharpLayer', `arn:aws:lambda:${this.region}:634166935893:layer:sharp:1`)
            ]
        });
        // Origin Access Control for processed images bucket
        const processedOac = new cloudfront.OriginAccessControl(this, 'ProcessedImagesOAC', {
            description: 'OAC for processed images bucket',
            originAccessControlOriginType: cloudfront.OriginAccessControlOriginType.S3,
            signing: cloudfront.Signing.SIGV4_ALWAYS
        });
        // CloudFront distribution for image optimization
        this.imageDistribution = new cloudfront.Distribution(this, 'ImageDistribution', {
            comment: 'Image optimization distribution',
            defaultBehavior: {
                origin: new origins.HttpOrigin(`${this.imageFunction.functionName}.lambda-url.${this.region}.on.aws`, {
                    customHeaders: {
                        'x-forwarded-host': 'images.example.com'
                    }
                }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                cachePolicy: new cloudfront.CachePolicy(this, 'ImageCachePolicy', {
                    cachePolicyName: `ImageOptimization-${props.environment || 'default'}`,
                    comment: 'Cache policy for optimized images',
                    defaultTtl: cdk.Duration.days(7),
                    maxTtl: cdk.Duration.days(365),
                    minTtl: cdk.Duration.seconds(0),
                    keyBehavior: cloudfront.CacheKeyBehavior.all(),
                    headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Accept', 'Accept-Encoding', 'CloudFront-Viewer-Country'),
                    queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList('w', 'h', 'q', 'f', 'fit', 'auto'),
                    enableAcceptEncodingGzip: true,
                    enableAcceptEncodingBrotli: true
                }),
                compress: true,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS
            },
            additionalBehaviors: {
                '/cached/*': {
                    origin: origins.S3BucketOrigin.withOriginAccessControl(processedBucket, {
                        originAccessControl: processedOac
                    }),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                    compress: true
                }
            },
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            enableIpv6: true,
            httpVersion: cloudfront.HttpVersion.HTTP2_AND_3
        });
        // Lambda Function URL for direct invocation
        const functionUrl = this.imageFunction.addFunctionUrl({
            authType: lambda.FunctionUrlAuthType.NONE,
            cors: {
                allowCredentials: false,
                allowedHeaders: ['*'],
                allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.HEAD],
                allowedOrigins: ['*'],
                maxAge: cdk.Duration.days(1)
            }
        });
        // S3 bucket policy for processed images OAC
        processedBucket.addToResourcePolicy(new iam.PolicyStatement({
            sid: 'AllowCloudFrontServicePrincipal',
            effect: iam.Effect.ALLOW,
            principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
            actions: ['s3:GetObject'],
            resources: [`${processedBucket.bucketArn}/*`],
            conditions: {
                StringEquals: {
                    'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.imageDistribution.distributionId}`
                }
            }
        }));
        // Outputs
        new cdk.CfnOutput(this, 'ImageDistributionDomain', {
            value: this.imageDistribution.distributionDomainName,
            description: 'Image optimization CloudFront domain',
            exportName: `ImageOptimization-${props.environment || 'default'}-Domain`
        });
        new cdk.CfnOutput(this, 'ImageFunctionUrl', {
            value: functionUrl.url,
            description: 'Image optimization function URL',
            exportName: `ImageOptimization-${props.environment || 'default'}-FunctionUrl`
        });
        new cdk.CfnOutput(this, 'ProcessedBucketName', {
            value: processedBucket.bucketName,
            description: 'Processed images S3 bucket',
            exportName: `ImageOptimization-${props.environment || 'default'}-ProcessedBucket`
        });
    }
}
exports.ImageOptimizationStack = ImageOptimizationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW1hZ2Utb3B0aW1pemF0aW9uLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaW1hZ2Utb3B0aW1pemF0aW9uLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyxpREFBaUQ7QUFDakQseUNBQXlDO0FBQ3pDLHlEQUF5RDtBQUN6RCw4REFBOEQ7QUFDOUQsMkNBQTJDO0FBUTNDLE1BQWEsc0JBQXVCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFJbkQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQztRQUMxRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qix1Q0FBdUM7UUFDdkMsTUFBTSxlQUFlLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSx1QkFBdUIsRUFBRTtZQUNuRSxTQUFTLEVBQUUsS0FBSztZQUNoQixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLHVCQUF1QjtvQkFDM0IsTUFBTSxFQUFFLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPO29CQUN0QyxVQUFVLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMscUNBQXFDO2lCQUN4RTthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBRUgsdUNBQXVDO1FBQ3ZDLE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUNwRSxTQUFTLEVBQUUsSUFBSSxHQUFHLENBQUMsZ0JBQWdCLENBQUMsc0JBQXNCLENBQUM7WUFDM0QsZUFB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VixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ2pELEtBQUssRUFBRSxJQUFJLENBQUMsaUJBQWlCLENBQUMsc0JBQXNCO1lBQ3BELFdBQVcsRUFBRSxzQ0FBc0M7WUFDbkQsVUFBVSxFQUFFLHFCQUFxQixLQUFLLENBQUMsV0FBVyxJQUFJLFNBQVMsU0FBUztTQUN6RSxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxXQUFXLENBQUMsR0FBRztZQUN0QixXQUFXLEVBQUUsaUNBQWlDO1lBQzlDLFVBQVUsRUFBRSxxQkFBcUIsS0FBSyxDQUFDLFdBQVcsSUFBSSxTQUFTLGNBQWM7U0FDOUUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxxQkFBcUIsRUFBRTtZQUM3QyxLQUFLLEVBQUUsZUFBZSxDQUFDLFVBQVU7WUFDakMsV0FBVyxFQUFFLDRCQUE0QjtZQUN6QyxVQUFVLEVBQUUscUJBQXFCLEtBQUssQ0FBQyxXQUFXLElBQUksU0FBUyxrQkFBa0I7U0FDbEYsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBakxELHdEQWlMQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBJbWFnZU9wdGltaXphdGlvblN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHNvdXJjZUJ1Y2tldDogczMuQnVja2V0O1xuICBlbnZpcm9ubWVudD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEltYWdlT3B0aW1pemF0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgaW1hZ2VGdW5jdGlvbjogbGFtYmRhLkZ1bmN0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgaW1hZ2VEaXN0cmlidXRpb246IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBJbWFnZU9wdGltaXphdGlvblN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFMzIGJ1Y2tldCBmb3IgcHJvY2Vzc2VkIGltYWdlcyBjYWNoZVxuICAgIGNvbnN0IHByb2Nlc3NlZEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1Byb2Nlc3NlZEltYWdlc0J1Y2tldCcsIHtcbiAgICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlUHJvY2Vzc2VkSW1hZ2VzJyxcbiAgICAgICAgICBzdGF0dXM6IHMzLkxpZmVjeWNsZVJ1bGVTdGF0dXMuRU5BQkxFRCxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCkgLy8gQ2FjaGUgcHJvY2Vzc2VkIGltYWdlcyBmb3IgMzAgZGF5c1xuICAgICAgICB9XG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBJQU0gcm9sZSBmb3IgaW1hZ2UgcHJvY2Vzc2luZyBMYW1iZGFcbiAgICBjb25zdCBpbWFnZVByb2Nlc3NpbmdSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdJbWFnZVByb2Nlc3NpbmdSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJylcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBTM0FjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbidcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYCR7cHJvcHMuc291cmNlQnVja2V0LmJ1Y2tldEFybn0vKmBdXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdEFjbCdcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYCR7cHJvY2Vzc2VkQnVja2V0LmJ1Y2tldEFybn0vKmBdXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEltYWdlIHByb2Nlc3NpbmcgTGFtYmRhIGZ1bmN0aW9uXG4gICAgdGhpcy5pbWFnZUZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnSW1hZ2VPcHRpbWl6YXRpb25GdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2ltYWdlLW9wdGltaXphdGlvbicpLFxuICAgICAgcm9sZTogaW1hZ2VQcm9jZXNzaW5nUm9sZSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDEwMjQsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTT1VSQ0VfQlVDS0VUOiBwcm9wcy5zb3VyY2VCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgUFJPQ0VTU0VEX0JVQ0tFVDogcHJvY2Vzc2VkQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIEVOQUJMRV9XRUJQOiAndHJ1ZScsXG4gICAgICAgIEVOQUJMRV9BVklGOiAndHJ1ZScsXG4gICAgICAgIE1BWF9XSURUSDogJzIwNDgnLFxuICAgICAgICBNQVhfSEVJR0hUOiAnMjA0OCcsXG4gICAgICAgIFFVQUxJVFk6ICc4NSdcbiAgICAgIH0sXG4gICAgICBsYXllcnM6IFtcbiAgICAgICAgLy8gU2hhcnAgbGF5ZXIgZm9yIGltYWdlIHByb2Nlc3NpbmdcbiAgICAgICAgbGFtYmRhLkxheWVyVmVyc2lvbi5mcm9tTGF5ZXJWZXJzaW9uQXJuKFxuICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgJ1NoYXJwTGF5ZXInLFxuICAgICAgICAgIGBhcm46YXdzOmxhbWJkYToke3RoaXMucmVnaW9ufTo2MzQxNjY5MzU4OTM6bGF5ZXI6c2hhcnA6MWBcbiAgICAgICAgKVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gT3JpZ2luIEFjY2VzcyBDb250cm9sIGZvciBwcm9jZXNzZWQgaW1hZ2VzIGJ1Y2tldFxuICAgIGNvbnN0IHByb2Nlc3NlZE9hYyA9IG5ldyBjbG91ZGZyb250Lk9yaWdpbkFjY2Vzc0NvbnRyb2wodGhpcywgJ1Byb2Nlc3NlZEltYWdlc09BQycsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnT0FDIGZvciBwcm9jZXNzZWQgaW1hZ2VzIGJ1Y2tldCcsXG4gICAgICBvcmlnaW5BY2Nlc3NDb250cm9sT3JpZ2luVHlwZTogY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NDb250cm9sT3JpZ2luVHlwZS5TMyxcbiAgICAgIHNpZ25pbmc6IGNsb3VkZnJvbnQuU2lnbmluZy5TSUdWNF9BTFdBWVNcbiAgICB9KTtcblxuICAgIC8vIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIGZvciBpbWFnZSBvcHRpbWl6YXRpb25cbiAgICB0aGlzLmltYWdlRGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdJbWFnZURpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGNvbW1lbnQ6ICdJbWFnZSBvcHRpbWl6YXRpb24gZGlzdHJpYnV0aW9uJyxcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IG5ldyBvcmlnaW5zLkh0dHBPcmlnaW4oYCR7dGhpcy5pbWFnZUZ1bmN0aW9uLmZ1bmN0aW9uTmFtZX0ubGFtYmRhLXVybC4ke3RoaXMucmVnaW9ufS5vbi5hd3NgLCB7XG4gICAgICAgICAgY3VzdG9tSGVhZGVyczoge1xuICAgICAgICAgICAgJ3gtZm9yd2FyZGVkLWhvc3QnOiAnaW1hZ2VzLmV4YW1wbGUuY29tJ1xuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LkhUVFBTX09OTFksXG4gICAgICAgIGNhY2hlUG9saWN5OiBuZXcgY2xvdWRmcm9udC5DYWNoZVBvbGljeSh0aGlzLCAnSW1hZ2VDYWNoZVBvbGljeScsIHtcbiAgICAgICAgICBjYWNoZVBvbGljeU5hbWU6IGBJbWFnZU9wdGltaXphdGlvbi0ke3Byb3BzLmVudmlyb25tZW50IHx8ICdkZWZhdWx0J31gLFxuICAgICAgICAgIGNvbW1lbnQ6ICdDYWNoZSBwb2xpY3kgZm9yIG9wdGltaXplZCBpbWFnZXMnLFxuICAgICAgICAgIGRlZmF1bHRUdGw6IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgICAgIG1heFR0bDogY2RrLkR1cmF0aW9uLmRheXMoMzY1KSxcbiAgICAgICAgICBtaW5UdGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgICAgIGtleUJlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlS2V5QmVoYXZpb3IuYWxsKCksXG4gICAgICAgICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5hbGxvd0xpc3QoXG4gICAgICAgICAgICAnQWNjZXB0JyxcbiAgICAgICAgICAgICdBY2NlcHQtRW5jb2RpbmcnLFxuICAgICAgICAgICAgJ0Nsb3VkRnJvbnQtVmlld2VyLUNvdW50cnknXG4gICAgICAgICAgKSxcbiAgICAgICAgICBxdWVyeVN0cmluZ0JlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlUXVlcnlTdHJpbmdCZWhhdmlvci5hbGxvd0xpc3QoXG4gICAgICAgICAgICAndycsICdoJywgJ3EnLCAnZicsICdmaXQnLCAnYXV0bydcbiAgICAgICAgICApLFxuICAgICAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nR3ppcDogdHJ1ZSxcbiAgICAgICAgICBlbmFibGVBY2NlcHRFbmNvZGluZ0Jyb3RsaTogdHJ1ZVxuICAgICAgICB9KSxcbiAgICAgICAgY29tcHJlc3M6IHRydWUsXG4gICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlNcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XG4gICAgICAgICcvY2FjaGVkLyonOiB7XG4gICAgICAgICAgb3JpZ2luOiBvcmlnaW5zLlMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NDb250cm9sKHByb2Nlc3NlZEJ1Y2tldCwge1xuICAgICAgICAgICAgb3JpZ2luQWNjZXNzQ29udHJvbDogcHJvY2Vzc2VkT2FjXG4gICAgICAgICAgfSksXG4gICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuSFRUUFNfT05MWSxcbiAgICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcbiAgICAgICAgICBjb21wcmVzczogdHJ1ZVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgcHJpY2VDbGFzczogY2xvdWRmcm9udC5QcmljZUNsYXNzLlBSSUNFX0NMQVNTXzEwMCxcbiAgICAgIGVuYWJsZUlwdjY6IHRydWUsXG4gICAgICBodHRwVmVyc2lvbjogY2xvdWRmcm9udC5IdHRwVmVyc2lvbi5IVFRQMl9BTkRfM1xuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIEZ1bmN0aW9uIFVSTCBmb3IgZGlyZWN0IGludm9jYXRpb25cbiAgICBjb25zdCBmdW5jdGlvblVybCA9IHRoaXMuaW1hZ2VGdW5jdGlvbi5hZGRGdW5jdGlvblVybCh7XG4gICAgICBhdXRoVHlwZTogbGFtYmRhLkZ1bmN0aW9uVXJsQXV0aFR5cGUuTk9ORSxcbiAgICAgIGNvcnM6IHtcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogZmFsc2UsXG4gICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtsYW1iZGEuSHR0cE1ldGhvZC5HRVQsIGxhbWJkYS5IdHRwTWV0aG9kLkhFQURdLFxuICAgICAgICBhbGxvd2VkT3JpZ2luczogWycqJ10sXG4gICAgICAgIG1heEFnZTogY2RrLkR1cmF0aW9uLmRheXMoMSlcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFMzIGJ1Y2tldCBwb2xpY3kgZm9yIHByb2Nlc3NlZCBpbWFnZXMgT0FDXG4gICAgcHJvY2Vzc2VkQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgc2lkOiAnQWxsb3dDbG91ZEZyb250U2VydmljZVByaW5jaXBhbCcsXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjbG91ZGZyb250LmFtYXpvbmF3cy5jb20nKV0sXG4gICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbYCR7cHJvY2Vzc2VkQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAnQVdTOlNvdXJjZUFybic6IGBhcm46YXdzOmNsb3VkZnJvbnQ6OiR7dGhpcy5hY2NvdW50fTpkaXN0cmlidXRpb24vJHt0aGlzLmltYWdlRGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbklkfWBcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pKTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSW1hZ2VEaXN0cmlidXRpb25Eb21haW4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5pbWFnZURpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdJbWFnZSBvcHRpbWl6YXRpb24gQ2xvdWRGcm9udCBkb21haW4nLFxuICAgICAgZXhwb3J0TmFtZTogYEltYWdlT3B0aW1pemF0aW9uLSR7cHJvcHMuZW52aXJvbm1lbnQgfHwgJ2RlZmF1bHQnfS1Eb21haW5gXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnSW1hZ2VGdW5jdGlvblVybCcsIHtcbiAgICAgIHZhbHVlOiBmdW5jdGlvblVybC51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0ltYWdlIG9wdGltaXphdGlvbiBmdW5jdGlvbiBVUkwnLFxuICAgICAgZXhwb3J0TmFtZTogYEltYWdlT3B0aW1pemF0aW9uLSR7cHJvcHMuZW52aXJvbm1lbnQgfHwgJ2RlZmF1bHQnfS1GdW5jdGlvblVybGBcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdQcm9jZXNzZWRCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHByb2Nlc3NlZEJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdQcm9jZXNzZWQgaW1hZ2VzIFMzIGJ1Y2tldCcsXG4gICAgICBleHBvcnROYW1lOiBgSW1hZ2VPcHRpbWl6YXRpb24tJHtwcm9wcy5lbnZpcm9ubWVudCB8fCAnZGVmYXVsdCd9LVByb2Nlc3NlZEJ1Y2tldGBcbiAgICB9KTtcbiAgfVxufVxuIl19