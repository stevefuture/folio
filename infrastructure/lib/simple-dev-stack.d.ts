import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
interface SimpleDevStackProps extends cdk.StackProps {
    domain?: string;
    hostedZoneId?: string;
}
export declare class SimpleDevStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: SimpleDevStackProps);
}
export {};
