"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DevStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const logs = require("aws-cdk-lib/aws-logs");
class DevStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Cost-optimized S3 bucket for dev
        const devBucket = new s3.Bucket(this, 'DevPortfolioBucket', {
            bucketName: `portfolio-dev-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Allow easy cleanup
            autoDeleteObjects: true, // Automatically delete objects on stack deletion
            versioning: false, // No versioning for dev to save costs
            lifecycleRules: [
                {
                    id: 'dev-cleanup',
                    enabled: true,
                    expiration: cdk.Duration.days(30) // Auto-delete old files
                }
            ],
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
        });
        // Minimal DynamoDB table for dev
        const devTable = new dynamodb.Table(this, 'DevPortfolioTable', {
            tableName: `PortfolioData-dev`,
            partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Cost-effective for dev
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Allow easy cleanup
            pointInTimeRecovery: false, // No PITR for dev to save costs
            // Minimal GSI for dev
            globalSecondaryIndexes: [
                {
                    indexName: 'GSI1',
                    partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
                    sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
                    projectionType: dynamodb.ProjectionType.KEYS_ONLY // Minimize storage costs
                }
            ]
        });
        // Cost-optimized Lambda function
        const devApiFunction = new lambda.Function(this, 'DevApiFunction', {
            functionName: `portfolio-api-dev`,
            runtime: lambda.Runtime.NODEJS_18_X,
            architecture: lambda.Architecture.ARM_64, // 20% cost savings
            handler: 'index.handler',
            code: lambda.Code.fromAsset('../backend/portfolio-api'),
            memorySize: 512, // Smaller memory for dev
            timeout: cdk.Duration.seconds(30), // Shorter timeout
            environment: {
                TABLE_NAME: devTable.tableName,
                BUCKET_NAME: devBucket.bucketName,
                ENVIRONMENT: 'dev'
            },
            logRetention: logs.RetentionDays.ONE_WEEK, // Short retention for dev
            deadLetterQueueEnabled: false, // No DLQ for dev
            reservedConcurrentExecutions: 5 // Limit concurrency for cost control
        });
        // Grant permissions
        devTable.grantReadWriteData(devApiFunction);
        devBucket.grantReadWrite(devApiFunction);
        // Minimal API Gateway for dev
        const devApi = new apigateway.RestApi(this, 'DevPortfolioApi', {
            restApiName: 'portfolio-api-dev',
            description: 'Development API for Photography Portfolio',
            deployOptions: {
                stageName: 'dev',
                throttlingRateLimit: 100, // Lower limits for dev
                throttlingBurstLimit: 200,
                loggingLevel: apigateway.MethodLoggingLevel.ERROR, // Minimal logging
                dataTraceEnabled: false, // No detailed tracing for dev
                metricsEnabled: false // No detailed metrics for dev
            },
            endpointConfiguration: {
                types: [apigateway.EndpointType.REGIONAL] // Regional only for dev
            }
        });
        // API integration
        const lambdaIntegration = new apigateway.LambdaIntegration(devApiFunction);
        devApi.root.addProxy({
            defaultIntegration: lambdaIntegration,
            anyMethod: true
        });
        // Cost-optimized CloudFront distribution
        const devDistribution = new cloudfront.Distribution(this, 'DevDistribution', {
            comment: 'Dev Portfolio Distribution',
            defaultBehavior: {
                origin: new origins.S3Origin(devBucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                compress: true
            },
            additionalBehaviors: {
                '/api/*': {
                    origin: new origins.RestApiOrigin(devApi),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL
                }
            },
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // US/Europe only for cost savings
            enableLogging: false, // No access logs for dev
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021
        });
        // Outputs
        new cdk.CfnOutput(this, 'DevBucketName', {
            value: devBucket.bucketName,
            description: 'Dev S3 bucket name'
        });
        new cdk.CfnOutput(this, 'DevTableName', {
            value: devTable.tableName,
            description: 'Dev DynamoDB table name'
        });
        new cdk.CfnOutput(this, 'DevApiUrl', {
            value: devApi.url,
            description: 'Dev API Gateway URL'
        });
        new cdk.CfnOutput(this, 'DevDistributionUrl', {
            value: `https://${devDistribution.distributionDomainName}`,
            description: 'Dev CloudFront distribution URL'
        });
        new cdk.CfnOutput(this, 'DevDistributionId', {
            value: devDistribution.distributionId,
            description: 'Dev CloudFront distribution ID'
        });
        // Cost estimation output
        new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
            value: '$3-8 per month when running, $0 when stopped',
            description: 'Estimated monthly cost for dev environment'
        });
    }
}
exports.DevStack = DevStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGV2LXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZGV2LXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyx5Q0FBeUM7QUFDekMseURBQXlEO0FBQ3pELDhEQUE4RDtBQUM5RCxxREFBcUQ7QUFDckQsaURBQWlEO0FBQ2pELHlEQUF5RDtBQUN6RCw2Q0FBNkM7QUFPN0MsTUFBYSxRQUFTLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDckMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFvQjtRQUM1RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixtQ0FBbUM7UUFDbkMsTUFBTSxTQUFTLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUMxRCxVQUFVLEVBQUUsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLENBQUMsVUFBVSxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFO1lBQ25FLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxxQkFBcUI7WUFDL0QsaUJBQWlCLEVBQUUsSUFBSSxFQUFFLGlEQUFpRDtZQUMxRSxVQUFVLEVBQUUsS0FBSyxFQUFFLHNDQUFzQztZQUN6RCxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLGFBQWE7b0JBQ2pCLE9BQU8sRUFBRSxJQUFJO29CQUNiLFVBQVUsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQyx3QkFBd0I7aUJBQzNEO2FBQ0Y7WUFDRCxnQkFBZ0IsRUFBRSxLQUFLO1lBQ3ZCLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTO1NBQ2xELENBQUMsQ0FBQztRQUVILGlDQUFpQztRQUNqQyxNQUFNLFFBQVEsR0FBRyxJQUFJLFFBQVEsQ0FBQyxLQUFLLENB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U0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLFNBQVMsQ0FBQyxVQUFVO1lBQzNCLFdBQVcsRUFBRSxvQkFBb0I7U0FDbEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxTQUFTO1lBQ3pCLFdBQVcsRUFBRSx5QkFBeUI7U0FDdkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDbkMsS0FBSyxFQUFFLE1BQU0sQ0FBQyxHQUFHO1lBQ2pCLFdBQVcsRUFBRSxxQkFBcUI7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1QyxLQUFLLEVBQUUsV0FBVyxlQUFlLENBQUMsc0JBQXNCLEVBQUU7WUFDMUQsV0FBVyxFQUFFLGlDQUFpQztTQUMvQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzNDLEtBQUssRUFBRSxlQUFlLENBQUMsY0FBYztZQUNyQyxXQUFXLEVBQUUsZ0NBQWdDO1NBQzlDLENBQUMsQ0FBQztRQUVILHlCQUF5QjtRQUN6QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzlDLEtBQUssRUFBRSw4Q0FBOEM7WUFDckQsV0FBVyxFQUFFLDRDQUE0QztTQUMxRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE3SUQsNEJBNklDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtYXBpZ2F0ZXdheSc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbnRlcmZhY2UgRGV2U3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZG9tYWluPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRGV2U3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogRGV2U3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gQ29zdC1vcHRpbWl6ZWQgUzMgYnVja2V0IGZvciBkZXZcbiAgICBjb25zdCBkZXZCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdEZXZQb3J0Zm9saW9CdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgcG9ydGZvbGlvLWRldi0ke2Nkay5Bd3MuQUNDT1VOVF9JRH0tJHtjZGsuQXdzLlJFR0lPTn1gLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gQWxsb3cgZWFzeSBjbGVhbnVwXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSwgLy8gQXV0b21hdGljYWxseSBkZWxldGUgb2JqZWN0cyBvbiBzdGFjayBkZWxldGlvblxuICAgICAgdmVyc2lvbmluZzogZmFsc2UsIC8vIE5vIHZlcnNpb25pbmcgZm9yIGRldiB0byBzYXZlIGNvc3RzXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdkZXYtY2xlYW51cCcsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCkgLy8gQXV0by1kZWxldGUgb2xkIGZpbGVzXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiBmYWxzZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTExcbiAgICB9KTtcblxuICAgIC8vIE1pbmltYWwgRHluYW1vREIgdGFibGUgZm9yIGRldlxuICAgIGNvbnN0IGRldlRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdEZXZQb3J0Zm9saW9UYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYFBvcnRmb2xpb0RhdGEtZGV2YCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnUEsnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnU0snLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCwgLy8gQ29zdC1lZmZlY3RpdmUgZm9yIGRldlxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSwgLy8gQWxsb3cgZWFzeSBjbGVhbnVwXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5OiBmYWxzZSwgLy8gTm8gUElUUiBmb3IgZGV2IHRvIHNhdmUgY29zdHNcbiAgICAgIC8vIE1pbmltYWwgR1NJIGZvciBkZXZcbiAgICAgIGdsb2JhbFNlY29uZGFyeUluZGV4ZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGluZGV4TmFtZTogJ0dTSTEnLFxuICAgICAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnR1NJMVBLJywgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcbiAgICAgICAgICBzb3J0S2V5OiB7IG5hbWU6ICdHU0kxU0snLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgICAgIHByb2plY3Rpb25UeXBlOiBkeW5hbW9kYi5Qcm9qZWN0aW9uVHlwZS5LRVlTX09OTFkgLy8gTWluaW1pemUgc3RvcmFnZSBjb3N0c1xuICAgICAgICB9XG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBDb3N0LW9wdGltaXplZCBMYW1iZGEgZnVuY3Rpb25cbiAgICBjb25zdCBkZXZBcGlGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ0RldkFwaUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgcG9ydGZvbGlvLWFwaS1kZXZgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBhcmNoaXRlY3R1cmU6IGxhbWJkYS5BcmNoaXRlY3R1cmUuQVJNXzY0LCAvLyAyMCUgY29zdCBzYXZpbmdzXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL2JhY2tlbmQvcG9ydGZvbGlvLWFwaScpLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLCAvLyBTbWFsbGVyIG1lbW9yeSBmb3IgZGV2XG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksIC8vIFNob3J0ZXIgdGltZW91dFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEFCTEVfTkFNRTogZGV2VGFibGUudGFibGVOYW1lLFxuICAgICAgICBCVUNLRVRfTkFNRTogZGV2QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIEVOVklST05NRU5UOiAnZGV2J1xuICAgICAgfSxcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLCAvLyBTaG9ydCByZXRlbnRpb24gZm9yIGRldlxuICAgICAgZGVhZExldHRlclF1ZXVlRW5hYmxlZDogZmFsc2UsIC8vIE5vIERMUSBmb3IgZGV2XG4gICAgICByZXNlcnZlZENvbmN1cnJlbnRFeGVjdXRpb25zOiA1IC8vIExpbWl0IGNvbmN1cnJlbmN5IGZvciBjb3N0IGNvbnRyb2xcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zXG4gICAgZGV2VGFibGUuZ3JhbnRSZWFkV3JpdGVEYXRhKGRldkFwaUZ1bmN0aW9uKTtcbiAgICBkZXZCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoZGV2QXBpRnVuY3Rpb24pO1xuXG4gICAgLy8gTWluaW1hbCBBUEkgR2F0ZXdheSBmb3IgZGV2XG4gICAgY29uc3QgZGV2QXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnRGV2UG9ydGZvbGlvQXBpJywge1xuICAgICAgcmVzdEFwaU5hbWU6ICdwb3J0Zm9saW8tYXBpLWRldicsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RldmVsb3BtZW50IEFQSSBmb3IgUGhvdG9ncmFwaHkgUG9ydGZvbGlvJyxcbiAgICAgIGRlcGxveU9wdGlvbnM6IHtcbiAgICAgICAgc3RhZ2VOYW1lOiAnZGV2JyxcbiAgICAgICAgdGhyb3R0bGluZ1JhdGVMaW1pdDogMTAwLCAvLyBMb3dlciBsaW1pdHMgZm9yIGRldlxuICAgICAgICB0aHJvdHRsaW5nQnVyc3RMaW1pdDogMjAwLFxuICAgICAgICBsb2dnaW5nTGV2ZWw6IGFwaWdhdGV3YXkuTWV0aG9kTG9nZ2luZ0xldmVsLkVSUk9SLCAvLyBNaW5pbWFsIGxvZ2dpbmdcbiAgICAgICAgZGF0YVRyYWNlRW5hYmxlZDogZmFsc2UsIC8vIE5vIGRldGFpbGVkIHRyYWNpbmcgZm9yIGRldlxuICAgICAgICBtZXRyaWNzRW5hYmxlZDogZmFsc2UgLy8gTm8gZGV0YWlsZWQgbWV0cmljcyBmb3IgZGV2XG4gICAgICB9LFxuICAgICAgZW5kcG9pbnRDb25maWd1cmF0aW9uOiB7XG4gICAgICAgIHR5cGVzOiBbYXBpZ2F0ZXdheS5FbmRwb2ludFR5cGUuUkVHSU9OQUxdIC8vIFJlZ2lvbmFsIG9ubHkgZm9yIGRldlxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gQVBJIGludGVncmF0aW9uXG4gICAgY29uc3QgbGFtYmRhSW50ZWdyYXRpb24gPSBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihkZXZBcGlGdW5jdGlvbik7XG4gICAgZGV2QXBpLnJvb3QuYWRkUHJveHkoe1xuICAgICAgZGVmYXVsdEludGVncmF0aW9uOiBsYW1iZGFJbnRlZ3JhdGlvbixcbiAgICAgIGFueU1ldGhvZDogdHJ1ZVxuICAgIH0pO1xuXG4gICAgLy8gQ29zdC1vcHRpbWl6ZWQgQ2xvdWRGcm9udCBkaXN0cmlidXRpb25cbiAgICBjb25zdCBkZXZEaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0RldkRpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGNvbW1lbnQ6ICdEZXYgUG9ydGZvbGlvIERpc3RyaWJ1dGlvbicsXG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihkZXZCdWNrZXQpLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRUQsXG4gICAgICAgIGNvbXByZXNzOiB0cnVlXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbEJlaGF2aW9yczoge1xuICAgICAgICAnL2FwaS8qJzoge1xuICAgICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUmVzdEFwaU9yaWdpbihkZXZBcGkpLFxuICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LkhUVFBTX09OTFksXG4gICAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19ESVNBQkxFRCxcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19BTExcbiAgICAgICAgfVxuICAgICAgfSxcbiAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsIC8vIFVTL0V1cm9wZSBvbmx5IGZvciBjb3N0IHNhdmluZ3NcbiAgICAgIGVuYWJsZUxvZ2dpbmc6IGZhbHNlLCAvLyBObyBhY2Nlc3MgbG9ncyBmb3IgZGV2XG4gICAgICBtaW5pbXVtUHJvdG9jb2xWZXJzaW9uOiBjbG91ZGZyb250LlNlY3VyaXR5UG9saWN5UHJvdG9jb2wuVExTX1YxXzJfMjAyMVxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEZXZCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IGRldkJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEZXYgUzMgYnVja2V0IG5hbWUnXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGV2VGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IGRldlRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGV2IER5bmFtb0RCIHRhYmxlIG5hbWUnXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGV2QXBpVXJsJywge1xuICAgICAgdmFsdWU6IGRldkFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RldiBBUEkgR2F0ZXdheSBVUkwnXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGV2RGlzdHJpYnV0aW9uVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7ZGV2RGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGV2IENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIFVSTCdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEZXZEaXN0cmlidXRpb25JZCcsIHtcbiAgICAgIHZhbHVlOiBkZXZEaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RldiBDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBJRCdcbiAgICB9KTtcblxuICAgIC8vIENvc3QgZXN0aW1hdGlvbiBvdXRwdXRcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRXN0aW1hdGVkTW9udGhseUNvc3QnLCB7XG4gICAgICB2YWx1ZTogJyQzLTggcGVyIG1vbnRoIHdoZW4gcnVubmluZywgJDAgd2hlbiBzdG9wcGVkJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRXN0aW1hdGVkIG1vbnRobHkgY29zdCBmb3IgZGV2IGVudmlyb25tZW50J1xuICAgIH0pO1xuICB9XG59XG4iXX0=