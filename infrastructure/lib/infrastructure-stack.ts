import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';

export class InfrastructureStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly bucket: s3.Bucket;
  public readonly userPool: cognito.UserPool;
  public readonly webAcl: wafv2.CfnWebACL;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table for projects and images
    this.table = new dynamodb.Table(this, 'PortfolioTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      deletionProtection: true
    });

    // S3 bucket for images with lifecycle policy
    this.bucket = new s3.Bucket(this, 'PortfolioBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'IntelligentTiering',
          status: s3.LifecycleRuleStatus.ENABLED,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(0)
            }
          ]
        },
        {
          id: 'DeleteIncompleteUploads',
          status: s3.LifecycleRuleStatus.ENABLED,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7)
        }
      ]
    });

    // Cognito User Pool with enhanced security
    this.userPool = new cognito.UserPool(this, 'AdminUserPool', {
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: false,
        otp: true
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      advancedSecurityMode: cognito.AdvancedSecurityMode.ENFORCED,
      deviceTracking: {
        challengeRequiredOnNewDevice: true,
        deviceOnlyRememberedOnUserPrompt: true
      },
      signInAliases: {
        email: true
      },
      autoVerify: {
        email: true
      }
    });

    // Enhanced WAF Web ACL
    this.webAcl = new wafv2.CfnWebACL(this, 'PortfolioWAF', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      rules: [
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 1,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'CommonRuleSetMetric'
          }
        },
        {
          name: 'RateLimitRule',
          priority: 2,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 2000,
              aggregateKeyType: 'IP'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'RateLimitMetric'
          }
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet'
            }
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'BadInputsMetric'
          }
        }
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'PortfolioWAF'
      }
    });

    // Cost monitoring topic
    const costTopic = new sns.Topic(this, 'CostAlarmTopic', {
      displayName: 'Portfolio Cost Alerts'
    });

    // Billing alarm
    new cloudwatch.Alarm(this, 'BillingAlarm', {
      alarmName: 'Portfolio-MonthlyBilling',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Billing',
        metricName: 'EstimatedCharges',
        dimensionsMap: {
          Currency: 'USD'
        },
        statistic: 'Maximum',
        period: cdk.Duration.hours(6)
      }),
      threshold: 50,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    // Outputs
    new cdk.CfnOutput(this, 'TableName', {
      value: this.table.tableName,
      description: 'DynamoDB table name'
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket name'
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID'
    });

    new cdk.CfnOutput(this, 'WebAclArn', {
      value: this.webAcl.attrArn,
      description: 'WAF Web ACL ARN'
    });
  }
}
