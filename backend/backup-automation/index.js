const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB();
const s3 = new AWS.S3();
const ssm = new AWS.SSM();

const TABLE_NAME = process.env.PRIMARY_TABLE_NAME;
const BACKUP_BUCKET = process.env.BACKUP_BUCKET_NAME;
const BACKUP_REGION = process.env.BACKUP_REGION;
const ENVIRONMENT = process.env.ENVIRONMENT;

exports.handler = async (event) => {
  console.log('Starting backup process...', JSON.stringify(event, null, 2));
  
  try {
    const results = {
      timestamp: new Date().toISOString(),
      environment: ENVIRONMENT,
      backups: []
    };

    // 1. Create DynamoDB backup
    const dynamoBackup = await createDynamoDBBackup();
    results.backups.push(dynamoBackup);

    // 2. Verify S3 replication status
    const s3Status = await verifyS3Replication();
    results.backups.push(s3Status);

    // 3. Export configuration
    const configBackup = await exportConfiguration();
    results.backups.push(configBackup);

    // 4. Cleanup old backups
    const cleanup = await cleanupOldBackups();
    results.cleanup = cleanup;

    // 5. Store backup metadata
    await storeBackupMetadata(results);

    console.log('Backup process completed successfully:', results);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        results: results
      })
    };

  } catch (error) {
    console.error('Backup process failed:', error);
    
    // Send failure notification
    await sendFailureNotification(error);
    
    throw error;
  }
};

