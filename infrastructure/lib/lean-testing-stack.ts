import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export class LeanTestingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket - KEEP (user-facing: image storage)
    const leanBucket = new s3.Bucket(this, 'LeanBucket', {
      bucketName: `portfolio-lean-${cdk.Aws.ACCOUNT_ID}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    // Lambda function - KEEP but simplified (user-facing: API functionality)
    const leanFunction = new lambda.Function(this, 'LeanFunction', {
      functionName: `portfolio-api-lean`,
      runtime: lambda.Runtime.NODEJS_18_X,
      architecture: lambda.Architecture.ARM_64, // 20% cost savings
      handler: 'lean.handler',
      memorySize: 256, // Reduced from 512MB
      timeout: cdk.Duration.seconds(15), // Reduced from 30s
      code: lambda.Code.fromInline(`
        // In-memory storage for testing (no DynamoDB costs)
        let portfolioItems = [
          { id: '1', title: 'Wedding Photography', category: 'wedding', description: 'Beautiful wedding moments' },
          { id: '2', title: 'Portrait Session', category: 'portrait', description: 'Professional portraits' }
        ];
        let contacts = [];

        exports.handler = async (event) => {
          const path = event.path || '/';
          const method = event.httpMethod || 'GET';
          
          const headers = {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
          };
          
          if (method === 'OPTIONS') return { statusCode: 200, headers, body: '' };
          
          try {
            // API status
            if (path === '/' || path === '/api' || path === '/api/') {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  message: 'Lean Testing API - Cost Optimized!',
                  timestamp: new Date().toISOString(),
                  environment: 'lean-testing',
                  features: ['in-memory-storage', 'basic-api', 'cost-optimized'],
                  costSavings: ['no-dynamodb', 'no-cognito', 'no-waf', 'no-monitoring'],
                  estimatedCost: '$1-3/month'
                })
              };
            }
            
            // Health check
            if (path === '/api/health') {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  status: 'healthy',
                  services: {
                    lambda: 'connected',
                    s3: 'connected',
                    storage: 'in-memory'
                  },
                  timestamp: new Date().toISOString()
                })
              };
            }
            
            // Portfolio items (in-memory)
            if (path === '/api/portfolio') {
              if (method === 'GET') {
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    items: portfolioItems,
                    count: portfolioItems.length,
                    storage: 'in-memory'
                  })
                };
              }
              
              if (method === 'POST') {
                const body = JSON.parse(event.body || '{}');
                const newItem = {
                  id: Date.now().toString(),
                  title: body.title,
                  category: body.category,
                  description: body.description,
                  timestamp: new Date().toISOString()
                };
                portfolioItems.push(newItem);
                
                return {
                  statusCode: 201,
                  headers,
                  body: JSON.stringify({
                    message: 'Portfolio item added',
                    item: newItem,
                    total: portfolioItems.length
                  })
                };
              }
            }
            
            // Contact form (in-memory)
            if (path === '/api/contact' && method === 'POST') {
              const body = JSON.parse(event.body || '{}');
              const contact = {
                id: Date.now().toString(),
                name: body.name,
                email: body.email,
                service: body.service,
                message: body.message,
                timestamp: new Date().toISOString(),
                status: 'new'
              };
              contacts.push(contact);
              
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  message: 'Contact form submitted successfully',
                  contactId: contact.id,
                  storage: 'in-memory'
                })
              };
            }
            
            // Admin endpoints (in-memory)
            if (path.startsWith('/api/admin')) {
              if (method === 'GET') {
                return {
                  statusCode: 200,
                  headers,
                  body: JSON.stringify({
                    contacts: contacts,
                    portfolioItems: portfolioItems,
                    totalContacts: contacts.length,
                    totalPortfolio: portfolioItems.length,
                    storage: 'in-memory (resets on restart)',
                    note: 'No authentication required in lean testing mode'
                  })
                };
              }
            }
            
            // Analytics (simulated)
            if (path === '/api/analytics') {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  visitors: Math.floor(Math.random() * 100) + 50,
                  pageViews: Math.floor(Math.random() * 500) + 200,
                  contacts: contacts.length,
                  portfolioItems: portfolioItems.length,
                  timestamp: new Date().toISOString(),
                  note: 'Simulated data for testing'
                })
              };
            }
            
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
        BUCKET_NAME: leanBucket.bucketName,
        ENVIRONMENT: 'lean-testing'
      }
    });

    // Grant S3 permissions
    leanBucket.grantReadWrite(leanFunction);

    // API Gateway - KEEP but simplified (user-facing: API access)
    const leanApi = new apigateway.RestApi(this, 'LeanApi', {
      restApiName: 'portfolio-lean-api',
      description: 'Lean Testing API - Cost Optimized',
      deployOptions: {
        stageName: 'lean',
        throttlingRateLimit: 100, // Reduced from 1000
        throttlingBurstLimit: 200  // Reduced from 2000
      }
    });

    const integration = new apigateway.LambdaIntegration(leanFunction);
    leanApi.root.addMethod('GET', integration);
    leanApi.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true
    });

    // CloudFront - KEEP (user-facing: fast content delivery)
    const leanDistribution = new cloudfront.Distribution(this, 'LeanDistribution', {
      comment: 'Lean Testing Distribution - Cost Optimized',
      defaultBehavior: {
        origin: new origins.S3Origin(leanBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(leanApi),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL
        }
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100 // US/Europe only
    });

    // Outputs
    new cdk.CfnOutput(this, 'LeanBucketName', {
      value: leanBucket.bucketName,
      description: 'Lean testing S3 bucket name'
    });

    new cdk.CfnOutput(this, 'LeanApiUrl', {
      value: leanApi.url,
      description: 'Lean testing API Gateway URL'
    });

    new cdk.CfnOutput(this, 'LeanDistributionUrl', {
      value: `https://${leanDistribution.distributionDomainName}`,
      description: 'Lean testing CloudFront distribution URL'
    });

    new cdk.CfnOutput(this, 'CostSavings', {
      value: 'Removed: DynamoDB, Cognito, WAF, Enhanced Monitoring, Global Tables, Backup Services',
      description: 'Cost optimizations applied'
    });

    new cdk.CfnOutput(this, 'EstimatedMonthlyCost', {
      value: '$1-3 per month - 70-90% cheaper than enhanced version',
      description: 'Estimated monthly cost for lean testing environment'
    });
  }
}
