import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

interface DevStackProps extends cdk.StackProps {
  domain?: string;
}

export class DevStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DevStackProps) {
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
