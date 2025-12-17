import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
interface FrontendStackProps extends cdk.StackProps {
    api: any;
    userPool: any;
    domainName?: string;
    hostedZoneId?: string;
    environment?: string;
}
export declare class FrontendStack extends cdk.Stack {
    readonly distribution: cloudfront.Distribution;
    readonly websiteBucket: s3.Bucket;
    readonly certificate?: acm.Certificate;
    constructor(scope: Construct, id: string, props: FrontendStackProps);
}
export {};
