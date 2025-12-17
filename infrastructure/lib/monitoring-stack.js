"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringStack = void 0;
const cdk = require("aws-cdk-lib");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const logs = require("aws-cdk-lib/aws-logs");
const sns = require("aws-cdk-lib/aws-sns");
const subscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
class MonitoringStack extends cdk.Stack {
    constructor(scope, id, props) {
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
exports.MonitoringStack = MonitoringStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibW9uaXRvcmluZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIm1vbml0b3Jpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLHlEQUF5RDtBQUN6RCw2Q0FBNkM7QUFDN0MsMkNBQTJDO0FBQzNDLG1FQUFtRTtBQWVuRSxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFHNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUEyQjtRQUNuRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDO1FBRTdILHVCQUF1QjtRQUN2QixJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ2xELFNBQVMsRUFBRSxvQkFBb0IsV0FBVyxFQUFFO1lBQzVDLFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxVQUFVLEVBQUUsQ0FBQztZQUNmLElBQUksQ0FBQyxVQUFVLENBQUMsZUFBZSxDQUFDLElBQUksYUFBYSxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDbkYsQ0FBQztRQUVELGFBQWE7UUFDYixNQUFNLFdBQVcsR0FBRyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUN6RCxZQUFZLEVBQUUsZUFBZSxXQUFXLENBQUMsWUFBWSxFQUFFO1lBQ3ZELFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7WUFDdkMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUN6QyxD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QUssRUFBRSx5REFBeUQsSUFBSSxDQUFDLE1BQU0sb0JBQW9CLFNBQVMsQ0FBQyxhQUFhLEVBQUU7WUFDeEgsV0FBVyxFQUFFLDJCQUEyQjtTQUN6QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLHlCQUF5QixFQUFFO1lBQ2pELEtBQUssRUFBRSx5REFBeUQsSUFBSSxDQUFDLE1BQU0sb0JBQW9CLGFBQWEsQ0FBQyxhQUFhLEVBQUU7WUFDNUgsV0FBVyxFQUFFLGtDQUFrQztTQUNoRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRO1lBQy9CLFdBQVcsRUFBRSxpQ0FBaUM7U0FDL0MsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBN1JELDBDQTZSQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgc3Vic2NyaXB0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zLXN1YnNjcmlwdGlvbnMnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBNb25pdG9yaW5nU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgYWxlcnRFbWFpbD86IHN0cmluZztcbiAgYXBpRnVuY3Rpb246IGxhbWJkYS5GdW5jdGlvbjtcbiAgaW1hZ2VPcHRGdW5jdGlvbj86IGxhbWJkYS5GdW5jdGlvbjtcbiAgc2VvRnVuY3Rpb24/OiBsYW1iZGEuRnVuY3Rpb247XG4gIGRpc3RyaWJ1dGlvbklkOiBzdHJpbmc7XG4gIHRhYmxlTmFtZTogc3RyaW5nO1xuICBidWNrZXROYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBNb25pdG9yaW5nU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgYWxlcnRUb3BpYzogc25zLlRvcGljO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBNb25pdG9yaW5nU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgeyBlbnZpcm9ubWVudCwgYWxlcnRFbWFpbCwgYXBpRnVuY3Rpb24sIGltYWdlT3B0RnVuY3Rpb24sIHNlb0Z1bmN0aW9uLCBkaXN0cmlidXRpb25JZCwgdGFibGVOYW1lLCBidWNrZXROYW1lIH0gPSBwcm9wcztcblxuICAgIC8vIFNOUyBUb3BpYyBmb3IgYWxlcnRzXG4gICAgdGhpcy5hbGVydFRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnQWxlcnRUb3BpYycsIHtcbiAgICAgIHRvcGljTmFtZTogYHBvcnRmb2xpby1hbGVydHMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGlzcGxheU5hbWU6ICdQb3J0Zm9saW8gTW9uaXRvcmluZyBBbGVydHMnXG4gICAgfSk7XG5cbiAgICBpZiAoYWxlcnRFbWFpbCkge1xuICAgICAgdGhpcy5hbGVydFRvcGljLmFkZFN1YnNjcmlwdGlvbihuZXcgc3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbihhbGVydEVtYWlsKSk7XG4gICAgfVxuXG4gICAgLy8gTG9nIEdyb3Vwc1xuICAgIGNvbnN0IGFwaUxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0FwaUxvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9sYW1iZGEvJHthcGlGdW5jdGlvbi5mdW5jdGlvbk5hbWV9YCxcbiAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9NT05USCxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICB9KTtcblxuICAgIC8vIEZyb250ZW5kIFBlcmZvcm1hbmNlIEFsYXJtc1xuICAgIGNvbnN0IGhpZ2hFcnJvclJhdGUgPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnSGlnaEVycm9yUmF0ZScsIHtcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0Nsb3VkRnJvbnQnLFxuICAgICAgICBtZXRyaWNOYW1lOiAnNHh4RXJyb3JSYXRlJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDogeyBEaXN0cmlidXRpb25JZDogZGlzdHJpYnV0aW9uSWQgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZSdcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiA1LFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElORyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdIaWdoIDR4eCBlcnJvciByYXRlIG9uIENsb3VkRnJvbnQnXG4gICAgfSk7XG4gICAgaGlnaEVycm9yUmF0ZS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaC5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XG5cbiAgICBjb25zdCBzbG93UmVzcG9uc2VUaW1lID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ1Nsb3dSZXNwb25zZVRpbWUnLCB7XG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9DbG91ZEZyb250JyxcbiAgICAgICAgbWV0cmljTmFtZTogJ09yaWdpbkxhdGVuY3knLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7IERpc3RyaWJ1dGlvbklkOiBkaXN0cmlidXRpb25JZCB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJ1xuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDMwMDAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdTbG93IG9yaWdpbiByZXNwb25zZSB0aW1lICg+M3MpJ1xuICAgIH0pO1xuICAgIHNsb3dSZXNwb25zZVRpbWUuYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2guU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gQmFja2VuZCBFcnJvciBBbGFybXNcbiAgICBjb25zdCBhcGlFcnJvcnMgPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQXBpRXJyb3JzJywge1xuICAgICAgbWV0cmljOiBhcGlGdW5jdGlvbi5tZXRyaWNFcnJvcnMoKSxcbiAgICAgIHRocmVzaG9sZDogNSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0hpZ2ggZXJyb3IgcmF0ZSBpbiBBUEkgTGFtYmRhJ1xuICAgIH0pO1xuICAgIGFwaUVycm9ycy5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaC5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XG5cbiAgICBjb25zdCBhcGlEdXJhdGlvbiA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdBcGlEdXJhdGlvbicsIHtcbiAgICAgIG1ldHJpYzogYXBpRnVuY3Rpb24ubWV0cmljRHVyYXRpb24oKSxcbiAgICAgIHRocmVzaG9sZDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMTApLnRvTWlsbGlzZWNvbmRzKCksXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMyxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdBUEkgTGFtYmRhIGR1cmF0aW9uID4xMHMnXG4gICAgfSk7XG4gICAgYXBpRHVyYXRpb24uYWRkQWxhcm1BY3Rpb24obmV3IGNsb3Vkd2F0Y2guU25zQWN0aW9uKHRoaXMuYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gRHluYW1vREIgQWxhcm1zXG4gICAgY29uc3QgZGJUaHJvdHRsZXMgPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnRGJUaHJvdHRsZXMnLCB7XG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXG4gICAgICAgIG1ldHJpY05hbWU6ICdUaHJvdHRsZWRSZXF1ZXN0cycsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgVGFibGVOYW1lOiB0YWJsZU5hbWUgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJ1xuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdEeW5hbW9EQiB0aHJvdHRsaW5nIGRldGVjdGVkJ1xuICAgIH0pO1xuICAgIGRiVGhyb3R0bGVzLmFkZEFsYXJtQWN0aW9uKG5ldyBjbG91ZHdhdGNoLlNuc0FjdGlvbih0aGlzLmFsZXJ0VG9waWMpKTtcblxuICAgIC8vIFNlY3VyaXR5IEFsYXJtc1xuICAgIGNvbnN0IHN1c3BpY2lvdXNBY3Rpdml0eSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdTdXNwaWNpb3VzQWN0aXZpdHknLCB7XG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9XQUZ2MicsXG4gICAgICAgIG1ldHJpY05hbWU6ICdCbG9ja2VkUmVxdWVzdHMnLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7IFxuICAgICAgICAgIFdlYkFDTDogYHBvcnRmb2xpby13YWYtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICAgIFJlZ2lvbjogJ0Nsb3VkRnJvbnQnXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bSdcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMDAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdIaWdoIG51bWJlciBvZiBibG9ja2VkIHJlcXVlc3RzICg+MTAwLzVtaW4pJ1xuICAgIH0pO1xuICAgIHN1c3BpY2lvdXNBY3Rpdml0eS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaC5TbnNBY3Rpb24odGhpcy5hbGVydFRvcGljKSk7XG5cbiAgICAvLyBNYWluIERhc2hib2FyZFxuICAgIGNvbnN0IGRhc2hib2FyZCA9IG5ldyBjbG91ZHdhdGNoLkRhc2hib2FyZCh0aGlzLCAnUG9ydGZvbGlvRGFzaGJvYXJkJywge1xuICAgICAgZGFzaGJvYXJkTmFtZTogYHBvcnRmb2xpby0ke2Vudmlyb25tZW50fWAsXG4gICAgICB3aWRnZXRzOiBbXG4gICAgICAgIC8vIEhlYWRlclxuICAgICAgICBbbmV3IGNsb3Vkd2F0Y2guVGV4dFdpZGdldCh7XG4gICAgICAgICAgbWFya2Rvd246IGAjIFBvcnRmb2xpbyBNb25pdG9yaW5nIC0gJHtlbnZpcm9ubWVudC50b1VwcGVyQ2FzZSgpfVxuKipFbnZpcm9ubWVudCoqOiAke2Vudmlyb25tZW50fSB8ICoqVXBkYXRlZCoqOiAke25ldyBEYXRlKCkudG9JU09TdHJpbmcoKX1gLFxuICAgICAgICAgIHdpZHRoOiAyNCwgaGVpZ2h0OiAyXG4gICAgICAgIH0pXSxcblxuICAgICAgICAvLyBGcm9udGVuZCBQZXJmb3JtYW5jZSBSb3dcbiAgICAgICAgW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgICAgIHRpdGxlOiAnQ2xvdWRGcm9udCBSZXF1ZXN0cycsXG4gICAgICAgICAgICBsZWZ0OiBbbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0Nsb3VkRnJvbnQnLFxuICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnUmVxdWVzdHMnLFxuICAgICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7IERpc3RyaWJ1dGlvbklkOiBkaXN0cmlidXRpb25JZCB9XG4gICAgICAgICAgICB9KV0sXG4gICAgICAgICAgICB3aWR0aDogOCwgaGVpZ2h0OiA2XG4gICAgICAgICAgfSksXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICAgICAgdGl0bGU6ICdFcnJvciBSYXRlcycsXG4gICAgICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0Nsb3VkRnJvbnQnLFxuICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6ICc0eHhFcnJvclJhdGUnLFxuICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRGlzdHJpYnV0aW9uSWQ6IGRpc3RyaWJ1dGlvbklkIH1cbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0Nsb3VkRnJvbnQnLFxuICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6ICc1eHhFcnJvclJhdGUnLFxuICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgRGlzdHJpYnV0aW9uSWQ6IGRpc3RyaWJ1dGlvbklkIH1cbiAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB3aWR0aDogOCwgaGVpZ2h0OiA2XG4gICAgICAgICAgfSksXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICAgICAgdGl0bGU6ICdDYWNoZSBIaXQgUmF0ZScsXG4gICAgICAgICAgICBsZWZ0OiBbbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0Nsb3VkRnJvbnQnLFxuICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnQ2FjaGVIaXRSYXRlJyxcbiAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBEaXN0cmlidXRpb25JZDogZGlzdHJpYnV0aW9uSWQgfVxuICAgICAgICAgICAgfSldLFxuICAgICAgICAgICAgd2lkdGg6IDgsIGhlaWdodDogNlxuICAgICAgICAgIH0pXG4gICAgICAgIF0sXG5cbiAgICAgICAgLy8gQmFja2VuZCBQZXJmb3JtYW5jZSBSb3dcbiAgICAgICAgW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgICAgIHRpdGxlOiAnTGFtYmRhIEludm9jYXRpb25zJyxcbiAgICAgICAgICAgIGxlZnQ6IFthcGlGdW5jdGlvbi5tZXRyaWNJbnZvY2F0aW9ucygpXSxcbiAgICAgICAgICAgIHdpZHRoOiA4LCBoZWlnaHQ6IDZcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgICAgICB0aXRsZTogJ0xhbWJkYSBFcnJvcnMgJiBEdXJhdGlvbicsXG4gICAgICAgICAgICBsZWZ0OiBbYXBpRnVuY3Rpb24ubWV0cmljRXJyb3JzKCldLFxuICAgICAgICAgICAgcmlnaHQ6IFthcGlGdW5jdGlvbi5tZXRyaWNEdXJhdGlvbigpXSxcbiAgICAgICAgICAgIHdpZHRoOiA4LCBoZWlnaHQ6IDZcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgICAgICB0aXRsZTogJ0R5bmFtb0RCIE9wZXJhdGlvbnMnLFxuICAgICAgICAgICAgbGVmdDogW1xuICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9EeW5hbW9EQicsXG4gICAgICAgICAgICAgICAgbWV0cmljTmFtZTogJ0NvbnN1bWVkUmVhZENhcGFjaXR5VW5pdHMnLFxuICAgICAgICAgICAgICAgIGRpbWVuc2lvbnNNYXA6IHsgVGFibGVOYW1lOiB0YWJsZU5hbWUgfVxuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvRHluYW1vREInLFxuICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdDb25zdW1lZFdyaXRlQ2FwYWNpdHlVbml0cycsXG4gICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBUYWJsZU5hbWU6IHRhYmxlTmFtZSB9XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgd2lkdGg6IDgsIGhlaWdodDogNlxuICAgICAgICAgIH0pXG4gICAgICAgIF0sXG5cbiAgICAgICAgLy8gU2VjdXJpdHkgUm93XG4gICAgICAgIFtcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgICAgICB0aXRsZTogJ1dBRiBCbG9ja2VkIFJlcXVlc3RzJyxcbiAgICAgICAgICAgIGxlZnQ6IFtuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvV0FGdjInLFxuICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnQmxvY2tlZFJlcXVlc3RzJyxcbiAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBcbiAgICAgICAgICAgICAgICBXZWJBQ0w6IGBwb3J0Zm9saW8td2FmLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgICAgICAgICAgICBSZWdpb246ICdDbG91ZEZyb250J1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KV0sXG4gICAgICAgICAgICB3aWR0aDogMTIsIGhlaWdodDogNlxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLlNpbmdsZVZhbHVlV2lkZ2V0KHtcbiAgICAgICAgICAgIHRpdGxlOiAnQWN0aXZlIEFsYXJtcycsXG4gICAgICAgICAgICBtZXRyaWNzOiBbXG4gICAgICAgICAgICAgIGhpZ2hFcnJvclJhdGUubWV0cmljLFxuICAgICAgICAgICAgICBhcGlFcnJvcnMubWV0cmljLFxuICAgICAgICAgICAgICBkYlRocm90dGxlcy5tZXRyaWNcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB3aWR0aDogMTIsIGhlaWdodDogNlxuICAgICAgICAgIH0pXG4gICAgICAgIF1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIFBlcmZvcm1hbmNlIERhc2hib2FyZFxuICAgIGNvbnN0IHBlcmZEYXNoYm9hcmQgPSBuZXcgY2xvdWR3YXRjaC5EYXNoYm9hcmQodGhpcywgJ1BlcmZvcm1hbmNlRGFzaGJvYXJkJywge1xuICAgICAgZGFzaGJvYXJkTmFtZTogYHBvcnRmb2xpby1wZXJmb3JtYW5jZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICB3aWRnZXRzOiBbXG4gICAgICAgIFtuZXcgY2xvdWR3YXRjaC5UZXh0V2lkZ2V0KHtcbiAgICAgICAgICBtYXJrZG93bjogYCMgUGVyZm9ybWFuY2UgTWV0cmljcyAtICR7ZW52aXJvbm1lbnQudG9VcHBlckNhc2UoKX1gLFxuICAgICAgICAgIHdpZHRoOiAyNCwgaGVpZ2h0OiAyXG4gICAgICAgIH0pXSxcbiAgICAgICAgW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgICAgIHRpdGxlOiAnUmVzcG9uc2UgVGltZXMnLFxuICAgICAgICAgICAgbGVmdDogW1xuICAgICAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9DbG91ZEZyb250JyxcbiAgICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnT3JpZ2luTGF0ZW5jeScsXG4gICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBEaXN0cmlidXRpb25JZDogZGlzdHJpYnV0aW9uSWQgfSxcbiAgICAgICAgICAgICAgICBsYWJlbDogJ09yaWdpbiBMYXRlbmN5J1xuICAgICAgICAgICAgICB9KSxcbiAgICAgICAgICAgICAgYXBpRnVuY3Rpb24ubWV0cmljRHVyYXRpb24oeyBsYWJlbDogJ0FQSSBEdXJhdGlvbicgfSlcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB3aWR0aDogMTIsIGhlaWdodDogOFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgICAgIHRpdGxlOiAnVGhyb3VnaHB1dCcsXG4gICAgICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0Nsb3VkRnJvbnQnLFxuICAgICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdSZXF1ZXN0cycsXG4gICAgICAgICAgICAgICAgZGltZW5zaW9uc01hcDogeyBEaXN0cmlidXRpb25JZDogZGlzdHJpYnV0aW9uSWQgfSxcbiAgICAgICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nXG4gICAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgICBhcGlGdW5jdGlvbi5tZXRyaWNJbnZvY2F0aW9ucyh7IHN0YXRpc3RpYzogJ1N1bScgfSlcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB3aWR0aDogMTIsIGhlaWdodDogOFxuICAgICAgICAgIH0pXG4gICAgICAgIF1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIExvZyBJbnNpZ2h0cyBRdWVyaWVzXG4gICAgY29uc3QgZXJyb3JRdWVyeSA9IG5ldyBsb2dzLlF1ZXJ5RGVmaW5pdGlvbih0aGlzLCAnRXJyb3JRdWVyeScsIHtcbiAgICAgIHF1ZXJ5RGVmaW5pdGlvbk5hbWU6IGBwb3J0Zm9saW8tZXJyb3JzLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIHF1ZXJ5U3RyaW5nOiBgXG4gICAgICAgIGZpZWxkcyBAdGltZXN0YW1wLCBAbWVzc2FnZSwgQHJlcXVlc3RJZFxuICAgICAgICB8IGZpbHRlciBAbWVzc2FnZSBsaWtlIC9FUlJPUi9cbiAgICAgICAgfCBzb3J0IEB0aW1lc3RhbXAgZGVzY1xuICAgICAgICB8IGxpbWl0IDEwMFxuICAgICAgYCxcbiAgICAgIGxvZ0dyb3VwczogW2FwaUxvZ0dyb3VwXVxuICAgIH0pO1xuXG4gICAgY29uc3QgcGVyZm9ybWFuY2VRdWVyeSA9IG5ldyBsb2dzLlF1ZXJ5RGVmaW5pdGlvbih0aGlzLCAnUGVyZm9ybWFuY2VRdWVyeScsIHtcbiAgICAgIHF1ZXJ5RGVmaW5pdGlvbk5hbWU6IGBwb3J0Zm9saW8tcGVyZm9ybWFuY2UtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcXVlcnlTdHJpbmc6IGBcbiAgICAgICAgZmllbGRzIEB0aW1lc3RhbXAsIEBkdXJhdGlvbiwgQHJlcXVlc3RJZFxuICAgICAgICB8IGZpbHRlciBAdHlwZSA9IFwiUkVQT1JUXCJcbiAgICAgICAgfCBzdGF0cyBhdmcoQGR1cmF0aW9uKSwgbWF4KEBkdXJhdGlvbiksIG1pbihAZHVyYXRpb24pIGJ5IGJpbig1bSlcbiAgICAgIGAsXG4gICAgICBsb2dHcm91cHM6IFthcGlMb2dHcm91cF1cbiAgICB9KTtcblxuICAgIC8vIE91dHB1dHNcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGFzaGJvYXJkVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC9ob21lP3JlZ2lvbj0ke3RoaXMucmVnaW9ufSNkYXNoYm9hcmRzOm5hbWU9JHtkYXNoYm9hcmQuZGFzaGJvYXJkTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246ICdNYWluIG1vbml0b3JpbmcgZGFzaGJvYXJkJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BlcmZvcm1hbmNlRGFzaGJvYXJkVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC9ob21lP3JlZ2lvbj0ke3RoaXMucmVnaW9ufSNkYXNoYm9hcmRzOm5hbWU9JHtwZXJmRGFzaGJvYXJkLmRhc2hib2FyZE5hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUGVyZm9ybWFuY2UgbW9uaXRvcmluZyBkYXNoYm9hcmQnXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQWxlcnRUb3BpY0FybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFsZXJ0VG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyB0b3BpYyBmb3IgbW9uaXRvcmluZyBhbGVydHMnXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==