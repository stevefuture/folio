import * as cdk from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
interface EnhancedWAFStackProps extends cdk.StackProps {
    environment: string;
    adminAllowedIPs?: string[];
    alertEmail?: string;
}
export declare class EnhancedWAFStack extends cdk.Stack {
    readonly webAcl: wafv2.CfnWebACL;
    readonly logGroup: logs.LogGroup;
    constructor(scope: Construct, id: string, props: EnhancedWAFStackProps);
}
export {};
