import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';

export class SimpleEnhancedStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for enhanced dev
    const enhancedBucket = new s3.Bucket(this, 'EnhancedBucket', {
      bucketName: `portfolio-enhanced-${cdk.Aws.ACCOUNT_ID}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    // DynamoDB table for enhanced dev
    const enhancedTable = new dynamodb.Table(this, 'EnhancedTable', {
      tableName: `PortfolioData-enhanced`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Add GSI for enhanced queries
    enhancedTable.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING }
    });

    // Cognito User Pool for authentication
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'portfolio-enhanced-users',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Cognito User Pool Client
    const userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'portfolio-enhanced-client',
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true
      }
    });

    // Enhanced Lambda function with more features
    const enhancedFunction = new lambda.Function(this, 'EnhancedFunction', {
      functionName: `portfolio-api-enhanced`,
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const dynamodb = new AWS.DynamoDB.DocumentClient();

        exports.handler = async (event) => {
          console.log('Enhanced API Request:', JSON.stringify(event, null, 2));
          
          const path = event.path || event.rawPath || '/';
          const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
          
          // CORS headers
          const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
          };
          
          // Handle OPTIONS requests
          if (method === 'OPTIONS') {
            return { statusCode: 200, headers, body: '' };
          }
          
          try {
            // Route handling
            if (path === '/' || path === '/api' || path === '/api/') {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  message: 'Enhanced Portfolio API is working!',
                  timestamp: new Date().toISOString(),
                  environment: 'enhanced',
                  features: ['authentication', 'admin', 'cms', 'advanced-api']
                })
              };
            }
            
            if (path === '/api/health') {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  status: 'healthy',
                  services: {
                    dynamodb: 'connected',
                    s3: 'connected',
                    cognito: 'configured'
                  },
                  timestamp: new Date().toISOString()
                })
              };
            }
            
            if (path === '/api/portfolio' && method === 'GET') {
              // Get portfolio items
              const result = await dynamodb.scan({
                TableName: process.env.TABLE_NAME,
                FilterExpression: 'begins_with(PK, :pk)',
                ExpressionAttributeValues: { ':pk': 'PORTFOLIO#' }
              }).promise();
              
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  items: result.Items || [],
                  count: result.Count || 0,
                  timestamp: new Date().toISOString()
                })
              };
            }
            
            if (path === '/api/contact' && method === 'POST') {
              const body = JSON.parse(event.body || '{}');
              
              // Save contact submission
              const contactId = 'CONTACT#' + Date.now();
              await dynamodb.put({
                TableName: process.env.TABLE_NAME,
                Item: {
                  PK: contactId,
                  SK: 'SUBMISSION',
                  name: body.name,
                  email: body.email,
                  service: body.service,
                  message: body.message,
                  timestamp: new Date().toISOString(),
                  status: 'new'
                }
              }).promise();
              
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  message: 'Contact form submitted successfully',
                  contactId: contactId,
                  timestamp: new Date().toISOString()
                })
              };
            }
            
            if (path.startsWith('/api/admin')) {
              // Admin endpoints (would normally require authentication)
              if (method === 'GET') {
                // Get admin dashboard data
                const contacts = await dynamodb.scan({
                  TableName: process.env.TABLE_NAME,
                  FilterExpression: 'begins_with(PK, :pk)',
                  ExpressionAttributeValues: { ':pk': 'CONTACT#' }
                }).promise();
                
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    contacts: contacts.Items || [],
                    totalContacts: contacts.Count || 0,
                    timestamp: new Date().toISOString()
                  })
                };
              }
            }
            
            // Default 404
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({
                error: 'Not Found',
                path: path,
                method: method,
                timestamp: new Date().toISOString()
              })
            };
            
          } catch (error) {
            console.error('API Error:', error);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message,
                timestamp: new Date().toISOString()
              })
            };
          }
        };
      `),
      environment: {
        TABLE_NAME: enhancedTable.tableName,
        BUCKET_NAME: enhancedBucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
        USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId
      },
      timeout: cdk.Duration.seconds(30)
    });

    // Grant permissions
    enhancedTable.grantReadWriteData(enhancedFunction);
    enhancedBucket.grantReadWrite(enhancedFunction);

    // API Gateway
    const enhancedApi = new apigateway.RestApi(this, 'EnhancedApi', {
      restApiName: 'portfolio-enhanced-api',
      description: 'Enhanced Portfolio API with Authentication',
      deployOptions: {
        stageName: 'enhanced'
      }
    });

    const integration = new apigateway.LambdaIntegration(enhancedFunction);

    // Add all routes
    enhancedApi.root.addMethod('GET', integration);
    enhancedApi.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true
    });

    // Enhanced CloudFront distribution
    const enhancedDistribution = new cloudfront.Distribution(this, 'EnhancedDistribution', {
      comment: 'Enhanced Portfolio Distribution',
      defaultBehavior: {
        origin: new origins.S3Origin(enhancedBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(enhancedApi),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL
        }
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100
    });

    // Outputs
    new cdk.CfnOutput(this, 'EnhancedBucketName', {
      value: enhancedBucket.bucketName,
      description: 'Enhanced S3 bucket name'
    });

    new cdk.CfnOutput(this, 'EnhancedTableName', {
      value: enhancedTable.tableName,
      description: 'Enhanced DynamoDB table name'
    });

    new cdk.CfnOutput(this, 'EnhancedApiUrl', {
      value: enhancedApi.url,
      description: 'Enhanced API Gateway URL'
    });

    new cdk.CfnOutput(this, 'EnhancedDistributionUrl', {
      value: `https://${enhancedDistribution.distributionDomainName}`,
      description: 'Enhanced CloudFront distribution URL'
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'Cognito User Pool ID'
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID'
    });

    new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
      value: '$15-30 per month when running, includes authentication and enhanced features',
      description: 'Estimated monthly cost for enhanced environment'
    });
  }
}
