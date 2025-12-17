import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

interface BackendStackProps extends cdk.StackProps {
  table: any;
  bucket: any;
}

export class BackendStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    // Lambda execution role with least privilege
    const lambdaRole = new iam.Role(this, 'PortfolioLambdaRole', {
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
                'dynamodb:PutItem',
                'dynamodb:UpdateItem'
              ],
              resources: [props.table.tableArn, `${props.table.tableArn}/index/*`]
            })
          ]
        }),
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['s3:GetObject', 's3:PutObject'],
              resources: [`${props.bucket.bucketArn}/*`]
            })
          ]
        })
      }
    });

    // Portfolio API Lambda
    const portfolioFunction = new lambda.Function(this, 'PortfolioFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../backend/portfolio-api'),
      role: lambdaRole,
      environment: {
        TABLE_NAME: props.table.tableName,
        BUCKET_NAME: props.bucket.bucketName
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512
    });

    // Image processing Lambda
    const imageFunction = new lambda.Function(this, 'ImageFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          // Basic image optimization placeholder
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Image processed' })
          };
        };
      `),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024
    });

    // API Gateway
    this.api = new apigateway.RestApi(this, 'PortfolioApi', {
      restApiName: 'Photography Portfolio API',
      description: 'API for photographer portfolio',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization']
      }
    });

    // API resources
    const apiResource = this.api.root.addResource('api');
    const projectsResource = apiResource.addResource('projects');
    const carouselResource = apiResource.addResource('carousel');
    const imagesResource = apiResource.addResource('images');

    // API methods
    projectsResource.addMethod('GET', new apigateway.LambdaIntegration(portfolioFunction));
    carouselResource.addMethod('GET', new apigateway.LambdaIntegration(portfolioFunction));
    imagesResource.addMethod('POST', new apigateway.LambdaIntegration(imageFunction));

    // Cost monitoring
    const costTopic = new sns.Topic(this, 'CostAlarmTopic', {
      displayName: 'Portfolio Cost Alerts'
    });

    // DynamoDB cost alarm
    new cloudwatch.Alarm(this, 'DynamoDBCostAlarm', {
      alarmName: 'Portfolio-DynamoDB-HighUsage',
      metric: props.table.metricConsumedReadCapacityUnits({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5)
      }),
      threshold: 1000,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Lambda cost alarm
    new cloudwatch.Alarm(this, 'LambdaCostAlarm', {
      alarmName: 'Portfolio-Lambda-HighInvocations',
      metric: portfolioFunction.metricInvocations({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5)
      }),
      threshold: 10000,
      evaluationPeriods: 2
    });

    // Outputs
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'API Gateway URL'
    });
  }
}
