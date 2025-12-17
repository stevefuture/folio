import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';

interface EnhancedWAFStackProps extends cdk.StackProps {
  environment: string;
  adminAllowedIPs?: string[];
  alertEmail?: string;
}

export class EnhancedWAFStack extends cdk.Stack {
  public readonly webAcl: wafv2.CfnWebACL;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: EnhancedWAFStackProps) {
    super(scope, id, props);

    // Create IP Set for admin allowed IPs
    const adminIPSet = new wafv2.CfnIPSet(this, 'AdminAllowedIPs', {
      name: `portfolio-admin-ips-${props.environment}`,
      scope: 'CLOUDFRONT',
      ipAddressVersion: 'IPV4',
      addresses: props.adminAllowedIPs || ['127.0.0.1/32'] // Default to localhost
    });

    // Create comprehensive WAF rules
    const wafRules: wafv2.CfnWebACL.RuleProperty[] = [
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
      securityAlertsTopic.addSubscription(
        new subscriptions.EmailSubscription(props.alertEmail)
      );
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

    wafBlockedRequestsAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(securityAlertsTopic)
    );

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

    adminAccessAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(securityAlertsTopic)
    );

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
