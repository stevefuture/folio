"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackupRecoveryStack = void 0;
const cdk = require("aws-cdk-lib");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const s3 = require("aws-cdk-lib/aws-s3");
const lambda = require("aws-cdk-lib/aws-lambda");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const iam = require("aws-cdk-lib/aws-iam");
const cloudwatch = require("aws-cdk-lib/aws-cloudwatch");
const sns = require("aws-cdk-lib/aws-sns");
const ssm = require("aws-cdk-lib/aws-ssm");
class BackupRecoveryStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // Create backup S3 bucket in secondary region
        this.backupBucket = new s3.Bucket(this, 'BackupBucket', {
            bucketName: `portfolio-backup-${props.environment}-${props.backupRegion}`,
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            lifecycleRules: [
                {
                    id: 'BackupLifecycle',
                    status: s3.LifecycleRuleStatus.ENABLED,
                    transitions: [
                        {
                            storageClass: s3.StorageClass.STANDARD_INFREQUENT_ACCESS,
                            transitionAfter: cdk.Duration.days(30)
                        },
                        {
                            storageClass: s3.StorageClass.GLACIER,
                            transitionAfter: cdk.Duration.days(90)
                        },
                        {
                            storageClass: s3.StorageClass.DEEP_ARCHIVE,
                            transitionAfter: cdk.Duration.days(365)
                        }
                    ],
                    noncurrentVersionTransitions: [
                        {
                            storageClass: s3.StorageClass.STANDARD_INFREQUENT_ACCESS,
                            transitionAfter: cdk.Duration.days(30)
                        }
                    ],
                    noncurrentVersionExpiration: cdk.Duration.days(2555) // 7 years
                }
            ],
            replicationConfiguration: {
                role: this.createReplicationRole(),
                rules: [
                    {
                        id: 'ReplicateToBackupRegion',
                        status: s3.ReplicationStatus.ENABLED,
                        prefix: 'media/',
                        destination: {
                            bucket: props.primaryBucket.bucketArn,
                            storageClass: s3.StorageClass.STANDARD_INFREQUENT_ACCESS
                        }
                    }
                ]
            }
        });
        // Enable Point-in-Time Recovery on primary table
        const tableWithPITR = new dynamodb.CfnTable(this, 'TablePITRConfig', {
            tableName: props.primaryTable.tableName,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true
            }
        });
        // Create Global Table for cross-region replication
        this.globalTable = new dynamodb.Table(this, 'GlobalTable', {
            tableName: `${props.primaryTable.tableName}-global`,
            partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            pointInTimeRecovery: true,
            replicationRegions: [props.backupRegion],
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
            removalPolicy: cdk.RemovalPolicy.RETAIN
        });
        // Backup automation Lambda function
        this.backupFunction = new lambda.Function(this, 'BackupFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'index.handler',
            code: lambda.Code.fromAsset('../backend/backup-automation'),
            timeout: cdk.Duration.minutes(15),
            memorySize: 1024,
            environment: {
                PRIMARY_TABLE_NAME: props.primaryTable.tableName,
                BACKUP_BUCKET_NAME: this.backupBucket.bucketName,
                BACKUP_REGION: props.backupRegion,
                ENVIRONMENT: props.environment
            },
            role: this.createBackupLambdaRole(props.primaryTable, this.backupBucket)
        });
        // Schedule daily backups
        const backupSchedule = new events.Rule(this, 'BackupSchedule', {
            schedule: events.Schedule.cron({
                minute: '0',
                hour: '2', // 2 AM UTC
                day: '*',
                month: '*',
                year: '*'
            }),
            description: 'Daily backup schedule'
        });
        backupSchedule.addTarget(new targets.LambdaFunction(this.backupFunction));
        // Configuration backup
        this.createConfigurationBackup(props.environment);
        // Monitoring and alerting
        this.createBackupMonitoring(props.alertEmail, props.environment);
        // Health check for disaster recovery
        this.createHealthChecks(props.environment);
        // Cross-region DNS failover
        this.createDNSFailover(props.environment);
        // Outputs
        new cdk.CfnOutput(this, 'BackupBucketName', {
            value: this.backupBucket.bucketName,
            description: 'Backup S3 bucket name'
        });
        new cdk.CfnOutput(this, 'GlobalTableName', {
            value: this.globalTable.tableName,
            description: 'Global DynamoDB table name'
        });
        new cdk.CfnOutput(this, 'BackupFunctionArn', {
            value: this.backupFunction.functionArn,
            description: 'Backup Lambda function ARN'
        });
    }
    createReplicationRole() {
        return new iam.Role(this, 'ReplicationRole', {
            assumedBy: new iam.ServicePrincipal('s3.amazonaws.com'),
            inlinePolicies: {
                ReplicationPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObjectVersionForReplication',
                                's3:GetObjectVersionAcl'
                            ],
                            resources: ['*']
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:ReplicateObject',
                                's3:ReplicateDelete'
                            ],
                            resources: ['*']
                        })
                    ]
                })
            }
        });
    }
    createBackupLambdaRole(table, bucket) {
        return new iam.Role(this, 'BackupLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ],
            inlinePolicies: {
                BackupPolicy: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:CreateBackup',
                                'dynamodb:DescribeBackup',
                                'dynamodb:ListBackups',
                                'dynamodb:DeleteBackup',
                                'dynamodb:RestoreTableFromBackup'
                            ],
                            resources: [
                                table.tableArn,
                                `${table.tableArn}/backup/*`
                            ]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:PutObject',
                                's3:GetObject',
                                's3:ListBucket',
                                's3:DeleteObject'
                            ],
                            resources: [
                                bucket.bucketArn,
                                `${bucket.bucketArn}/*`
                            ]
                        }),
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'ssm:GetParameters',
                                'ssm:GetParameter',
                                'ssm:PutParameter'
                            ],
                            resources: [
                                `arn:aws:ssm:${this.region}:${this.account}:parameter/portfolio/${this.stackName}/*`
                            ]
                        })
                    ]
                })
            }
        });
    }
    createConfigurationBackup(environment) {
        // Configuration backup Lambda
        const configBackupFunction = new lambda.Function(this, 'ConfigBackupFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'config-backup.handler',
            code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        const ssm = new AWS.SSM();
        const s3 = new AWS.S3();
        
        exports.handler = async (event) => {
          try {
            // Get all parameters for this environment
            const parameters = await ssm.getParametersByPath({
              Path: '/portfolio/${environment}/',
              Recursive: true,
              WithDecryption: false
            }).promise();
            
            // Create backup object
            const backup = {
              timestamp: new Date().toISOString(),
              environment: '${environment}',
              parameters: parameters.Parameters
            };
            
            // Store in S3
            await s3.putObject({
              Bucket: process.env.BACKUP_BUCKET,
              Key: \`config-backups/\${environment}/\${new Date().toISOString().split('T')[0]}.json\`,
              Body: JSON.stringify(backup, null, 2),
              ServerSideEncryption: 'AES256'
            }).promise();
            
            console.log('Configuration backup completed');
            return { statusCode: 200, body: 'Backup completed' };
          } catch (error) {
            console.error('Backup failed:', error);
            throw error;
          }
        };
      `),
            environment: {
                BACKUP_BUCKET: this.backupBucket.bucketName
            },
            timeout: cdk.Duration.minutes(5)
        });
        // Grant permissions
        this.backupBucket.grantWrite(configBackupFunction);
        configBackupFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ['ssm:GetParametersByPath'],
            resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/portfolio/${environment}/*`]
        }));
        // Schedule daily config backups
        const configBackupSchedule = new events.Rule(this, 'ConfigBackupSchedule', {
            schedule: events.Schedule.cron({
                minute: '30',
                hour: '2',
                day: '*',
                month: '*',
                year: '*'
            })
        });
        configBackupSchedule.addTarget(new targets.LambdaFunction(configBackupFunction));
    }
    createBackupMonitoring(alertEmail, environment) {
        // SNS topic for backup alerts
        const backupAlertsTopic = new sns.Topic(this, 'BackupAlerts', {
            displayName: `Portfolio Backup Alerts - ${environment}`
        });
        backupAlertsTopic.addSubscription(new cdk.aws_sns_subscriptions.EmailSubscription(alertEmail));
        // CloudWatch alarms
        const backupFailureAlarm = new cloudwatch.Alarm(this, 'BackupFailureAlarm', {
            alarmName: `Portfolio-BackupFailure-${environment}`,
            alarmDescription: 'Backup operation failed',
            metric: this.backupFunction.metricErrors({
                statistic: 'Sum',
                period: cdk.Duration.minutes(5)
            }),
            threshold: 1,
            evaluationPeriods: 1,
            treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
        });
        backupFailureAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(backupAlertsTopic));
        // S3 replication monitoring
        const replicationFailureAlarm = new cloudwatch.Alarm(this, 'ReplicationFailureAlarm', {
            alarmName: `Portfolio-ReplicationFailure-${environment}`,
            alarmDescription: 'S3 cross-region replication failed',
            metric: new cloudwatch.Metric({
                namespace: 'AWS/S3',
                metricName: 'ReplicationLatency',
                dimensionsMap: {
                    SourceBucket: this.backupBucket.bucketName
                },
                statistic: 'Maximum',
                period: cdk.Duration.minutes(15)
            }),
            threshold: 3600, // 1 hour
            evaluationPeriods: 2,
            treatMissingData: cloudwatch.TreatMissingData.BREACHING
        });
        replicationFailureAlarm.addAlarmAction(new cdk.aws_cloudwatch_actions.SnsAction(backupAlertsTopic));
    }
    createHealthChecks(environment) {
        // Health check Lambda for disaster recovery readiness
        const healthCheckFunction = new lambda.Function(this, 'HealthCheckFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'health-check.handler',
            code: lambda.Code.fromInline(`
        const AWS = require('aws-sdk');
        
        exports.handler = async (event) => {
          const dynamodb = new AWS.DynamoDB();
          const s3 = new AWS.S3();
          
          const checks = [];
          
          try {
            // Check DynamoDB table health
            const tableStatus = await dynamodb.describeTable({
              TableName: process.env.TABLE_NAME
            }).promise();
            
            checks.push({
              service: 'DynamoDB',
              status: tableStatus.Table.TableStatus === 'ACTIVE' ? 'HEALTHY' : 'UNHEALTHY',
              details: { tableStatus: tableStatus.Table.TableStatus }
            });
            
            // Check S3 bucket accessibility
            await s3.headBucket({ Bucket: process.env.BUCKET_NAME }).promise();
            checks.push({
              service: 'S3',
              status: 'HEALTHY',
              details: { bucket: process.env.BUCKET_NAME }
            });
            
            // Check backup recency
            const backups = await dynamodb.listBackups({
              TableName: process.env.TABLE_NAME,
              TimeRangeLowerBound: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
            }).promise();
            
            checks.push({
              service: 'Backups',
              status: backups.BackupSummaries.length > 0 ? 'HEALTHY' : 'UNHEALTHY',
              details: { recentBackups: backups.BackupSummaries.length }
            });
            
            return {
              statusCode: 200,
              body: JSON.stringify({
                overall: checks.every(c => c.status === 'HEALTHY') ? 'HEALTHY' : 'DEGRADED',
                checks,
                timestamp: new Date().toISOString()
              })
            };
          } catch (error) {
            return {
              statusCode: 500,
              body: JSON.stringify({
                overall: 'UNHEALTHY',
                error: error.message,
                timestamp: new Date().toISOString()
              })
            };
          }
        };
      `),
            environment: {
                TABLE_NAME: this.globalTable.tableName,
                BUCKET_NAME: this.backupBucket.bucketName
            },
            timeout: cdk.Duration.minutes(2)
        });
        // Grant permissions for health checks
        this.globalTable.grantReadData(healthCheckFunction);
        this.backupBucket.grantRead(healthCheckFunction);
        healthCheckFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                'dynamodb:DescribeTable',
                'dynamodb:ListBackups'
            ],
            resources: [this.globalTable.tableArn]
        }));
        // Schedule health checks every 15 minutes
        const healthCheckSchedule = new events.Rule(this, 'HealthCheckSchedule', {
            schedule: events.Schedule.rate(cdk.Duration.minutes(15))
        });
        healthCheckSchedule.addTarget(new targets.LambdaFunction(healthCheckFunction));
    }
    createDNSFailover(environment) {
        // Store DNS configuration for failover
        new ssm.StringParameter(this, 'DNSFailoverConfig', {
            parameterName: `/portfolio/${environment}/dns/failover-config`,
            stringValue: JSON.stringify({
                primaryRegion: this.region,
                backupRegion: 'us-west-2',
                healthCheckEndpoint: '/health',
                failoverThreshold: 3
            }),
            description: 'DNS failover configuration for disaster recovery'
        });
    }
}
exports.BackupRecoveryStack = BackupRecoveryStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFja3VwLXJlY292ZXJ5LXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmFja3VwLXJlY292ZXJ5LXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyxxREFBcUQ7QUFDckQseUNBQXlDO0FBQ3pDLGlEQUFpRDtBQUNqRCxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELDJDQUEyQztBQUMzQyx5REFBeUQ7QUFDekQsMkNBQTJDO0FBRTNDLDJDQUEyQztBQVczQyxNQUFhLG1CQUFvQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBS2hELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBK0I7UUFDdkUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsOENBQThDO1FBQzlDLElBQUksQ0FBQyxZQUFZLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxjQUFjLEVBQUU7WUFDdEQsVUFBVSxFQUFFLG9CQUFvQixLQUFLLENBQUMsV0FBVyxJQUFJLEtBQUssQ0FBQyxZQUFZLEVBQUU7WUFDekUsU0FBUyxFQUFFLElBQUk7WUFDZixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsY0FBYyxFQUFFO2dCQUNkO29CQUNFLEVBQUUsRUFBRSxpQkFBaUI7b0JBQ3JCLE1BQU0sRUFBRSxFQUFFLENBQUMsbUJBQW1CLENBQUMsT0FBTztvQkFDdEMsV0FBVyxFQUFFO3dCQUNYOzRCQUNFLFlBQVksRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLDBCQUEwQjs0QkFDeEQsZUFBZSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQzt5QkFDdkM7d0JBQ0Q7NEJBQ0UsWUFBWSxFQUFFLEVBQUUsQ0FBQyxZQUFZLENBQUMs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QUFDO0lBRU8saUJBQWlCLENBQUMsV0FBbUI7UUFDM0MsdUNBQXVDO1FBQ3ZDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDakQsYUFBYSxFQUFFLGNBQWMsV0FBVyxzQkFBc0I7WUFDOUQsV0FBVyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQzFCLGFBQWEsRUFBRSxJQUFJLENBQUMsTUFBTTtnQkFDMUIsWUFBWSxFQUFFLFdBQVc7Z0JBQ3pCLG1CQUFtQixFQUFFLFNBQVM7Z0JBQzlCLGlCQUFpQixFQUFFLENBQUM7YUFDckIsQ0FBQztZQUNGLFdBQVcsRUFBRSxrREFBa0Q7U0FDaEUsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBNWJELGtEQTRiQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgc25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMnO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSAnYXdzLWNkay1saWIvYXdzLXNzbSc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcblxuaW50ZXJmYWNlIEJhY2t1cFJlY292ZXJ5U3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgcHJpbWFyeVRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHJpbWFyeUJ1Y2tldDogczMuQnVja2V0O1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICBiYWNrdXBSZWdpb246IHN0cmluZztcbiAgYWxlcnRFbWFpbDogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQmFja3VwUmVjb3ZlcnlTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBiYWNrdXBCdWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IGdsb2JhbFRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IGJhY2t1cEZ1bmN0aW9uOiBsYW1iZGEuRnVuY3Rpb247XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEJhY2t1cFJlY292ZXJ5U3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gQ3JlYXRlIGJhY2t1cCBTMyBidWNrZXQgaW4gc2Vjb25kYXJ5IHJlZ2lvblxuICAgIHRoaXMuYmFja3VwQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQmFja3VwQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHBvcnRmb2xpby1iYWNrdXAtJHtwcm9wcy5lbnZpcm9ubWVudH0tJHtwcm9wcy5iYWNrdXBSZWdpb259YCxcbiAgICAgIHZlcnNpb25lZDogdHJ1ZSxcbiAgICAgIGVuY3J5cHRpb246IHMzLkJ1Y2tldEVuY3J5cHRpb24uUzNfTUFOQUdFRCxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdCYWNrdXBMaWZlY3ljbGUnLFxuICAgICAgICAgIHN0YXR1czogczMuTGlmZWN5Y2xlUnVsZVN0YXR1cy5FTkFCTEVELFxuICAgICAgICAgIHRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLlNUQU5EQVJEX0lORlJFUVVFTlRfQUNDRVNTLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgc3RvcmFnZUNsYXNzOiBzMy5TdG9yYWdlQ2xhc3MuR0xBQ0lFUixcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg5MClcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLkRFRVBfQVJDSElWRSxcbiAgICAgICAgICAgICAgdHJhbnNpdGlvbkFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cygzNjUpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgXSxcbiAgICAgICAgICBub25jdXJyZW50VmVyc2lvblRyYW5zaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHN0b3JhZ2VDbGFzczogczMuU3RvcmFnZUNsYXNzLlNUQU5EQVJEX0lORlJFUVVFTlRfQUNDRVNTLFxuICAgICAgICAgICAgICB0cmFuc2l0aW9uQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDMwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIF0sXG4gICAgICAgICAgbm9uY3VycmVudFZlcnNpb25FeHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygyNTU1KSAvLyA3IHllYXJzXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICByZXBsaWNhdGlvbkNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgcm9sZTogdGhpcy5jcmVhdGVSZXBsaWNhdGlvblJvbGUoKSxcbiAgICAgICAgcnVsZXM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBpZDogJ1JlcGxpY2F0ZVRvQmFja3VwUmVnaW9uJyxcbiAgICAgICAgICAgIHN0YXR1czogczMuUmVwbGljYXRpb25TdGF0dXMuRU5BQkxFRCxcbiAgICAgICAgICAgIHByZWZpeDogJ21lZGlhLycsXG4gICAgICAgICAgICBkZXN0aW5hdGlvbjoge1xuICAgICAgICAgICAgICBidWNrZXQ6IHByb3BzLnByaW1hcnlCdWNrZXQuYnVja2V0QXJuLFxuICAgICAgICAgICAgICBzdG9yYWdlQ2xhc3M6IHMzLlN0b3JhZ2VDbGFzcy5TVEFOREFSRF9JTkZSRVFVRU5UX0FDQ0VTU1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gRW5hYmxlIFBvaW50LWluLVRpbWUgUmVjb3Zlcnkgb24gcHJpbWFyeSB0YWJsZVxuICAgIGNvbnN0IHRhYmxlV2l0aFBJVFIgPSBuZXcgZHluYW1vZGIuQ2ZuVGFibGUodGhpcywgJ1RhYmxlUElUUkNvbmZpZycsIHtcbiAgICAgIHRhYmxlTmFtZTogcHJvcHMucHJpbWFyeVRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgR2xvYmFsIFRhYmxlIGZvciBjcm9zcy1yZWdpb24gcmVwbGljYXRpb25cbiAgICB0aGlzLmdsb2JhbFRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdHbG9iYWxUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYCR7cHJvcHMucHJpbWFyeVRhYmxlLnRhYmxlTmFtZX0tZ2xvYmFsYCxcbiAgICAgIHBhcnRpdGlvbktleTogeyBuYW1lOiAnUEsnLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgc29ydEtleTogeyBuYW1lOiAnU0snLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgICByZXBsaWNhdGlvblJlZ2lvbnM6IFtwcm9wcy5iYWNrdXBSZWdpb25dLFxuICAgICAgc3RyZWFtOiBkeW5hbW9kYi5TdHJlYW1WaWV3VHlwZS5ORVdfQU5EX09MRF9JTUFHRVMsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU5cbiAgICB9KTtcblxuICAgIC8vIEJhY2t1cCBhdXRvbWF0aW9uIExhbWJkYSBmdW5jdGlvblxuICAgIHRoaXMuYmFja3VwRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdCYWNrdXBGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL2JhY2t1cC1hdXRvbWF0aW9uJyksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgUFJJTUFSWV9UQUJMRV9OQU1FOiBwcm9wcy5wcmltYXJ5VGFibGUudGFibGVOYW1lLFxuICAgICAgICBCQUNLVVBfQlVDS0VUX05BTUU6IHRoaXMuYmFja3VwQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIEJBQ0tVUF9SRUdJT046IHByb3BzLmJhY2t1cFJlZ2lvbixcbiAgICAgICAgRU5WSVJPTk1FTlQ6IHByb3BzLmVudmlyb25tZW50XG4gICAgICB9LFxuICAgICAgcm9sZTogdGhpcy5jcmVhdGVCYWNrdXBMYW1iZGFSb2xlKHByb3BzLnByaW1hcnlUYWJsZSwgdGhpcy5iYWNrdXBCdWNrZXQpXG4gICAgfSk7XG5cbiAgICAvLyBTY2hlZHVsZSBkYWlseSBiYWNrdXBzXG4gICAgY29uc3QgYmFja3VwU2NoZWR1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ0JhY2t1cFNjaGVkdWxlJywge1xuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5jcm9uKHtcbiAgICAgICAgbWludXRlOiAnMCcsXG4gICAgICAgIGhvdXI6ICcyJywgLy8gMiBBTSBVVENcbiAgICAgICAgZGF5OiAnKicsXG4gICAgICAgIG1vbnRoOiAnKicsXG4gICAgICAgIHllYXI6ICcqJ1xuICAgICAgfSksXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhaWx5IGJhY2t1cCBzY2hlZHVsZSdcbiAgICB9KTtcblxuICAgIGJhY2t1cFNjaGVkdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbih0aGlzLmJhY2t1cEZ1bmN0aW9uKSk7XG5cbiAgICAvLyBDb25maWd1cmF0aW9uIGJhY2t1cFxuICAgIHRoaXMuY3JlYXRlQ29uZmlndXJhdGlvbkJhY2t1cChwcm9wcy5lbnZpcm9ubWVudCk7XG5cbiAgICAvLyBNb25pdG9yaW5nIGFuZCBhbGVydGluZ1xuICAgIHRoaXMuY3JlYXRlQmFja3VwTW9uaXRvcmluZyhwcm9wcy5hbGVydEVtYWlsLCBwcm9wcy5lbnZpcm9ubWVudCk7XG5cbiAgICAvLyBIZWFsdGggY2hlY2sgZm9yIGRpc2FzdGVyIHJlY292ZXJ5XG4gICAgdGhpcy5jcmVhdGVIZWFsdGhDaGVja3MocHJvcHMuZW52aXJvbm1lbnQpO1xuXG4gICAgLy8gQ3Jvc3MtcmVnaW9uIEROUyBmYWlsb3ZlclxuICAgIHRoaXMuY3JlYXRlRE5TRmFpbG92ZXIocHJvcHMuZW52aXJvbm1lbnQpO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdCYWNrdXBCdWNrZXROYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuYmFja3VwQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0JhY2t1cCBTMyBidWNrZXQgbmFtZSdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdHbG9iYWxUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5nbG9iYWxUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0dsb2JhbCBEeW5hbW9EQiB0YWJsZSBuYW1lJ1xuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0JhY2t1cEZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMuYmFja3VwRnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0JhY2t1cCBMYW1iZGEgZnVuY3Rpb24gQVJOJ1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVSZXBsaWNhdGlvblJvbGUoKTogaWFtLlJvbGUge1xuICAgIHJldHVybiBuZXcgaWFtLlJvbGUodGhpcywgJ1JlcGxpY2F0aW9uUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdzMy5hbWF6b25hd3MuY29tJyksXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBSZXBsaWNhdGlvblBvbGljeTogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkZvclJlcGxpY2F0aW9uJyxcbiAgICAgICAgICAgICAgICAnczM6R2V0T2JqZWN0VmVyc2lvbkFjbCdcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpSZXBsaWNhdGVPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpSZXBsaWNhdGVEZWxldGUnXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogWycqJ11cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVCYWNrdXBMYW1iZGFSb2xlKHRhYmxlOiBkeW5hbW9kYi5UYWJsZSwgYnVja2V0OiBzMy5CdWNrZXQpOiBpYW0uUm9sZSB7XG4gICAgcmV0dXJuIG5ldyBpYW0uUm9sZSh0aGlzLCAnQmFja3VwTGFtYmRhUm9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdsYW1iZGEuYW1hem9uYXdzLmNvbScpLFxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgIGlhbS5NYW5hZ2VkUG9saWN5LmZyb21Bd3NNYW5hZ2VkUG9saWN5TmFtZSgnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScpXG4gICAgICBdLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQmFja3VwUG9saWN5OiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpDcmVhdGVCYWNrdXAnLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpEZXNjcmliZUJhY2t1cCcsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkxpc3RCYWNrdXBzJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6RGVsZXRlQmFja3VwJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UmVzdG9yZVRhYmxlRnJvbUJhY2t1cCdcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgdGFibGUudGFibGVBcm4sXG4gICAgICAgICAgICAgICAgYCR7dGFibGUudGFibGVBcm59L2JhY2t1cC8qYFxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOkxpc3RCdWNrZXQnLFxuICAgICAgICAgICAgICAgICdzMzpEZWxldGVPYmplY3QnXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGJ1Y2tldC5idWNrZXRBcm4sXG4gICAgICAgICAgICAgICAgYCR7YnVja2V0LmJ1Y2tldEFybn0vKmBcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzc206R2V0UGFyYW1ldGVycycsXG4gICAgICAgICAgICAgICAgJ3NzbTpHZXRQYXJhbWV0ZXInLFxuICAgICAgICAgICAgICAgICdzc206UHV0UGFyYW1ldGVyJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzc206JHt0aGlzLnJlZ2lvbn06JHt0aGlzLmFjY291bnR9OnBhcmFtZXRlci9wb3J0Zm9saW8vJHt0aGlzLnN0YWNrTmFtZX0vKmBcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUNvbmZpZ3VyYXRpb25CYWNrdXAoZW52aXJvbm1lbnQ6IHN0cmluZyk6IHZvaWQge1xuICAgIC8vIENvbmZpZ3VyYXRpb24gYmFja3VwIExhbWJkYVxuICAgIGNvbnN0IGNvbmZpZ0JhY2t1cEZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnQ29uZmlnQmFja3VwRnVuY3Rpb24nLCB7XG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMThfWCxcbiAgICAgIGhhbmRsZXI6ICdjb25maWctYmFja3VwLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG4gICAgICAgIGNvbnN0IEFXUyA9IHJlcXVpcmUoJ2F3cy1zZGsnKTtcbiAgICAgICAgY29uc3Qgc3NtID0gbmV3IEFXUy5TU00oKTtcbiAgICAgICAgY29uc3QgczMgPSBuZXcgQVdTLlMzKCk7XG4gICAgICAgIFxuICAgICAgICBleHBvcnRzLmhhbmRsZXIgPSBhc3luYyAoZXZlbnQpID0+IHtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gR2V0IGFsbCBwYXJhbWV0ZXJzIGZvciB0aGlzIGVudmlyb25tZW50XG4gICAgICAgICAgICBjb25zdCBwYXJhbWV0ZXJzID0gYXdhaXQgc3NtLmdldFBhcmFtZXRlcnNCeVBhdGgoe1xuICAgICAgICAgICAgICBQYXRoOiAnL3BvcnRmb2xpby8ke2Vudmlyb25tZW50fS8nLFxuICAgICAgICAgICAgICBSZWN1cnNpdmU6IHRydWUsXG4gICAgICAgICAgICAgIFdpdGhEZWNyeXB0aW9uOiBmYWxzZVxuICAgICAgICAgICAgfSkucHJvbWlzZSgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICAvLyBDcmVhdGUgYmFja3VwIG9iamVjdFxuICAgICAgICAgICAgY29uc3QgYmFja3VwID0ge1xuICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICAgICAgZW52aXJvbm1lbnQ6ICcke2Vudmlyb25tZW50fScsXG4gICAgICAgICAgICAgIHBhcmFtZXRlcnM6IHBhcmFtZXRlcnMuUGFyYW1ldGVyc1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gU3RvcmUgaW4gUzNcbiAgICAgICAgICAgIGF3YWl0IHMzLnB1dE9iamVjdCh7XG4gICAgICAgICAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuQkFDS1VQX0JVQ0tFVCxcbiAgICAgICAgICAgICAgS2V5OiBcXGBjb25maWctYmFja3Vwcy9cXCR7ZW52aXJvbm1lbnR9L1xcJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXX0uanNvblxcYCxcbiAgICAgICAgICAgICAgQm9keTogSlNPTi5zdHJpbmdpZnkoYmFja3VwLCBudWxsLCAyKSxcbiAgICAgICAgICAgICAgU2VydmVyU2lkZUVuY3J5cHRpb246ICdBRVMyNTYnXG4gICAgICAgICAgICB9KS5wcm9taXNlKCk7XG4gICAgICAgICAgICBcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdDb25maWd1cmF0aW9uIGJhY2t1cCBjb21wbGV0ZWQnKTtcbiAgICAgICAgICAgIHJldHVybiB7IHN0YXR1c0NvZGU6IDIwMCwgYm9keTogJ0JhY2t1cCBjb21wbGV0ZWQnIH07XG4gICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0JhY2t1cCBmYWlsZWQ6JywgZXJyb3IpO1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICB9O1xuICAgICAgYCksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBCQUNLVVBfQlVDS0VUOiB0aGlzLmJhY2t1cEJ1Y2tldC5idWNrZXROYW1lXG4gICAgICB9LFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSlcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zXG4gICAgdGhpcy5iYWNrdXBCdWNrZXQuZ3JhbnRXcml0ZShjb25maWdCYWNrdXBGdW5jdGlvbik7XG4gICAgY29uZmlnQmFja3VwRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIGFjdGlvbnM6IFsnc3NtOkdldFBhcmFtZXRlcnNCeVBhdGgnXSxcbiAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnNzbToke3RoaXMucmVnaW9ufToke3RoaXMuYWNjb3VudH06cGFyYW1ldGVyL3BvcnRmb2xpby8ke2Vudmlyb25tZW50fS8qYF1cbiAgICB9KSk7XG5cbiAgICAvLyBTY2hlZHVsZSBkYWlseSBjb25maWcgYmFja3Vwc1xuICAgIGNvbnN0IGNvbmZpZ0JhY2t1cFNjaGVkdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdDb25maWdCYWNrdXBTY2hlZHVsZScsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuY3Jvbih7XG4gICAgICAgIG1pbnV0ZTogJzMwJyxcbiAgICAgICAgaG91cjogJzInLFxuICAgICAgICBkYXk6ICcqJyxcbiAgICAgICAgbW9udGg6ICcqJyxcbiAgICAgICAgeWVhcjogJyonXG4gICAgICB9KVxuICAgIH0pO1xuXG4gICAgY29uZmlnQmFja3VwU2NoZWR1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKGNvbmZpZ0JhY2t1cEZ1bmN0aW9uKSk7XG4gIH1cblxuICBwcml2YXRlIGNyZWF0ZUJhY2t1cE1vbml0b3JpbmcoYWxlcnRFbWFpbDogc3RyaW5nLCBlbnZpcm9ubWVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgLy8gU05TIHRvcGljIGZvciBiYWNrdXAgYWxlcnRzXG4gICAgY29uc3QgYmFja3VwQWxlcnRzVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdCYWNrdXBBbGVydHMnLCB7XG4gICAgICBkaXNwbGF5TmFtZTogYFBvcnRmb2xpbyBCYWNrdXAgQWxlcnRzIC0gJHtlbnZpcm9ubWVudH1gXG4gICAgfSk7XG5cbiAgICBiYWNrdXBBbGVydHNUb3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgICBuZXcgY2RrLmF3c19zbnNfc3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbihhbGVydEVtYWlsKVxuICAgICk7XG5cbiAgICAvLyBDbG91ZFdhdGNoIGFsYXJtc1xuICAgIGNvbnN0IGJhY2t1cEZhaWx1cmVBbGFybSA9IG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdCYWNrdXBGYWlsdXJlQWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGBQb3J0Zm9saW8tQmFja3VwRmFpbHVyZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnQmFja3VwIG9wZXJhdGlvbiBmYWlsZWQnLFxuICAgICAgbWV0cmljOiB0aGlzLmJhY2t1cEZ1bmN0aW9uLm1ldHJpY0Vycm9ycyh7XG4gICAgICAgIHN0YXRpc3RpYzogJ1N1bScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSlcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElOR1xuICAgIH0pO1xuXG4gICAgYmFja3VwRmFpbHVyZUFsYXJtLmFkZEFsYXJtQWN0aW9uKFxuICAgICAgbmV3IGNkay5hd3NfY2xvdWR3YXRjaF9hY3Rpb25zLlNuc0FjdGlvbihiYWNrdXBBbGVydHNUb3BpYylcbiAgICApO1xuXG4gICAgLy8gUzMgcmVwbGljYXRpb24gbW9uaXRvcmluZ1xuICAgIGNvbnN0IHJlcGxpY2F0aW9uRmFpbHVyZUFsYXJtID0gbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ1JlcGxpY2F0aW9uRmFpbHVyZUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgUG9ydGZvbGlvLVJlcGxpY2F0aW9uRmFpbHVyZS0ke2Vudmlyb25tZW50fWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnUzMgY3Jvc3MtcmVnaW9uIHJlcGxpY2F0aW9uIGZhaWxlZCcsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0FXUy9TMycsXG4gICAgICAgIG1ldHJpY05hbWU6ICdSZXBsaWNhdGlvbkxhdGVuY3knLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgU291cmNlQnVja2V0OiB0aGlzLmJhY2t1cEJ1Y2tldC5idWNrZXROYW1lXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ01heGltdW0nLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KVxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDM2MDAsIC8vIDEgaG91clxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDIsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuQlJFQUNISU5HXG4gICAgfSk7XG5cbiAgICByZXBsaWNhdGlvbkZhaWx1cmVBbGFybS5hZGRBbGFybUFjdGlvbihcbiAgICAgIG5ldyBjZGsuYXdzX2Nsb3Vkd2F0Y2hfYWN0aW9ucy5TbnNBY3Rpb24oYmFja3VwQWxlcnRzVG9waWMpXG4gICAgKTtcbiAgfVxuXG4gIHByaXZhdGUgY3JlYXRlSGVhbHRoQ2hlY2tzKGVudmlyb25tZW50OiBzdHJpbmcpOiB2b2lkIHtcbiAgICAvLyBIZWFsdGggY2hlY2sgTGFtYmRhIGZvciBkaXNhc3RlciByZWNvdmVyeSByZWFkaW5lc3NcbiAgICBjb25zdCBoZWFsdGhDaGVja0Z1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnSGVhbHRoQ2hlY2tGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ2hlYWx0aC1jaGVjay5oYW5kbGVyJyxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuICAgICAgICBjb25zdCBBV1MgPSByZXF1aXJlKCdhd3Mtc2RrJyk7XG4gICAgICAgIFxuICAgICAgICBleHBvcnRzLmhhbmRsZXIgPSBhc3luYyAoZXZlbnQpID0+IHtcbiAgICAgICAgICBjb25zdCBkeW5hbW9kYiA9IG5ldyBBV1MuRHluYW1vREIoKTtcbiAgICAgICAgICBjb25zdCBzMyA9IG5ldyBBV1MuUzMoKTtcbiAgICAgICAgICBcbiAgICAgICAgICBjb25zdCBjaGVja3MgPSBbXTtcbiAgICAgICAgICBcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gQ2hlY2sgRHluYW1vREIgdGFibGUgaGVhbHRoXG4gICAgICAgICAgICBjb25zdCB0YWJsZVN0YXR1cyA9IGF3YWl0IGR5bmFtb2RiLmRlc2NyaWJlVGFibGUoe1xuICAgICAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlRBQkxFX05BTUVcbiAgICAgICAgICAgIH0pLnByb21pc2UoKTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgY2hlY2tzLnB1c2goe1xuICAgICAgICAgICAgICBzZXJ2aWNlOiAnRHluYW1vREInLFxuICAgICAgICAgICAgICBzdGF0dXM6IHRhYmxlU3RhdHVzLlRhYmxlLlRhYmxlU3RhdHVzID09PSAnQUNUSVZFJyA/ICdIRUFMVEhZJyA6ICdVTkhFQUxUSFknLFxuICAgICAgICAgICAgICBkZXRhaWxzOiB7IHRhYmxlU3RhdHVzOiB0YWJsZVN0YXR1cy5UYWJsZS5UYWJsZVN0YXR1cyB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ2hlY2sgUzMgYnVja2V0IGFjY2Vzc2liaWxpdHlcbiAgICAgICAgICAgIGF3YWl0IHMzLmhlYWRCdWNrZXQoeyBCdWNrZXQ6IHByb2Nlc3MuZW52LkJVQ0tFVF9OQU1FIH0pLnByb21pc2UoKTtcbiAgICAgICAgICAgIGNoZWNrcy5wdXNoKHtcbiAgICAgICAgICAgICAgc2VydmljZTogJ1MzJyxcbiAgICAgICAgICAgICAgc3RhdHVzOiAnSEVBTFRIWScsXG4gICAgICAgICAgICAgIGRldGFpbHM6IHsgYnVja2V0OiBwcm9jZXNzLmVudi5CVUNLRVRfTkFNRSB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIFxuICAgICAgICAgICAgLy8gQ2hlY2sgYmFja3VwIHJlY2VuY3lcbiAgICAgICAgICAgIGNvbnN0IGJhY2t1cHMgPSBhd2FpdCBkeW5hbW9kYi5saXN0QmFja3Vwcyh7XG4gICAgICAgICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuVEFCTEVfTkFNRSxcbiAgICAgICAgICAgICAgVGltZVJhbmdlTG93ZXJCb3VuZDogbmV3IERhdGUoRGF0ZS5ub3coKSAtIDI0ICogNjAgKiA2MCAqIDEwMDApIC8vIDI0IGhvdXJzIGFnb1xuICAgICAgICAgICAgfSkucHJvbWlzZSgpO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICBjaGVja3MucHVzaCh7XG4gICAgICAgICAgICAgIHNlcnZpY2U6ICdCYWNrdXBzJyxcbiAgICAgICAgICAgICAgc3RhdHVzOiBiYWNrdXBzLkJhY2t1cFN1bW1hcmllcy5sZW5ndGggPiAwID8gJ0hFQUxUSFknIDogJ1VOSEVBTFRIWScsXG4gICAgICAgICAgICAgIGRldGFpbHM6IHsgcmVjZW50QmFja3VwczogYmFja3Vwcy5CYWNrdXBTdW1tYXJpZXMubGVuZ3RoIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICBvdmVyYWxsOiBjaGVja3MuZXZlcnkoYyA9PiBjLnN0YXR1cyA9PT0gJ0hFQUxUSFknKSA/ICdIRUFMVEhZJyA6ICdERUdSQURFRCcsXG4gICAgICAgICAgICAgICAgY2hlY2tzLFxuICAgICAgICAgICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICAgICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICAgICAgICBvdmVyYWxsOiAnVU5IRUFMVEhZJyxcbiAgICAgICAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZSxcbiAgICAgICAgICAgICAgICB0aW1lc3RhbXA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKVxuICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgICBgKSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIFRBQkxFX05BTUU6IHRoaXMuZ2xvYmFsVGFibGUudGFibGVOYW1lLFxuICAgICAgICBCVUNLRVRfTkFNRTogdGhpcy5iYWNrdXBCdWNrZXQuYnVja2V0TmFtZVxuICAgICAgfSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDIpXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9ucyBmb3IgaGVhbHRoIGNoZWNrc1xuICAgIHRoaXMuZ2xvYmFsVGFibGUuZ3JhbnRSZWFkRGF0YShoZWFsdGhDaGVja0Z1bmN0aW9uKTtcbiAgICB0aGlzLmJhY2t1cEJ1Y2tldC5ncmFudFJlYWQoaGVhbHRoQ2hlY2tGdW5jdGlvbik7XG4gICAgXG4gICAgaGVhbHRoQ2hlY2tGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgYWN0aW9uczogW1xuICAgICAgICAnZHluYW1vZGI6RGVzY3JpYmVUYWJsZScsXG4gICAgICAgICdkeW5hbW9kYjpMaXN0QmFja3VwcydcbiAgICAgIF0sXG4gICAgICByZXNvdXJjZXM6IFt0aGlzLmdsb2JhbFRhYmxlLnRhYmxlQXJuXVxuICAgIH0pKTtcblxuICAgIC8vIFNjaGVkdWxlIGhlYWx0aCBjaGVja3MgZXZlcnkgMTUgbWludXRlc1xuICAgIGNvbnN0IGhlYWx0aENoZWNrU2NoZWR1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ0hlYWx0aENoZWNrU2NoZWR1bGUnLCB7XG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpKVxuICAgIH0pO1xuXG4gICAgaGVhbHRoQ2hlY2tTY2hlZHVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24oaGVhbHRoQ2hlY2tGdW5jdGlvbikpO1xuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVETlNGYWlsb3ZlcihlbnZpcm9ubWVudDogc3RyaW5nKTogdm9pZCB7XG4gICAgLy8gU3RvcmUgRE5TIGNvbmZpZ3VyYXRpb24gZm9yIGZhaWxvdmVyXG4gICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgJ0ROU0ZhaWxvdmVyQ29uZmlnJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9wb3J0Zm9saW8vJHtlbnZpcm9ubWVudH0vZG5zL2ZhaWxvdmVyLWNvbmZpZ2AsXG4gICAgICBzdHJpbmdWYWx1ZTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBwcmltYXJ5UmVnaW9uOiB0aGlzLnJlZ2lvbixcbiAgICAgICAgYmFja3VwUmVnaW9uOiAndXMtd2VzdC0yJyxcbiAgICAgICAgaGVhbHRoQ2hlY2tFbmRwb2ludDogJy9oZWFsdGgnLFxuICAgICAgICBmYWlsb3ZlclRocmVzaG9sZDogM1xuICAgICAgfSksXG4gICAgICBkZXNjcmlwdGlvbjogJ0ROUyBmYWlsb3ZlciBjb25maWd1cmF0aW9uIGZvciBkaXNhc3RlciByZWNvdmVyeSdcbiAgICB9KTtcbiAgfVxufVxuIl19