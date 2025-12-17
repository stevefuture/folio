import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
interface ImageOptimizationStackProps extends cdk.StackProps {
    sourceBucket: s3.Bucket;
    environment?: string;
}
export declare class ImageOptimizationStack extends cdk.Stack {
    readonly imageFunction: lambda.Function;
    readonly imageDistribution: cloudfront.Distribution;
    constructor(scope: Construct, id: string, props: ImageOptimizationStackProps);
}
export {};
