import * as iam from 'aws-cdk-lib/aws-iam';
import * as cdk from 'aws-cdk-lib';

export class IAMPolicies {
  
  // Lambda execution role with minimal permissions
  static createLambdaExecutionRole(
    scope: cdk.Stack, 
    id: string, 
    tableName: string, 
    bucketName: string,
    environment: string
  ): iam.Role {
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
  static createAdminLambdaRole(
    scope: cdk.Stack,
    id: string,
    tableName: string,
    bucketName: string,
    environment: string
  ): iam.Role {
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
  static createImageProcessingRole(
    scope: cdk.Stack,
    id: string,
    sourceBucketName: string,
    processedBucketName: string
  ): iam.Role {
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
  static createCloudFrontOACPolicy(
    scope: cdk.Stack,
    bucketName: string,
    distributionId: string
  ): iam.PolicyDocument {
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
  static createCognitoAdminPolicy(
    scope: cdk.Stack,
    userPoolId: string
  ): iam.PolicyDocument {
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
  static createAPIGatewayRole(
    scope: cdk.Stack,
    id: string
  ): iam.Role {
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
  static createSecurityMonitoringRole(
    scope: cdk.Stack,
    id: string
  ): iam.Role {
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
  static createCrossAccountPolicy(
    scope: cdk.Stack,
    trustedAccountId: string,
    environment: string
  ): iam.Role {
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
  static createDynamoDBResourcePolicy(
    scope: cdk.Stack,
    tableName: string,
    allowedPrincipals: string[]
  ): iam.PolicyDocument {
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
