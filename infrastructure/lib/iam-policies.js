"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IAMPolicies = void 0;
const iam = require("aws-cdk-lib/aws-iam");
const cdk = require("aws-cdk-lib");
class IAMPolicies {
    // Lambda execution role with minimal permissions
    static createLambdaExecutionRole(scope, id, tableName, bucketName, environment) {
        return new iam.Role(scope, id, {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            description: `Lambda execution role for portfolio API - ${environment}`,
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ],
            inlinePolicies: {
                DynamoDBAccess: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            sid: 'DynamoDBReadWrite',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:GetItem',
                                'dynamodb:PutItem',
                                'dynamodb:Query',
                                'dynamodb:UpdateItem',
                                'dynamodb:BatchGetItem'
                            ],
                            resources: [
                                `arn:aws:dynamodb:${scope.region}:${scope.account}:table/${tableName}`,
                                `arn:aws:dynamodb:${scope.region}:${scope.account}:table/${tableName}/index/*`
                            ],
                            conditions: {
                                'ForAllValues:StringEquals': {
                                    'dynamodb:Attributes': [
                                        'PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK',
                                        'EntityType', 'Title', 'Description', 'Status', 'IsVisible',
                                        'CreatedAt', 'UpdatedAt', 'PublishedAt'
                                    ]
                                },
                                'StringEquals': {
                                    'dynamodb:Select': ['AllAttributes', 'SpecificAttributes']
                                }
                            }
                        })
                    ]
                }),
                S3ReadAccess: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            sid: 'S3ReadOnlyAccess',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:GetObjectVersion'
                            ],
                            resources: [`arn:aws:s3:::${bucketName}/*`],
                            conditions: {
                                'StringEquals': {
                                    's3:ExistingObjectTag/Environment': environment
                                },
                                'IpAddress': {
                                    'aws:SourceIp': [
                                        '10.0.0.0/8',
                                        '172.16.0.0/12',
                                        '192.168.0.0/16'
                                    ]
                                }
                            }
                        })
                    ]
                }),
                CloudWatchLogs: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            sid: 'CloudWatchLogsAccess',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'logs:CreateLogStream',
                                'logs:PutLogEvents'
                            ],
                            resources: [
                                `arn:aws:logs:${scope.region}:${scope.account}:log-group:/aws/lambda/*:*`
                            ]
                        })
                    ]
                })
            }
        });
    }
    // Admin Lambda role with elevated permissions
    static createAdminLambdaRole(scope, id, tableName, bucketName, environment) {
        return new iam.Role(scope, id, {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            description: `Admin Lambda execution role - ${environment}`,
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ],
            inlinePolicies: {
                DynamoDBFullAccess: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            sid: 'DynamoDBFullAccess',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:GetItem',
                                'dynamodb:PutItem',
                                'dynamodb:Query',
                                'dynamodb:UpdateItem',
                                'dynamodb:DeleteItem',
                                'dynamodb:BatchGetItem',
                                'dynamodb:BatchWriteItem',
                                'dynamodb:Scan'
                            ],
                            resources: [
                                `arn:aws:dynamodb:${scope.region}:${scope.account}:table/${tableName}`,
                                `arn:aws:dynamodb:${scope.region}:${scope.account}:table/${tableName}/index/*`
                            ],
                            conditions: {
                                'Bool': {
                                    'aws:MultiFactorAuthPresent': 'true'
                                },
                                'DateGreaterThan': {
                                    'aws:CurrentTime': '2024-01-01T00:00:00Z'
                                }
                            }
                        })
                    ]
                }),
                S3AdminAccess: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            sid: 'S3AdminAccess',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:PutObject',
                                's3:DeleteObject',
                                's3:GetObjectVersion',
                                's3:ListBucket'
                            ],
                            resources: [
                                `arn:aws:s3:::${bucketName}`,
                                `arn:aws:s3:::${bucketName}/*`
                            ],
                            conditions: {
                                'StringEquals': {
                                    'aws:RequestedRegion': scope.region
                                },
                                'Bool': {
                                    'aws:MultiFactorAuthPresent': 'true'
                                }
                            }
                        })
                    ]
                })
            }
        });
    }
    // Image processing Lambda role
    static createImageProcessingRole(scope, id, sourceBucketName, processedBucketName) {
        return new iam.Role(scope, id, {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            description: 'Image processing Lambda execution role',
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ],
            inlinePolicies: {
                ImageProcessingAccess: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            sid: 'SourceBucketRead',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:GetObject',
                                's3:GetObjectVersion'
                            ],
                            resources: [`arn:aws:s3:::${sourceBucketName}/*`],
                            conditions: {
                                'StringLike': {
                                    's3:ExistingObjectTag/ContentType': ['image/*']
                                }
                            }
                        }),
                        new iam.PolicyStatement({
                            sid: 'ProcessedBucketWrite',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:PutObject',
                                's3:PutObjectAcl'
                            ],
                            resources: [`arn:aws:s3:::${processedBucketName}/*`],
                            conditions: {
                                'StringEquals': {
                                    's3:x-amz-server-side-encryption': 'AES256'
                                }
                            }
                        })
                    ]
                })
            }
        });
    }
    // CloudFront Origin Access Control policy
    static createCloudFrontOACPolicy(scope, bucketName, distributionId) {
        return new iam.PolicyDocument({
            statements: [
                new iam.PolicyStatement({
                    sid: 'AllowCloudFrontServicePrincipal',
                    effect: iam.Effect.ALLOW,
                    principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
                    actions: ['s3:GetObject'],
                    resources: [`arn:aws:s3:::${bucketName}/*`],
                    conditions: {
                        'StringEquals': {
                            'AWS:SourceArn': `arn:aws:cloudfront::${scope.account}:distribution/${distributionId}`
                        }
                    }
                }),
                new iam.PolicyStatement({
                    sid: 'DenyDirectAccess',
                    effect: iam.Effect.DENY,
                    principals: [new iam.AnyPrincipal()],
                    actions: ['s3:*'],
                    resources: [
                        `arn:aws:s3:::${bucketName}`,
                        `arn:aws:s3:::${bucketName}/*`
                    ],
                    conditions: {
                        'StringNotEquals': {
                            'AWS:SourceArn': `arn:aws:cloudfront::${scope.account}:distribution/${distributionId}`
                        }
                    }
                })
            ]
        });
    }
    // Cognito User Pool policy for admin access
    static createCognitoAdminPolicy(scope, userPoolId) {
        return new iam.PolicyDocument({
            statements: [
                new iam.PolicyStatement({
                    sid: 'CognitoAdminAccess',
                    effect: iam.Effect.ALLOW,
                    actions: [
                        'cognito-idp:AdminGetUser',
                        'cognito-idp:AdminListGroupsForUser',
                        'cognito-idp:AdminUpdateUserAttributes'
                    ],
                    resources: [
                        `arn:aws:cognito-idp:${scope.region}:${scope.account}:userpool/${userPoolId}`
                    ],
                    conditions: {
                        'Bool': {
                            'aws:MultiFactorAuthPresent': 'true'
                        },
                        'StringEquals': {
                            'cognito-idp:username': '${aws:username}'
                        }
                    }
                })
            ]
        });
    }
    // API Gateway execution role
    static createAPIGatewayRole(scope, id) {
        return new iam.Role(scope, id, {
            assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
            description: 'API Gateway execution role',
            inlinePolicies: {
                CloudWatchLogs: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'logs:CreateLogGroup',
                                'logs:CreateLogStream',
                                'logs:DescribeLogGroups',
                                'logs:DescribeLogStreams',
                                'logs:PutLogEvents',
                                'logs:GetLogEvents',
                                'logs:FilterLogEvents'
                            ],
                            resources: [
                                `arn:aws:logs:${scope.region}:${scope.account}:*`
                            ]
                        })
                    ]
                })
            }
        });
    }
    // Security monitoring role
    static createSecurityMonitoringRole(scope, id) {
        return new iam.Role(scope, id, {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            description: 'Security monitoring and alerting role',
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ],
            inlinePolicies: {
                SecurityMonitoring: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            sid: 'CloudWatchMetrics',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'cloudwatch:PutMetricData',
                                'cloudwatch:GetMetricStatistics',
                                'cloudwatch:ListMetrics'
                            ],
                            resources: ['*'],
                            conditions: {
                                'StringEquals': {
                                    'cloudwatch:namespace': ['AWS/WAF', 'AWS/Lambda', 'AWS/Cognito', 'Custom/Security']
                                }
                            }
                        }),
                        new iam.PolicyStatement({
                            sid: 'SNSPublish',
                            effect: iam.Effect.ALLOW,
                            actions: ['sns:Publish'],
                            resources: [
                                `arn:aws:sns:${scope.region}:${scope.account}:portfolio-security-alerts-*`
                            ]
                        }),
                        new iam.PolicyStatement({
                            sid: 'LogsAccess',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'logs:CreateLogStream',
                                'logs:PutLogEvents',
                                'logs:DescribeLogStreams',
                                'logs:FilterLogEvents'
                            ],
                            resources: [
                                `arn:aws:logs:${scope.region}:${scope.account}:log-group:/aws/waf/*`,
                                `arn:aws:logs:${scope.region}:${scope.account}:log-group:/security/*`
                            ]
                        })
                    ]
                })
            }
        });
    }
    // Cross-account access policy (for CI/CD)
    static createCrossAccountPolicy(scope, trustedAccountId, environment) {
        return new iam.Role(scope, 'CrossAccountDeploymentRole', {
            assumedBy: new iam.AccountPrincipal(trustedAccountId),
            description: `Cross-account deployment role for ${environment}`,
            externalIds: [`portfolio-deployment-${environment}`],
            maxSessionDuration: cdk.Duration.hours(1),
            inlinePolicies: {
                DeploymentAccess: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            sid: 'S3DeploymentAccess',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:PutObject',
                                's3:PutObjectAcl',
                                's3:DeleteObject',
                                's3:ListBucket'
                            ],
                            resources: [
                                `arn:aws:s3:::portfolio-${environment}-*`,
                                `arn:aws:s3:::portfolio-${environment}-*/*`
                            ],
                            conditions: {
                                'StringEquals': {
                                    'aws:RequestedRegion': scope.region
                                }
                            }
                        }),
                        new iam.PolicyStatement({
                            sid: 'CloudFrontInvalidation',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'cloudfront:CreateInvalidation',
                                'cloudfront:GetInvalidation'
                            ],
                            resources: [`arn:aws:cloudfront::${scope.account}:distribution/*`]
                        }),
                        new iam.PolicyStatement({
                            sid: 'LambdaDeployment',
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'lambda:UpdateFunctionCode',
                                'lambda:UpdateFunctionConfiguration',
                                'lambda:PublishVersion'
                            ],
                            resources: [`arn:aws:lambda:${scope.region}:${scope.account}:function:portfolio-*`]
                        })
                    ]
                })
            }
        });
    }
    // Resource-based policy for DynamoDB
    static createDynamoDBResourcePolicy(scope, tableName, allowedPrincipals) {
        return new iam.PolicyDocument({
            statements: [
                new iam.PolicyStatement({
                    sid: 'AllowSpecificPrincipals',
                    effect: iam.Effect.ALLOW,
                    principals: allowedPrincipals.map(arn => iam.Role.fromRoleArn(scope, `Role-${arn.split('/').pop()}`, arn)),
                    actions: [
                        'dynamodb:GetItem',
                        'dynamodb:Query',
                        'dynamodb:PutItem',
                        'dynamodb:UpdateItem'
                    ],
                    resources: [
                        `arn:aws:dynamodb:${scope.region}:${scope.account}:table/${tableName}`,
                        `arn:aws:dynamodb:${scope.region}:${scope.account}:table/${tableName}/index/*`
                    ],
                    conditions: {
                        'ForAllValues:StringEquals': {
                            'dynamodb:LeadingKeys': ['PROJECT', 'CAROUSEL', 'CONFIG']
                        }
                    }
                }),
                new iam.PolicyStatement({
                    sid: 'DenyUnauthorizedAccess',
                    effect: iam.Effect.DENY,
                    principals: [new iam.AnyPrincipal()],
                    actions: ['dynamodb:*'],
                    resources: [
                        `arn:aws:dynamodb:${scope.region}:${scope.account}:table/${tableName}`,
                        `arn:aws:dynamodb:${scope.region}:${scope.account}:table/${tableName}/index/*`
                    ],
                    conditions: {
                        'StringNotEquals': {
                            'aws:PrincipalArn': allowedPrincipals
                        }
                    }
                })
            ]
        });
    }
}
exports.IAMPolicies = IAMPolicies;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaWFtLXBvbGljaWVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiaWFtLXBvbGljaWVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLDJDQUEyQztBQUMzQyxtQ0FBbUM7QUFFbkMsTUFBYSxXQUFXO0lBRXRCLGlEQUFpRDtJQUNqRCxNQUFNLENBQUMseUJBQXlCLENBQzlCLEtBQWdCLEVBQ2hCLEVBQVUsRUFDVixTQUFpQixFQUNqQixVQUFrQixFQUNsQixXQUFtQjtRQUVuQixPQUFPLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFO1lBQzdCLFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxXQUFXLEVBQUUsNkNBQTZDLFdBQVcsRUFBRTtZQUN2RSxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywwQ0FBMEMsQ0FBQzthQUN2RjtZQUNELGNBQWMsRUFBRTtnQkFDZCxjQUFjLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO29CQUNyQyxVQUFVLEVBQUU7d0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixHQUFHLEVBQUUsbUJBQW1COzRCQUN4QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1Asa0JBQWtCO2dDQUNsQixrQkFBa0I7Z0NBQ2xCLGdCQUFnQjtnQ0FDaEIscUJBQXFCO2dDQUNyQix1QkFBdUI7NkJBQ3hCOzRCQUNELFNBQVMsRUFBRTtnQ0FDVCxvQkFBb0IsS0FBSyxDQUFDLE1BQU0sSUFBSSxLQUFLLENBQUMsT0FBTyxVQUFVLFNBQVMsRUFBRTtnQ0FDdEUsb0JBQW9CLEtBQUssQ0FBQyxNQUFNLElBQUksS0FBSyxDQUFDLE9BQU8sVUFBVSxTQUFTLFVBQVU7NkJBQy9FOzRCQUNELFVBQVUsRUFBRTtnQ0FDViwyQkFB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QkFDRjtpQkFDRixDQUFDO2FBQ0g7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFwZUQsa0NBb2VDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcblxuZXhwb3J0IGNsYXNzIElBTVBvbGljaWVzIHtcbiAgXG4gIC8vIExhbWJkYSBleGVjdXRpb24gcm9sZSB3aXRoIG1pbmltYWwgcGVybWlzc2lvbnNcbiAgc3RhdGljIGNyZWF0ZUxhbWJkYUV4ZWN1dGlvblJvbGUoXG4gICAgc2NvcGU6IGNkay5TdGFjaywgXG4gICAgaWQ6IHN0cmluZywgXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsIFxuICAgIGJ1Y2tldE5hbWU6IHN0cmluZyxcbiAgICBlbnZpcm9ubWVudDogc3RyaW5nXG4gICk6IGlhbS5Sb2xlIHtcbiAgICByZXR1cm4gbmV3IGlhbS5Sb2xlKHNjb3BlLCBpZCwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogYExhbWJkYSBleGVjdXRpb24gcm9sZSBmb3IgcG9ydGZvbGlvIEFQSSAtICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKVxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIER5bmFtb0RCQWNjZXNzOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIHNpZDogJ0R5bmFtb0RCUmVhZFdyaXRlJyxcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOkdldEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpQdXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpVcGRhdGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6QmF0Y2hHZXRJdGVtJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3Njb3BlLnJlZ2lvbn06JHtzY29wZS5hY2NvdW50fTp0YWJsZS8ke3RhYmxlTmFtZX1gLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7c2NvcGUucmVnaW9ufToke3Njb3BlLmFjY291bnR9OnRhYmxlLyR7dGFibGVOYW1lfS9pbmRleC8qYFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAgICAgJ0ZvckFsbFZhbHVlczpTdHJpbmdFcXVhbHMnOiB7XG4gICAgICAgICAgICAgICAgICAnZHluYW1vZGI6QXR0cmlidXRlcyc6IFtcbiAgICAgICAgICAgICAgICAgICAgJ1BLJywgJ1NLJywgJ0dTSTFQSycsICdHU0kxU0snLCAnR1NJMlBLJywgJ0dTSTJTSycsXG4gICAgICAgICAgICAgICAgICAgICdFbnRpdHlUeXBlJywgJ1RpdGxlJywgJ0Rlc2NyaXB0aW9uJywgJ1N0YXR1cycsICdJc1Zpc2libGUnLFxuICAgICAgICAgICAgICAgICAgICAnQ3JlYXRlZEF0JywgJ1VwZGF0ZWRBdCcsICdQdWJsaXNoZWRBdCdcbiAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICdTdHJpbmdFcXVhbHMnOiB7XG4gICAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2VsZWN0JzogWydBbGxBdHRyaWJ1dGVzJywgJ1NwZWNpZmljQXR0cmlidXRlcyddXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSksXG4gICAgICAgIFxuICAgICAgICBTM1JlYWRBY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgc2lkOiAnUzNSZWFkT25seUFjY2VzcycsXG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3QnLFxuICAgICAgICAgICAgICAgICdzMzpHZXRPYmplY3RWZXJzaW9uJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzMzo6OiR7YnVja2V0TmFtZX0vKmBdLFxuICAgICAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAgICAgJ1N0cmluZ0VxdWFscyc6IHtcbiAgICAgICAgICAgICAgICAgICdzMzpFeGlzdGluZ09iamVjdFRhZy9FbnZpcm9ubWVudCc6IGVudmlyb25tZW50XG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnSXBBZGRyZXNzJzoge1xuICAgICAgICAgICAgICAgICAgJ2F3czpTb3VyY2VJcCc6IFtcbiAgICAgICAgICAgICAgICAgICAgJzEwLjAuMC4wLzgnLFxuICAgICAgICAgICAgICAgICAgICAnMTcyLjE2LjAuMC8xMicsXG4gICAgICAgICAgICAgICAgICAgICcxOTIuMTY4LjAuMC8xNidcbiAgICAgICAgICAgICAgICAgIF1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9KSxcbiAgICAgICAgXG4gICAgICAgIENsb3VkV2F0Y2hMb2dzOiBuZXcgaWFtLlBvbGljeURvY3VtZW50KHtcbiAgICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIHNpZDogJ0Nsb3VkV2F0Y2hMb2dzQWNjZXNzJyxcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nU3RyZWFtJyxcbiAgICAgICAgICAgICAgICAnbG9nczpQdXRMb2dFdmVudHMnXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOmxvZ3M6JHtzY29wZS5yZWdpb259OiR7c2NvcGUuYWNjb3VudH06bG9nLWdyb3VwOi9hd3MvbGFtYmRhLyo6KmBcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBBZG1pbiBMYW1iZGEgcm9sZSB3aXRoIGVsZXZhdGVkIHBlcm1pc3Npb25zXG4gIHN0YXRpYyBjcmVhdGVBZG1pbkxhbWJkYVJvbGUoXG4gICAgc2NvcGU6IGNkay5TdGFjayxcbiAgICBpZDogc3RyaW5nLFxuICAgIHRhYmxlTmFtZTogc3RyaW5nLFxuICAgIGJ1Y2tldE5hbWU6IHN0cmluZyxcbiAgICBlbnZpcm9ubWVudDogc3RyaW5nXG4gICk6IGlhbS5Sb2xlIHtcbiAgICByZXR1cm4gbmV3IGlhbS5Sb2xlKHNjb3BlLCBpZCwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogYEFkbWluIExhbWJkYSBleGVjdXRpb24gcm9sZSAtICR7ZW52aXJvbm1lbnR9YCxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKVxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIER5bmFtb0RCRnVsbEFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBzaWQ6ICdEeW5hbW9EQkZ1bGxBY2Nlc3MnLFxuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6R2V0SXRlbScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlB1dEl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAgICAgJ2R5bmFtb2RiOlVwZGF0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpEZWxldGVJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6QmF0Y2hHZXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6QmF0Y2hXcml0ZUl0ZW0nLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpTY2FuJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3Njb3BlLnJlZ2lvbn06JHtzY29wZS5hY2NvdW50fTp0YWJsZS8ke3RhYmxlTmFtZX1gLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7c2NvcGUucmVnaW9ufToke3Njb3BlLmFjY291bnR9OnRhYmxlLyR7dGFibGVOYW1lfS9pbmRleC8qYFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAgICAgJ0Jvb2wnOiB7XG4gICAgICAgICAgICAgICAgICAnYXdzOk11bHRpRmFjdG9yQXV0aFByZXNlbnQnOiAndHJ1ZSdcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICdEYXRlR3JlYXRlclRoYW4nOiB7XG4gICAgICAgICAgICAgICAgICAnYXdzOkN1cnJlbnRUaW1lJzogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0pLFxuICAgICAgICBcbiAgICAgICAgUzNBZG1pbkFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBzaWQ6ICdTM0FkbWluQWNjZXNzJyxcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOkRlbGV0ZU9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb24nLFxuICAgICAgICAgICAgICAgICdzMzpMaXN0QnVja2V0J1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgICAgICBgYXJuOmF3czpzMzo6OiR7YnVja2V0TmFtZX1gLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOnMzOjo6JHtidWNrZXROYW1lfS8qYFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAgICAgJ1N0cmluZ0VxdWFscyc6IHtcbiAgICAgICAgICAgICAgICAgICdhd3M6UmVxdWVzdGVkUmVnaW9uJzogc2NvcGUucmVnaW9uXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAnQm9vbCc6IHtcbiAgICAgICAgICAgICAgICAgICdhd3M6TXVsdGlGYWN0b3JBdXRoUHJlc2VudCc6ICd0cnVlJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBJbWFnZSBwcm9jZXNzaW5nIExhbWJkYSByb2xlXG4gIHN0YXRpYyBjcmVhdGVJbWFnZVByb2Nlc3NpbmdSb2xlKFxuICAgIHNjb3BlOiBjZGsuU3RhY2ssXG4gICAgaWQ6IHN0cmluZyxcbiAgICBzb3VyY2VCdWNrZXROYW1lOiBzdHJpbmcsXG4gICAgcHJvY2Vzc2VkQnVja2V0TmFtZTogc3RyaW5nXG4gICk6IGlhbS5Sb2xlIHtcbiAgICByZXR1cm4gbmV3IGlhbS5Sb2xlKHNjb3BlLCBpZCwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBkZXNjcmlwdGlvbjogJ0ltYWdlIHByb2Nlc3NpbmcgTGFtYmRhIGV4ZWN1dGlvbiByb2xlJyxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnKVxuICAgICAgXSxcbiAgICAgIGlubGluZVBvbGljaWVzOiB7XG4gICAgICAgIEltYWdlUHJvY2Vzc2luZ0FjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBzaWQ6ICdTb3VyY2VCdWNrZXRSZWFkJyxcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdFZlcnNpb24nXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW2Bhcm46YXdzOnMzOjo6JHtzb3VyY2VCdWNrZXROYW1lfS8qYF0sXG4gICAgICAgICAgICAgIGNvbmRpdGlvbnM6IHtcbiAgICAgICAgICAgICAgICAnU3RyaW5nTGlrZSc6IHtcbiAgICAgICAgICAgICAgICAgICdzMzpFeGlzdGluZ09iamVjdFRhZy9Db250ZW50VHlwZSc6IFsnaW1hZ2UvKiddXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgc2lkOiAnUHJvY2Vzc2VkQnVja2V0V3JpdGUnLFxuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0QWNsJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpzMzo6OiR7cHJvY2Vzc2VkQnVja2V0TmFtZX0vKmBdLFxuICAgICAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAgICAgJ1N0cmluZ0VxdWFscyc6IHtcbiAgICAgICAgICAgICAgICAgICdzMzp4LWFtei1zZXJ2ZXItc2lkZS1lbmNyeXB0aW9uJzogJ0FFUzI1NidcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLy8gQ2xvdWRGcm9udCBPcmlnaW4gQWNjZXNzIENvbnRyb2wgcG9saWN5XG4gIHN0YXRpYyBjcmVhdGVDbG91ZEZyb250T0FDUG9saWN5KFxuICAgIHNjb3BlOiBjZGsuU3RhY2ssXG4gICAgYnVja2V0TmFtZTogc3RyaW5nLFxuICAgIGRpc3RyaWJ1dGlvbklkOiBzdHJpbmdcbiAgKTogaWFtLlBvbGljeURvY3VtZW50IHtcbiAgICByZXR1cm4gbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBzaWQ6ICdBbGxvd0Nsb3VkRnJvbnRTZXJ2aWNlUHJpbmNpcGFsJyxcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgcHJpbmNpcGFsczogW25ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnY2xvdWRmcm9udC5hbWF6b25hd3MuY29tJyldLFxuICAgICAgICAgIGFjdGlvbnM6IFsnczM6R2V0T2JqZWN0J10sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbYGFybjphd3M6czM6Ojoke2J1Y2tldE5hbWV9LypgXSxcbiAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAnU3RyaW5nRXF1YWxzJzoge1xuICAgICAgICAgICAgICAnQVdTOlNvdXJjZUFybic6IGBhcm46YXdzOmNsb3VkZnJvbnQ6OiR7c2NvcGUuYWNjb3VudH06ZGlzdHJpYnV0aW9uLyR7ZGlzdHJpYnV0aW9uSWR9YFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBzaWQ6ICdEZW55RGlyZWN0QWNjZXNzJyxcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuREVOWSxcbiAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BbnlQcmluY2lwYWwoKV0sXG4gICAgICAgICAgYWN0aW9uczogWydzMzoqJ10sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICBgYXJuOmF3czpzMzo6OiR7YnVja2V0TmFtZX1gLFxuICAgICAgICAgICAgYGFybjphd3M6czM6Ojoke2J1Y2tldE5hbWV9LypgXG4gICAgICAgICAgXSxcbiAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAnU3RyaW5nTm90RXF1YWxzJzoge1xuICAgICAgICAgICAgICAnQVdTOlNvdXJjZUFybic6IGBhcm46YXdzOmNsb3VkZnJvbnQ6OiR7c2NvcGUuYWNjb3VudH06ZGlzdHJpYnV0aW9uLyR7ZGlzdHJpYnV0aW9uSWR9YFxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgIF1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIENvZ25pdG8gVXNlciBQb29sIHBvbGljeSBmb3IgYWRtaW4gYWNjZXNzXG4gIHN0YXRpYyBjcmVhdGVDb2duaXRvQWRtaW5Qb2xpY3koXG4gICAgc2NvcGU6IGNkay5TdGFjayxcbiAgICB1c2VyUG9vbElkOiBzdHJpbmdcbiAgKTogaWFtLlBvbGljeURvY3VtZW50IHtcbiAgICByZXR1cm4gbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBzaWQ6ICdDb2duaXRvQWRtaW5BY2Nlc3MnLFxuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAnY29nbml0by1pZHA6QWRtaW5HZXRVc2VyJyxcbiAgICAgICAgICAgICdjb2duaXRvLWlkcDpBZG1pbkxpc3RHcm91cHNGb3JVc2VyJyxcbiAgICAgICAgICAgICdjb2duaXRvLWlkcDpBZG1pblVwZGF0ZVVzZXJBdHRyaWJ1dGVzJ1xuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICBgYXJuOmF3czpjb2duaXRvLWlkcDoke3Njb3BlLnJlZ2lvbn06JHtzY29wZS5hY2NvdW50fTp1c2VycG9vbC8ke3VzZXJQb29sSWR9YFxuICAgICAgICAgIF0sXG4gICAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgICAgJ0Jvb2wnOiB7XG4gICAgICAgICAgICAgICdhd3M6TXVsdGlGYWN0b3JBdXRoUHJlc2VudCc6ICd0cnVlJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdTdHJpbmdFcXVhbHMnOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvLWlkcDp1c2VybmFtZSc6ICcke2F3czp1c2VybmFtZX0nXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgXVxuICAgIH0pO1xuICB9XG5cbiAgLy8gQVBJIEdhdGV3YXkgZXhlY3V0aW9uIHJvbGVcbiAgc3RhdGljIGNyZWF0ZUFQSUdhdGV3YXlSb2xlKFxuICAgIHNjb3BlOiBjZGsuU3RhY2ssXG4gICAgaWQ6IHN0cmluZ1xuICApOiBpYW0uUm9sZSB7XG4gICAgcmV0dXJuIG5ldyBpYW0uUm9sZShzY29wZSwgaWQsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdhcGlnYXRld2F5LmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgZXhlY3V0aW9uIHJvbGUnLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgQ2xvdWRXYXRjaExvZ3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2xvZ3M6Q3JlYXRlTG9nR3JvdXAnLFxuICAgICAgICAgICAgICAgICdsb2dzOkNyZWF0ZUxvZ1N0cmVhbScsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6RGVzY3JpYmVMb2dHcm91cHMnLFxuICAgICAgICAgICAgICAgICdsb2dzOkRlc2NyaWJlTG9nU3RyZWFtcycsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6UHV0TG9nRXZlbnRzJyxcbiAgICAgICAgICAgICAgICAnbG9nczpHZXRMb2dFdmVudHMnLFxuICAgICAgICAgICAgICAgICdsb2dzOkZpbHRlckxvZ0V2ZW50cydcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6bG9nczoke3Njb3BlLnJlZ2lvbn06JHtzY29wZS5hY2NvdW50fToqYFxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIFNlY3VyaXR5IG1vbml0b3Jpbmcgcm9sZVxuICBzdGF0aWMgY3JlYXRlU2VjdXJpdHlNb25pdG9yaW5nUm9sZShcbiAgICBzY29wZTogY2RrLlN0YWNrLFxuICAgIGlkOiBzdHJpbmdcbiAgKTogaWFtLlJvbGUge1xuICAgIHJldHVybiBuZXcgaWFtLlJvbGUoc2NvcGUsIGlkLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnbGFtYmRhLmFtYXpvbmF3cy5jb20nKSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgbW9uaXRvcmluZyBhbmQgYWxlcnRpbmcgcm9sZScsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJylcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBTZWN1cml0eU1vbml0b3Jpbmc6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgc2lkOiAnQ2xvdWRXYXRjaE1ldHJpY3MnLFxuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhJyxcbiAgICAgICAgICAgICAgICAnY2xvdWR3YXRjaDpHZXRNZXRyaWNTdGF0aXN0aWNzJyxcbiAgICAgICAgICAgICAgICAnY2xvdWR3YXRjaDpMaXN0TWV0cmljcydcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgICAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgICAgICAgICdTdHJpbmdFcXVhbHMnOiB7XG4gICAgICAgICAgICAgICAgICAnY2xvdWR3YXRjaDpuYW1lc3BhY2UnOiBbJ0FXUy9XQUYnLCAnQVdTL0xhbWJkYScsICdBV1MvQ29nbml0bycsICdDdXN0b20vU2VjdXJpdHknXVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIHNpZDogJ1NOU1B1Ymxpc2gnLFxuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFsnc25zOlB1Ymxpc2gnXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6c25zOiR7c2NvcGUucmVnaW9ufToke3Njb3BlLmFjY291bnR9OnBvcnRmb2xpby1zZWN1cml0eS1hbGVydHMtKmBcbiAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfSksXG4gICAgICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgICAgIHNpZDogJ0xvZ3NBY2Nlc3MnLFxuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnbG9nczpDcmVhdGVMb2dTdHJlYW0nLFxuICAgICAgICAgICAgICAgICdsb2dzOlB1dExvZ0V2ZW50cycsXG4gICAgICAgICAgICAgICAgJ2xvZ3M6RGVzY3JpYmVMb2dTdHJlYW1zJyxcbiAgICAgICAgICAgICAgICAnbG9nczpGaWx0ZXJMb2dFdmVudHMnXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgICAgIGBhcm46YXdzOmxvZ3M6JHtzY29wZS5yZWdpb259OiR7c2NvcGUuYWNjb3VudH06bG9nLWdyb3VwOi9hd3Mvd2FmLypgLFxuICAgICAgICAgICAgICAgIGBhcm46YXdzOmxvZ3M6JHtzY29wZS5yZWdpb259OiR7c2NvcGUuYWNjb3VudH06bG9nLWdyb3VwOi9zZWN1cml0eS8qYFxuICAgICAgICAgICAgICBdXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIENyb3NzLWFjY291bnQgYWNjZXNzIHBvbGljeSAoZm9yIENJL0NEKVxuICBzdGF0aWMgY3JlYXRlQ3Jvc3NBY2NvdW50UG9saWN5KFxuICAgIHNjb3BlOiBjZGsuU3RhY2ssXG4gICAgdHJ1c3RlZEFjY291bnRJZDogc3RyaW5nLFxuICAgIGVudmlyb25tZW50OiBzdHJpbmdcbiAgKTogaWFtLlJvbGUge1xuICAgIHJldHVybiBuZXcgaWFtLlJvbGUoc2NvcGUsICdDcm9zc0FjY291bnREZXBsb3ltZW50Um9sZScsIHtcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5BY2NvdW50UHJpbmNpcGFsKHRydXN0ZWRBY2NvdW50SWQpLFxuICAgICAgZGVzY3JpcHRpb246IGBDcm9zcy1hY2NvdW50IGRlcGxveW1lbnQgcm9sZSBmb3IgJHtlbnZpcm9ubWVudH1gLFxuICAgICAgZXh0ZXJuYWxJZHM6IFtgcG9ydGZvbGlvLWRlcGxveW1lbnQtJHtlbnZpcm9ubWVudH1gXSxcbiAgICAgIG1heFNlc3Npb25EdXJhdGlvbjogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgICAgaW5saW5lUG9saWNpZXM6IHtcbiAgICAgICAgRGVwbG95bWVudEFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBzaWQ6ICdTM0RlcGxveW1lbnRBY2Nlc3MnLFxuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6UHV0T2JqZWN0QWNsJyxcbiAgICAgICAgICAgICAgICAnczM6RGVsZXRlT2JqZWN0JyxcbiAgICAgICAgICAgICAgICAnczM6TGlzdEJ1Y2tldCdcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICAgICAgYGFybjphd3M6czM6Ojpwb3J0Zm9saW8tJHtlbnZpcm9ubWVudH0tKmAsXG4gICAgICAgICAgICAgICAgYGFybjphd3M6czM6Ojpwb3J0Zm9saW8tJHtlbnZpcm9ubWVudH0tKi8qYFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAgICAgJ1N0cmluZ0VxdWFscyc6IHtcbiAgICAgICAgICAgICAgICAgICdhd3M6UmVxdWVzdGVkUmVnaW9uJzogc2NvcGUucmVnaW9uXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgc2lkOiAnQ2xvdWRGcm9udEludmFsaWRhdGlvbicsXG4gICAgICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICAgICdjbG91ZGZyb250OkNyZWF0ZUludmFsaWRhdGlvbicsXG4gICAgICAgICAgICAgICAgJ2Nsb3VkZnJvbnQ6R2V0SW52YWxpZGF0aW9uJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpjbG91ZGZyb250Ojoke3Njb3BlLmFjY291bnR9OmRpc3RyaWJ1dGlvbi8qYF1cbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBzaWQ6ICdMYW1iZGFEZXBsb3ltZW50JyxcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ2xhbWJkYTpVcGRhdGVGdW5jdGlvbkNvZGUnLFxuICAgICAgICAgICAgICAgICdsYW1iZGE6VXBkYXRlRnVuY3Rpb25Db25maWd1cmF0aW9uJyxcbiAgICAgICAgICAgICAgICAnbGFtYmRhOlB1Ymxpc2hWZXJzaW9uJ1xuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgICByZXNvdXJjZXM6IFtgYXJuOmF3czpsYW1iZGE6JHtzY29wZS5yZWdpb259OiR7c2NvcGUuYWNjb3VudH06ZnVuY3Rpb246cG9ydGZvbGlvLSpgXVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICBdXG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXNvdXJjZS1iYXNlZCBwb2xpY3kgZm9yIER5bmFtb0RCXG4gIHN0YXRpYyBjcmVhdGVEeW5hbW9EQlJlc291cmNlUG9saWN5KFxuICAgIHNjb3BlOiBjZGsuU3RhY2ssXG4gICAgdGFibGVOYW1lOiBzdHJpbmcsXG4gICAgYWxsb3dlZFByaW5jaXBhbHM6IHN0cmluZ1tdXG4gICk6IGlhbS5Qb2xpY3lEb2N1bWVudCB7XG4gICAgcmV0dXJuIG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgc2lkOiAnQWxsb3dTcGVjaWZpY1ByaW5jaXBhbHMnLFxuICAgICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgICAgICBwcmluY2lwYWxzOiBhbGxvd2VkUHJpbmNpcGFscy5tYXAoYXJuID0+IGlhbS5Sb2xlLmZyb21Sb2xlQXJuKHNjb3BlLCBgUm9sZS0ke2Fybi5zcGxpdCgnLycpLnBvcCgpfWAsIGFybikpLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgICAgICdkeW5hbW9kYjpRdWVyeScsXG4gICAgICAgICAgICAnZHluYW1vZGI6UHV0SXRlbScsXG4gICAgICAgICAgICAnZHluYW1vZGI6VXBkYXRlSXRlbSdcbiAgICAgICAgICBdLFxuICAgICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHtzY29wZS5yZWdpb259OiR7c2NvcGUuYWNjb3VudH06dGFibGUvJHt0YWJsZU5hbWV9YCxcbiAgICAgICAgICAgIGBhcm46YXdzOmR5bmFtb2RiOiR7c2NvcGUucmVnaW9ufToke3Njb3BlLmFjY291bnR9OnRhYmxlLyR7dGFibGVOYW1lfS9pbmRleC8qYFxuICAgICAgICAgIF0sXG4gICAgICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICAgICAgJ0ZvckFsbFZhbHVlczpTdHJpbmdFcXVhbHMnOiB7XG4gICAgICAgICAgICAgICdkeW5hbW9kYjpMZWFkaW5nS2V5cyc6IFsnUFJPSkVDVCcsICdDQVJPVVNFTCcsICdDT05GSUcnXVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSksXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICBzaWQ6ICdEZW55VW5hdXRob3JpemVkQWNjZXNzJyxcbiAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuREVOWSxcbiAgICAgICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5BbnlQcmluY2lwYWwoKV0sXG4gICAgICAgICAgYWN0aW9uczogWydkeW5hbW9kYjoqJ10sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgICBgYXJuOmF3czpkeW5hbW9kYjoke3Njb3BlLnJlZ2lvbn06JHtzY29wZS5hY2NvdW50fTp0YWJsZS8ke3RhYmxlTmFtZX1gLFxuICAgICAgICAgICAgYGFybjphd3M6ZHluYW1vZGI6JHtzY29wZS5yZWdpb259OiR7c2NvcGUuYWNjb3VudH06dGFibGUvJHt0YWJsZU5hbWV9L2luZGV4LypgXG4gICAgICAgICAgXSxcbiAgICAgICAgICBjb25kaXRpb25zOiB7XG4gICAgICAgICAgICAnU3RyaW5nTm90RXF1YWxzJzoge1xuICAgICAgICAgICAgICAnYXdzOlByaW5jaXBhbEFybic6IGFsbG93ZWRQcmluY2lwYWxzXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgXVxuICAgIH0pO1xuICB9XG59XG4iXX0=