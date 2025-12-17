"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityLoggingStack = void 0;
const cdk = require("aws-cdk-lib");
const logs = require("aws-cdk-lib/aws-logs");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const lambda = require("aws-cdk-lib/aws-lambda");
class SecurityLoggingStack extends cdk.Stack {
    constructor(scope, id, props) {
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
exports.SecurityLoggingStack = SecurityLoggingStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktbG9nZ2luZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY3VyaXR5LWxvZ2dpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLDZDQUE2QztBQUM3Qyx5REFBeUQ7QUFFekQsaURBQWlEO0FBWWpELE1BQWEsb0JBQXFCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDakQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFnQztRQUN4RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxjQUFjLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFMUQsdUJBQXVCO1FBQ3ZCLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUN2RSxZQUFZLEVBQUUsNkJBQTZCLFdBQVcsRUFBRTtZQUN4RCxTQUFTLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxZQUFZO1lBQzFDLGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE9BQU87U0FDekMsQ0FBQyxDQUFDO1FBRUgsZ0JBQWdCO1FBQ2hCLE1BQU0sV0FBVyxHQUFHLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3pELFlBQVksRUFBRSx3QkFBd0IsV0FBVyxFQUFFO1lBQ25ELFNBQVMsRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFNBQVM7WUFDdkMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztTQUN6QyxDQUFDLENBQUM7UUFFSCxrQ0FBa0M7UUFDbEMsTUFBTSxpQkFBaUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3ZFLE9BQU8sRUFBRSxNQUFNLENBQUMs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dEMsV0FBVyxFQUFFLHNDQUFzQztTQUNwRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFyT0Qsb0RBcU9DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW50ZXJmYWNlIFNlY3VyaXR5TG9nZ2luZ1N0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGFsZXJ0VG9waWM6IHNucy5Ub3BpYztcbiAgZGlzdHJpYnV0aW9uSWQ6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFNlY3VyaXR5TG9nZ2luZ1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNlY3VyaXR5TG9nZ2luZ1N0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHsgZW52aXJvbm1lbnQsIGFsZXJ0VG9waWMsIGRpc3RyaWJ1dGlvbklkIH0gPSBwcm9wcztcblxuICAgIC8vIENsb3VkVHJhaWwgTG9nIEdyb3VwXG4gICAgY29uc3QgY2xvdWRUcmFpbExvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0Nsb3VkVHJhaWxMb2dHcm91cCcsIHtcbiAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvY2xvdWR0cmFpbC9wb3J0Zm9saW8tJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuVEhSRUVfTU9OVEhTLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pO1xuXG4gICAgLy8gV0FGIExvZyBHcm91cFxuICAgIGNvbnN0IHdhZkxvZ0dyb3VwID0gbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1dBRkxvZ0dyb3VwJywge1xuICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy93YWZ2Mi9wb3J0Zm9saW8tJHtlbnZpcm9ubWVudH1gLFxuICAgICAgcmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX01PTlRILFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWVxuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgRXZlbnQgUHJvY2Vzc29yIExhbWJkYVxuICAgIGNvbnN0IHNlY3VyaXR5UHJvY2Vzc29yID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnU2VjdXJpdHlQcm9jZXNzb3InLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuICAgICAgICBjb25zdCBBV1MgPSByZXF1aXJlKCdhd3Mtc2RrJyk7XG4gICAgICAgIGNvbnN0IHNucyA9IG5ldyBBV1MuU05TKCk7XG5cbiAgICAgICAgZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1Byb2Nlc3Npbmcgc2VjdXJpdHkgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCBhbGVydHMgPSBbXTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBQcm9jZXNzIENsb3VkV2F0Y2ggTG9ncyBldmVudHNcbiAgICAgICAgICBpZiAoZXZlbnQuYXdzbG9ncykge1xuICAgICAgICAgICAgY29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoQnVmZmVyLmZyb20oZXZlbnQuYXdzbG9ncy5kYXRhLCAnYmFzZTY0JykudG9TdHJpbmcoJ3V0ZjgnKSk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGZvciAoY29uc3QgbG9nRXZlbnQgb2YgcGF5bG9hZC5sb2dFdmVudHMpIHtcbiAgICAgICAgICAgICAgY29uc3QgbWVzc2FnZSA9IGxvZ0V2ZW50Lm1lc3NhZ2U7XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICAvLyBEZXRlY3Qgc3VzcGljaW91cyBwYXR0ZXJuc1xuICAgICAgICAgICAgICBpZiAobWVzc2FnZS5pbmNsdWRlcygnQkxPQ0snKSB8fCBtZXNzYWdlLmluY2x1ZGVzKCdSQVRFX0xJTUlUJykpIHtcbiAgICAgICAgICAgICAgICBhbGVydHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnV0FGX0JMT0NLJyxcbiAgICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUobG9nRXZlbnQudGltZXN0YW1wKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgbWVzc2FnZTogbWVzc2FnZSxcbiAgICAgICAgICAgICAgICAgIHNldmVyaXR5OiAnTUVESVVNJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIFxuICAgICAgICAgICAgICBpZiAobWVzc2FnZS5pbmNsdWRlcygnU1FMJykgfHwgbWVzc2FnZS5pbmNsdWRlcygnWFNTJykgfHwgbWVzc2FnZS5pbmNsdWRlcygnaW5qZWN0aW9uJykpIHtcbiAgICAgICAgICAgICAgICBhbGVydHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICB0eXBlOiAnQVRUQUNLX0FUVEVNUFQnLFxuICAgICAgICAgICAgICAgICAgdGltZXN0YW1wOiBuZXcgRGF0ZShsb2dFdmVudC50aW1lc3RhbXApLnRvSVNPU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICBtZXNzYWdlOiBtZXNzYWdlLFxuICAgICAgICAgICAgICAgICAgc2V2ZXJpdHk6ICdISUdIJ1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIFNlbmQgYWxlcnRzIGZvciBoaWdoIHNldmVyaXR5IGV2ZW50c1xuICAgICAgICAgIGZvciAoY29uc3QgYWxlcnQgb2YgYWxlcnRzKSB7XG4gICAgICAgICAgICBpZiAoYWxlcnQuc2V2ZXJpdHkgPT09ICdISUdIJykge1xuICAgICAgICAgICAgICBhd2FpdCBzbnMucHVibGlzaCh7XG4gICAgICAgICAgICAgICAgVG9waWNBcm46ICcke2FsZXJ0VG9waWMudG9waWNBcm59JyxcbiAgICAgICAgICAgICAgICBTdWJqZWN0OiBcXGDwn5qoIFNlY3VyaXR5IEFsZXJ0OiBcXCR7YWxlcnQudHlwZX1cXGAsXG4gICAgICAgICAgICAgICAgTWVzc2FnZTogSlNPTi5zdHJpbmdpZnkoYWxlcnQsIG51bGwsIDIpXG4gICAgICAgICAgICAgIH0pLnByb21pc2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHsgcHJvY2Vzc2VkRXZlbnRzOiBhbGVydHMubGVuZ3RoIH07XG4gICAgICAgIH07XG4gICAgICBgKSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDEpLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQUxFUlRfVE9QSUNfQVJOOiBhbGVydFRvcGljLnRvcGljQXJuXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBhbGVydFRvcGljLmdyYW50UHVibGlzaChzZWN1cml0eVByb2Nlc3Nvcik7XG5cbiAgICAvLyBTZWN1cml0eSBNZXRyaWMgRmlsdGVyc1xuICAgIGNvbnN0IHN1c3BpY2lvdXNJcEZpbHRlciA9IG5ldyBsb2dzLk1ldHJpY0ZpbHRlcih0aGlzLCAnU3VzcGljaW91c0lwRmlsdGVyJywge1xuICAgICAgbG9nR3JvdXA6IHdhZkxvZ0dyb3VwLFxuICAgICAgbWV0cmljTmFtZXNwYWNlOiAnUG9ydGZvbGlvL1NlY3VyaXR5JyxcbiAgICAgIG1ldHJpY05hbWU6ICdTdXNwaWNpb3VzSVBzJyxcbiAgICAgIGZpbHRlclBhdHRlcm46IGxvZ3MuRmlsdGVyUGF0dGVybi5saXRlcmFsKCdbdGltZXN0YW1wLCByZXF1ZXN0X2lkLCBjbGllbnRfaXA9XCJCTE9DSypcIl0nKSxcbiAgICAgIG1ldHJpY1ZhbHVlOiAnMSdcbiAgICB9KTtcblxuICAgIGNvbnN0IGF0dGFja0F0dGVtcHRGaWx0ZXIgPSBuZXcgbG9ncy5NZXRyaWNGaWx0ZXIodGhpcywgJ0F0dGFja0F0dGVtcHRGaWx0ZXInLCB7XG4gICAgICBsb2dHcm91cDogd2FmTG9nR3JvdXAsXG4gICAgICBtZXRyaWNOYW1lc3BhY2U6ICdQb3J0Zm9saW8vU2VjdXJpdHknLFxuICAgICAgbWV0cmljTmFtZTogJ0F0dGFja0F0dGVtcHRzJyxcbiAgICAgIGZpbHRlclBhdHRlcm46IGxvZ3MuRmlsdGVyUGF0dGVybi5hbnlUZXJtKCdTUUwnLCAnWFNTJywgJ2luamVjdGlvbicsICdzY3JpcHQnKSxcbiAgICAgIG1ldHJpY1ZhbHVlOiAnMSdcbiAgICB9KTtcblxuICAgIC8vIFNlY3VyaXR5IEFsYXJtc1xuICAgIGNvbnN0IHN1c3BpY2lvdXNJcEFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ1N1c3BpY2lvdXNJcEFsYXJtJywge1xuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdQb3J0Zm9saW8vU2VjdXJpdHknLFxuICAgICAgICBtZXRyaWNOYW1lOiAnU3VzcGljaW91c0lQcycsXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bSdcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ011bHRpcGxlIElQcyBibG9ja2VkIGJ5IFdBRidcbiAgICB9KTtcbiAgICBzdXNwaWNpb3VzSXBBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaC5TbnNBY3Rpb24oYWxlcnRUb3BpYykpO1xuXG4gICAgY29uc3QgYXR0YWNrQXR0ZW1wdEFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0F0dGFja0F0dGVtcHRBbGFybScsIHtcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnUG9ydGZvbGlvL1NlY3VyaXR5JyxcbiAgICAgICAgbWV0cmljTmFtZTogJ0F0dGFja0F0dGVtcHRzJyxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJ1xuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdQb3RlbnRpYWwgYXR0YWNrIGF0dGVtcHRzIGRldGVjdGVkJ1xuICAgIH0pO1xuICAgIGF0dGFja0F0dGVtcHRBbGFybS5hZGRBbGFybUFjdGlvbihuZXcgY2xvdWR3YXRjaC5TbnNBY3Rpb24oYWxlcnRUb3BpYykpO1xuXG4gICAgLy8gU2VjdXJpdHkgRGFzaGJvYXJkXG4gICAgY29uc3Qgc2VjdXJpdHlEYXNoYm9hcmQgPSBuZXcgY2xvdWR3YXRjaC5EYXNoYm9hcmQodGhpcywgJ1NlY3VyaXR5RGFzaGJvYXJkJywge1xuICAgICAgZGFzaGJvYXJkTmFtZTogYHBvcnRmb2xpby1zZWN1cml0eS0ke2Vudmlyb25tZW50fWAsXG4gICAgICB3aWRnZXRzOiBbXG4gICAgICAgIFtuZXcgY2xvdWR3YXRjaC5UZXh0V2lkZ2V0KHtcbiAgICAgICAgICBtYXJrZG93bjogYCMgU2VjdXJpdHkgTW9uaXRvcmluZyAtICR7ZW52aXJvbm1lbnQudG9VcHBlckNhc2UoKX1cbioqUmVhbC10aW1lIHNlY3VyaXR5IGV2ZW50IG1vbml0b3JpbmcgYW5kIHRocmVhdCBkZXRlY3Rpb24qKmAsXG4gICAgICAgICAgd2lkdGg6IDI0LCBoZWlnaHQ6IDJcbiAgICAgICAgfSldLFxuICAgICAgICBcbiAgICAgICAgW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgICAgIHRpdGxlOiAnV0FGIEJsb2NrZWQgUmVxdWVzdHMnLFxuICAgICAgICAgICAgbGVmdDogW25ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9XQUZ2MicsXG4gICAgICAgICAgICAgIG1ldHJpY05hbWU6ICdCbG9ja2VkUmVxdWVzdHMnLFxuICAgICAgICAgICAgICBkaW1lbnNpb25zTWFwOiB7IFxuICAgICAgICAgICAgICAgIFdlYkFDTDogYHBvcnRmb2xpby13YWYtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICAgICAgICAgIFJlZ2lvbjogJ0Nsb3VkRnJvbnQnXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXSxcbiAgICAgICAgICAgIHdpZHRoOiA4LCBoZWlnaHQ6IDZcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgICAgICB0aXRsZTogJ1NlY3VyaXR5IEV2ZW50cycsXG4gICAgICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnUG9ydGZvbGlvL1NlY3VyaXR5JyxcbiAgICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnU3VzcGljaW91c0lQcydcbiAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICAgICAgbmFtZXNwYWNlOiAnUG9ydGZvbGlvL1NlY3VyaXR5JyxcbiAgICAgICAgICAgICAgICBtZXRyaWNOYW1lOiAnQXR0YWNrQXR0ZW1wdHMnXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgd2lkdGg6IDgsIGhlaWdodDogNlxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLlNpbmdsZVZhbHVlV2lkZ2V0KHtcbiAgICAgICAgICAgIHRpdGxlOiAnU2VjdXJpdHkgU3RhdHVzJyxcbiAgICAgICAgICAgIG1ldHJpY3M6IFtcbiAgICAgICAgICAgICAgc3VzcGljaW91c0lwQWxhcm0ubWV0cmljLFxuICAgICAgICAgICAgICBhdHRhY2tBdHRlbXB0QWxhcm0ubWV0cmljXG4gICAgICAgICAgICBdLFxuICAgICAgICAgICAgd2lkdGg6IDgsIGhlaWdodDogNlxuICAgICAgICAgIH0pXG4gICAgICAgIF0sXG5cbiAgICAgICAgW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLkxvZ1F1ZXJ5V2lkZ2V0KHtcbiAgICAgICAgICAgIHRpdGxlOiAnUmVjZW50IFNlY3VyaXR5IEV2ZW50cycsXG4gICAgICAgICAgICBsb2dHcm91cHM6IFt3YWZMb2dHcm91cF0sXG4gICAgICAgICAgICBxdWVyeUxpbmVzOiBbXG4gICAgICAgICAgICAgICdmaWVsZHMgQHRpbWVzdGFtcCwgQG1lc3NhZ2UnLFxuICAgICAgICAgICAgICAnZmlsdGVyIEBtZXNzYWdlIGxpa2UgL0JMT0NLLycsXG4gICAgICAgICAgICAgICdzb3J0IEB0aW1lc3RhbXAgZGVzYycsXG4gICAgICAgICAgICAgICdsaW1pdCAyMCdcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgICB3aWR0aDogMjQsIGhlaWdodDogOFxuICAgICAgICAgIH0pXG4gICAgICAgIF1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIExvZyBJbnNpZ2h0cyBRdWVyaWVzIGZvciBTZWN1cml0eVxuICAgIGNvbnN0IHNlY3VyaXR5UXVlcnkgPSBuZXcgbG9ncy5RdWVyeURlZmluaXRpb24odGhpcywgJ1NlY3VyaXR5RXZlbnRzUXVlcnknLCB7XG4gICAgICBxdWVyeURlZmluaXRpb25OYW1lOiBgcG9ydGZvbGlvLXNlY3VyaXR5LWV2ZW50cy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBxdWVyeVN0cmluZzogYFxuICAgICAgICBmaWVsZHMgQHRpbWVzdGFtcCwgQG1lc3NhZ2VcbiAgICAgICAgfCBmaWx0ZXIgQG1lc3NhZ2UgbGlrZSAvQkxPQ0svIG9yIEBtZXNzYWdlIGxpa2UgL1JBVEVfTElNSVQvXG4gICAgICAgIHwgc3RhdHMgY291bnQoKSBieSBiaW4oMWgpXG4gICAgICAgIHwgc29ydCBAdGltZXN0YW1wIGRlc2NcbiAgICAgIGAsXG4gICAgICBsb2dHcm91cHM6IFt3YWZMb2dHcm91cF1cbiAgICB9KTtcblxuICAgIGNvbnN0IHRvcEJsb2NrZWRJcHNRdWVyeSA9IG5ldyBsb2dzLlF1ZXJ5RGVmaW5pdGlvbih0aGlzLCAnVG9wQmxvY2tlZElwc1F1ZXJ5Jywge1xuICAgICAgcXVlcnlEZWZpbml0aW9uTmFtZTogYHBvcnRmb2xpby1ibG9ja2VkLWlwcy0ke2Vudmlyb25tZW50fWAsXG4gICAgICBxdWVyeVN0cmluZzogYFxuICAgICAgICBmaWVsZHMgQHRpbWVzdGFtcCwgQG1lc3NhZ2VcbiAgICAgICAgfCBmaWx0ZXIgQG1lc3NhZ2UgbGlrZSAvQkxPQ0svXG4gICAgICAgIHwgcGFyc2UgQG1lc3NhZ2UgL2NsaWVudElQXCI6XCIoPzxpcD5bXlwiXSspL1xuICAgICAgICB8IHN0YXRzIGNvdW50KCkgYXMgYmxvY2tzIGJ5IGlwXG4gICAgICAgIHwgc29ydCBibG9ja3MgZGVzY1xuICAgICAgICB8IGxpbWl0IDEwXG4gICAgICBgLFxuICAgICAgbG9nR3JvdXBzOiBbd2FmTG9nR3JvdXBdXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NlY3VyaXR5RGFzaGJvYXJkVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC9ob21lP3JlZ2lvbj0ke3RoaXMucmVnaW9ufSNkYXNoYm9hcmRzOm5hbWU9JHtzZWN1cml0eURhc2hib2FyZC5kYXNoYm9hcmROYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IG1vbml0b3JpbmcgZGFzaGJvYXJkJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dBRkxvZ0dyb3VwTmFtZScsIHtcbiAgICAgIHZhbHVlOiB3YWZMb2dHcm91cC5sb2dHcm91cE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1dBRiBsb2cgZ3JvdXAgZm9yIHNlY3VyaXR5IGFuYWx5c2lzJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Nsb3VkVHJhaWxMb2dHcm91cE5hbWUnLCB7XG4gICAgICB2YWx1ZTogY2xvdWRUcmFpbExvZ0dyb3VwLmxvZ0dyb3VwTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRUcmFpbCBsb2cgZ3JvdXAgZm9yIGF1ZGl0IHRyYWlsJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=