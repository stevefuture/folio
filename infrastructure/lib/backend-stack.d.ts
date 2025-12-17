import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
interface BackendStackProps extends cdk.StackProps {
    table: any;
    bucket: any;
}
export declare class BackendStack extends cdk.Stack {
    readonly api: apigateway.RestApi;
    constructor(scope: Construct, id: string, props: BackendStackProps);
}
export {};
