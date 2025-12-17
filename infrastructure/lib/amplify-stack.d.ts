import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import { Construct } from 'constructs';
interface AmplifyStackProps extends cdk.StackProps {
    environment: string;
    domainName?: string;
    repositoryUrl: string;
    accessToken: string;
}
export declare class AmplifyStack extends cdk.Stack {
    readonly amplifyApp: amplify.CfnApp;
    constructor(scope: Construct, id: string, props: AmplifyStackProps);
}
export {};
