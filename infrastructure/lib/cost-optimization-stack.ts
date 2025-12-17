import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';

interface CostOptimizationStackProps extends cdk.StackProps {
  environment: string;
  deploymentPhase: string;
  alertEmail?: string;
}

export class CostOptimizationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CostOptimizationStackProps) {
    super(scope, id, props);

    const { environment, deploymentPhase, alertEmail } = props;

    // SNS Topic for cost alerts
    const costAlertTopic = new sns.Topic(this, 'CostAlertTopic', {
      topicName: `portfolio-cost-alerts-${environment}`,
      displayName: 'Portfolio Cost Alerts'
    });

    if (alertEmail) {
      costAlertTopic.addSubscription(
        new subscriptions.EmailSubscription(alertEmail)
      );
    }

    // Budget thresholds based on deployment phase
    const budgetLimits = {
      minimal: 20,
      enhanced: 60,
      enterprise: 120
    };

    const budgetLimit = budgetLimits[deploymentPhase as keyof typeof budgetLimits] || 60;

    // AWS Budget for cost monitoring
    new budgets.CfnBudget(this, 'PortfolioBudget', {
      budget: {
        budgetName: `portfolio-budget-${environment}`,
        budgetLimit: {
          amount: budgetLimit,
          unit: 'USD'
        },
        timeUnit: 'MONTHLY',
        budgetType: 'COST',
        costFilters: {
          TagKey: ['Project'],
          TagValue: ['PhotographyPortfolio']
        }
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE'
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: costAlertTopic.topicArn
            }
          ]
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE'
          },
          subscribers: [
            {
              subscriptionType: 'SNS',
              address: costAlertTopic.topicArn
            }
          ]
        }
      ]
    });

    // Cost optimization Lambda function
    const costOptimizerFunction = new lambda.Function(this, 'CostOptimizer', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const cloudwatch = new AWS.CloudWatch();
        const s3 = new AWS.S3();
        const dynamodb = new AWS.DynamoDB();

        exports.handler = async (event) => {
          console.log('Running cost optimization checks...');
          
          const recommendations = [];
          
          try {
            // Check S3 storage classes
            const s3Buckets = await s3.listBuckets().promise();
            for (const bucket of s3Buckets.Buckets) {
              if (bucket.Name.includes('portfolio')) {
                const lifecycle = await s3.getBucketLifecycleConfiguration({
                  Bucket: bucket.Name
                }).promise().catch(() => null);
                
                if (!lifecycle) {
                  recommendations.push({
                    service: 'S3',
                    resource: bucket.Name,
                    recommendation: 'Add lifecycle policy for cost optimization',
                    potentialSavings: '20-40%'
                  });
                }
              }
            }
            
            // Check DynamoDB capacity
            const tables = await dynamodb.listTables().promise();
            for (const tableName of tables.TableNames) {
              if (tableName.includes('Portfolio')) {
                const table = await dynamodb.describeTable({
                  TableName: tableName
                }).promise();
                
                if (table.Table.BillingModeSummary?.BillingMode === 'PROVISIONED') {
                  recommendations.push({
                    service: 'DynamoDB',
                    resource: tableName,
                    recommendation: 'Consider on-demand billing for variable workloads',
                    potentialSavings: '10-30%'
                  });
                }
              }
            }
            
            // Send recommendations if any found
            if (recommendations.length > 0) {
              const sns = new AWS.SNS();
              await sns.publish({
                TopicArn: '${costAlertTopic.topicArn}',
                Subject: 'Portfolio Cost Optimization Recommendations',
                Message: JSON.stringify(recommendations, null, 2)
              }).promise();
            }
            
            return {
              statusCode: 200,
              body: JSON.stringify({
                message: 'Cost optimization check completed',
                recommendations: recommendations.length
              })
            };
            
          } catch (error) {
            console.error('Error in cost optimization:', error);
            throw error;
          }
        };
      `),
      environment: {
        COST_ALERT_TOPIC_ARN: costAlertTopic.topicArn
      },
      timeout: cdk.Duration.minutes(5)
    });

    // Grant permissions
    costAlertTopic.grantPublish(costOptimizerFunction);

    // Schedule cost optimization checks
    const costOptimizationRule = new events.Rule(this, 'CostOptimizationSchedule', {
      schedule: events.Schedule.rate(cdk.Duration.days(7)), // Weekly
      description: 'Weekly cost optimization analysis'
    });

    costOptimizationRule.addTarget(
      new targets.LambdaFunction(costOptimizerFunction)
    );

    // CloudWatch Dashboard for cost monitoring
    const costDashboard = new cloudwatch.Dashboard(this, 'CostDashboard', {
      dashboardName: `portfolio-costs-${environment}`,
      widgets: [
        [
          new cloudwatch.TextWidget({
            markdown: `# Portfolio Cost Monitoring - ${environment.toUpperCase()}
            
**Deployment Phase**: ${deploymentPhase}
**Budget Limit**: $${budgetLimit}/month
**Environment**: ${environment}

## Cost Optimization Tips
- Enable S3 Intelligent Tiering
- Use DynamoDB On-Demand for variable workloads
- Monitor CloudFront cache hit ratio
- Review unused resources monthly`,
            width: 24,
            height: 6
          })
        ]
      ]
    });

    // Output important information
    new cdk.CfnOutput(this, 'CostAlertTopicArn', {
      value: costAlertTopic.topicArn,
      description: 'SNS Topic ARN for cost alerts'
    });

    new cdk.CfnOutput(this, 'BudgetLimit', {
      value: budgetLimit.toString(),
      description: 'Monthly budget limit in USD'
    });

    new cdk.CfnOutput(this, 'CostDashboardUrl', {
      value: `https://console.aws.amazon.com/cloudwatch/home?region=${this.region}#dashboards:name=${costDashboard.dashboardName}`,
      description: 'CloudWatch cost monitoring dashboard'
    });
  }
}
