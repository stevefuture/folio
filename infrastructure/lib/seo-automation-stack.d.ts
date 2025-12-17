import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
interface SEOAutomationStackProps extends cdk.StackProps {
    table: any;
    bucket: s3.Bucket;
    environment: string;
    siteUrl: string;
    imageUrl: string;
}
export declare class SEOAutomationStack extends cdk.Stack {
    readonly seoApi: apigateway.RestApi;
    constructor(scope: Construct, id: string, props: SEOAutomationStackProps);
}
export {};