async function createDynamoDBBackup() {
  console.log('Creating DynamoDB backup...');
  
  const backupName = `${TABLE_NAME}-${ENVIRONMENT}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  
  try {
    const backup = await dynamodb.createBackup({
      TableName: TABLE_NAME,
      BackupName: backupName
    }).promise();

    console.log('DynamoDB backup created:', backup.BackupDetails.BackupArn);

    return {
      service: 'DynamoDB',
      status: 'SUCCESS',
      backupArn: backup.BackupDetails.BackupArn,
      backupName: backupName,
      size: backup.BackupDetails.BackupSizeBytes || 0
    };

  } catch (error) {
    console.error('DynamoDB backup failed:', error);
    return {
      service: 'DynamoDB',
      status: 'FAILED',
      error: error.message
    };
  }
}

async function verifyS3Replication() {
  console.log('Verifying S3 replication status...');
  
  try {
    // Check replication configuration
    const replicationConfig = await s3.getBucketReplication({
      Bucket: BACKUP_BUCKET
    }).promise();

    // Get replication metrics
    const metrics = await s3.getBucketMetricsConfiguration({
      Bucket: BACKUP_BUCKET,
      Id: 'ReplicationMetrics'
    }).promise().catch(() => null);

    return {
      service: 'S3-Replication',
      status: 'SUCCESS',
      rules: replicationConfig.ReplicationConfiguration.Rules.length,
      metricsEnabled: !!metrics
    };

  } catch (error) {
    console.error('S3 replication verification failed:', error);
    return {
      service: 'S3-Replication',
      status: 'FAILED',
      error: error.message
    };
  }
}

async function exportConfiguration() {
  console.log('Exporting configuration...');
  
  try {
    // Get all parameters for this environment
    const parameters = await ssm.getParametersByPath({
      Path: `/portfolio/${ENVIRONMENT}/`,
      Recursive: true,
      WithDecryption: false // Don't decrypt secrets in backup
    }).promise();

    // Create configuration export
    const configExport = {
      timestamp: new Date().toISOString(),
      environment: ENVIRONMENT,
      parameterCount: parameters.Parameters.length,
      parameters: parameters.Parameters.map(p => ({
        name: p.Name,
        type: p.Type,
        lastModified: p.LastModifiedDate,
        version: p.Version
        // Note: Value is excluded for security
      }))
    };

    // Store configuration backup in S3
    const backupKey = `config-backups/${ENVIRONMENT}/${new Date().toISOString().split('T')[0]}.json`;
    
    await s3.putObject({
      Bucket: BACKUP_BUCKET,
      Key: backupKey,
      Body: JSON.stringify(configExport, null, 2),
      ServerSideEncryption: 'AES256',
      ContentType: 'application/json'
    }).promise();

    return {
      service: 'Configuration',
      status: 'SUCCESS',
      backupKey: backupKey,
      parameterCount: parameters.Parameters.length
    };

  } catch (error) {
    console.error('Configuration export failed:', error);
    return {
      service: 'Configuration',
      status: 'FAILED',
      error: error.message
    };
  }
}

async function cleanupOldBackups() {
  console.log('Cleaning up old backups...');
  
  const results = {
    dynamodbCleaned: 0,
    s3Cleaned: 0
  };

  try {
    // Cleanup old DynamoDB backups (keep last 30 days)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const backups = await dynamodb.listBackups({
      TableName: TABLE_NAME,
      TimeRangeLowerBound: new Date('2020-01-01'), // Start from a reasonable date
      TimeRangeUpperBound: cutoffDate
    }).promise();

    for (const backup of backups.BackupSummaries) {
      if (backup.BackupName.includes(ENVIRONMENT)) {
        try {
          await dynamodb.deleteBackup({
            BackupArn: backup.BackupArn
          }).promise();
          results.dynamodbCleaned++;
          console.log('Deleted old backup:', backup.BackupName);
        } catch (error) {
          console.error('Failed to delete backup:', backup.BackupName, error.message);
        }
      }
    }

    // Cleanup old S3 configuration backups (keep last 90 days)
    const s3CutoffDate = new Date();
    s3CutoffDate.setDate(s3CutoffDate.getDate() - 90);

    const s3Objects = await s3.listObjectsV2({
      Bucket: BACKUP_BUCKET,
      Prefix: `config-backups/${ENVIRONMENT}/`
    }).promise();

    for (const object of s3Objects.Contents || []) {
      if (object.LastModified < s3CutoffDate) {
        try {
          await s3.deleteObject({
            Bucket: BACKUP_BUCKET,
            Key: object.Key
          }).promise();
          results.s3Cleaned++;
          console.log('Deleted old S3 backup:', object.Key);
        } catch (error) {
          console.error('Failed to delete S3 object:', object.Key, error.message);
        }
      }
    }

    return results;

  } catch (error) {
    console.error('Cleanup failed:', error);
    return {
      ...results,
      error: error.message
    };
  }
}

async function storeBackupMetadata(results) {
  console.log('Storing backup metadata...');
  
  try {
    const metadataKey = `backup-metadata/${ENVIRONMENT}/${new Date().toISOString().split('T')[0]}.json`;
    
    await s3.putObject({
      Bucket: BACKUP_BUCKET,
      Key: metadataKey,
      Body: JSON.stringify(results, null, 2),
      ServerSideEncryption: 'AES256',
      ContentType: 'application/json'
    }).promise();

    console.log('Backup metadata stored:', metadataKey);

  } catch (error) {
    console.error('Failed to store backup metadata:', error);
  }
}

async function sendFailureNotification(error) {
  console.log('Sending failure notification...');
  
  try {
    const sns = new AWS.SNS();
    
    const message = {
      timestamp: new Date().toISOString(),
      environment: ENVIRONMENT,
      error: error.message,
      stack: error.stack
    };

    // Try to get SNS topic ARN from parameter store
    const topicParam = await ssm.getParameter({
      Name: `/portfolio/${ENVIRONMENT}/sns/backup-alerts-topic`
    }).promise().catch(() => null);

    if (topicParam) {
      await sns.publish({
        TopicArn: topicParam.Parameter.Value,
        Subject: `Backup Failed - Portfolio ${ENVIRONMENT}`,
        Message: JSON.stringify(message, null, 2)
      }).promise();

      console.log('Failure notification sent');
    } else {
      console.log('No SNS topic configured for notifications');
    }

  } catch (notificationError) {
    console.error('Failed to send notification:', notificationError);
  }
}
