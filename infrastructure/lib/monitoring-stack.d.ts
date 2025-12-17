import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
interface MonitoringStackProps extends cdk.StackProps {
    environment: string;
    alertEmail?: string;
    apiFunction: lambda.Function;
    imageOptFunction?: lambda.Function;
    seoFunction?: lambda.Function;
    distributionId: string;
    tableName: string;
    bucketName: string;
}
export declare class MonitoringStack extends cdk.Stack {
    readonly alertTopic: sns.Topic;
    constructor(scope: Construct, id: string, props: MonitoringStackProps);
}
export {};
