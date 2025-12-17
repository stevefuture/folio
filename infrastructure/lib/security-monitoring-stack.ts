import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as guardduty from 'aws-cdk-lib/aws-guardduty';
import * as config from 'aws-cdk-lib/aws-config';
import { Construct } from 'constructs';

interface SecurityMonitoringStackProps extends cdk.StackProps {
  environment: string;
  alertEmail: string;
  slackWebhookUrl?: string;
}

export class SecurityMonitoringStack extends cdk.Stack {
  public readonly securityAlertsTopic: sns.Topic;
  public readonly securityDashboard: cloudwatch.Dashboard;

  constructor(scope: Construct, id: string, props: SecurityMonitoringStackProps) {
    super(scope, id, props);

    // Create SNS topic for security alerts
    this.securityAlertsTopic = new sns.Topic(this, 'SecurityAlerts', {
      displayName: `Portfolio Security Alerts - ${props.environment}`,
      topicName: `portfolio-security-alerts-${props.environment}`
    });

    // Add email subscription
    this.securityAlertsTopic.addSubscription(
      new subscriptions.EmailSubscription(props.alertEmail)
    );

    // Create CloudWatch Log Groups for centralized logging
    const logGroups = {
      api: new logs.LogGroup(this, 'APILogGroup', {
        logGroupName: `/aws/lambda/portfolio-api-${props.environment}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      
      auth: new logs.LogGroup(this, 'AuthLogGroup', {
        logGroupName: `/aws/cognito/portfolio-auth-${props.environment}`,
        retention: logs.RetentionDays.THREE_MONTHS,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      
      security: new logs.LogGroup(this, 'SecurityLogGroup', {
        logGroupName: `/security/portfolio-${props.environment}`,
        retention: logs.RetentionDays.SIX_MONTHS,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      }),
      
      cloudfront: new logs.LogGroup(this, 'CloudFrontLogGroup', {
        logGroupName: `/aws/cloudfront/portfolio-${props.environment}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY
      })
    };

    // Security event processing Lambda
    const securityEventProcessor = new lambda.Function(this, 'SecurityEventProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const sns = new AWS.SNS();
        
        exports.handler = async (event) => {
          console.log('Security event received:', JSON.stringify(event, null, 2));
          
          const message = {
            timestamp: new Date().toISOString(),
            environment: process.env.ENVIRONMENT,
            event: event,
            severity: determineSeverity(event),
            source: event.source || 'unknown'
          };
          
          if (message.severity === 'HIGH' || message.severity === 'CRITICAL') {
            await sns.publish({
              TopicArn: process.env.SNS_TOPIC_ARN,
              Subject: \`Security Alert - \${message.severity} - Portfolio \${process.env.ENVIRONMENT}\`,
              Message: JSON.stringify(message, null, 2)
            }).promise();
          }
          
          return { statusCode: 200 };
        };
        
        function determineSeverity(event) {
          if (event.detail?.eventName?.includes('Delete') || 
              event.detail?.eventName?.includes('Terminate')) {
            return 'HIGH';
          }
          if (event.detail?.errorCode || event.detail?.errorMessage) {
            return 'MEDIUM';
          }
          return 'LOW';
        }
      `),
      environment: {
        SNS_TOPIC_ARN: this.securityAlertsTopic.topicArn,
        ENVIRONMENT: props.environment
      },
      timeout: cdk.Duration.seconds(30)
    });

    // Grant permissions to security event processor
    this.securityAlertsTopic.grantPublish(securityEventProcessor);

    // CloudWatch Alarms for security monitoring
    const securityAlarms = this.createSecurityAlarms(logGroups, props.environment);

    // EventBridge rules for security events
    this.createSecurityEventRules(securityEventProcessor, props.environment);

    // Enable GuardDuty (if not already enabled)
    const guardDutyDetector = new guardduty.CfnDetector(this, 'GuardDutyDetector', {
      enable: true,
      findingPublishingFrequency: 'FIFTEEN_MINUTES'
    });

    // AWS Config rules for compliance monitoring
    this.createConfigRules(props.environment);

    // Create security dashboard
    this.securityDashboard = this.createSecurityDashboard(logGroups, securityAlarms, props.environment);

    // Slack integration (if webhook provided)
    if (props.slackWebhookUrl) {
      this.createSlackIntegration(props.slackWebhookUrl, props.environment);
    }

    // Outputs
    new cdk.CfnOutput(this, 'SecurityAlertsTopicArn', {
      value: this.securityAlertsTopic.topicArn,
      description: 'Security alerts SNS topic ARN'
    });

    new cdk.CfnOutput(this, 'SecurityDashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${this.securityDashboard.dashboardName}`,
      description: 'Security monitoring dashboard URL'
    });
  }

  private createSecurityAlarms(logGroups: any, environment: string): cloudwatch.Alarm[] {
    const alarms: cloudwatch.Alarm[] = [];

    // Failed authentication attempts
    const failedAuthAlarm = new cloudwatch.Alarm(this, 'FailedAuthAlarm', {
      alarmName: `Portfolio-FailedAuth-${environment}`,
      alarmDescription: 'Multiple failed authentication attempts detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Cognito',
        metricName: 'SignInFailures',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5)
      }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    failedAuthAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(this.securityAlertsTopic)
    );
    alarms.push(failedAuthAlarm);

    // API error rate alarm
    const apiErrorAlarm = new cloudwatch.Alarm(this, 'APIErrorAlarm', {
      alarmName: `Portfolio-APIErrors-${environment}`,
      alarmDescription: 'High API error rate detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        dimensionsMap: {
          FunctionName: `portfolio-api-${environment}`
        },
        statistic: 'Sum',
        period: cdk.Duration.minutes(5)
      }),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    apiErrorAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(this.securityAlertsTopic)
    );
    alarms.push(apiErrorAlarm);

    // Unusual traffic pattern alarm
    const trafficSpikeAlarm = new cloudwatch.Alarm(this, 'TrafficSpikeAlarm', {
      alarmName: `Portfolio-TrafficSpike-${environment}`,
      alarmDescription: 'Unusual traffic spike detected',
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: 'Requests',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5)
      }),
      threshold: 10000,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });

    trafficSpikeAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(this.securityAlertsTopic)
    );
    alarms.push(trafficSpikeAlarm);

    return alarms;
  }

  private createSecurityEventRules(processor: lambda.Function, environment: string): void {
    // CloudTrail security events
    const securityEventRule = new events.Rule(this, 'SecurityEventRule', {
      eventPattern: {
        source: ['aws.cognito-idp', 'aws.s3', 'aws.lambda'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventSource: ['cognito-idp.amazonaws.com', 's3.amazonaws.com', 'lambda.amazonaws.com'],
          eventName: [
            'AdminCreateUser',
            'AdminDeleteUser',
            'DeleteBucket',
            'DeleteFunction',
            'PutBucketPolicy'
          ]
        }
      }
    });

    securityEventRule.addTarget(new targets.LambdaFunction(processor));

    // GuardDuty findings
    const guardDutyRule = new events.Rule(this, 'GuardDutyRule', {
      eventPattern: {
        source: ['aws.guardduty'],
        detailType: ['GuardDuty Finding']
      }
    });

    guardDutyRule.addTarget(new targets.LambdaFunction(processor));
  }

  private createConfigRules(environment: string): void {
    // S3 bucket public access prohibited
    new config.ManagedRule(this, 'S3BucketPublicAccessProhibited', {
      identifier: config.ManagedRuleIdentifiers.S3_BUCKET_PUBLIC_ACCESS_PROHIBITED,
      description: 'Checks that S3 buckets do not allow public access'
    });

    // Root access key check
    new config.ManagedRule(this, 'RootAccessKeyCheck', {
      identifier: config.ManagedRuleIdentifiers.ROOT_ACCESS_KEY_CHECK,
      description: 'Checks whether root access key is available'
    });

    // MFA enabled for IAM console access
    new config.ManagedRule(this, 'MFAEnabledForIAMConsoleAccess', {
      identifier: config.ManagedRuleIdentifiers.MFA_ENABLED_FOR_IAM_CONSOLE_ACCESS,
      description: 'Checks whether MFA is enabled for IAM users'
    });
  }

  private createSecurityDashboard(logGroups: any, alarms: cloudwatch.Alarm[], environment: string): cloudwatch.Dashboard {
    const dashboard = new cloudwatch.Dashboard(this, 'SecurityDashboard', {
      dashboardName: `Portfolio-Security-${environment}`,
      defaultInterval: cdk.Duration.hours(1)
    });

    // Security metrics widgets
    dashboard.addWidgets(
      // WAF blocked requests
      new cloudwatch.GraphWidget({
        title: 'WAF Blocked Requests',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/WAFV2',
            metricName: 'BlockedRequests',
            statistic: 'Sum'
          })
        ],
        width: 12,
        height: 6
      }),

      // Authentication metrics
      new cloudwatch.GraphWidget({
        title: 'Authentication Events',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Cognito',
            metricName: 'SignInSuccesses',
            statistic: 'Sum'
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/Cognito',
            metricName: 'SignInFailures',
            statistic: 'Sum'
          })
        ],
        width: 12,
        height: 6
      }),

      // API performance and errors
      new cloudwatch.GraphWidget({
        title: 'API Performance',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Duration',
            statistic: 'Average'
          })
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/Lambda',
            metricName: 'Errors',
            statistic: 'Sum'
          })
        ],
        width: 12,
        height: 6
      }),

      // CloudFront metrics
      new cloudwatch.GraphWidget({
        title: 'CloudFront Traffic',
        left: [
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: 'Requests',
            statistic: 'Sum'
          })
        ],
        right: [
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: '4xxErrorRate',
            statistic: 'Average'
          }),
          new cloudwatch.Metric({
            namespace: 'AWS/CloudFront',
            metricName: '5xxErrorRate',
            statistic: 'Average'
          })
        ],
        width: 12,
        height: 6
      })
    );

    return dashboard;
  }

  private createSlackIntegration(webhookUrl: string, environment: string): void {
    const slackNotifier = new lambda.Function(this, 'SlackNotifier', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const https = require('https');
        const url = require('url');
        
        exports.handler = async (event) => {
          const message = JSON.parse(event.Records[0].Sns.Message);
          
          const slackMessage = {
            text: \`🚨 Security Alert - \${process.env.ENVIRONMENT}\`,
            attachments: [{
              color: 'danger',
              fields: [
                {
                  title: 'Environment',
                  value: process.env.ENVIRONMENT,
                  short: true
                },
                {
                  title: 'Timestamp',
                  value: message.timestamp || new Date().toISOString(),
                  short: true
                },
                {
                  title: 'Details',
                  value: JSON.stringify(message, null, 2),
                  short: false
                }
              ]
            }]
          };
          
          const webhookUrl = process.env.SLACK_WEBHOOK_URL;
          const parsedUrl = url.parse(webhookUrl);
          
          const postData = JSON.stringify(slackMessage);
          
          const options = {
            hostname: parsedUrl.hostname,
            port: 443,
            path: parsedUrl.path,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          };
          
          return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
              resolve({ statusCode: res.statusCode });
            });
            
            req.on('error', reject);
            req.write(postData);
            req.end();
          });
        };
      `),
      environment: {
        SLACK_WEBHOOK_URL: webhookUrl,
        ENVIRONMENT: environment
      }
    });

    this.securityAlertsTopic.addSubscription(
      new subscriptions.LambdaSubscription(slackNotifier)
    );
  }
}
