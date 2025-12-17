import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

interface SecurityLoggingStackProps extends cdk.StackProps {
  environment: string;
  alertTopic: sns.Topic;
  distributionId: string;
}

export class SecurityLoggingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SecurityLoggingStackProps) {
    super(scope, id, props);

    const { environment, alertTopic, distributionId } = props;

    // CloudTrail Log Group
    const cloudTrailLogGroup = new logs.LogGroup(this, 'CloudTrailLogGroup', {
      logGroupName: `/aws/cloudtrail/portfolio-${environment}`,
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // WAF Log Group
    const wafLogGroup = new logs.LogGroup(this, 'WAFLogGroup', {
      logGroupName: `/aws/wafv2/portfolio-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Security Event Processor Lambda
    const securityProcessor = new lambda.Function(this, 'SecurityProcessor', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const sns = new AWS.SNS();

        exports.handler = async (event) => {
          console.log('Processing security event:', JSON.stringify(event, null, 2));
          
          const alerts = [];
          
          // Process CloudWatch Logs events
          if (event.awslogs) {
            const payload = JSON.parse(Buffer.from(event.awslogs.data, 'base64').toString('utf8'));
            
            for (const logEvent of payload.logEvents) {
              const message = logEvent.message;
              
              // Detect suspicious patterns
              if (message.includes('BLOCK') || message.includes('RATE_LIMIT')) {
                alerts.push({
                  type: 'WAF_BLOCK',
                  timestamp: new Date(logEvent.timestamp).toISOString(),
                  message: message,
                  severity: 'MEDIUM'
                });
              }
              
              if (message.includes('SQL') || message.includes('XSS') || message.includes('injection')) {
                alerts.push({
                  type: 'ATTACK_ATTEMPT',
                  timestamp: new Date(logEvent.timestamp).toISOString(),
                  message: message,
                  severity: 'HIGH'
                });
              }
            }
          }
          
          // Send alerts for high severity events
          for (const alert of alerts) {
            if (alert.severity === 'HIGH') {
              await sns.publish({
                TopicArn: '${alertTopic.topicArn}',
                Subject: \`🚨 Security Alert: \${alert.type}\`,
                Message: JSON.stringify(alert, null, 2)
              }).promise();
            }
          }
          
          return { processedEvents: alerts.length };
        };
      `),
      timeout: cdk.Duration.minutes(1),
      environment: {
        ALERT_TOPIC_ARN: alertTopic.topicArn
      }
    });

    alertTopic.grantPublish(securityProcessor);

    // Security Metric Filters
    const suspiciousIpFilter = new logs.MetricFilter(this, 'SuspiciousIpFilter', {
      logGroup: wafLogGroup,
      metricNamespace: 'Portfolio/Security',
      metricName: 'SuspiciousIPs',
      filterPattern: logs.FilterPattern.literal('[timestamp, request_id, client_ip="BLOCK*"]'),
      metricValue: '1'
    });

    const attackAttemptFilter = new logs.MetricFilter(this, 'AttackAttemptFilter', {
      logGroup: wafLogGroup,
      metricNamespace: 'Portfolio/Security',
      metricName: 'AttackAttempts',
      filterPattern: logs.FilterPattern.anyTerm('SQL', 'XSS', 'injection', 'script'),
      metricValue: '1'
    });

    // Security Alarms
    const suspiciousIpAlarm = new cloudwatch.Alarm(this, 'SuspiciousIpAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'Portfolio/Security',
        metricName: 'SuspiciousIPs',
        statistic: 'Sum'
      }),
      threshold: 10,
      evaluationPeriods: 1,
      alarmDescription: 'Multiple IPs blocked by WAF'
    });
    suspiciousIpAlarm.addAlarmAction(new cloudwatch.SnsAction(alertTopic));

    const attackAttemptAlarm = new cloudwatch.Alarm(this, 'AttackAttemptAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'Portfolio/Security',
        metricName: 'AttackAttempts',
        statistic: 'Sum'
      }),
      threshold: 5,
      evaluationPeriods: 1,
      alarmDescription: 'Potential attack attempts detected'
    });
    attackAttemptAlarm.addAlarmAction(new cloudwatch.SnsAction(alertTopic));

    // Security Dashboard
    const securityDashboard = new cloudwatch.Dashboard(this, 'SecurityDashboard', {
      dashboardName: `portfolio-security-${environment}`,
      widgets: [
        [new cloudwatch.TextWidget({
          markdown: `# Security Monitoring - ${environment.toUpperCase()}
**Real-time security event monitoring and threat detection**`,
          width: 24, height: 2
        })],
        
        [
          new cloudwatch.GraphWidget({
            title: 'WAF Blocked Requests',
            left: [new cloudwatch.Metric({
              namespace: 'AWS/WAFv2',
              metricName: 'BlockedRequests',
              dimensionsMap: { 
                WebACL: `portfolio-waf-${environment}`,
                Region: 'CloudFront'
              }
            })],
            width: 8, height: 6
          }),
          new cloudwatch.GraphWidget({
            title: 'Security Events',
            left: [
              new cloudwatch.Metric({
                namespace: 'Portfolio/Security',
                metricName: 'SuspiciousIPs'
              }),
              new cloudwatch.Metric({
                namespace: 'Portfolio/Security',
                metricName: 'AttackAttempts'
              })
            ],
            width: 8, height: 6
          }),
          new cloudwatch.SingleValueWidget({
            title: 'Security Status',
            metrics: [
              suspiciousIpAlarm.metric,
              attackAttemptAlarm.metric
            ],
            width: 8, height: 6
          })
        ],

        [
          new cloudwatch.LogQueryWidget({
            title: 'Recent Security Events',
            logGroups: [wafLogGroup],
            queryLines: [
              'fields @timestamp, @message',
              'filter @message like /BLOCK/',
              'sort @timestamp desc',
              'limit 20'
            ],
            width: 24, height: 8
          })
        ]
      ]
    });

    // Log Insights Queries for Security
    const securityQuery = new logs.QueryDefinition(this, 'SecurityEventsQuery', {
      queryDefinitionName: `portfolio-security-events-${environment}`,
      queryString: `
        fields @timestamp, @message
        | filter @message like /BLOCK/ or @message like /RATE_LIMIT/
        | stats count() by bin(1h)
        | sort @timestamp desc
      `,
      logGroups: [wafLogGroup]
    });

    const topBlockedIpsQuery = new logs.QueryDefinition(this, 'TopBlockedIpsQuery', {
      queryDefinitionName: `portfolio-blocked-ips-${environment}`,
      queryString: `
        fields @timestamp, @message
        | filter @message like /BLOCK/
        | parse @message /clientIP":"(?<ip>[^"]+)/
        | stats count() as blocks by ip
        | sort blocks desc
        | limit 10
      `,
      logGroups: [wafLogGroup]
    });

    // Outputs
    new cdk.CfnOutput(this, 'SecurityDashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${securityDashboard.dashboardName}`,
      description: 'Security monitoring dashboard'
    });

    new cdk.CfnOutput(this, 'WAFLogGroupName', {
      value: wafLogGroup.logGroupName,
      description: 'WAF log group for security analysis'
    });

    new cdk.CfnOutput(this, 'CloudTrailLogGroupName', {
      value: cloudTrailLogGroup.logGroupName,
      description: 'CloudTrail log group for audit trail'
    });
  }
}
