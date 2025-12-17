import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

interface SimpleDevStackProps extends cdk.StackProps {
  domain?: string;
  hostedZoneId?: string;
}

export class SimpleDevStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SimpleDevStackProps) {
    super(scope, id, props);

    const { domain, hostedZoneId } = props;

    // S3 bucket for dev
    const devBucket = new s3.Bucket(this, 'DevBucket', {
      bucketName: `portfolio-dev-${cdk.Aws.ACCOUNT_ID}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    // DynamoDB table for dev
    const devTable = new dynamodb.Table(this, 'DevTable', {
      tableName: `PortfolioData-dev`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Lambda function for dev
    const devFunction = new lambda.Function(this, 'DevFunction', {
      functionName: `portfolio-api-dev`,
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
              message: 'Dev API is working!',
              timestamp: new Date().toISOString(),
              environment: 'dev'
            })
          };
        };
      `),
      environment: {
        TABLE_NAME: devTable.tableName,
        BUCKET_NAME: devBucket.bucketName
      }
    });

    // Grant permissions
    devTable.grantReadWriteData(devFunction);
    devBucket.grantReadWrite(devFunction);

    // API Gateway
    const api = new apigateway.RestApi(this, 'DevApi', {
      restApiName: 'portfolio-dev-api',
      deployOptions: {
        stageName: 'dev'
      }
    });

    const integration = new apigateway.LambdaIntegration(devFunction);
    api.root.addMethod('GET', integration);
    api.root.addProxy({
      defaultIntegration: integration,
      anyMethod: true
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

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, 'DevDistribution', {
      comment: 'Dev Portfolio Distribution',
      defaultBehavior: {
        origin: new origins.S3Origin(devBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL
        }
      },
      domainNames: domain ? [domain] : undefined,
      certificate: certificate
    });

    // DNS record
    if (domain && hostedZone) {
      new route53.ARecord(this, 'DevAliasRecord', {
        zone: hostedZone,
        recordName: domain,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(distribution)
        )
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'BucketName', {
      value: devBucket.bucketName
    });

    new cdk.CfnOutput(this, 'TableName', {
      value: devTable.tableName
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url
    });

    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${distribution.distributionDomainName}`
    });

    if (domain) {
      new cdk.CfnOutput(this, 'WebsiteUrl', {
        value: `https://${domain}`
      });
    }
  }
}
