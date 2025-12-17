"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostOptimizationStack = void 0;
const cdk = require("aws-cdk-lib");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const sns = require("aws-cdk-lib/aws-sns");
const subscriptions = require("aws-cdk-lib/aws-sns-subscriptions");
const budgets = require("aws-cdk-lib/aws-budgets");
const lambda = require("aws-cdk-lib/aws-lambda");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
class CostOptimizationStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const { environment, deploymentPhase, alertEmail } = props;
        // SNS Topic for cost alerts
        const costAlertTopic = new sns.Topic(this, 'CostAlertTopic', {
            topicName: `portfolio-cost-alerts-${environment}`,
            displayName: 'Portfolio Cost Alerts'
        });
        if (alertEmail) {
            costAlertTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
        }
        // Budget thresholds based on deployment phase
        const budgetLimits = {
            minimal: 20,
            enhanced: 60,
            enterprise: 120
        };
        const budgetLimit = budgetLimits[deploymentPhase] || 60;
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
        costOptimizationRule.addTarget(new targets.LambdaFunction(costOptimizerFunction));
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
exports.CostOptimizationStack = CostOptimizationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29zdC1vcHRpbWl6YXRpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb3N0LW9wdGltaXphdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMseURBQXlEO0FBQ3pELDJDQUEyQztBQUMzQyxtRUFBbUU7QUFDbkUsbURBQW1EO0FBQ25ELGlEQUFpRDtBQUNqRCxpREFBaUQ7QUFDakQsMERBQTBEO0FBUzFELE1BQWEscUJBQXNCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDbEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFpQztRQUN6RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLEVBQUUsV0FBVyxFQUFFLGVBQWUsRUFBRSxVQUFVLEVBQUUsR0FBRyxLQUFLLENBQUM7UUFFM0QsNEJBQTRCO1FBQzVCLE1BQU0sY0FBYyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7WUFDM0QsU0FBUyxFQUFFLHlCQUF5QixXQUFXLEVBQUU7WUFDakQsV0FBVyxFQUFFLHVCQUF1QjtTQUNyQyxDQUFDLENBQUM7UUFFSCxJQUFJLFVBQVUsRUFBRSxDQUFDO1lBQ2YsY0FBYyxDQUFDLGVBQWUsQ0FDNUIsSUFBSSxhQUFhLENBQUMsaUJBQWlCLENBQUMsVUFBVSxDQUFDLENBQ2hELENBQUM7UUFDSixDQUFDO1FBRUQsOENBQThDO1FBQzlDLE1BQU0sWUFBWSxHQUFHO1lBQ25CLE9BQU8sRUFBRSxFQUFFO1lBQ1gsUUFBUSxFQUFFLEVBQUU7WUFDWixVQUFVLEVBQUUsR0FBRztTQUNoQixDQUFDO1FBRUYsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLGVBQTRDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFckYsaUNBQWlDO1FBQ2pDLElBQUksT0FBTyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUs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QztxQkFDVixDQUFDO2lCQUNIO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCwrQkFBK0I7UUFDL0IsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsY0FBYyxDQUFDLFFBQVE7WUFDOUIsV0FBVyxFQUFFLCtCQUErQjtTQUM3QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsV0FBVyxDQUFDLFFBQVEsRUFBRTtZQUM3QixXQUFXLEVBQUUsNkJBQTZCO1NBQzNDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLHlEQUF5RCxJQUFJLENBQUMsTUFBTSxvQkFBb0IsYUFBYSxDQUFDLGFBQWEsRUFBRTtZQUM1SCxXQUFXLEVBQUUsc0NBQXNDO1NBQ3BELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQW5ORCxzREFtTkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBzdWJzY3JpcHRpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucyc7XG5pbXBvcnQgKiBhcyBidWRnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1idWRnZXRzJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbnRlcmZhY2UgQ29zdE9wdGltaXphdGlvblN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGVudmlyb25tZW50OiBzdHJpbmc7XG4gIGRlcGxveW1lbnRQaGFzZTogc3RyaW5nO1xuICBhbGVydEVtYWlsPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQ29zdE9wdGltaXphdGlvblN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IENvc3RPcHRpbWl6YXRpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB7IGVudmlyb25tZW50LCBkZXBsb3ltZW50UGhhc2UsIGFsZXJ0RW1haWwgfSA9IHByb3BzO1xuXG4gICAgLy8gU05TIFRvcGljIGZvciBjb3N0IGFsZXJ0c1xuICAgIGNvbnN0IGNvc3RBbGVydFRvcGljID0gbmV3IHNucy5Ub3BpYyh0aGlzLCAnQ29zdEFsZXJ0VG9waWMnLCB7XG4gICAgICB0b3BpY05hbWU6IGBwb3J0Zm9saW8tY29zdC1hbGVydHMtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZGlzcGxheU5hbWU6ICdQb3J0Zm9saW8gQ29zdCBBbGVydHMnXG4gICAgfSk7XG5cbiAgICBpZiAoYWxlcnRFbWFpbCkge1xuICAgICAgY29zdEFsZXJ0VG9waWMuYWRkU3Vic2NyaXB0aW9uKFxuICAgICAgICBuZXcgc3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbihhbGVydEVtYWlsKVxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBCdWRnZXQgdGhyZXNob2xkcyBiYXNlZCBvbiBkZXBsb3ltZW50IHBoYXNlXG4gICAgY29uc3QgYnVkZ2V0TGltaXRzID0ge1xuICAgICAgbWluaW1hbDogMjAsXG4gICAgICBlbmhhbmNlZDogNjAsXG4gICAgICBlbnRlcnByaXNlOiAxMjBcbiAgICB9O1xuXG4gICAgY29uc3QgYnVkZ2V0TGltaXQgPSBidWRnZXRMaW1pdHNbZGVwbG95bWVudFBoYXNlIGFzIGtleW9mIHR5cGVvZiBidWRnZXRMaW1pdHNdIHx8IDYwO1xuXG4gICAgLy8gQVdTIEJ1ZGdldCBmb3IgY29zdCBtb25pdG9yaW5nXG4gICAgbmV3IGJ1ZGdldHMuQ2ZuQnVkZ2V0KHRoaXMsICdQb3J0Zm9saW9CdWRnZXQnLCB7XG4gICAgICBidWRnZXQ6IHtcbiAgICAgICAgYnVkZ2V0TmFtZTogYHBvcnRmb2xpby1idWRnZXQtJHtlbnZpcm9ubWVudH1gLFxuICAgICAgICBidWRnZXRMaW1pdDoge1xuICAgICAgICAgIGFtb3VudDogYnVkZ2V0TGltaXQsXG4gICAgICAgICAgdW5pdDogJ1VTRCdcbiAgICAgICAgfSxcbiAgICAgICAgdGltZVVuaXQ6ICdNT05USExZJyxcbiAgICAgICAgYnVkZ2V0VHlwZTogJ0NPU1QnLFxuICAgICAgICBjb3N0RmlsdGVyczoge1xuICAgICAgICAgIFRhZ0tleTogWydQcm9qZWN0J10sXG4gICAgICAgICAgVGFnVmFsdWU6IFsnUGhvdG9ncmFwaHlQb3J0Zm9saW8nXVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgbm90aWZpY2F0aW9uc1dpdGhTdWJzY3JpYmVyczogW1xuICAgICAgICB7XG4gICAgICAgICAgbm90aWZpY2F0aW9uOiB7XG4gICAgICAgICAgICBub3RpZmljYXRpb25UeXBlOiAnQUNUVUFMJyxcbiAgICAgICAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogJ0dSRUFURVJfVEhBTicsXG4gICAgICAgICAgICB0aHJlc2hvbGQ6IDgwLFxuICAgICAgICAgICAgdGhyZXNob2xkVHlwZTogJ1BFUkNFTlRBR0UnXG4gICAgICAgICAgfSxcbiAgICAgICAgICBzdWJzY3JpYmVyczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBzdWJzY3JpcHRpb25UeXBlOiAnU05TJyxcbiAgICAgICAgICAgICAgYWRkcmVzczogY29zdEFsZXJ0VG9waWMudG9waWNBcm5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBub3RpZmljYXRpb246IHtcbiAgICAgICAgICAgIG5vdGlmaWNhdGlvblR5cGU6ICdGT1JFQ0FTVEVEJyxcbiAgICAgICAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogJ0dSRUFURVJfVEhBTicsXG4gICAgICAgICAgICB0aHJlc2hvbGQ6IDEwMCxcbiAgICAgICAgICAgIHRocmVzaG9sZFR5cGU6ICdQRVJDRU5UQUdFJ1xuICAgICAgICAgIH0sXG4gICAgICAgICAgc3Vic2NyaWJlcnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uVHlwZTogJ1NOUycsXG4gICAgICAgICAgICAgIGFkZHJlc3M6IGNvc3RBbGVydFRvcGljLnRvcGljQXJuXG4gICAgICAgICAgICB9XG4gICAgICAgICAgXVxuICAgICAgICB9XG4gICAgICBdXG4gICAgfSk7XG5cbiAgICAvLyBDb3N0IG9wdGltaXphdGlvbiBMYW1iZGEgZnVuY3Rpb25cbiAgICBjb25zdCBjb3N0T3B0aW1pemVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdDb3N0T3B0aW1pemVyJywge1xuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE4X1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tSW5saW5lKGBcbiAgICAgICAgY29uc3QgQVdTID0gcmVxdWlyZSgnYXdzLXNkaycpO1xuICAgICAgICBjb25zdCBjbG91ZHdhdGNoID0gbmV3IEFXUy5DbG91ZFdhdGNoKCk7XG4gICAgICAgIGNvbnN0IHMzID0gbmV3IEFXUy5TMygpO1xuICAgICAgICBjb25zdCBkeW5hbW9kYiA9IG5ldyBBV1MuRHluYW1vREIoKTtcblxuICAgICAgICBleHBvcnRzLmhhbmRsZXIgPSBhc3luYyAoZXZlbnQpID0+IHtcbiAgICAgICAgICBjb25zb2xlLmxvZygnUnVubmluZyBjb3N0IG9wdGltaXphdGlvbiBjaGVja3MuLi4nKTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCByZWNvbW1lbmRhdGlvbnMgPSBbXTtcbiAgICAgICAgICBcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gQ2hlY2sgUzMgc3RvcmFnZSBjbGFzc2VzXG4gICAgICAgICAgICBjb25zdCBzM0J1Y2tldHMgPSBhd2FpdCBzMy5saXN0QnVja2V0cygpLnByb21pc2UoKTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgYnVja2V0IG9mIHMzQnVja2V0cy5CdWNrZXRzKSB7XG4gICAgICAgICAgICAgIGlmIChidWNrZXQuTmFtZS5pbmNsdWRlcygncG9ydGZvbGlvJykpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaWZlY3ljbGUgPSBhd2FpdCBzMy5nZXRCdWNrZXRMaWZlY3ljbGVDb25maWd1cmF0aW9uKHtcbiAgICAgICAgICAgICAgICAgIEJ1Y2tldDogYnVja2V0Lk5hbWVcbiAgICAgICAgICAgICAgICB9KS5wcm9taXNlKCkuY2F0Y2goKCkgPT4gbnVsbCk7XG4gICAgICAgICAgICAgICAgXG4gICAgICAgICAgICAgICAgaWYgKCFsaWZlY3ljbGUpIHtcbiAgICAgICAgICAgICAgICAgIHJlY29tbWVuZGF0aW9ucy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgc2VydmljZTogJ1MzJyxcbiAgICAgICAgICAgICAgICAgICAgcmVzb3VyY2U6IGJ1Y2tldC5OYW1lLFxuICAgICAgICAgICAgICAgICAgICByZWNvbW1lbmRhdGlvbjogJ0FkZCBsaWZlY3ljbGUgcG9saWN5IGZvciBjb3N0IG9wdGltaXphdGlvbicsXG4gICAgICAgICAgICAgICAgICAgIHBvdGVudGlhbFNhdmluZ3M6ICcyMC00MCUnXG4gICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ2hlY2sgRHluYW1vREIgY2FwYWNpdHlcbiAgICAgICAgICAgIGNvbnN0IHRhYmxlcyA9IGF3YWl0IGR5bmFtb2RiLmxpc3RUYWJsZXMoKS5wcm9taXNlKCk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRhYmxlTmFtZSBvZiB0YWJsZXMuVGFibGVOYW1lcykge1xuICAgICAgICAgICAgICBpZiAodGFibGVOYW1lLmluY2x1ZGVzKCdQb3J0Zm9saW8nKSkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhYmxlID0gYXdhaXQgZHluYW1vZGIuZGVzY3JpYmVUYWJsZSh7XG4gICAgICAgICAgICAgICAgICBUYWJsZU5hbWU6IHRhYmxlTmFtZVxuICAgICAgICAgICAgICAgIH0pLnByb21pc2UoKTtcbiAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBpZiAodGFibGUuVGFibGUuQmlsbGluZ01vZGVTdW1tYXJ5Py5CaWxsaW5nTW9kZSA9PT0gJ1BST1ZJU0lPTkVEJykge1xuICAgICAgICAgICAgICAgICAgcmVjb21tZW5kYXRpb25zLnB1c2goe1xuICAgICAgICAgICAgICAgICAgICBzZXJ2aWNlOiAnRHluYW1vREInLFxuICAgICAgICAgICAgICAgICAgICByZXNvdXJjZTogdGFibGVOYW1lLFxuICAgICAgICAgICAgICAgICAgICByZWNvbW1lbmRhdGlvbjogJ0NvbnNpZGVyIG9uLWRlbWFuZCBiaWxsaW5nIGZvciB2YXJpYWJsZSB3b3JrbG9hZHMnLFxuICAgICAgICAgICAgICAgICAgICBwb3RlbnRpYWxTYXZpbmdzOiAnMTAtMzAlJ1xuICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIC8vIFNlbmQgcmVjb21tZW5kYXRpb25zIGlmIGFueSBmb3VuZFxuICAgICAgICAgICAgaWYgKHJlY29tbWVuZGF0aW9ucy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHNucyA9IG5ldyBBV1MuU05TKCk7XG4gICAgICAgICAgICAgIGF3YWl0IHNucy5wdWJsaXNoKHtcbiAgICAgICAgICAgICAgICBUb3BpY0FybjogJyR7Y29zdEFsZXJ0VG9waWMudG9waWNBcm59JyxcbiAgICAgICAgICAgICAgICBTdWJqZWN0OiAnUG9ydGZvbGlvIENvc3QgT3B0aW1pemF0aW9uIFJlY29tbWVuZGF0aW9ucycsXG4gICAgICAgICAgICAgICAgTWVzc2FnZTogSlNPTi5zdHJpbmdpZnkocmVjb21tZW5kYXRpb25zLCBudWxsLCAyKVxuICAgICAgICAgICAgICB9KS5wcm9taXNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICAgIG1lc3NhZ2U6ICdDb3N0IG9wdGltaXphdGlvbiBjaGVjayBjb21wbGV0ZWQnLFxuICAgICAgICAgICAgICAgIHJlY29tbWVuZGF0aW9uczogcmVjb21tZW5kYXRpb25zLmxlbmd0aFxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIFxuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiBjb3N0IG9wdGltaXphdGlvbjonLCBlcnJvcik7XG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICBgKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIENPU1RfQUxFUlRfVE9QSUNfQVJOOiBjb3N0QWxlcnRUb3BpYy50b3BpY0FyblxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9uc1xuICAgIGNvc3RBbGVydFRvcGljLmdyYW50UHVibGlzaChjb3N0T3B0aW1pemVyRnVuY3Rpb24pO1xuXG4gICAgLy8gU2NoZWR1bGUgY29zdCBvcHRpbWl6YXRpb24gY2hlY2tzXG4gICAgY29uc3QgY29zdE9wdGltaXphdGlvblJ1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ0Nvc3RPcHRpbWl6YXRpb25TY2hlZHVsZScsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUucmF0ZShjZGsuRHVyYXRpb24uZGF5cyg3KSksIC8vIFdlZWtseVxuICAgICAgZGVzY3JpcHRpb246ICdXZWVrbHkgY29zdCBvcHRpbWl6YXRpb24gYW5hbHlzaXMnXG4gICAgfSk7XG5cbiAgICBjb3N0T3B0aW1pemF0aW9uUnVsZS5hZGRUYXJnZXQoXG4gICAgICBuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihjb3N0T3B0aW1pemVyRnVuY3Rpb24pXG4gICAgKTtcblxuICAgIC8vIENsb3VkV2F0Y2ggRGFzaGJvYXJkIGZvciBjb3N0IG1vbml0b3JpbmdcbiAgICBjb25zdCBjb3N0RGFzaGJvYXJkID0gbmV3IGNsb3Vkd2F0Y2guRGFzaGJvYXJkKHRoaXMsICdDb3N0RGFzaGJvYXJkJywge1xuICAgICAgZGFzaGJvYXJkTmFtZTogYHBvcnRmb2xpby1jb3N0cy0ke2Vudmlyb25tZW50fWAsXG4gICAgICB3aWRnZXRzOiBbXG4gICAgICAgIFtcbiAgICAgICAgICBuZXcgY2xvdWR3YXRjaC5UZXh0V2lkZ2V0KHtcbiAgICAgICAgICAgIG1hcmtkb3duOiBgIyBQb3J0Zm9saW8gQ29zdCBNb25pdG9yaW5nIC0gJHtlbnZpcm9ubWVudC50b1VwcGVyQ2FzZSgpfVxuICAgICAgICAgICAgXG4qKkRlcGxveW1lbnQgUGhhc2UqKjogJHtkZXBsb3ltZW50UGhhc2V9XG4qKkJ1ZGdldCBMaW1pdCoqOiAkJHtidWRnZXRMaW1pdH0vbW9udGhcbioqRW52aXJvbm1lbnQqKjogJHtlbnZpcm9ubWVudH1cblxuIyMgQ29zdCBPcHRpbWl6YXRpb24gVGlwc1xuLSBFbmFibGUgUzMgSW50ZWxsaWdlbnQgVGllcmluZ1xuLSBVc2UgRHluYW1vREIgT24tRGVtYW5kIGZvciB2YXJpYWJsZSB3b3JrbG9hZHNcbi0gTW9uaXRvciBDbG91ZEZyb250IGNhY2hlIGhpdCByYXRpb1xuLSBSZXZpZXcgdW51c2VkIHJlc291cmNlcyBtb250aGx5YCxcbiAgICAgICAgICAgIHdpZHRoOiAyNCxcbiAgICAgICAgICAgIGhlaWdodDogNlxuICAgICAgICAgIH0pXG4gICAgICAgIF1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCBpbXBvcnRhbnQgaW5mb3JtYXRpb25cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29zdEFsZXJ0VG9waWNBcm4nLCB7XG4gICAgICB2YWx1ZTogY29zdEFsZXJ0VG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyBUb3BpYyBBUk4gZm9yIGNvc3QgYWxlcnRzJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0J1ZGdldExpbWl0Jywge1xuICAgICAgdmFsdWU6IGJ1ZGdldExpbWl0LnRvU3RyaW5nKCksXG4gICAgICBkZXNjcmlwdGlvbjogJ01vbnRobHkgYnVkZ2V0IGxpbWl0IGluIFVTRCdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb3N0RGFzaGJvYXJkVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY2xvdWR3YXRjaC9ob21lP3JlZ2lvbj0ke3RoaXMucmVnaW9ufSNkYXNoYm9hcmRzOm5hbWU9JHtjb3N0RGFzaGJvYXJkLmRhc2hib2FyZE5hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRXYXRjaCBjb3N0IG1vbml0b3JpbmcgZGFzaGJvYXJkJ1xuICAgIH0pO1xuICB9XG59XG4iXX0=