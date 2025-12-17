import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
interface BackupRecoveryStackProps extends cdk.StackProps {
    primaryTable: dynamodb.Table;
    primaryBucket: s3.Bucket;
    environment: string;
    backupRegion: string;
    alertEmail: string;
}
export declare class BackupRecoveryStack extends cdk.Stack {
    readonly backupBucket: s3.Bucket;
    readonly globalTable: dynamodb.Table;
    readonly backupFunction: lambda.Function;
    constructor(scope: Construct, id: string, props: BackupRecoveryStackProps);
    private createReplicationRole;
    private createBackupLambdaRole;
    private createConfigurationBackup;
    private createBackupMonitoring;
    private createHealthChecks;
    private createDNSFailover;
}
export {};
