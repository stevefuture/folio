import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
interface CostOptimizationStackProps extends cdk.StackProps {
    environment: string;
    deploymentPhase: string;
    alertEmail?: string;
}
export declare class CostOptimizationStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: CostOptimizationStackProps);
}
export {};
