import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

interface SEOAutomationStackProps extends cdk.StackProps {
  table: any;
  bucket: s3.Bucket;
  environment: string;
  siteUrl: string;
  imageUrl: string;
}

export class SEOAutomationStack extends cdk.Stack {
  public readonly seoApi: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: SEOAutomationStackProps) {
    super(scope, id, props);

    // IAM role for SEO Lambda functions
    const seoLambdaRole = new iam.Role(this, 'SEOLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ],
      inlinePolicies: {
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'dynamodb:Query',
                'dynamodb:GetItem',
                'dynamodb:Scan'
              ],
              resources: [props.table.tableArn, `${props.table.tableArn}/index/*`]
            })
          ]
        }),
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                's3:PutObject',
                's3:PutObjectAcl',
                's3:GetObject'
              ],
              resources: [`${props.bucket.bucketArn}/*`]
            })
          ]
        })
      }
    });

    // Meta tags and structured data generator
    const metaGeneratorFunction = new lambda.Function(this, 'MetaGeneratorFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'meta-generator.handler',
      code: lambda.Code.fromAsset('../backend/seo-automation'),
      role: seoLambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        TABLE_NAME: props.table.tableName,
        SITE_URL: props.siteUrl,
        IMAGE_DOMAIN: props.imageUrl,
        ENVIRONMENT: props.environment
      }
    });

    // Sitemap generator
    const sitemapGeneratorFunction = new lambda.Function(this, 'SitemapGeneratorFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'sitemap-generator.handler',
      code: lambda.Code.fromAsset('../backend/seo-automation'),
      role: seoLambdaRole,
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
      environment: {
        TABLE_NAME: props.table.tableName,
        BUCKET_NAME: props.bucket.bucketName,
        SITE_URL: props.siteUrl,
        ENVIRONMENT: props.environment
      }
    });

    // Robots.txt generator
    const robotsGeneratorFunction = new lambda.Function(this, 'RobotsGeneratorFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'robots-generator.handler',
      code: lambda.Code.fromAsset('../backend/seo-automation'),
      role: seoLambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
        SITE_URL: props.siteUrl,
        ENVIRONMENT: props.environment
      }
    });

    // API Gateway for SEO endpoints
    this.seoApi = new apigateway.RestApi(this, 'SEOApi', {
      restApiName: 'Photography Portfolio SEO API',
      description: 'SEO automation endpoints',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST'],
        allowHeaders: ['Content-Type', 'Authorization']
      }
    });

    // SEO endpoints
    const seoResource = this.seoApi.root.addResource('seo');
    
    // Meta tags endpoint: GET /seo/meta/{proxy+}
    const metaResource = seoResource.addResource('meta');
    const metaProxyResource = metaResource.addResource('{proxy+}');
    metaProxyResource.addMethod('GET', new apigateway.LambdaIntegration(metaGeneratorFunction));

    // Sitemap generation endpoint: POST /seo/sitemap
    const sitemapResource = seoResource.addResource('sitemap');
    sitemapResource.addMethod('POST', new apigateway.LambdaIntegration(sitemapGeneratorFunction));

    // Robots.txt generation endpoint: POST /seo/robots
    const robotsResource = seoResource.addResource('robots');
    robotsResource.addMethod('POST', new apigateway.LambdaIntegration(robotsGeneratorFunction));

    // Scheduled sitemap generation (daily at 2 AM UTC)
    const sitemapScheduleRule = new events.Rule(this, 'SitemapScheduleRule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '2',
        day: '*',
        month: '*',
        year: '*'
      }),
      description: 'Daily sitemap generation'
    });

    sitemapScheduleRule.addTarget(new targets.LambdaFunction(sitemapGeneratorFunction));

    // Scheduled robots.txt generation (on deployment)
    const robotsScheduleRule = new events.Rule(this, 'RobotsScheduleRule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '3',
        day: '*',
        month: '*',
        year: '*'
      }),
      description: 'Daily robots.txt generation'
    });

    robotsScheduleRule.addTarget(new targets.LambdaFunction(robotsGeneratorFunction));

    // CloudWatch alarms for monitoring
    metaGeneratorFunction.metricErrors().createAlarm(this, 'MetaGeneratorErrors', {
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING
    });

    sitemapGeneratorFunction.metricErrors().createAlarm(this, 'SitemapGeneratorErrors', {
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Outputs
    new cdk.CfnOutput(this, 'SEOApiUrl', {
      value: this.seoApi.url,
      description: 'SEO API Gateway URL',
      exportName: `PhotographyPortfolio-${props.environment}-SEOApiUrl`
    });

    new cdk.CfnOutput(this, 'MetaEndpoint', {
      value: `${this.seoApi.url}seo/meta/`,
      description: 'Meta tags generation endpoint'
    });

    new cdk.CfnOutput(this, 'SitemapEndpoint', {
      value: `${this.seoApi.url}seo/sitemap`,
      description: 'Sitemap generation endpoint'
    });
  }
}
