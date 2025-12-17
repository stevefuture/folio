import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface ImageOptimizationStackProps extends cdk.StackProps {
  sourceBucket: s3.Bucket;
  environment?: string;
}

export class ImageOptimizationStack extends cdk.Stack {
  public readonly imageFunction: lambda.Function;
  public readonly imageDistribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ImageOptimizationStackProps) {
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
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          'SharpLayer',
          `arn:aws:lambda:${this.region}:634166935893:layer:sharp:1`
        )
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
          headerBehavior: cloudfront.CacheHeaderBehavior.allowList(
            'Accept',
            'Accept-Encoding',
            'CloudFront-Viewer-Country'
          ),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList(
            'w', 'h', 'q', 'f', 'fit', 'auto'
          ),
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
