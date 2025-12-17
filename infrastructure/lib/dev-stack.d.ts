import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
interface DevStackProps extends cdk.StackProps {
    domain?: string;
}
export declare class DevStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: DevStackProps);
}
export {};
