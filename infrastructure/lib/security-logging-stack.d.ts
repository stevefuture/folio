import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
interface SecurityLoggingStackProps extends cdk.StackProps {
    environment: string;
    alertTopic: sns.Topic;
    distributionId: string;
}
export declare class SecurityLoggingStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: SecurityLoggingStackProps);
}
export {};
