"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedWAFStack = void 0;
const cdk = require("aws-cdk-lib");
const wafv2 = require("aws-cdk-lib/aws-wafv2");
const logs = require("aws-cdk-lib/aws-logs");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const sns = require("aws-cdk-lib/aws-sns");
const subscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
class EnhancedWAFStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Create IP Set for admin allowed IPs
        const adminIPSet = new wafv2.CfnIPSet(this, 'AdminAllowedIPs', {
            name: `portfolio-admin-ips-${props.environment}`,
            scope: 'CLOUDFRONT',
            ipAddressVersion: 'IPV4',
            addresses: props.adminAllowedIPs || ['127.0.0.1/32'] // Default to localhost
        });
        // Create comprehensive WAF rules
        const wafRules = [
            // AWS Managed Rules - Common Rule Set
            {
                name: 'AWSManagedRulesCommonRuleSet',
                priority: 1,
                overrideAction: { none: {} },
                statement: {
                    managedRuleGroupStatement: {
                        vendorName: 'AWS',
                        name: 'AWSManagedRulesCommonRuleSet',
                        excludedRules: [
                            // Exclude rules that might block legitimate requests
                            { name: 'SizeRestrictions_BODY' }, // Allow larger image uploads
                            { name: 'GenericRFI_BODY' }
                        ]
                    }
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: 'CommonRuleSet'
                }
            },
            // AWS Managed Rules - Known Bad Inputs
            {
                name: 'AWSManagedRulesKnownBadInputsRuleSet',
                priority: 2,
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
                    metricName: 'KnownBadInputs'
                }
            },
            // AWS Managed Rules - SQL Injection
            {
                name: 'AWSManagedRulesSQLiRuleSet',
                priority: 3,
                overrideAction: { none: {} },
                statement: {
                    managedRuleGroupStatement: {
                        vendorName: 'AWS',
                        name: 'AWSManagedRulesSQLiRuleSet'
                    }
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: 'SQLiRuleSet'
                }
            },
            // Geographic blocking for high-risk countries
            {
                name: 'GeoBlockHighRiskCountries',
                priority: 5,
                action: { block: {} },
                statement: {
                    geoMatchStatement: {
                        countryCodes: ['CN', 'RU', 'KP', 'IR'] // High-risk countries
                    }
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: 'GeoBlock'
                }
            },
            // Rate limiting for general traffic
            {
                name: 'GeneralRateLimit',
                priority: 10,
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
                    metricName: 'GeneralRateLimit'
                }
            },
            // Admin path protection with IP whitelist
            {
                name: 'AdminPathProtection',
                priority: 15,
                action: { block: {} },
                statement: {
                    andStatement: {
                        statements: [
                            {
                                byteMatchStatement: {
                                    searchString: '/admin',
                                    fieldToMatch: { uriPath: {} },
                                    textTransformations: [
                                        { priority: 0, type: 'LOWERCASE' }
                                    ],
                                    positionalConstraint: 'STARTS_WITH'
                                }
                            },
                            {
                                notStatement: {
                                    statement: {
                                        ipSetReferenceStatement: {
                                            arn: adminIPSet.attrArn
                                        }
                                    }
                                }
                            }
                        ]
                    }
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: 'AdminPathProtection'
                }
            },
            // API rate limiting
            {
                name: 'APIRateLimit',
                priority: 20,
                action: { block: {} },
                statement: {
                    rateBasedStatement: {
                        limit: 500,
                        aggregateKeyType: 'IP',
                        scopeDownStatement: {
                            byteMatchStatement: {
                                searchString: '/api/',
                                fieldToMatch: { uriPath: {} },
                                textTransformations: [
                                    { priority: 0, type: 'LOWERCASE' }
                                ],
                                positionalConstraint: 'STARTS_WITH'
                            }
                        }
                    }
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: 'APIRateLimit'
                }
            },
            // Image upload protection
            {
                name: 'ImageUploadProtection',
                priority: 25,
                action: { block: {} },
                statement: {
                    rateBasedStatement: {
                        limit: 10,
                        aggregateKeyType: 'IP',
                        scopeDownStatement: {
                            andStatement: {
                                statements: [
                                    {
                                        byteMatchStatement: {
                                            searchString: '/api/upload',
                                            fieldToMatch: { uriPath: {} },
                                            textTransformations: [
                                                { priority: 0, type: 'LOWERCASE' }
                                            ],
                                            positionalConstraint: 'CONTAINS'
                                        }
                                    },
                                    {
                                        byteMatchStatement: {
                                            searchString: 'POST',
                                            fieldToMatch: { method: {} },
                                            textTransformations: [
                                                { priority: 0, type: 'NONE' }
                                            ],
                                            positionalConstraint: 'EXACTLY'
                                        }
                                    }
                                ]
                            }
                        }
                    }
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: 'ImageUploadProtection'
                }
            },
            // Block suspicious user agents
            {
                name: 'BlockSuspiciousUserAgents',
                priority: 30,
                action: { block: {} },
                statement: {
                    orStatement: {
                        statements: [
                            {
                                byteMatchStatement: {
                                    searchString: 'bot',
                                    fieldToMatch: {
                                        singleHeader: { name: 'user-agent' }
                                    },
                                    textTransformations: [
                                        { priority: 0, type: 'LOWERCASE' }
                                    ],
                                    positionalConstraint: 'CONTAINS'
                                }
                            },
                            {
                                byteMatchStatement: {
                                    searchString: 'crawler',
                                    fieldToMatch: {
                                        singleHeader: { name: 'user-agent' }
                                    },
                                    textTransformations: [
                                        { priority: 0, type: 'LOWERCASE' }
                                    ],
                                    positionalConstraint: 'CONTAINS'
                                }
                            },
                            {
                                byteMatchStatement: {
                                    searchString: 'scanner',
                                    fieldToMatch: {
                                        singleHeader: { name: 'user-agent' }
                                    },
                                    textTransformations: [
                                        { priority: 0, type: 'LOWERCASE' }
                                    ],
                                    positionalConstraint: 'CONTAINS'
                                }
                            }
                        ]
                    }
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: 'SuspiciousUserAgents'
                }
            },
            // Block requests without proper referrer (for admin paths)
            {
                name: 'AdminReferrerCheck',
                priority: 35,
                action: { block: {} },
                statement: {
                    andStatement: {
                        statements: [
                            {
                                byteMatchStatement: {
                                    searchString: '/admin',
                                    fieldToMatch: { uriPath: {} },
                                    textTransformations: [
                                        { priority: 0, type: 'LOWERCASE' }
                                    ],
                                    positionalConstraint: 'STARTS_WITH'
                                }
                            },
                            {
                                notStatement: {
                                    statement: {
                                        byteMatchStatement: {
                                            searchString: 'yourdomain.com',
                                            fieldToMatch: {
                                                singleHeader: { name: 'referer' }
                                            },
                                            textTransformations: [
                                                { priority: 0, type: 'LOWERCASE' }
                                            ],
                                            positionalConstraint: 'CONTAINS'
                                        }
                                    }
                                }
                            }
                        ]
                    }
                },
                visibilityConfig: {
                    sampledRequestsEnabled: true,
                    cloudWatchMetricsEnabled: true,
                    metricName: 'AdminReferrerCheck'
                }
            }
        ];
        // Create the Web ACL
        this.webAcl = new wafv2.CfnWebACL(this, 'EnhancedWebACL', {
            name: `portfolio-waf-${props.environment}`,
            scope: 'CLOUDFRONT',
            defaultAction: { allow: {} },
            rules: wafRules,
            visibilityConfig: {
                sampledRequestsEnabled: true,
                cloudWatchMetricsEnabled: true,
                metricName: `PortfolioWAF-${props.environment}`
            },
            description: `Enhanced WAF for Photography Portfolio - ${props.environment}`
        });
        // Create CloudWatch Log Group for WAF logs
        this.logGroup = new logs.LogGroup(this, 'WAFLogGroup', {
            logGroupName: `/aws/wafv2/portfolio-${props.environment}`,
            retention: logs.RetentionDays.ONE_MONTH,
            removalPolicy: cdk.RemovalPolicy.DESTROY
        });
        // Create logging configuration
        new wafv2.CfnLoggingConfiguration(this, 'WAFLoggingConfig', {
            resourceArn: this.webAcl.attrArn,
            logDestinationConfigs: [this.logGroup.logGroupArn],
            redactedFields: [
                { singleHeader: { name: 'authorization' } },
                { singleHeader: { name: 'cookie' } }
            ]
        });
        // Create SNS topic for security alerts
        const securityAlertsTopic = new sns.Topic(this, 'SecurityAlerts', {
            displayName: `Portfolio Security Alerts - ${props.environment}`
        });
        if (props.alertEmail) {
            securityAlertsTopic.addSubscription(new subscriptions.EmailSubscription(props.alertEmail));
        }
        // CloudWatch Alarms for security monitoring
        const wafBlockedRequestsAlarm = new cloudwatch.Alarm(this, 'WAFBlockedRequestsAlarm', {
            alarmName: `Portfolio-WAF-HighBlockedRequests-${props.environment}`,
            alarmDescription: 'High number of blocked requests detected',
            metric: new cloudwatch.Metric({
                namespace: 'AWS/WAFV2',
                metricName: 'BlockedRequests',
                dimensionsMap: {
                    WebACL: this.webAcl.attrName,
                    Region: 'CloudFront',
                    Rule: 'ALL'
                },
                statistic: 'Sum',
                period: cdk.Duration.minutes(5)
            }),
            threshold: 100,
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        wafBlockedRequestsAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(securityAlertsTopic));
        // Admin path access alarm
        const adminAccessAlarm = new cloudwatch.Alarm(this, 'AdminAccessAlarm', {
            alarmName: `Portfolio-AdminAccess-${props.environment}`,
            alarmDescription: 'Unusual admin path access detected',
            metric: new cloudwatch.Metric({
                namespace: 'AWS/WAFV2',
                metricName: 'BlockedRequests',
                dimensionsMap: {
                    WebACL: this.webAcl.attrName,
                    Region: 'CloudFront',
                    Rule: 'AdminPathProtection'
                },
                statistic: 'Sum',
                period: cdk.Duration.minutes(5)
            }),
            threshold: 10,
            evaluationPeriods: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        adminAccessAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(securityAlertsTopic));
        // Outputs
        new cdk.CfnOutput(this, 'WebACLArn', {
            value: this.webAcl.attrArn,
            description: 'Enhanced WAF Web ACL ARN',
            exportName: `Portfolio-WAF-ARN-${props.environment}`
        });
        new cdk.CfnOutput(this, 'WAFLogGroupName', {
            value: this.logGroup.logGroupName,
            description: 'WAF CloudWatch Log Group',
            exportName: `Portfolio-WAF-LogGroup-${props.environment}`
        });
        new cdk.CfnOutput(this, 'SecurityAlertsTopicArn', {
            value: securityAlertsTopic.topicArn,
            description: 'Security alerts SNS topic ARN',
            exportName: `Portfolio-SecurityAlerts-${props.environment}`
        });
    }
}
exports.EnhancedWAFStack = EnhancedWAFStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW5oYW5jZWQtd2FmLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZW5oYW5jZWQtd2FmLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQywrQ0FBK0M7QUFDL0MsNkNBQTZDO0FBQzdDLHlEQUF5RDtBQUN6RCwyQ0FBMkM7QUFDM0MsbUVBQW1FO0FBU25FLE1BQWEsZ0JBQWlCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFJN0MsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUE0QjtRQUNwRSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixzQ0FBc0M7UUFDdEMsTUFBTSxVQUFVLEdBQUcsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUM3RCxJQUFJLEVBQUUsdUJBQXVCLEtBQUssQ0FBQyxXQUFXLEVBQUU7WUFDaEQsS0FBSyxFQUFFLFlBQVk7WUFDbkIsZ0JBQWdCLEVBQUUsTUFBTTtZQUN4QixTQUFTLEVBQUUsS0FBSyxDQUFDLGVBQWUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDLHVCQUF1QjtTQUM3RSxDQUFDLENBQUM7UUFFSCxpQ0FBaUM7UUFDakMsTUFBTSxRQUFRLEdBQW1DO1lBQy9DLHNDQUFzQztZQUN0QztnQkFDRSxJQUFJLEVBQUUsOEJBQThCO2dCQUNwQyxRQUFRLEVBQUUsQ0FBQztnQkFDWCxjQUFjLEVBQUUsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFO2dCQUM1QixTQUFTLEVBQUU7b0JBQ1QseUJBQXlCLEVBQUU7d0JBQ3pCLFVBQVUsRUFBRSxLQUFLO3dCQUNqQixJQUFJLEVBQUUsOEJBQThCO3dCQUNwQyxhQUFhLEVBQUU7NEJBQ2IscURBQXFEOzRCQUNyRCxFQUFFLElBQUksRUFBRSx1QkFBdUIsRUFBRSxFQUFFLDZCQUE2Qjs0QkFDaEUsRUFBRSxJQUFJLEVBQUUsaUJBQWlCLEVB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O1lBQ3BCLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxhQUFhO1NBQzVELENBQUMsQ0FBQztRQUVILGdCQUFnQixDQUFDLGNBQWMsQ0FDN0IsSUFBSSxHQUFHLENBQUMsc0JBQXNCLENBQUMsU0FBUyxDQUFDLG1CQUFtQixDQUFDLENBQzlELENBQUM7UUFFRixVQUFVO1FBQ1YsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDbkMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTztZQUMxQixXQUFXLEVBQUUsMEJBQTBCO1lBQ3ZDLFVBQVUsRUFBRSxxQkFBcUIsS0FBSyxDQUFDLFdBQVcsRUFBRTtTQUNyRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ3pDLEtBQUssRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLFlBQVk7WUFDakMsV0FBVyxFQUFFLDBCQUEwQjtZQUN2QyxVQUFVLEVBQUUsMEJBQTBCLEtBQUssQ0FBQyxXQUFXLEVBQUU7U0FDMUQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNoRCxLQUFLLEVBQUUsbUJBQW1CLENBQUMsUUFBUTtZQUNuQyxXQUFXLEVBQUUsK0JBQStCO1lBQzVDLFVBQVUsRUFBRSw0QkFBNEIsS0FBSyxDQUFDLFdBQVcsRUFBRTtTQUM1RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE1YUQsNENBNGFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHdhZnYyIGZyb20gJ2F3cy1jZGstbGliL2F3cy13YWZ2Mic7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgc3Vic2NyaXB0aW9ucyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc25zLXN1YnNjcmlwdGlvbnMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBFbmhhbmNlZFdBRlN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGFkbWluQWxsb3dlZElQcz86IHN0cmluZ1tdO1xuICBhbGVydEVtYWlsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRW5oYW5jZWRXQUZTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSB3ZWJBY2w6IHdhZnYyLkNmbldlYkFDTDtcbiAgcHVibGljIHJlYWRvbmx5IGxvZ0dyb3VwOiBsb2dzLkxvZ0dyb3VwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBFbmhhbmNlZFdBRlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIENyZWF0ZSBJUCBTZXQgZm9yIGFkbWluIGFsbG93ZWQgSVBzXG4gICAgY29uc3QgYWRtaW5JUFNldCA9IG5ldyB3YWZ2Mi5DZm5JUFNldCh0aGlzLCAnQWRtaW5BbGxvd2VkSVBzJywge1xuICAgICAgbmFtZTogYHBvcnRmb2xpby1hZG1pbi1pcHMtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgc2NvcGU6ICdDTE9VREZST05UJyxcbiAgICAgIGlwQWRkcmVzc1ZlcnNpb246ICdJUFY0JyxcbiAgICAgIGFkZHJlc3NlczogcHJvcHMuYWRtaW5BbGxvd2VkSVBzIHx8IFsnMTI3LjAuMC4xLzMyJ10gLy8gRGVmYXVsdCB0byBsb2NhbGhvc3RcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBjb21wcmVoZW5zaXZlIFdBRiBydWxlc1xuICAgIGNvbnN0IHdhZlJ1bGVzOiB3YWZ2Mi5DZm5XZWJBQ0wuUnVsZVByb3BlcnR5W10gPSBbXG4gICAgICAvLyBBV1MgTWFuYWdlZCBSdWxlcyAtIENvbW1vbiBSdWxlIFNldFxuICAgICAge1xuICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzQ29tbW9uUnVsZVNldCcsXG4gICAgICAgIHByaW9yaXR5OiAxLFxuICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNDb21tb25SdWxlU2V0JyxcbiAgICAgICAgICAgIGV4Y2x1ZGVkUnVsZXM6IFtcbiAgICAgICAgICAgICAgLy8gRXhjbHVkZSBydWxlcyB0aGF0IG1pZ2h0IGJsb2NrIGxlZ2l0aW1hdGUgcmVxdWVzdHNcbiAgICAgICAgICAgICAgeyBuYW1lOiAnU2l6ZVJlc3RyaWN0aW9uc19CT0RZJyB9LCAvLyBBbGxvdyBsYXJnZXIgaW1hZ2UgdXBsb2Fkc1xuICAgICAgICAgICAgICB7IG5hbWU6ICdHZW5lcmljUkZJX0JPRFknIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnQ29tbW9uUnVsZVNldCdcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLy8gQVdTIE1hbmFnZWQgUnVsZXMgLSBLbm93biBCYWQgSW5wdXRzXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNLbm93bkJhZElucHV0c1J1bGVTZXQnLFxuICAgICAgICBwcmlvcml0eTogMixcbiAgICAgICAgb3ZlcnJpZGVBY3Rpb246IHsgbm9uZToge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgbWFuYWdlZFJ1bGVHcm91cFN0YXRlbWVudDoge1xuICAgICAgICAgICAgdmVuZG9yTmFtZTogJ0FXUycsXG4gICAgICAgICAgICBuYW1lOiAnQVdTTWFuYWdlZFJ1bGVzS25vd25CYWRJbnB1dHNSdWxlU2V0J1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6ICdLbm93bkJhZElucHV0cydcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLy8gQVdTIE1hbmFnZWQgUnVsZXMgLSBTUUwgSW5qZWN0aW9uXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNTUUxpUnVsZVNldCcsXG4gICAgICAgIHByaW9yaXR5OiAzLFxuICAgICAgICBvdmVycmlkZUFjdGlvbjogeyBub25lOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBtYW5hZ2VkUnVsZUdyb3VwU3RhdGVtZW50OiB7XG4gICAgICAgICAgICB2ZW5kb3JOYW1lOiAnQVdTJyxcbiAgICAgICAgICAgIG5hbWU6ICdBV1NNYW5hZ2VkUnVsZXNTUUxpUnVsZVNldCdcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnU1FMaVJ1bGVTZXQnXG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIC8vIEdlb2dyYXBoaWMgYmxvY2tpbmcgZm9yIGhpZ2gtcmlzayBjb3VudHJpZXNcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ0dlb0Jsb2NrSGlnaFJpc2tDb3VudHJpZXMnLFxuICAgICAgICBwcmlvcml0eTogNSxcbiAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBnZW9NYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgY291bnRyeUNvZGVzOiBbJ0NOJywgJ1JVJywgJ0tQJywgJ0lSJ10gLy8gSGlnaC1yaXNrIGNvdW50cmllc1xuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6ICdHZW9CbG9jaydcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLy8gUmF0ZSBsaW1pdGluZyBmb3IgZ2VuZXJhbCB0cmFmZmljXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdHZW5lcmFsUmF0ZUxpbWl0JyxcbiAgICAgICAgcHJpb3JpdHk6IDEwLFxuICAgICAgICBhY3Rpb246IHsgYmxvY2s6IHt9IH0sXG4gICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgIHJhdGVCYXNlZFN0YXRlbWVudDoge1xuICAgICAgICAgICAgbGltaXQ6IDIwMDAsXG4gICAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnXG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogJ0dlbmVyYWxSYXRlTGltaXQnXG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIC8vIEFkbWluIHBhdGggcHJvdGVjdGlvbiB3aXRoIElQIHdoaXRlbGlzdFxuICAgICAge1xuICAgICAgICBuYW1lOiAnQWRtaW5QYXRoUHJvdGVjdGlvbicsXG4gICAgICAgIHByaW9yaXR5OiAxNSxcbiAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBhbmRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAnL2FkbWluJyxcbiAgICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyB1cmlQYXRoOiB7fSB9LFxuICAgICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICB7IHByaW9yaXR5OiAwLCB0eXBlOiAnTE9XRVJDQVNFJyB9XG4gICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdTVEFSVFNfV0lUSCdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBub3RTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIHN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgICBpcFNldFJlZmVyZW5jZVN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgICAgIGFybjogYWRtaW5JUFNldC5hdHRyQXJuXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnQWRtaW5QYXRoUHJvdGVjdGlvbidcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLy8gQVBJIHJhdGUgbGltaXRpbmdcbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ0FQSVJhdGVMaW1pdCcsXG4gICAgICAgIHByaW9yaXR5OiAyMCxcbiAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIGxpbWl0OiA1MDAsXG4gICAgICAgICAgICBhZ2dyZWdhdGVLZXlUeXBlOiAnSVAnLFxuICAgICAgICAgICAgc2NvcGVEb3duU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgIHNlYXJjaFN0cmluZzogJy9hcGkvJyxcbiAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgdXJpUGF0aDoge30gfSxcbiAgICAgICAgICAgICAgICB0ZXh0VHJhbnNmb3JtYXRpb25zOiBbXG4gICAgICAgICAgICAgICAgICB7IHByaW9yaXR5OiAwLCB0eXBlOiAnTE9XRVJDQVNFJyB9XG4gICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICBwb3NpdGlvbmFsQ29uc3RyYWludDogJ1NUQVJUU19XSVRIJ1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogJ0FQSVJhdGVMaW1pdCdcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLy8gSW1hZ2UgdXBsb2FkIHByb3RlY3Rpb25cbiAgICAgIHtcbiAgICAgICAgbmFtZTogJ0ltYWdlVXBsb2FkUHJvdGVjdGlvbicsXG4gICAgICAgIHByaW9yaXR5OiAyNSxcbiAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICByYXRlQmFzZWRTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgIGxpbWl0OiAxMCxcbiAgICAgICAgICAgIGFnZ3JlZ2F0ZUtleVR5cGU6ICdJUCcsXG4gICAgICAgICAgICBzY29wZURvd25TdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgYW5kU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBieXRlTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICcvYXBpL3VwbG9hZCcsXG4gICAgICAgICAgICAgICAgICAgICAgZmllbGRUb01hdGNoOiB7IHVyaVBhdGg6IHt9IH0sXG4gICAgICAgICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgeyBwcmlvcml0eTogMCwgdHlwZTogJ0xPV0VSQ0FTRScgfVxuICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdDT05UQUlOUydcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAnUE9TVCcsXG4gICAgICAgICAgICAgICAgICAgICAgZmllbGRUb01hdGNoOiB7IG1ldGhvZDoge30gfSxcbiAgICAgICAgICAgICAgICAgICAgICB0ZXh0VHJhbnNmb3JtYXRpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgICAgICB7IHByaW9yaXR5OiAwLCB0eXBlOiAnTk9ORScgfVxuICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdFWEFDVExZJ1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9LFxuICAgICAgICB2aXNpYmlsaXR5Q29uZmlnOiB7XG4gICAgICAgICAgc2FtcGxlZFJlcXVlc3RzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgbWV0cmljTmFtZTogJ0ltYWdlVXBsb2FkUHJvdGVjdGlvbidcbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgLy8gQmxvY2sgc3VzcGljaW91cyB1c2VyIGFnZW50c1xuICAgICAge1xuICAgICAgICBuYW1lOiAnQmxvY2tTdXNwaWNpb3VzVXNlckFnZW50cycsXG4gICAgICAgIHByaW9yaXR5OiAzMCxcbiAgICAgICAgYWN0aW9uOiB7IGJsb2NrOiB7fSB9LFxuICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICBvclN0YXRlbWVudDoge1xuICAgICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICdib3QnLFxuICAgICAgICAgICAgICAgICAgZmllbGRUb01hdGNoOiB7IFxuICAgICAgICAgICAgICAgICAgICBzaW5nbGVIZWFkZXI6IHsgbmFtZTogJ3VzZXItYWdlbnQnIH1cbiAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICB0ZXh0VHJhbnNmb3JtYXRpb25zOiBbXG4gICAgICAgICAgICAgICAgICAgIHsgcHJpb3JpdHk6IDAsIHR5cGU6ICdMT1dFUkNBU0UnIH1cbiAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICBwb3NpdGlvbmFsQ29uc3RyYWludDogJ0NPTlRBSU5TJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGJ5dGVNYXRjaFN0YXRlbWVudDoge1xuICAgICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAnY3Jhd2xlcicsXG4gICAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgXG4gICAgICAgICAgICAgICAgICAgIHNpbmdsZUhlYWRlcjogeyBuYW1lOiAndXNlci1hZ2VudCcgfVxuICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgeyBwcmlvcml0eTogMCwgdHlwZTogJ0xPV0VSQ0FTRScgfVxuICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnQ09OVEFJTlMnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICBzZWFyY2hTdHJpbmc6ICdzY2FubmVyJyxcbiAgICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyBcbiAgICAgICAgICAgICAgICAgICAgc2luZ2xlSGVhZGVyOiB7IG5hbWU6ICd1c2VyLWFnZW50JyB9XG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICB7IHByaW9yaXR5OiAwLCB0eXBlOiAnTE9XRVJDQVNFJyB9XG4gICAgICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdDT05UQUlOUydcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHZpc2liaWxpdHlDb25maWc6IHtcbiAgICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGNsb3VkV2F0Y2hNZXRyaWNzRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBtZXRyaWNOYW1lOiAnU3VzcGljaW91c1VzZXJBZ2VudHMnXG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIC8vIEJsb2NrIHJlcXVlc3RzIHdpdGhvdXQgcHJvcGVyIHJlZmVycmVyIChmb3IgYWRtaW4gcGF0aHMpXG4gICAgICB7XG4gICAgICAgIG5hbWU6ICdBZG1pblJlZmVycmVyQ2hlY2snLFxuICAgICAgICBwcmlvcml0eTogMzUsXG4gICAgICAgIGFjdGlvbjogeyBibG9jazoge30gfSxcbiAgICAgICAgc3RhdGVtZW50OiB7XG4gICAgICAgICAgYW5kU3RhdGVtZW50OiB7XG4gICAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBieXRlTWF0Y2hTdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgIHNlYXJjaFN0cmluZzogJy9hZG1pbicsXG4gICAgICAgICAgICAgICAgICBmaWVsZFRvTWF0Y2g6IHsgdXJpUGF0aDoge30gfSxcbiAgICAgICAgICAgICAgICAgIHRleHRUcmFuc2Zvcm1hdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAgICAgeyBwcmlvcml0eTogMCwgdHlwZTogJ0xPV0VSQ0FTRScgfVxuICAgICAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgICAgIHBvc2l0aW9uYWxDb25zdHJhaW50OiAnU1RBUlRTX1dJVEgnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbm90U3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICBzdGF0ZW1lbnQ6IHtcbiAgICAgICAgICAgICAgICAgICAgYnl0ZU1hdGNoU3RhdGVtZW50OiB7XG4gICAgICAgICAgICAgICAgICAgICAgc2VhcmNoU3RyaW5nOiAneW91cmRvbWFpbi5jb20nLFxuICAgICAgICAgICAgICAgICAgICAgIGZpZWxkVG9NYXRjaDogeyBcbiAgICAgICAgICAgICAgICAgICAgICAgIHNpbmdsZUhlYWRlcjogeyBuYW1lOiAncmVmZXJlcicgfVxuICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgdGV4dFRyYW5zZm9ybWF0aW9uczogW1xuICAgICAgICAgICAgICAgICAgICAgICAgeyBwcmlvcml0eTogMCwgdHlwZTogJ0xPV0VSQ0FTRScgfVxuICAgICAgICAgICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgICAgICAgICAgcG9zaXRpb25hbENvbnN0cmFpbnQ6ICdDT05UQUlOUydcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICAgIHNhbXBsZWRSZXF1ZXN0c0VuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgY2xvdWRXYXRjaE1ldHJpY3NFbmFibGVkOiB0cnVlLFxuICAgICAgICAgIG1ldHJpY05hbWU6ICdBZG1pblJlZmVycmVyQ2hlY2snXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICBdO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSBXZWIgQUNMXG4gICAgdGhpcy53ZWJBY2wgPSBuZXcgd2FmdjIuQ2ZuV2ViQUNMKHRoaXMsICdFbmhhbmNlZFdlYkFDTCcsIHtcbiAgICAgIG5hbWU6IGBwb3J0Zm9saW8td2FmLSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIHNjb3BlOiAnQ0xPVURGUk9OVCcsXG4gICAgICBkZWZhdWx0QWN0aW9uOiB7IGFsbG93OiB7fSB9LFxuICAgICAgcnVsZXM6IHdhZlJ1bGVzLFxuICAgICAgdmlzaWJpbGl0eUNvbmZpZzoge1xuICAgICAgICBzYW1wbGVkUmVxdWVzdHNFbmFibGVkOiB0cnVlLFxuICAgICAgICBjbG91ZFdhdGNoTWV0cmljc0VuYWJsZWQ6IHRydWUsXG4gICAgICAgIG1ldHJpY05hbWU6IGBQb3J0Zm9saW9XQUYtJHtwcm9wcy5lbnZpcm9ubWVudH1gXG4gICAgICB9LFxuICAgICAgZGVzY3JpcHRpb246IGBFbmhhbmNlZCBXQUYgZm9yIFBob3RvZ3JhcGh5IFBvcnRmb2xpbyAtICR7cHJvcHMuZW52aXJvbm1lbnR9YFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggTG9nIEdyb3VwIGZvciBXQUYgbG9nc1xuICAgIHRoaXMubG9nR3JvdXAgPSBuZXcgbG9ncy5Mb2dHcm91cCh0aGlzLCAnV0FGTG9nR3JvdXAnLCB7XG4gICAgICBsb2dHcm91cE5hbWU6IGAvYXdzL3dhZnYyL3BvcnRmb2xpby0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICByZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfTU9OVEgsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgbG9nZ2luZyBjb25maWd1cmF0aW9uXG4gICAgbmV3IHdhZnYyLkNmbkxvZ2dpbmdDb25maWd1cmF0aW9uKHRoaXMsICdXQUZMb2dnaW5nQ29uZmlnJywge1xuICAgICAgcmVzb3VyY2VBcm46IHRoaXMud2ViQWNsLmF0dHJBcm4sXG4gICAgICBsb2dEZXN0aW5hdGlvbkNvbmZpZ3M6IFt0aGlzLmxvZ0dyb3VwLmxvZ0dyb3VwQXJuXSxcbiAgICAgIHJlZGFjdGVkRmllbGRzOiBbXG4gICAgICAgIHsgc2luZ2xlSGVhZGVyOiB7IG5hbWU6ICdhdXRob3JpemF0aW9uJyB9IH0sXG4gICAgICAgIHsgc2luZ2xlSGVhZGVyOiB7IG5hbWU6ICdjb29raWUnIH0gfVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFNOUyB0b3BpYyBmb3Igc2VjdXJpdHkgYWxlcnRzXG4gICAgY29uc3Qgc2VjdXJpdHlBbGVydHNUb3BpYyA9IG5ldyBzbnMuVG9waWModGhpcywgJ1NlY3VyaXR5QWxlcnRzJywge1xuICAgICAgZGlzcGxheU5hbWU6IGBQb3J0Zm9saW8gU2VjdXJpdHkgQWxlcnRzIC0gJHtwcm9wcy5lbnZpcm9ubWVudH1gXG4gICAgfSk7XG5cbiAgICBpZiAocHJvcHMuYWxlcnRFbWFpbCkge1xuICAgICAgc2VjdXJpdHlBbGVydHNUb3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICAgIG5ldyBzdWJzY3JpcHRpb25zLkVtYWlsU3Vic2NyaXB0aW9uKHByb3BzLmFsZXJ0RW1haWwpXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIENsb3VkV2F0Y2ggQWxhcm1zIGZvciBzZWN1cml0eSBtb25pdG9yaW5nXG4gICAgY29uc3Qgd2FmQmxvY2tlZFJlcXVlc3RzQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnV0FGQmxvY2tlZFJlcXVlc3RzQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGBQb3J0Zm9saW8tV0FGLUhpZ2hCbG9ja2VkUmVxdWVzdHMtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ0hpZ2ggbnVtYmVyIG9mIGJsb2NrZWQgcmVxdWVzdHMgZGV0ZWN0ZWQnLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBV1MvV0FGVjInLFxuICAgICAgICBtZXRyaWNOYW1lOiAnQmxvY2tlZFJlcXVlc3RzJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIFdlYkFDTDogdGhpcy53ZWJBY2wuYXR0ck5hbWUsXG4gICAgICAgICAgUmVnaW9uOiAnQ2xvdWRGcm9udCcsXG4gICAgICAgICAgUnVsZTogJ0FMTCdcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KVxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwMCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAyLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkdcbiAgICB9KTtcblxuICAgIHdhZkJsb2NrZWRSZXF1ZXN0c0FsYXJtLmFkZEFsYXJtQWN0aW9uKFxuICAgICAgbmV3IGNkay5hd3NfY2xvdWR3YXRjaF9hY3Rpb25zLlNuc0FjdGlvbihzZWN1cml0eUFsZXJ0c1RvcGljKVxuICAgICk7XG5cbiAgICAvLyBBZG1pbiBwYXRoIGFjY2VzcyBhbGFybVxuICAgIGNvbnN0IGFkbWluQWNjZXNzQWxhcm0gPSBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQWRtaW5BY2Nlc3NBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYFBvcnRmb2xpby1BZG1pbkFjY2Vzcy0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnVW51c3VhbCBhZG1pbiBwYXRoIGFjY2VzcyBkZXRlY3RlZCcsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9XQUZWMicsXG4gICAgICAgIG1ldHJpY05hbWU6ICdCbG9ja2VkUmVxdWVzdHMnLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgV2ViQUNMOiB0aGlzLndlYkFjbC5hdHRyTmFtZSxcbiAgICAgICAgICBSZWdpb246ICdDbG91ZEZyb250JyxcbiAgICAgICAgICBSdWxlOiAnQWRtaW5QYXRoUHJvdGVjdGlvbidcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnU3VtJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KVxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEwLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElOR1xuICAgIH0pO1xuXG4gICAgYWRtaW5BY2Nlc3NBbGFybS5hZGRBbGFybUFjdGlvbihcbiAgICAgIG5ldyBjZGsuYXdzX2Nsb3Vkd2F0Y2hfYWN0aW9ucy5TbnNBY3Rpb24oc2VjdXJpdHlBbGVydHNUb3BpYylcbiAgICApO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJBQ0xBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy53ZWJBY2wuYXR0ckFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRW5oYW5jZWQgV0FGIFdlYiBBQ0wgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBQb3J0Zm9saW8tV0FGLUFSTi0ke3Byb3BzLmVudmlyb25tZW50fWBcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXQUZMb2dHcm91cE5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sb2dHcm91cC5sb2dHcm91cE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1dBRiBDbG91ZFdhdGNoIExvZyBHcm91cCcsXG4gICAgICBleHBvcnROYW1lOiBgUG9ydGZvbGlvLVdBRi1Mb2dHcm91cC0ke3Byb3BzLmVudmlyb25tZW50fWBcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTZWN1cml0eUFsZXJ0c1RvcGljQXJuJywge1xuICAgICAgdmFsdWU6IHNlY3VyaXR5QWxlcnRzVG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NlY3VyaXR5IGFsZXJ0cyBTTlMgdG9waWMgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBQb3J0Zm9saW8tU2VjdXJpdHlBbGVydHMtJHtwcm9wcy5lbnZpcm9ubWVudH1gXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==