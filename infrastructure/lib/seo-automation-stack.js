"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEOAutomationStack = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const events = require("aws-cdk-lib/aws-events");
const targets = require("aws-cdk-lib/aws-events-targets");
const iam = require("aws-cdk-lib/aws-iam");
class SEOAutomationStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // IAM role for SEO Lambda functions
        const seoLambdaRole = new iam.Role(this, 'SEOLambdaRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
            ],
            inlinePolicies: {
                DynamoDBAccess: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                'dynamodb:Query',
                                'dynamodb:GetItem',
                                'dynamodb:Scan'
                            ],
                            resources: [props.table.tableArn, `${props.table.tableArn}/index/*`]
                        })
                    ]
                }),
                S3Access: new iam.PolicyDocument({
                    statements: [
                        new iam.PolicyStatement({
                            effect: iam.Effect.ALLOW,
                            actions: [
                                's3:PutObject',
                                's3:PutObjectAcl',
                                's3:GetObject'
                            ],
                            resources: [`${props.bucket.bucketArn}/*`]
                        })
                    ]
                })
            }
        });
        // Meta tags and structured data generator
        const metaGeneratorFunction = new lambda.Function(this, 'MetaGeneratorFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'meta-generator.handler',
            code: lambda.Code.fromAsset('../backend/seo-automation'),
            role: seoLambdaRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 512,
            environment: {
                TABLE_NAME: props.table.tableName,
                SITE_URL: props.siteUrl,
                IMAGE_DOMAIN: props.imageUrl,
                ENVIRONMENT: props.environment
            }
        });
        // Sitemap generator
        const sitemapGeneratorFunction = new lambda.Function(this, 'SitemapGeneratorFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'sitemap-generator.handler',
            code: lambda.Code.fromAsset('../backend/seo-automation'),
            role: seoLambdaRole,
            timeout: cdk.Duration.minutes(5),
            memorySize: 1024,
            environment: {
                TABLE_NAME: props.table.tableName,
                BUCKET_NAME: props.bucket.bucketName,
                SITE_URL: props.siteUrl,
                ENVIRONMENT: props.environment
            }
        });
        // Robots.txt generator
        const robotsGeneratorFunction = new lambda.Function(this, 'RobotsGeneratorFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'robots-generator.handler',
            code: lambda.Code.fromAsset('../backend/seo-automation'),
            role: seoLambdaRole,
            timeout: cdk.Duration.seconds(30),
            memorySize: 256,
            environment: {
                BUCKET_NAME: props.bucket.bucketName,
                SITE_URL: props.siteUrl,
                ENVIRONMENT: props.environment
            }
        });
        // API Gateway for SEO endpoints
        this.seoApi = new apigateway.RestApi(this, 'SEOApi', {
            restApiName: 'Photography Portfolio SEO API',
            description: 'SEO automation endpoints',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: ['GET', 'POST'],
                allowHeaders: ['Content-Type', 'Authorization']
            }
        });
        // SEO endpoints
        const seoResource = this.seoApi.root.addResource('seo');
        // Meta tags endpoint: GET /seo/meta/{proxy+}
        const metaResource = seoResource.addResource('meta');
        const metaProxyResource = metaResource.addResource('{proxy+}');
        metaProxyResource.addMethod('GET', new apigateway.LambdaIntegration(metaGeneratorFunction));
        // Sitemap generation endpoint: POST /seo/sitemap
        const sitemapResource = seoResource.addResource('sitemap');
        sitemapResource.addMethod('POST', new apigateway.LambdaIntegration(sitemapGeneratorFunction));
        // Robots.txt generation endpoint: POST /seo/robots
        const robotsResource = seoResource.addResource('robots');
        robotsResource.addMethod('POST', new apigateway.LambdaIntegration(robotsGeneratorFunction));
        // Scheduled sitemap generation (daily at 2 AM UTC)
        const sitemapScheduleRule = new events.Rule(this, 'SitemapScheduleRule', {
            schedule: events.Schedule.cron({
                minute: '0',
                hour: '2',
                day: '*',
                month: '*',
                year: '*'
            }),
            description: 'Daily sitemap generation'
        });
        sitemapScheduleRule.addTarget(new targets.LambdaFunction(sitemapGeneratorFunction));
        // Scheduled robots.txt generation (on deployment)
        const robotsScheduleRule = new events.Rule(this, 'RobotsScheduleRule', {
            schedule: events.Schedule.cron({
                minute: '0',
                hour: '3',
                day: '*',
                month: '*',
                year: '*'
            }),
            description: 'Daily robots.txt generation'
        });
        robotsScheduleRule.addTarget(new targets.LambdaFunction(robotsGeneratorFunction));
        // CloudWatch alarms for monitoring
        metaGeneratorFunction.metricErrors().createAlarm(this, 'MetaGeneratorErrors', {
            threshold: 5,
            evaluationPeriods: 2,
            treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING
        });
        sitemapGeneratorFunction.metricErrors().createAlarm(this, 'SitemapGeneratorErrors', {
            threshold: 1,
            evaluationPeriods: 1,
            treatMissingData: cdk.aws_cloudwatch.TreatMissingData.NOT_BREACHING
        });
        // Outputs
        new cdk.CfnOutput(this, 'SEOApiUrl', {
            value: this.seoApi.url,
            description: 'SEO API Gateway URL',
            exportName: `PhotographyPortfolio-${props.environment}-SEOApiUrl`
        });
        new cdk.CfnOutput(this, 'MetaEndpoint', {
            value: `${this.seoApi.url}seo/meta/`,
            description: 'Meta tags generation endpoint'
        });
        new cdk.CfnOutput(this, 'SitemapEndpoint', {
            value: `${this.seoApi.url}seo/sitemap`,
            description: 'Sitemap generation endpoint'
        });
    }
}
exports.SEOAutomationStack = SEOAutomationStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2VvLWF1dG9tYXRpb24tc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzZW8tYXV0b21hdGlvbi1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMsaURBQWlEO0FBQ2pELHlEQUF5RDtBQUN6RCxpREFBaUQ7QUFDakQsMERBQTBEO0FBQzFELDJDQUEyQztBQVkzQyxNQUFhLGtCQUFtQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBRy9DLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBOEI7UUFDdEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsb0NBQW9DO1FBQ3BDLE1BQU0sYUFBYSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3hELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQywwQ0FBMEMsQ0FBQzthQUN2RjtZQUNELGNBQWMsRUFBRTtnQkFDZCxjQUFjLEVBQUUsSUFBSSxHQUFHLENBQUMsY0FBYyxDQUFDO29CQUNyQyxVQUFVLEVBQUU7d0JBQ1YsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDOzRCQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLOzRCQUN4QixPQUFPLEVBQUU7Z0NBQ1AsZ0JBQWdCO2dDQUNoQixrQkFBa0I7Z0NBQ2xCLGVBQWU7NkJBQ2hCOzRCQUNELFNBQVMsRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxRQUFRLFVBQVUsQ0FBQzt5QkFDckUsQ0FBQztxQkFDSDtpQkFDRixDQUFDO2dCQUNGLFFBQVEsRUFBRSxJQUFJLEdBQUcsQ0FBQyxjQUFj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QUFFLEdBQUcsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUMsYUFBYTtTQUNwRSxDQUFDLENBQUM7UUFFSCxVQUFVO1FBQ1YsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxXQUFXLEVBQUU7WUFDbkMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRztZQUN0QixXQUFXLEVBQUUscUJBQXFCO1lBQ2xDLFVBQVUsRUFBRSx3QkFBd0IsS0FBSyxDQUFDLFdBQVcsWUFBWTtTQUNsRSxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUN0QyxLQUFLLEVBQUUsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsV0FBVztZQUNwQyxXQUFXLEVBQUUsK0JBQStCO1NBQzdDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsaUJBQWlCLEVBQUU7WUFDekMsS0FBSyxFQUFFLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxHQUFHLGFBQWE7WUFDdEMsV0FBVyxFQUFFLDZCQUE2QjtTQUMzQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE5S0QsZ0RBOEtDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXknO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuXG5pbnRlcmZhY2UgU0VPQXV0b21hdGlvblN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIHRhYmxlOiBhbnk7XG4gIGJ1Y2tldDogczMuQnVja2V0O1xuICBlbnZpcm9ubWVudDogc3RyaW5nO1xuICBzaXRlVXJsOiBzdHJpbmc7XG4gIGltYWdlVXJsOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBTRU9BdXRvbWF0aW9uU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xuICBwdWJsaWMgcmVhZG9ubHkgc2VvQXBpOiBhcGlnYXRld2F5LlJlc3RBcGk7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFNFT0F1dG9tYXRpb25TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyBJQU0gcm9sZSBmb3IgU0VPIExhbWJkYSBmdW5jdGlvbnNcbiAgICBjb25zdCBzZW9MYW1iZGFSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdTRU9MYW1iZGFSb2xlJywge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoJ2xhbWJkYS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlJylcbiAgICAgIF0sXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBEeW5hbW9EQkFjY2VzczogbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6UXVlcnknLFxuICAgICAgICAgICAgICAgICdkeW5hbW9kYjpHZXRJdGVtJyxcbiAgICAgICAgICAgICAgICAnZHluYW1vZGI6U2NhbidcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbcHJvcHMudGFibGUudGFibGVBcm4sIGAke3Byb3BzLnRhYmxlLnRhYmxlQXJufS9pbmRleC8qYF1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgXVxuICAgICAgICB9KSxcbiAgICAgICAgUzNBY2Nlc3M6IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgICAgIHN0YXRlbWVudHM6IFtcbiAgICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdCcsXG4gICAgICAgICAgICAgICAgJ3MzOlB1dE9iamVjdEFjbCcsXG4gICAgICAgICAgICAgICAgJ3MzOkdldE9iamVjdCdcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgICAgcmVzb3VyY2VzOiBbYCR7cHJvcHMuYnVja2V0LmJ1Y2tldEFybn0vKmBdXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIF1cbiAgICAgICAgfSlcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIE1ldGEgdGFncyBhbmQgc3RydWN0dXJlZCBkYXRhIGdlbmVyYXRvclxuICAgIGNvbnN0IG1ldGFHZW5lcmF0b3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ01ldGFHZW5lcmF0b3JGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ21ldGEtZ2VuZXJhdG9yLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL3Nlby1hdXRvbWF0aW9uJyksXG4gICAgICByb2xlOiBzZW9MYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogNTEyLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEFCTEVfTkFNRTogcHJvcHMudGFibGUudGFibGVOYW1lLFxuICAgICAgICBTSVRFX1VSTDogcHJvcHMuc2l0ZVVybCxcbiAgICAgICAgSU1BR0VfRE9NQUlOOiBwcm9wcy5pbWFnZVVybCxcbiAgICAgICAgRU5WSVJPTk1FTlQ6IHByb3BzLmVudmlyb25tZW50XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBTaXRlbWFwIGdlbmVyYXRvclxuICAgIGNvbnN0IHNpdGVtYXBHZW5lcmF0b3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ1NpdGVtYXBHZW5lcmF0b3JGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ3NpdGVtYXAtZ2VuZXJhdG9yLmhhbmRsZXInLFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCcuLi9iYWNrZW5kL3Nlby1hdXRvbWF0aW9uJyksXG4gICAgICByb2xlOiBzZW9MYW1iZGFSb2xlLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgVEFCTEVfTkFNRTogcHJvcHMudGFibGUudGFibGVOYW1lLFxuICAgICAgICBCVUNLRVRfTkFNRTogcHJvcHMuYnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFNJVEVfVVJMOiBwcm9wcy5zaXRlVXJsLFxuICAgICAgICBFTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIFJvYm90cy50eHQgZ2VuZXJhdG9yXG4gICAgY29uc3Qgcm9ib3RzR2VuZXJhdG9yRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdSb2JvdHNHZW5lcmF0b3JGdW5jdGlvbicsIHtcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18xOF9YLFxuICAgICAgaGFuZGxlcjogJ3JvYm90cy1nZW5lcmF0b3IuaGFuZGxlcicsXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoJy4uL2JhY2tlbmQvc2VvLWF1dG9tYXRpb24nKSxcbiAgICAgIHJvbGU6IHNlb0xhbWJkYVJvbGUsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBCVUNLRVRfTkFNRTogcHJvcHMuYnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFNJVEVfVVJMOiBwcm9wcy5zaXRlVXJsLFxuICAgICAgICBFTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnRcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEFQSSBHYXRld2F5IGZvciBTRU8gZW5kcG9pbnRzXG4gICAgdGhpcy5zZW9BcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdTRU9BcGknLCB7XG4gICAgICByZXN0QXBpTmFtZTogJ1Bob3RvZ3JhcGh5IFBvcnRmb2xpbyBTRU8gQVBJJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU0VPIGF1dG9tYXRpb24gZW5kcG9pbnRzJyxcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbJ0dFVCcsICdQT1NUJ10sXG4gICAgICAgIGFsbG93SGVhZGVyczogWydDb250ZW50LVR5cGUnLCAnQXV0aG9yaXphdGlvbiddXG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBTRU8gZW5kcG9pbnRzXG4gICAgY29uc3Qgc2VvUmVzb3VyY2UgPSB0aGlzLnNlb0FwaS5yb290LmFkZFJlc291cmNlKCdzZW8nKTtcbiAgICBcbiAgICAvLyBNZXRhIHRhZ3MgZW5kcG9pbnQ6IEdFVCAvc2VvL21ldGEve3Byb3h5K31cbiAgICBjb25zdCBtZXRhUmVzb3VyY2UgPSBzZW9SZXNvdXJjZS5hZGRSZXNvdXJjZSgnbWV0YScpO1xuICAgIGNvbnN0IG1ldGFQcm94eVJlc291cmNlID0gbWV0YVJlc291cmNlLmFkZFJlc291cmNlKCd7cHJveHkrfScpO1xuICAgIG1ldGFQcm94eVJlc291cmNlLmFkZE1ldGhvZCgnR0VUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24obWV0YUdlbmVyYXRvckZ1bmN0aW9uKSk7XG5cbiAgICAvLyBTaXRlbWFwIGdlbmVyYXRpb24gZW5kcG9pbnQ6IFBPU1QgL3Nlby9zaXRlbWFwXG4gICAgY29uc3Qgc2l0ZW1hcFJlc291cmNlID0gc2VvUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3NpdGVtYXAnKTtcbiAgICBzaXRlbWFwUmVzb3VyY2UuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oc2l0ZW1hcEdlbmVyYXRvckZ1bmN0aW9uKSk7XG5cbiAgICAvLyBSb2JvdHMudHh0IGdlbmVyYXRpb24gZW5kcG9pbnQ6IFBPU1QgL3Nlby9yb2JvdHNcbiAgICBjb25zdCByb2JvdHNSZXNvdXJjZSA9IHNlb1Jlc291cmNlLmFkZFJlc291cmNlKCdyb2JvdHMnKTtcbiAgICByb2JvdHNSZXNvdXJjZS5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihyb2JvdHNHZW5lcmF0b3JGdW5jdGlvbikpO1xuXG4gICAgLy8gU2NoZWR1bGVkIHNpdGVtYXAgZ2VuZXJhdGlvbiAoZGFpbHkgYXQgMiBBTSBVVEMpXG4gICAgY29uc3Qgc2l0ZW1hcFNjaGVkdWxlUnVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnU2l0ZW1hcFNjaGVkdWxlUnVsZScsIHtcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUuY3Jvbih7XG4gICAgICAgIG1pbnV0ZTogJzAnLFxuICAgICAgICBob3VyOiAnMicsXG4gICAgICAgIGRheTogJyonLFxuICAgICAgICBtb250aDogJyonLFxuICAgICAgICB5ZWFyOiAnKidcbiAgICAgIH0pLFxuICAgICAgZGVzY3JpcHRpb246ICdEYWlseSBzaXRlbWFwIGdlbmVyYXRpb24nXG4gICAgfSk7XG5cbiAgICBzaXRlbWFwU2NoZWR1bGVSdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihzaXRlbWFwR2VuZXJhdG9yRnVuY3Rpb24pKTtcblxuICAgIC8vIFNjaGVkdWxlZCByb2JvdHMudHh0IGdlbmVyYXRpb24gKG9uIGRlcGxveW1lbnQpXG4gICAgY29uc3Qgcm9ib3RzU2NoZWR1bGVSdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdSb2JvdHNTY2hlZHVsZVJ1bGUnLCB7XG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLmNyb24oe1xuICAgICAgICBtaW51dGU6ICcwJyxcbiAgICAgICAgaG91cjogJzMnLFxuICAgICAgICBkYXk6ICcqJyxcbiAgICAgICAgbW9udGg6ICcqJyxcbiAgICAgICAgeWVhcjogJyonXG4gICAgICB9KSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGFpbHkgcm9ib3RzLnR4dCBnZW5lcmF0aW9uJ1xuICAgIH0pO1xuXG4gICAgcm9ib3RzU2NoZWR1bGVSdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihyb2JvdHNHZW5lcmF0b3JGdW5jdGlvbikpO1xuXG4gICAgLy8gQ2xvdWRXYXRjaCBhbGFybXMgZm9yIG1vbml0b3JpbmdcbiAgICBtZXRhR2VuZXJhdG9yRnVuY3Rpb24ubWV0cmljRXJyb3JzKCkuY3JlYXRlQWxhcm0odGhpcywgJ01ldGFHZW5lcmF0b3JFcnJvcnMnLCB7XG4gICAgICB0aHJlc2hvbGQ6IDUsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMixcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNkay5hd3NfY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLk5PVF9CUkVBQ0hJTkdcbiAgICB9KTtcblxuICAgIHNpdGVtYXBHZW5lcmF0b3JGdW5jdGlvbi5tZXRyaWNFcnJvcnMoKS5jcmVhdGVBbGFybSh0aGlzLCAnU2l0ZW1hcEdlbmVyYXRvckVycm9ycycsIHtcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2RrLmF3c19jbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuTk9UX0JSRUFDSElOR1xuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTRU9BcGlVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5zZW9BcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdTRU8gQVBJIEdhdGV3YXkgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBQaG90b2dyYXBoeVBvcnRmb2xpby0ke3Byb3BzLmVudmlyb25tZW50fS1TRU9BcGlVcmxgXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnTWV0YUVuZHBvaW50Jywge1xuICAgICAgdmFsdWU6IGAke3RoaXMuc2VvQXBpLnVybH1zZW8vbWV0YS9gLFxuICAgICAgZGVzY3JpcHRpb246ICdNZXRhIHRhZ3MgZ2VuZXJhdGlvbiBlbmRwb2ludCdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTaXRlbWFwRW5kcG9pbnQnLCB7XG4gICAgICB2YWx1ZTogYCR7dGhpcy5zZW9BcGkudXJsfXNlby9zaXRlbWFwYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnU2l0ZW1hcCBnZW5lcmF0aW9uIGVuZHBvaW50J1xuICAgIH0pO1xuICB9XG59XG4iXX0=