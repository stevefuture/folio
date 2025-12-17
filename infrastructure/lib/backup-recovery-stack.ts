import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

interface BackupRecoveryStackProps extends cdk.StackProps {
  primaryTable: dynamodb.Table;
  primaryBucket: s3.Bucket;
  environment: string;
  backupRegion: string;
  alertEmail: string;
}

export class BackupRecoveryStack extends cdk.Stack {
  public readonly backupBucket: s3.Bucket;
  public readonly globalTable: dynamodb.Table;
  public readonly backupFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: BackupRecoveryStackProps) {
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

  private createReplicationRole(): iam.Role {
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

  private createBackupLambdaRole(table: dynamodb.Table, bucket: s3.Bucket): iam.Role {
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

  private createConfigurationBackup(environment: string): void {
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

  private createBackupMonitoring(alertEmail: string, environment: string): void {
    // SNS topic for backup alerts
    const backupAlertsTopic = new sns.Topic(this, 'BackupAlerts', {
      displayName: `Portfolio Backup Alerts - ${environment}`
    });

    backupAlertsTopic.addSubscription(
      new cdk.aws_sns_subscriptions.EmailSubscription(alertEmail)
    );

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

    backupFailureAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(backupAlertsTopic)
    );

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

    replicationFailureAlarm.addAlarmAction(
      new cdk.aws_cloudwatch_actions.SnsAction(backupAlertsTopic)
    );
  }

  private createHealthChecks(environment: string): void {
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

  private createDNSFailover(environment: string): void {
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
