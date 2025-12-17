"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityMonitoringStack = void 0;
const cdk = require("aws-cdk-lib");
const logs = require("aws-cdk-lib/aws-logs");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const sns = require("aws-cdk-lib/aws-sns");
const subscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
const lambda = require("aws-cdk-lib/aws-lambda");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const guardduty = require("aws-cdk-lib/aws-guardduty");
const config = require("aws-cdk-lib/aws-config");
class SecurityMonitoringStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Create SNS topic for security alerts
        this.securityAlertsTopic = new sns.Topic(this, 'SecurityAlerts', {
            displayName: `Portfolio Security Alerts - ${props.environment}`,
            topicName: `portfolio-security-alerts-${props.environment}`
        });
        // Add email subscription
        this.securityAlertsTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
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
    createSecurityAlarms(logGroups, environment) {
        const alarms = [];
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
        failedAuthAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.securityAlertsTopic));
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
        apiErrorAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.securityAlertsTopic));
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
        trafficSpikeAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(this.securityAlertsTopic));
        alarms.push(trafficSpikeAlarm);
        return alarms;
    }
    createSecurityEventRules(processor, environment) {
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
    createConfigRules(environment) {
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
    createSecurityDashboard(logGroups, alarms, environment) {
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
        }));
        return dashboard;
    }
    createSlackIntegration(webhookUrl, environment) {
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
        this.securityAlertsTopic.addSubscription(new subscriptions.LambdaSubscription(slackNotifier));
    }
}
exports.SecurityMonitoringStack = SecurityMonitoringStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VjdXJpdHktbW9uaXRvcmluZy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNlY3VyaXR5LW1vbml0b3Jpbmctc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLDZDQUE2QztBQUM3Qyx5REFBeUQ7QUFDekQsMkNBQTJDO0FBQzNDLG1FQUFtRTtBQUNuRSxpREFBaUQ7QUFDakQsaURBQWlEO0FBQ2pELDBEQUEwRDtBQUUxRCx1REFBdUQ7QUFDdkQsaURBQWlEO0FBU2pELE1BQWEsdUJBQXdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFJcEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFtQztRQUMzRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qix1Q0FBdUM7UUFDdkMsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDL0QsV0FBVyxFQUFFLCtCQUErQixLQUFLLENBQUMsV0FBVyxFQUFFO1lBQy9ELFNBQVMsRUFBRSw2QkFBNkIsS0FBSyxDQUFDLFdBQVcsRUFBRTtTQUM1RCxDQUFDLENBQUM7UUFFSCx5QkFBeUI7UUFDekIsSUFBSSxDQUFDLG1CQUFtQixDQUFDLGVBQWUsQ0FDdEMsSUFBSSxhQUFhLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxDQUN0RCxDQUFDO1FBRUYsdURBQXVEO1FBQ3ZELE1BQU0sU0FBUyxHQUFHO1lBQ2hCLEdBQUcsRUFBRSxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtnQkFDMUMsWUFBWSxFQUFFLDZCQUE2QixLQUFLLENBQUMsV0FBVyxFQUFFO2dCQUM5RCxTQUFTLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTO2dCQUN2QyxhQUFhLEVBQUUsR0FBRyxDQUFDLGFB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QUNGLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxlQUFlLENBQ3RDLElBQUksYUFBYSxDQUFDLGtCQUFrQixDQUFDLGFBQWEsQ0FBQyxDQUNwRCxDQUFDO0lBQ0osQ0FBQztDQUNGO0FBaGFELDBEQWdhQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgc3Vic2NyaXB0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zLXN1YnNjcmlwdGlvbnMnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgZ3VhcmRkdXR5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1ndWFyZGR1dHknO1xuaW1wb3J0ICogYXMgY29uZmlnIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb25maWcnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBTZWN1cml0eU1vbml0b3JpbmdTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICBhbGVydEVtYWlsOiBzdHJpbmc7XG4gIHNsYWNrV2ViaG9va1VybD86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFNlY3VyaXR5TW9uaXRvcmluZ1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IHNlY3VyaXR5QWxlcnRzVG9waWM6IHNucy5Ub3BpYztcbiAgcHVibGljIHJlYWRvbmx5IHNlY3VyaXR5RGFzaGJvYXJkOiBjbG91ZHdhdGNoLkRhc2hib2FyZDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU2VjdXJpdHlNb25pdG9yaW5nU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gQ3JlYXRlIFNOUyB0b3BpYyBmb3Igc2VjdXJpdHkgYWxlcnRzXG4gICAgdGhpcy5zZWN1cml0eUFsZXJ0c1RvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnU2VjdXJpdHlBbGVydHMnLCB7XG4gICAgICBkaXNwbGF5TmFtZTogYFBvcnRmb2xpbyBTZWN1cml0eSBBbGVydHMgLSAke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICB0b3BpY05hbWU6IGBwb3J0Zm9saW8tc2VjdXJpdHktYWxlcnRzLSR7cHJvcHMuZW52aXJvbm1lbnR9YFxuICAgIH0pO1xuXG4gICAgLy8gQWRkIGVtYWlsIHN1YnNjcmlwdGlvblxuICAgIHRoaXMuc2VjdXJpdHlBbGVydHNUb3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICBuZXcgc3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbihwcm9wcy5hbGVydEVtYWlsKVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBMb2cgR3JvdXBzIGZvciBjZW50cmFsaXplZCBsb2dnaW5nXG4gICAgY29uc3QgbG9nR3JvdXBzID0ge1xuICAgICAgYXBpOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnQVBJTG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogYC9hd3MvbGFtYmRhL3BvcnRmb2xpby1hcGktJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICAgIH0pLFxuICAgICAgXG4gICAgICBhdXRoOiBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnQXV0aExvZ0dyb3VwJywge1xuICAgICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL2NvZ25pdG8vcG9ydGZvbGlvLWF1dGgtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5USFJFRV9NT05USFMsXG4gICAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1lcbiAgICAgIH0pLFxuICAgICAgXG4gICAgICBzZWN1cml0eTogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ1NlY3VyaXR5TG9nR3JvdXAnLCB7XG4gICAgICAgIGxvZ0dyb3VwTmFtZTogYC9zZWN1cml0eS9wb3J0Zm9saW8tJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5TSVhfTU9OVEhTLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgICB9KSxcbiAgICAgIFxuICAgICAgY2xvdWRmcm9udDogbmV3IGxvZ3MuTG9nR3JvdXAodGhpcywgJ0Nsb3VkRnJvbnRMb2dHcm91cCcsIHtcbiAgICAgICAgbG9nR3JvdXBOYW1lOiBgL2F3cy9jbG91ZGZyb250L3BvcnRmb2xpby0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICAgIHJldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgICB9KVxuICAgIH07XG5cbiAgICAvLyBTZWN1cml0eSBldmVudCBwcm9jZXNzaW5nIExhbWJkYVxuICAgIGNvbnN0IHNlY3VyaXR5RXZlbnRQcm9jZXNzb3IgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdTZWN1cml0eUV2ZW50UHJvY2Vzc29yJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbiAgICAgICAgY29uc3QgQVdTID0gcmVxdWlyZSgnYXdzLXNkaycpO1xuICAgICAgICBjb25zdCBzbnMgPSBuZXcgQVdTLlNOUygpO1xuICAgICAgICBcbiAgICAgICAgZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc29sZS5sb2coJ1NlY3VyaXR5IGV2ZW50IHJlY2VpdmVkOicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG4gICAgICAgICAgXG4gICAgICAgICAgY29uc3QgbWVzc2FnZSA9IHtcbiAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgZW52aXJvbm1lbnQ6IHByb2Nlc3MuZW52LkVOVklST05NRU5ULFxuICAgICAgICAgICAgZXZlbnQ6IGV2ZW50LFxuICAgICAgICAgICAgc2V2ZXJpdHk6IGRldGVybWluZVNldmVyaXR5KGV2ZW50KSxcbiAgICAgICAgICAgIHNvdXJjZTogZXZlbnQuc291cmNlIHx8ICd1bmtub3duJ1xuICAgICAgICAgIH07XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKG1lc3NhZ2Uuc2V2ZXJpdHkgPT09ICdISUdIJyB8fCBtZXNzYWdlLnNldmVyaXR5ID09PSAnQ1JJVElDQUwnKSB7XG4gICAgICAgICAgICBhd2FpdCBzbnMucHVibGlzaCh7XG4gICAgICAgICAgICAgIFRvcGljQXJuOiBwcm9jZXNzLmVudi5TTlNfVE9QSUNfQVJOLFxuICAgICAgICAgICAgICBTdWJqZWN0OiBcXGBTZWN1cml0eSBBbGVydCAtIFxcJHttZXNzYWdlLnNldmVyaXR5fSAtIFBvcnRmb2xpbyBcXCR7cHJvY2Vzcy5lbnYuRU5WSVJPTk1FTlR9XFxgLFxuICAgICAgICAgICAgICBNZXNzYWdlOiBKU09OLnN0cmluZ2lmeShtZXNzYWdlLCBudWxsLCAyKVxuICAgICAgICAgICAgfSkucHJvbWlzZSgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4geyBzdGF0dXNDb2RlOiAyMDAgfTtcbiAgICAgICAgfTtcbiAgICAgICAgXG4gICAgICAgIGZ1bmN0aW9uIGRldGVybWluZVNldmVyaXR5KGV2ZW50KSB7XG4gICAgICAgICAgaWYgKGV2ZW50LmRldGFpbD8uZXZlbnROYW1lPy5pbmNsdWRlcygnRGVsZXRlJykgfHwgXG4gICAgICAgICAgICAgIGV2ZW50LmRldGFpbD8uZXZlbnROYW1lPy5pbmNsdWRlcygnVGVybWluYXRlJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnSElHSCc7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChldmVudC5kZXRhaWw/LmVycm9yQ29kZSB8fCBldmVudC5kZXRhaWw/LmVycm9yTWVzc2FnZSkge1xuICAgICAgICAgICAgcmV0dXJuICdNRURJVU0nO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gJ0xPVyc7XG4gICAgICAgIH1cbiAgICAgIGApLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgU05TX1RPUElDX0FSTjogdGhpcy5zZWN1cml0eUFsZXJ0c1RvcGljLnRvcGljQXJuLFxuICAgICAgICBFTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnRcbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMClcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zIHRvIHNlY3VyaXR5IGV2ZW50IHByb2Nlc3NvclxuICAgIHRoaXMuc2VjdXJpdHlBbGVydHNUb3BpYy5ncmFudFB1Ymxpc2goc2VjdXJpdHlFdmVudFByb2Nlc3Nvcik7XG5cbiAgICAvLyBDbG91ZFdhdGNoIEFsYXJtcyBmb3Igc2VjdXJpdHkgbW9uaXRvcmluZ1xuICAgIGNvbnN0IHNlY3VyaXR5QWxhcm1zID0gdGhpcy5jcmVhdGVTZWN1cml0eUFsYXJtcyhsb2dHcm91cHMsIHByb3BzLmVudmlyb25tZW50KTtcblxuICAgIC8vIEV2ZW50QnJpZGdlIHJ1bGVzIGZvciBzZWN1cml0eSBldmVudHNcbiAgICB0aGlzLmNyZWF0ZVNlY3VyaXR5RXZlbnRSdWxlcyhzZWN1cml0eUV2ZW50UHJvY2Vzc29yLCBwcm9wcy5lbnZpcm9ubWVudCk7XG5cbiAgICAvLyBFbmFibGUgR3VhcmREdXR5IChpZiBub3QgYWxyZWFkeSBlbmFibGVkKVxuICAgIGNvbnN0IGd1YXJkRHV0eURldGVjdG9yID0gbmV3IGd1YXJkZHV0eS5DZm5EZXRlY3Rvcih0aGlzLCAnR3VhcmREdXR5RGV0ZWN0b3InLCB7XG4gICAgICBlbmFibGU6IHRydWUsXG4gICAgICBmaW5kaW5nUHVibGlzaGluZ0ZyZXF1ZW5jeTogJ0ZJRlRFRU5fTUlOVVRFUydcbiAgICB9KTtcblxuICAgIC8vIEFXUyBDb25maWcgcnVsZXMgZm9yIGNvbXBsaWFuY2UgbW9uaXRvcmluZ1xuICAgIHRoaXMuY3JlYXRlQ29uZmlnUnVsZXMocHJvcHMuZW52aXJvbm1lbnQpO1xuXG4gICAgLy8gQ3JlYXRlIHNlY3VyaXR5IGRhc2hib2FyZFxuICAgIHRoaXMuc2VjdXJpdHlEYXNoYm9hcmQgPSB0aGlzLmNyZWF0ZVNlY3VyaXR5RGFzaGJvYXJkKGxvZ0dyb3Vwcywgc2VjdXJpdHlBbGFybXMsIHByb3BzLmVudmlyb25tZW50KTtcblxuICAgIC8vIFNsYWNrIGludGVncmF0aW9uIChpZiB3ZWJob29rIHByb3ZpZGVkKVxuICAgIGlmIChwcm9wcy5zbGFja1dlYmhvb2tVcmwpIHtcbiAgICAgIHRoaXMuY3JlYXRlU2xhY2tJbnRlZ3JhdGlvbihwcm9wcy5zbGFja1dlYmhvb2tVcmwsIHByb3BzLmVudmlyb25tZW50KTtcbiAgICB9XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1NlY3VyaXR5QWxlcnRzVG9waWNBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zZWN1cml0eUFsZXJ0c1RvcGljLnRvcGljQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTZWN1cml0eSBhbGVydHMgU05TIHRvcGljIEFSTidcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTZWN1cml0eURhc2hib2FyZFVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly9jb25zb2xlLmF3cy5hbWF6b24uY29tL2Nsb3Vkd2F0Y2gvaG9tZT9yZWdpb249JHt0aGlzLnJlZ2lvbn0jZGFzaGJvYXJkczpuYW1lPSR7dGhpcy5zZWN1cml0eURhc2hib2FyZC5kYXNoYm9hcmROYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IG1vbml0b3JpbmcgZGFzaGJvYXJkIFVSTCdcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlU2VjdXJpdHlBbGFybXMobG9nR3JvdXBzOiBhbnksIGVudmlyb25tZW50OiBzdHJpbmcpOiBjbG91ZHdhdGNoLkFsYXJtW10ge1xuICAgIGNvbnN0IGFsYXJtczogY2xvdWR3YXRjaC5BbGFybVtdID0gW107XG5cbiAgICAvLyBGYWlsZWQgYXV0aGVudGljYXRpb24gYXR0ZW1wdHNcbiAgICBjb25zdCBmYWlsZWRBdXRoQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnRmFpbGVkQXV0aEFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgUG9ydGZvbGlvLUZhaWxlZEF1dGgtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ011bHRpcGxlIGZhaWxlZCBhdXRoZW50aWNhdGlvbiBhdHRlbXB0cyBkZXRlY3RlZCcsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9Db2duaXRvJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ1NpZ25JbkZhaWx1cmVzJyxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KVxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HXG4gICAgfSk7XG5cbiAgICBmYWlsZWRBdXRoQWxhcm0uYWRkQWxhcm1BY3Rpb24oXG4gICAgICBuZXcgY2RrLmF3c19jbG91ZHdhdGNoX2FjdGlvbnMuU25zQWN0aW9uKHRoaXMuc2VjdXJpdHlBbGVydHNUb3BpYylcbiAgICApO1xuICAgIGFsYXJtcy5wdXNoKGZhaWxlZEF1dGhBbGFybSk7XG5cbiAgICAvLyBBUEkgZXJyb3IgcmF0ZSBhbGFybVxuICAgIGNvbnN0IGFwaUVycm9yQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQVBJRXJyb3JBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYFBvcnRmb2xpby1BUElFcnJvcnMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0hpZ2ggQVBJIGVycm9yIHJhdGUgZGV0ZWN0ZWQnLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcbiAgICAgICAgbWV0cmljTmFtZTogJ0Vycm9ycycsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBGdW5jdGlvbk5hbWU6IGBwb3J0Zm9saW8tYXBpLSR7ZW52aXJvbm1lbnR9YFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdTdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMTAsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5OT1RfQlJFQUNISU5HXG4gICAgfSk7XG5cbiAgICBhcGlFcnJvckFsYXJtLmFkZEFsYXJtQWN0aW9uKFxuICAgICAgbmV3IGNkay5hd3NfY2xvdWR3YXRjaF9hY3Rpb25zLlNuc0FjdGlvbih0aGlzLnNlY3VyaXR5QWxlcnRzVG9waWMpXG4gICAgKTtcbiAgICBhbGFybXMucHVzaChhcGlFcnJvckFsYXJtKTtcblxuICAgIC8vIFVudXN1YWwgdHJhZmZpYyBwYXR0ZXJuIGFsYXJtXG4gICAgY29uc3QgdHJhZmZpY1NwaWtlQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnVHJhZmZpY1NwaWtlQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGBQb3J0Zm9saW8tVHJhZmZpY1NwaWtlLSR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdVbnVzdWFsIHRyYWZmaWMgc3Bpa2UgZGV0ZWN0ZWQnLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQ2xvdWRGcm9udCcsXG4gICAgICAgIG1ldHJpY05hbWU6ICdSZXF1ZXN0cycsXG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSlcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxMDAwMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkdcbiAgICB9KTtcblxuICAgIHRyYWZmaWNTcGlrZUFsYXJtLmFkZEFsYXJtQWN0aW9uKFxuICAgICAgbmV3IGNkay5hd3NfY2xvdWR3YXRjaF9hY3Rpb25zLlNuc0FjdGlvbih0aGlzLnNlY3VyaXR5QWxlcnRzVG9waWMpXG4gICAgKTtcbiAgICBhbGFybXMucHVzaCh0cmFmZmljU3Bpa2VBbGFybSk7XG5cbiAgICByZXR1cm4gYWxhcm1zO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVTZWN1cml0eUV2ZW50UnVsZXMocHJvY2Vzc29yOiBsYW1iZGEuRnVuY3Rpb24sIGVudmlyb25tZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBDbG91ZFRyYWlsIHNlY3VyaXR5IGV2ZW50c1xuICAgIGNvbnN0IHNlY3VyaXR5RXZlbnRSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdTZWN1cml0eUV2ZW50UnVsZScsIHtcbiAgICAgIGV2ZW50UGF0dGVybjoge1xuICAgICAgICBzb3VyY2U6IFsnYXdzLmNvZ25pdG8taWRwJywgJ2F3cy5zMycsICdhd3MubGFtYmRhJ10sXG4gICAgICAgIGRldGFpbFR5cGU6IFsnQVdTIEFQSSBDYWxsIHZpYSBDbG91ZFRyYWlsJ10sXG4gICAgICAgIGRldGFpbDoge1xuICAgICAgICAgIGV2ZW50U291cmNlOiBbJ2NvZ25pdG8taWRwLmFtYXpvbmF3cy5jb20nLCAnczMuYW1hem9uYXdzLmNvbScsICdsYW1iZGEuYW1hem9uYXdzLmNvbSddLFxuICAgICAgICAgIGV2ZW50TmFtZTogW1xuICAgICAgICAgICAgJ0FkbWluQ3JlYXRlVXNlcicsXG4gICAgICAgICAgICAnQWRtaW5EZWxldGVVc2VyJyxcbiAgICAgICAgICAgICdEZWxldGVCdWNrZXQnLFxuICAgICAgICAgICAgJ0RlbGV0ZUZ1bmN0aW9uJyxcbiAgICAgICAgICAgICdQdXRCdWNrZXRQb2xpY3knXG4gICAgICAgICAgXVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBzZWN1cml0eUV2ZW50UnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24ocHJvY2Vzc29yKSk7XG5cbiAgICAvLyBHdWFyZER1dHkgZmluZGluZ3NcbiAgICBjb25zdCBndWFyZER1dHlSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdHdWFyZER1dHlSdWxlJywge1xuICAgICAgZXZlbnRQYXR0ZXJuOiB7XG4gICAgICAgIHNvdXJjZTogWydhd3MuZ3VhcmRkdXR5J10sXG4gICAgICAgIGRldGFpbFR5cGU6IFsnR3VhcmREdXR5IEZpbmRpbmcnXVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgZ3VhcmREdXR5UnVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24ocHJvY2Vzc29yKSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUNvbmZpZ1J1bGVzKGVudmlyb25tZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBTMyBidWNrZXQgcHVibGljIGFjY2VzcyBwcm9oaWJpdGVkXG4gICAgbmV3IGNvbmZpZy5NYW5hZ2VkUnVsZSh0aGlzLCAnUzNCdWNrZXRQdWJsaWNBY2Nlc3NQcm9oaWJpdGVkJywge1xuICAgICAgaWRlbnRpZmllcjogY29uZmlnLk1hbmFnZWRSdWxlSWRlbnRpZmllcnMuUzNfQlVDS0VUX1BVQkxJQ19BQ0NFU1NfUFJPSElCSVRFRCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2tzIHRoYXQgUzMgYnVja2V0cyBkbyBub3QgYWxsb3cgcHVibGljIGFjY2VzcydcbiAgICB9KTtcblxuICAgIC8vIFJvb3QgYWNjZXNzIGtleSBjaGVja1xuICAgIG5ldyBjb25maWcuTWFuYWdlZFJ1bGUodGhpcywgJ1Jvb3RBY2Nlc3NLZXlDaGVjaycsIHtcbiAgICAgIGlkZW50aWZpZXI6IGNvbmZpZy5NYW5hZ2VkUnVsZUlkZW50aWZpZXJzLlJPT1RfQUNDRVNTX0tFWV9DSEVDSyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2hlY2tzIHdoZXRoZXIgcm9vdCBhY2Nlc3Mga2V5IGlzIGF2YWlsYWJsZSdcbiAgICB9KTtcblxuICAgIC8vIE1GQSBlbmFibGVkIGZvciBJQU0gY29uc29sZSBhY2Nlc3NcbiAgICBuZXcgY29uZmlnLk1hbmFnZWRSdWxlKHRoaXMsICdNRkFFbmFibGVkRm9ySUFNQ29uc29sZUFjY2VzcycsIHtcbiAgICAgIGlkZW50aWZpZXI6IGNvbmZpZy5NYW5hZ2VkUnVsZUlkZW50aWZpZXJzLk1GQV9FTkFCTEVEX0ZPUl9JQU1fQ09OU09MRV9BQ0NFU1MsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NoZWNrcyB3aGV0aGVyIE1GQSBpcyBlbmFibGVkIGZvciBJQU0gdXNlcnMnXG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVNlY3VyaXR5RGFzaGJvYXJkKGxvZ0dyb3VwczogYW55LCBhbGFybXM6IGNsb3Vkd2F0Y2guQWxhcm1bXSwgZW52aXJvbm1lbnQ6IHN0cmluZyk6IGNsb3Vkd2F0Y2guRGFzaGJvYXJkIHtcbiAgICBjb25zdCBkYXNoYm9hcmQgPSBuZXcgY2xvdWR3YXRjaC5EYXNoYm9hcmQodGhpcywgJ1NlY3VyaXR5RGFzaGJvYXJkJywge1xuICAgICAgZGFzaGJvYXJkTmFtZTogYFBvcnRmb2xpby1TZWN1cml0eS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBkZWZhdWx0SW50ZXJ2YWw6IGNkay5EdXJhdGlvbi5ob3VycygxKVxuICAgIH0pO1xuXG4gICAgLy8gU2VjdXJpdHkgbWV0cmljcyB3aWRnZXRzXG4gICAgZGFzaGJvYXJkLmFkZFdpZGdldHMoXG4gICAgICAvLyBXQUYgYmxvY2tlZCByZXF1ZXN0c1xuICAgICAgbmV3IGNsb3Vkd2F0Y2guR3JhcGhXaWRnZXQoe1xuICAgICAgICB0aXRsZTogJ1dBRiBCbG9ja2VkIFJlcXVlc3RzJyxcbiAgICAgICAgbGVmdDogW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvV0FGVjInLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0Jsb2NrZWRSZXF1ZXN0cycsXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nXG4gICAgICAgICAgfSlcbiAgICAgICAgXSxcbiAgICAgICAgd2lkdGg6IDEyLFxuICAgICAgICBoZWlnaHQ6IDZcbiAgICAgIH0pLFxuXG4gICAgICAvLyBBdXRoZW50aWNhdGlvbiBtZXRyaWNzXG4gICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgIHRpdGxlOiAnQXV0aGVudGljYXRpb24gRXZlbnRzJyxcbiAgICAgICAgbGVmdDogW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQ29nbml0bycsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnU2lnbkluU3VjY2Vzc2VzJyxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bSdcbiAgICAgICAgICB9KSxcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0NvZ25pdG8nLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ1NpZ25JbkZhaWx1cmVzJyxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ1N1bSdcbiAgICAgICAgICB9KVxuICAgICAgICBdLFxuICAgICAgICB3aWR0aDogMTIsXG4gICAgICAgIGhlaWdodDogNlxuICAgICAgfSksXG5cbiAgICAgIC8vIEFQSSBwZXJmb3JtYW5jZSBhbmQgZXJyb3JzXG4gICAgICBuZXcgY2xvdWR3YXRjaC5HcmFwaFdpZGdldCh7XG4gICAgICAgIHRpdGxlOiAnQVBJIFBlcmZvcm1hbmNlJyxcbiAgICAgICAgbGVmdDogW1xuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvTGFtYmRhJyxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdEdXJhdGlvbicsXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJ1xuICAgICAgICAgIH0pXG4gICAgICAgIF0sXG4gICAgICAgIHJpZ2h0OiBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9MYW1iZGEnLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJ0Vycm9ycycsXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nXG4gICAgICAgICAgfSlcbiAgICAgICAgXSxcbiAgICAgICAgd2lkdGg6IDEyLFxuICAgICAgICBoZWlnaHQ6IDZcbiAgICAgIH0pLFxuXG4gICAgICAvLyBDbG91ZEZyb250IG1ldHJpY3NcbiAgICAgIG5ldyBjbG91ZHdhdGNoLkdyYXBoV2lkZ2V0KHtcbiAgICAgICAgdGl0bGU6ICdDbG91ZEZyb250IFRyYWZmaWMnLFxuICAgICAgICBsZWZ0OiBbXG4gICAgICAgICAgbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgICAgIG5hbWVzcGFjZTogJ0FXUy9DbG91ZEZyb250JyxcbiAgICAgICAgICAgIG1ldHJpY05hbWU6ICdSZXF1ZXN0cycsXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdTdW0nXG4gICAgICAgICAgfSlcbiAgICAgICAgXSxcbiAgICAgICAgcmlnaHQ6IFtcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICAgICAgbmFtZXNwYWNlOiAnQVdTL0Nsb3VkRnJvbnQnLFxuICAgICAgICAgICAgbWV0cmljTmFtZTogJzR4eEVycm9yUmF0ZScsXG4gICAgICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJ1xuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgICAgICBuYW1lc3BhY2U6ICdBV1MvQ2xvdWRGcm9udCcsXG4gICAgICAgICAgICBtZXRyaWNOYW1lOiAnNXh4RXJyb3JSYXRlJyxcbiAgICAgICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnXG4gICAgICAgICAgfSlcbiAgICAgICAgXSxcbiAgICAgICAgd2lkdGg6IDEyLFxuICAgICAgICBoZWlnaHQ6IDZcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHJldHVybiBkYXNoYm9hcmQ7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZVNsYWNrSW50ZWdyYXRpb24od2ViaG9va1VybDogc3RyaW5nLCBlbnZpcm9ubWVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3Qgc2xhY2tOb3RpZmllciA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1NsYWNrTm90aWZpZXInLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuICAgICAgICBjb25zdCBodHRwcyA9IHJlcXVpcmUoJ2h0dHBzJyk7XG4gICAgICAgIGNvbnN0IHVybCA9IHJlcXVpcmUoJ3VybCcpO1xuICAgICAgICBcbiAgICAgICAgZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgKGV2ZW50KSA9PiB7XG4gICAgICAgICAgY29uc3QgbWVzc2FnZSA9IEpTT04ucGFyc2UoZXZlbnQuUmVjb3Jkc1swXS5TbnMuTWVzc2FnZSk7XG4gICAgICAgICAgXG4gICAgICAgICAgY29uc3Qgc2xhY2tNZXNzYWdlID0ge1xuICAgICAgICAgICAgdGV4dDogXFxg8J+aqCBTZWN1cml0eSBBbGVydCAtIFxcJHtwcm9jZXNzLmVudi5FTlZJUk9OTUVOVH1cXGAsXG4gICAgICAgICAgICBhdHRhY2htZW50czogW3tcbiAgICAgICAgICAgICAgY29sb3I6ICdkYW5nZXInLFxuICAgICAgICAgICAgICBmaWVsZHM6IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICB0aXRsZTogJ0Vudmlyb25tZW50JyxcbiAgICAgICAgICAgICAgICAgIHZhbHVlOiBwcm9jZXNzLmVudi5FTlZJUk9OTUVOVCxcbiAgICAgICAgICAgICAgICAgIHNob3J0OiB0cnVlXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICB0aXRsZTogJ1RpbWVzdGFtcCcsXG4gICAgICAgICAgICAgICAgICB2YWx1ZTogbWVzc2FnZS50aW1lc3RhbXAgfHwgbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgICAgICAgICAgc2hvcnQ6IHRydWVcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgIHRpdGxlOiAnRGV0YWlscycsXG4gICAgICAgICAgICAgICAgICB2YWx1ZTogSlNPTi5zdHJpbmdpZnkobWVzc2FnZSwgbnVsbCwgMiksXG4gICAgICAgICAgICAgICAgICBzaG9ydDogZmFsc2VcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIF1cbiAgICAgICAgICAgIH1dXG4gICAgICAgICAgfTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCB3ZWJob29rVXJsID0gcHJvY2Vzcy5lbnYuU0xBQ0tfV0VCSE9PS19VUkw7XG4gICAgICAgICAgY29uc3QgcGFyc2VkVXJsID0gdXJsLnBhcnNlKHdlYmhvb2tVcmwpO1xuICAgICAgICAgIFxuICAgICAgICAgIGNvbnN0IHBvc3REYXRhID0gSlNPTi5zdHJpbmdpZnkoc2xhY2tNZXNzYWdlKTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICAgICAgaG9zdG5hbWU6IHBhcnNlZFVybC5ob3N0bmFtZSxcbiAgICAgICAgICAgIHBvcnQ6IDQ0MyxcbiAgICAgICAgICAgIHBhdGg6IHBhcnNlZFVybC5wYXRoLFxuICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgICAgICdDb250ZW50LUxlbmd0aCc6IEJ1ZmZlci5ieXRlTGVuZ3RoKHBvc3REYXRhKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH07XG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHJlcSA9IGh0dHBzLnJlcXVlc3Qob3B0aW9ucywgKHJlcykgPT4ge1xuICAgICAgICAgICAgICByZXNvbHZlKHsgc3RhdHVzQ29kZTogcmVzLnN0YXR1c0NvZGUgfSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgcmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG4gICAgICAgICAgICByZXEud3JpdGUocG9zdERhdGEpO1xuICAgICAgICAgICAgcmVxLmVuZCgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9O1xuICAgICAgYCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBTTEFDS19XRUJIT09LX1VSTDogd2ViaG9va1VybCxcbiAgICAgICAgRU5WSVJPTk1FTlQ6IGVudmlyb25tZW50XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLnNlY3VyaXR5QWxlcnRzVG9waWMuYWRkU3Vic2NyaXB0aW9uKFxuICAgICAgbmV3IHN1YnNjcmlwdGlvbnMuTGFtYmRhU3Vic2NyaXB0aW9uKHNsYWNrTm90aWZpZXIpXG4gICAgKTtcbiAgfVxufVxuIl19