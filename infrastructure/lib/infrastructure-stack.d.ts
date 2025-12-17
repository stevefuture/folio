import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
export declare class InfrastructureStack extends cdk.Stack {
    readonly table: dynamodb.Table;
    readonly bucket: s3.Bucket;
    readonly userPool: cognito.UserPool;
    readonly webAcl: wafv2.CfnWebACL;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}
