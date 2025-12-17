import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

interface EnhancedDevStackProps extends cdk.StackProps {
  domain?: string;
  hostedZoneId?: string;
}

export class EnhancedDevStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EnhancedDevStackProps) {
    super(scope, id, props);

    const { domain, hostedZoneId } = props;

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
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true
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
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: true
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
        const s3 = new AWS.S3();

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
                  features: ['authentication', 'admin', 'image-optimization', 'cms']
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
                  }
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
                  count: result.Count || 0
                })
              };
            }
            
            if (path === '/api/contact' && method === 'POST') {
              const body = JSON.parse(event.body || '{}');
              
              // Save contact submission
              await dynamodb.put({
                TableName: process.env.TABLE_NAME,
                Item: {
                  PK: 'CONTACT#' + Date.now(),
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
                  timestamp: new Date().toISOString()
                })
              };
            }
            
            // Default 404
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({
                error: 'Not Found',
                path: path,
                method: method
              })
            };
            
          } catch (error) {
            console.error('API Error:', error);
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({
                error: 'Internal Server Error',
                message: error.message
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

    // API Gateway with Cognito authorization
    const enhancedApi = new apigateway.RestApi(this, 'EnhancedApi', {
      restApiName: 'portfolio-enhanced-api',
      description: 'Enhanced Portfolio API with Authentication',
      deployOptions: {
        stageName: 'enhanced',
        throttlingRateLimit: 1000,
        throttlingBurstLimit: 2000
      }
    });

    // Cognito Authorizer
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
      authorizerName: 'portfolio-authorizer'
    });

    const integration = new apigateway.LambdaIntegration(enhancedFunction);

    // Public endpoints (no auth required)
    enhancedApi.root.addMethod('GET', integration);
    const apiResource = enhancedApi.root.addResource('api');
    apiResource.addMethod('GET', integration);
    
    const healthResource = apiResource.addResource('health');
    healthResource.addMethod('GET', integration);
    
    const portfolioResource = apiResource.addResource('portfolio');
    portfolioResource.addMethod('GET', integration);
    
    const contactResource = apiResource.addResource('contact');
    contactResource.addMethod('POST', integration);

    // Protected admin endpoints
    const adminResource = apiResource.addResource('admin');
    adminResource.addMethod('GET', integration, {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });
    adminResource.addMethod('POST', integration, {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO
    });

    // Add CORS to all resources
    [apiResource, healthResource, portfolioResource, contactResource, adminResource].forEach(resource => {
      resource.addCorsPreflight({
        allowOrigins: ['*'],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization']
      });
    });

    // Basic WAF for enhanced security
    const webAcl = new wafv2.CfnWebACL(this, 'EnhancedWAF', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP'
            }
          },
          action: { block: {} },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitRule'
          }
        }
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'EnhancedPortfolioWAF'
      }
    });

    // Certificate and domain setup
    let certificate: acm.Certificate | undefined;
    let hostedZone: route53.IHostedZone | undefined;

    if (domain && hostedZoneId) {
      hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId,
        zoneName: domain.split('.').slice(-2).join('.')
      });

      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: domain,
        validation: acm.CertificateValidation.fromDns(hostedZone)
      });
    }

    // Enhanced CloudFront distribution
    const enhancedDistribution = new cloudfront.Distribution(this, 'EnhancedDistribution', {
      comment: 'Enhanced Portfolio Distribution with WAF',
      webAclId: webAcl.attrArn,
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
      domainNames: domain ? [domain] : undefined,
      certificate: certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100
    });

    // DNS record
    if (domain && hostedZone) {
      new route53.ARecord(this, 'EnhancedAliasRecord', {
        zone: hostedZone,
        recordName: domain,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(enhancedDistribution)
        )
      });
    }

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

    if (domain) {
      new cdk.CfnOutput(this, 'EnhancedWebsiteUrl', {
        value: `https://${domain}`,
        description: 'Enhanced website URL'
      });
    }

    new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
      value: '$15-30 per month when running, includes authentication, WAF, and enhanced features',
      description: 'Estimated monthly cost for enhanced environment'
    });
  }
}
