import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
interface SecurityMonitoringStackProps extends cdk.StackProps {
    environment: string;
    alertEmail: string;
    slackWebhookUrl?: string;
}
export declare class SecurityMonitoringStack extends cdk.Stack {
    readonly securityAlertsTopic: sns.Topic;
    readonly securityDashboard: cloudwatch.Dashboard;
    constructor(scope: Construct, id: string, props: SecurityMonitoringStackProps);
    private createSecurityAlarms;
    private createSecurityEventRules;
    private createConfigRules;
    private createSecurityDashboard;
    private createSlackIntegration;
}
export {};
