import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';
export declare class IAMPolicies {
    static createLambdaExecutionRole(scope: cdk.Stack, id: string, tableName: string, bucketName: string, environment: string): iam.Role;
    static createAdminLambdaRole(scope: cdk.Stack, id: string, tableName: string, bucketName: string, environment: string): iam.Role;
    static createImageProcessingRole(scope: cdk.Stack, id: string, sourceBucketName: string, processedBucketName: string): iam.Role;
    static createCloudFrontOACPolicy(scope: cdk.Stack, bucketName: string, distributionId: string): iam.PolicyDocument;
    static createCognitoAdminPolicy(scope: cdk.Stack, userPoolId: string): iam.PolicyDocument;
    static createAPIGatewayRole(scope: cdk.Stack, id: string): iam.Role;
    static createSecurityMonitoringRole(scope: cdk.Stack, id: string): iam.Role;
    static createCrossAccountPolicy(scope: cdk.Stack, trustedAccountId: string, environment: string): iam.Role;
    static createDynamoDBResourcePolicy(scope: cdk.Stack, tableName: string, allowedPrincipals: string[]): iam.PolicyDocument;
}
