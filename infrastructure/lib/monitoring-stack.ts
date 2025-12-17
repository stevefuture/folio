import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

interface MonitoringStackProps extends cdk.StackProps {
  environment: string;
  alertEmail?: string;
  apiFunction: lambda.Function;
  imageOptFunction?: lambda.Function;
  seoFunction?: lambda.Function;
  distributionId: string;
  tableName: string;
  bucketName: string;
}

export class MonitoringStack extends cdk.Stack {
  public readonly alertTopic: sns.Topic;

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    const { environment, alertEmail, apiFunction, imageOptFunction, seoFunction, distributionId, tableName, bucketName } = props;

    // SNS Topic for alerts
    this.alertTopic = new sns.Topic(this, 'AlertTopic', {
      topicName: `portfolio-alerts-${environment}`,
      displayName: 'Portfolio Monitoring Alerts'
    });

    if (alertEmail) {
      this.alertTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
    }

    // Log Groups
    const apiLogGroup = new logs.LogGroup(this, 'ApiLogGroup', {
      logGroupName: `/aws/lambda/${apiFunction.functionName}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Frontend Performance Alarms
    const highErrorRate = new cloudwatch.Alarm(this, 'HighErrorRate', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: '4xxErrorRate',
        dimensionsMap: { DistributionId: distributionId },
        statistic: 'Average'
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: 'High 4xx error rate on CloudFront'
    });
    highErrorRate.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

    const slowResponseTime = new cloudwatch.Alarm(this, 'SlowResponseTime', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/CloudFront',
        metricName: 'OriginLatency',
        dimensionsMap: { DistributionId: distributionId },
        statistic: 'Average'
      }),
      threshold: 3000,
      evaluationPeriods: 3,
      alarmDescription: 'Slow origin response time (>3s)'
    });
    slowResponseTime.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

    // Backend Error Alarms
    const apiErrors = new cloudwatch.Alarm(this, 'ApiErrors', {
      metric: apiFunction.metricErrors(),
      threshold: 5,
      evaluationPeriods: 2,
      alarmDescription: 'High error rate in API Lambda'
    });
    apiErrors.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

    const apiDuration = new cloudwatch.Alarm(this, 'ApiDuration', {
      metric: apiFunction.metricDuration(),
      threshold: cdk.Duration.seconds(10).toMilliseconds(),
      evaluationPeriods: 3,
      alarmDescription: 'API Lambda duration >10s'
    });
    apiDuration.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

    // DynamoDB Alarms
    const dbThrottles = new cloudwatch.Alarm(this, 'DbThrottles', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/DynamoDB',
        metricName: 'ThrottledRequests',
        dimensionsMap: { TableName: tableName },
        statistic: 'Sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'DynamoDB throttling detected'
    });
    dbThrottles.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

    // Security Alarms
    const suspiciousActivity = new cloudwatch.Alarm(this, 'SuspiciousActivity', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/WAFv2',
        metricName: 'BlockedRequests',
        dimensionsMap: { 
          WebACL: `portfolio-waf-${environment}`,
          Region: 'CloudFront'
        },
        statistic: 'Sum'
      }),
      threshold: 100,
      evaluationPeriods: 1,
      alarmDescription: 'High number of blocked requests (>100/5min)'
    });
    suspiciousActivity.addAlarmAction(new cloudwatch.SnsAction(this.alertTopic));

    // Main Dashboard
    const dashboard = new cloudwatch.Dashboard(this, 'PortfolioDashboard', {
      dashboardName: `portfolio-${environment}`,
      widgets: [
        // Header
        [new cloudwatch.TextWidget({
          markdown: `# Portfolio Monitoring - ${environment.toUpperCase()}
**Environment**: ${environment} | **Updated**: ${new Date().toISOString()}`,
          width: 24, height: 2
        })],

        // Frontend Performance Row
        [
          new cloudwatch.GraphWidget({
            title: 'CloudFront Requests',
            left: [new cloudwatch.Metric({
              namespace: 'AWS/CloudFront',
              metricName: 'Requests',
              dimensionsMap: { DistributionId: distributionId }
            })],
            width: 8, height: 6
          }),
          new cloudwatch.GraphWidget({
            title: 'Error Rates',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/CloudFront',
                metricName: '4xxErrorRate',
                dimensionsMap: { DistributionId: distributionId }
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/CloudFront',
                metricName: '5xxErrorRate',
                dimensionsMap: { DistributionId: distributionId }
              })
            ],
            width: 8, height: 6
          }),
          new cloudwatch.GraphWidget({
            title: 'Cache Hit Rate',
            left: [new cloudwatch.Metric({
              namespace: 'AWS/CloudFront',
              metricName: 'CacheHitRate',
              dimensionsMap: { DistributionId: distributionId }
            })],
            width: 8, height: 6
          })
        ],

        // Backend Performance Row
        [
          new cloudwatch.GraphWidget({
            title: 'Lambda Invocations',
            left: [apiFunction.metricInvocations()],
            width: 8, height: 6
          }),
          new cloudwatch.GraphWidget({
            title: 'Lambda Errors & Duration',
            left: [apiFunction.metricErrors()],
            right: [apiFunction.metricDuration()],
            width: 8, height: 6
          }),
          new cloudwatch.GraphWidget({
            title: 'DynamoDB Operations',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/DynamoDB',
                metricName: 'ConsumedReadCapacityUnits',
                dimensionsMap: { TableName: tableName }
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/DynamoDB',
                metricName: 'ConsumedWriteCapacityUnits',
                dimensionsMap: { TableName: tableName }
              })
            ],
            width: 8, height: 6
          })
        ],

        // Security Row
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
            width: 12, height: 6
          }),
          new cloudwatch.SingleValueWidget({
            title: 'Active Alarms',
            metrics: [
              highErrorRate.metric,
              apiErrors.metric,
              dbThrottles.metric
            ],
            width: 12, height: 6
          })
        ]
      ]
    });

    // Performance Dashboard
    const perfDashboard = new cloudwatch.Dashboard(this, 'PerformanceDashboard', {
      dashboardName: `portfolio-performance-${environment}`,
      widgets: [
        [new cloudwatch.TextWidget({
          markdown: `# Performance Metrics - ${environment.toUpperCase()}`,
          width: 24, height: 2
        })],
        [
          new cloudwatch.GraphWidget({
            title: 'Response Times',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/CloudFront',
                metricName: 'OriginLatency',
                dimensionsMap: { DistributionId: distributionId },
                label: 'Origin Latency'
              }),
              apiFunction.metricDuration({ label: 'API Duration' })
            ],
            width: 12, height: 8
          }),
          new cloudwatch.GraphWidget({
            title: 'Throughput',
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/CloudFront',
                metricName: 'Requests',
                dimensionsMap: { DistributionId: distributionId },
                statistic: 'Sum'
              }),
              apiFunction.metricInvocations({ statistic: 'Sum' })
            ],
            width: 12, height: 8
          })
        ]
      ]
    });

    // Log Insights Queries
    const errorQuery = new logs.QueryDefinition(this, 'ErrorQuery', {
      queryDefinitionName: `portfolio-errors-${environment}`,
      queryString: `
        fields @timestamp, @message, @requestId
        | filter @message like /ERROR/
        | sort @timestamp desc
        | limit 100
      `,
      logGroups: [apiLogGroup]
    });

    const performanceQuery = new logs.QueryDefinition(this, 'PerformanceQuery', {
      queryDefinitionName: `portfolio-performance-${environment}`,
      queryString: `
        fields @timestamp, @duration, @requestId
        | filter @type = "REPORT"
        | stats avg(@duration), max(@duration), min(@duration) by bin(5m)
      `,
      logGroups: [apiLogGroup]
    });

    // Outputs
    new cdk.CfnOutput(this, 'DashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${dashboard.dashboardName}`,
      description: 'Main monitoring dashboard'
    });

    new cdk.CfnOutput(this, 'PerformanceDashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${perfDashboard.dashboardName}`,
      description: 'Performance monitoring dashboard'
    });

    new cdk.CfnOutput(this, 'AlertTopicArn', {
      value: this.alertTopic.topicArn,
      description: 'SNS topic for monitoring alerts'
    });
  }
}
