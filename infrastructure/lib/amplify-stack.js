"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmplifyStack = void 0;
const cdk = require("aws-cdk-lib");
const amplify = require("aws-cdk-lib/aws-amplify");
const iam = require("aws-cdk-lib/aws-iam");
const ssm = require("aws-cdk-lib/aws-ssm");
class AmplifyStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // IAM role for Amplify
        const amplifyRole = new iam.Role(this, 'AmplifyRole', {
            assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess-Amplify')
            ]
        });
        // Environment variables for Amplify
        const environmentVariables = {
            // Build configuration
            AMPLIFY_MONOREPO_APP_ROOT: 'frontend',
            AMPLIFY_DIFF_DEPLOY: 'false',
            // Next.js configuration
            NEXT_PUBLIC_ENVIRONMENT: props.environment,
            DEPLOYMENT_TARGET: 'amplify',
            // API endpoints (will be set after backend deployment)
            NEXT_PUBLIC_API_URL: `https://api${props.environment !== 'production' ? `-${props.environment}` : ''}.${props.domainName || 'example.com'}`,
            NEXT_PUBLIC_IMAGE_DOMAIN: `https://images${props.environment !== 'production' ? `-${props.environment}` : ''}.${props.domainName || 'example.com'}`,
            NEXT_PUBLIC_SITE_URL: `https://${props.environment !== 'production' ? `${props.environment}.` : ''}${props.domainName || 'example.com'}`,
            // Feature flags
            NEXT_PUBLIC_ENABLE_ANALYTICS: props.environment === 'production' ? 'true' : 'false',
            NEXT_PUBLIC_ENABLE_ADMIN: props.environment !== 'production' ? 'true' : 'false',
            NEXT_PUBLIC_DEBUG: props.environment !== 'production' ? 'true' : 'false',
            // Site metadata
            NEXT_PUBLIC_SITE_NAME: 'Photography Portfolio',
            NEXT_PUBLIC_SITE_DESCRIPTION: 'Professional photography portfolio showcasing stunning visual stories'
        };
        // Create Amplify app
        this.amplifyApp = new amplify.CfnApp(this, 'AmplifyApp', {
            name: `photography-portfolio-${props.environment}`,
            description: `Photography portfolio website - ${props.environment} environment`,
            repository: props.repositoryUrl,
            accessToken: props.accessToken,
            iamServiceRole: amplifyRole.roleArn,
            // Build settings
            buildSpec: cdk.Fn.sub(`
version: 1
applications:
  - appRoot: frontend
    frontend:
      phases:
        preBuild:
          commands:
            - echo "Installing dependencies..."
            - npm ci
            - echo "Environment: \${AWS_BRANCH}"
        build:
          commands:
            - echo "Building Next.js application..."
            - export DEPLOYMENT_TARGET=amplify
            - npm run build
        postBuild:
          commands:
            - echo "Build completed successfully"
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
      `),
            // Environment variables
            environmentVariables: Object.entries(environmentVariables).map(([name, value]) => ({
                name,
                value
            })),
            // Platform and framework
            platform: 'WEB_COMPUTE',
            // Custom rules for SPA routing
            customRules: [
                {
                    source: '/<*>',
                    target: '/index.html',
                    status: '404-200'
                }
            ]
        });
        // Create branch
        const branchName = props.environment === 'production' ? 'main' : props.environment;
        const branch = new amplify.CfnBranch(this, 'AmplifyBranch', {
            appId: this.amplifyApp.attrAppId,
            branchName,
            description: `${props.environment} environment branch`,
            enableAutoBuild: true,
            enablePerformanceMode: props.environment === 'production',
            // Environment variables (branch-specific overrides)
            environmentVariables: [
                {
                    name: 'NEXT_PUBLIC_ENVIRONMENT',
                    value: props.environment
                }
            ]
        });
        // Custom domain (if provided)
        if (props.domainName) {
            const domainName = props.environment === 'production'
                ? props.domainName
                : `${props.environment}.${props.domainName}`;
            const domain = new amplify.CfnDomain(this, 'AmplifyDomain', {
                appId: this.amplifyApp.attrAppId,
                domainName: props.domainName,
                subDomainSettings: [
                    {
                        branchName,
                        prefix: props.environment === 'production' ? '' : props.environment
                    }
                ],
                enableAutoSubDomain: false
            });
            // Output domain URL
            new cdk.CfnOutput(this, 'AmplifyDomainUrl', {
                value: `https://${domainName}`,
                description: 'Amplify app domain URL'
            });
        }
        // Store environment variables in Parameter Store for other stacks
        new ssm.StringParameter(this, 'AmplifyAppId', {
            parameterName: `/photography-portfolio/${props.environment}/amplify/app-id`,
            stringValue: this.amplifyApp.attrAppId,
            description: 'Amplify App ID'
        });
        // Outputs
        new cdk.CfnOutput(this, 'AmplifyAppId', {
            value: this.amplifyApp.attrAppId,
            description: 'Amplify App ID',
            exportName: `PhotographyPortfolio-${props.environment}-AmplifyAppId`
        });
        new cdk.CfnOutput(this, 'AmplifyAppUrl', {
            value: `https://${branchName}.${this.amplifyApp.attrDefaultDomain}`,
            description: 'Amplify app URL',
            exportName: `PhotographyPortfolio-${props.environment}-AmplifyAppUrl`
        });
        new cdk.CfnOutput(this, 'AmplifyConsoleUrl', {
            value: `https://console.aws.amazon.com/amplify/home?region=${this.region}#/${this.amplifyApp.attrAppId}`,
            description: 'Amplify console URL'
        });
    }
}
exports.AmplifyStack = AmplifyStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW1wbGlmeS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFtcGxpZnktc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBQ25DLG1EQUFtRDtBQUNuRCwyQ0FBMkM7QUFDM0MsMkNBQTJDO0FBVTNDLE1BQWEsWUFBYSxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBR3pDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsdUJBQXVCO1FBQ3ZCLE1BQU0sV0FBVyxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsYUFBYSxFQUFFO1lBQ3BELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyx1QkFBdUIsQ0FBQztZQUM1RCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FBQyw2QkFBNkIsQ0FBQzthQUMxRTtTQUNGLENBQUMsQ0FBQztRQUVILG9DQUFvQztRQUNwQyxNQUFNLG9CQUFvQixHQUFHO1lBQzNCLHNCQUFzQjtZQUN0Qix5QkFBeUIsRUFBRSxVQUFVO1lBQ3JDLG1CQUFtQixFQUFFLE9BQU87WUFFNUIsd0JBQXdCO1lBQ3hCLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxXQUFXO1lBQzFDLGlCQUFpQixFQUFFLFNBQVM7WUFFNUIsdURBQXVEO1lBQ3ZELG1CQUFtQixFQUFFLGNBQWMsS0FBSyxDQUFDLFdBQVcsS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksS0FBSyxDQUFDLFVBQVUsSUFBSSxhQUFhLEVBQUU7WUFDM0ksd0JBQXdCLEVBQUUsaUJBQWlCLEtBQUssQ0FBQyxXQUFXLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtB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VyxlQUFlO1NBQ3JFLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxXQUFXLFVBQVUsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixFQUFFO1lBQ25FLFdBQVcsRUFBRSxpQkFBaUI7WUFDOUIsVUFBVSxFQUFFLHdCQUF3QixLQUFLLENBQUMsV0FBVyxnQkFBZ0I7U0FDdEUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsc0RBQXNELElBQUksQ0FBQyxNQUFNLEtBQUssSUFBSSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEVBQUU7WUFDeEcsV0FBVyxFQUFFLHFCQUFxQjtTQUNuQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFwS0Qsb0NBb0tDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGFtcGxpZnkgZnJvbSAnYXdzLWNkay1saWIvYXdzLWFtcGxpZnknO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBBbXBsaWZ5U3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZW52aXJvbm1lbnQ6IHN0cmluZztcbiAgZG9tYWluTmFtZT86IHN0cmluZztcbiAgcmVwb3NpdG9yeVVybDogc3RyaW5nO1xuICBhY2Nlc3NUb2tlbjogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQW1wbGlmeVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGFtcGxpZnlBcHA6IGFtcGxpZnkuQ2ZuQXBwO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBBbXBsaWZ5U3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gSUFNIHJvbGUgZm9yIEFtcGxpZnlcbiAgICBjb25zdCBhbXBsaWZ5Um9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQW1wbGlmeVJvbGUnLCB7XG4gICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uU2VydmljZVByaW5jaXBhbCgnYW1wbGlmeS5hbWF6b25hd3MuY29tJyksXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKCdBZG1pbmlzdHJhdG9yQWNjZXNzLUFtcGxpZnknKVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gRW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciBBbXBsaWZ5XG4gICAgY29uc3QgZW52aXJvbm1lbnRWYXJpYWJsZXMgPSB7XG4gICAgICAvLyBCdWlsZCBjb25maWd1cmF0aW9uXG4gICAgICBBTVBMSUZZX01PTk9SRVBPX0FQUF9ST09UOiAnZnJvbnRlbmQnLFxuICAgICAgQU1QTElGWV9ESUZGX0RFUExPWTogJ2ZhbHNlJyxcbiAgICAgIFxuICAgICAgLy8gTmV4dC5qcyBjb25maWd1cmF0aW9uXG4gICAgICBORVhUX1BVQkxJQ19FTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICBERVBMT1lNRU5UX1RBUkdFVDogJ2FtcGxpZnknLFxuICAgICAgXG4gICAgICAvLyBBUEkgZW5kcG9pbnRzICh3aWxsIGJlIHNldCBhZnRlciBiYWNrZW5kIGRlcGxveW1lbnQpXG4gICAgICBORVhUX1BVQkxJQ19BUElfVVJMOiBgaHR0cHM6Ly9hcGkke3Byb3BzLmVudmlyb25tZW50ICE9PSAncHJvZHVjdGlvbicgPyBgLSR7cHJvcHMuZW52aXJvbm1lbnR9YCA6ICcnfS4ke3Byb3BzLmRvbWFpbk5hbWUgfHwgJ2V4YW1wbGUuY29tJ31gLFxuICAgICAgTkVYVF9QVUJMSUNfSU1BR0VfRE9NQUlOOiBgaHR0cHM6Ly9pbWFnZXMke3Byb3BzLmVudmlyb25tZW50ICE9PSAncHJvZHVjdGlvbicgPyBgLSR7cHJvcHMuZW52aXJvbm1lbnR9YCA6ICcnfS4ke3Byb3BzLmRvbWFpbk5hbWUgfHwgJ2V4YW1wbGUuY29tJ31gLFxuICAgICAgTkVYVF9QVUJMSUNfU0lURV9VUkw6IGBodHRwczovLyR7cHJvcHMuZW52aXJvbm1lbnQgIT09ICdwcm9kdWN0aW9uJyA/IGAke3Byb3BzLmVudmlyb25tZW50fS5gIDogJyd9JHtwcm9wcy5kb21haW5OYW1lIHx8ICdleGFtcGxlLmNvbSd9YCxcbiAgICAgIFxuICAgICAgLy8gRmVhdHVyZSBmbGFnc1xuICAgICAgTkVYVF9QVUJMSUNfRU5BQkxFX0FOQUxZVElDUzogcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kdWN0aW9uJyA/ICd0cnVlJyA6ICdmYWxzZScsXG4gICAgICBORVhUX1BVQkxJQ19FTkFCTEVfQURNSU46IHByb3BzLmVudmlyb25tZW50ICE9PSAncHJvZHVjdGlvbicgPyAndHJ1ZScgOiAnZmFsc2UnLFxuICAgICAgTkVYVF9QVUJMSUNfREVCVUc6IHByb3BzLmVudmlyb25tZW50ICE9PSAncHJvZHVjdGlvbicgPyAndHJ1ZScgOiAnZmFsc2UnLFxuICAgICAgXG4gICAgICAvLyBTaXRlIG1ldGFkYXRhXG4gICAgICBORVhUX1BVQkxJQ19TSVRFX05BTUU6ICdQaG90b2dyYXBoeSBQb3J0Zm9saW8nLFxuICAgICAgTkVYVF9QVUJMSUNfU0lURV9ERVNDUklQVElPTjogJ1Byb2Zlc3Npb25hbCBwaG90b2dyYXBoeSBwb3J0Zm9saW8gc2hvd2Nhc2luZyBzdHVubmluZyB2aXN1YWwgc3RvcmllcydcbiAgICB9O1xuXG4gICAgLy8gQ3JlYXRlIEFtcGxpZnkgYXBwXG4gICAgdGhpcy5hbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnkuQ2ZuQXBwKHRoaXMsICdBbXBsaWZ5QXBwJywge1xuICAgICAgbmFtZTogYHBob3RvZ3JhcGh5LXBvcnRmb2xpby0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogYFBob3RvZ3JhcGh5IHBvcnRmb2xpbyB3ZWJzaXRlIC0gJHtwcm9wcy5lbnZpcm9ubWVudH0gZW52aXJvbm1lbnRgLFxuICAgICAgcmVwb3NpdG9yeTogcHJvcHMucmVwb3NpdG9yeVVybCxcbiAgICAgIGFjY2Vzc1Rva2VuOiBwcm9wcy5hY2Nlc3NUb2tlbixcbiAgICAgIGlhbVNlcnZpY2VSb2xlOiBhbXBsaWZ5Um9sZS5yb2xlQXJuLFxuICAgICAgXG4gICAgICAvLyBCdWlsZCBzZXR0aW5nc1xuICAgICAgYnVpbGRTcGVjOiBjZGsuRm4uc3ViKGBcbnZlcnNpb246IDFcbmFwcGxpY2F0aW9uczpcbiAgLSBhcHBSb290OiBmcm9udGVuZFxuICAgIGZyb250ZW5kOlxuICAgICAgcGhhc2VzOlxuICAgICAgICBwcmVCdWlsZDpcbiAgICAgICAgICBjb21tYW5kczpcbiAgICAgICAgICAgIC0gZWNobyBcIkluc3RhbGxpbmcgZGVwZW5kZW5jaWVzLi4uXCJcbiAgICAgICAgICAgIC0gbnBtIGNpXG4gICAgICAgICAgICAtIGVjaG8gXCJFbnZpcm9ubWVudDogXFwke0FXU19CUkFOQ0h9XCJcbiAgICAgICAgYnVpbGQ6XG4gICAgICAgICAgY29tbWFuZHM6XG4gICAgICAgICAgICAtIGVjaG8gXCJCdWlsZGluZyBOZXh0LmpzIGFwcGxpY2F0aW9uLi4uXCJcbiAgICAgICAgICAgIC0gZXhwb3J0IERFUExPWU1FTlRfVEFSR0VUPWFtcGxpZnlcbiAgICAgICAgICAgIC0gbnBtIHJ1biBidWlsZFxuICAgICAgICBwb3N0QnVpbGQ6XG4gICAgICAgICAgY29tbWFuZHM6XG4gICAgICAgICAgICAtIGVjaG8gXCJCdWlsZCBjb21wbGV0ZWQgc3VjY2Vzc2Z1bGx5XCJcbiAgICAgIGFydGlmYWN0czpcbiAgICAgICAgYmFzZURpcmVjdG9yeTogLm5leHRcbiAgICAgICAgZmlsZXM6XG4gICAgICAgICAgLSAnKiovKidcbiAgICAgIGNhY2hlOlxuICAgICAgICBwYXRoczpcbiAgICAgICAgICAtIG5vZGVfbW9kdWxlcy8qKi8qXG4gICAgICAgICAgLSAubmV4dC9jYWNoZS8qKi8qXG4gICAgICBgKSxcbiAgICAgIFxuICAgICAgLy8gRW52aXJvbm1lbnQgdmFyaWFibGVzXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczogT2JqZWN0LmVudHJpZXMoZW52aXJvbm1lbnRWYXJpYWJsZXMpLm1hcCgoW25hbWUsIHZhbHVlXSkgPT4gKHtcbiAgICAgICAgbmFtZSxcbiAgICAgICAgdmFsdWVcbiAgICAgIH0pKSxcblxuICAgICAgLy8gUGxhdGZvcm0gYW5kIGZyYW1ld29ya1xuICAgICAgcGxhdGZvcm06ICdXRUJfQ09NUFVURScsXG4gICAgICBcbiAgICAgIC8vIEN1c3RvbSBydWxlcyBmb3IgU1BBIHJvdXRpbmdcbiAgICAgIGN1c3RvbVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBzb3VyY2U6ICcvPCo+JyxcbiAgICAgICAgICB0YXJnZXQ6ICcvaW5kZXguaHRtbCcsXG4gICAgICAgICAgc3RhdHVzOiAnNDA0LTIwMCdcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGJyYW5jaFxuICAgIGNvbnN0IGJyYW5jaE5hbWUgPSBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nID8gJ21haW4nIDogcHJvcHMuZW52aXJvbm1lbnQ7XG4gICAgY29uc3QgYnJhbmNoID0gbmV3IGFtcGxpZnkuQ2ZuQnJhbmNoKHRoaXMsICdBbXBsaWZ5QnJhbmNoJywge1xuICAgICAgYXBwSWQ6IHRoaXMuYW1wbGlmeUFwcC5hdHRyQXBwSWQsXG4gICAgICBicmFuY2hOYW1lLFxuICAgICAgZGVzY3JpcHRpb246IGAke3Byb3BzLmVudmlyb25tZW50fSBlbnZpcm9ubWVudCBicmFuY2hgLFxuICAgICAgZW5hYmxlQXV0b0J1aWxkOiB0cnVlLFxuICAgICAgZW5hYmxlUGVyZm9ybWFuY2VNb2RlOiBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nLFxuICAgICAgXG4gICAgICAvLyBFbnZpcm9ubWVudCB2YXJpYWJsZXMgKGJyYW5jaC1zcGVjaWZpYyBvdmVycmlkZXMpXG4gICAgICBlbnZpcm9ubWVudFZhcmlhYmxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgbmFtZTogJ05FWFRfUFVCTElDX0VOVklST05NRU5UJyxcbiAgICAgICAgICB2YWx1ZTogcHJvcHMuZW52aXJvbm1lbnRcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0pO1xuXG4gICAgLy8gQ3VzdG9tIGRvbWFpbiAoaWYgcHJvdmlkZWQpXG4gICAgaWYgKHByb3BzLmRvbWFpbk5hbWUpIHtcbiAgICAgIGNvbnN0IGRvbWFpbk5hbWUgPSBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2R1Y3Rpb24nIFxuICAgICAgICA/IHByb3BzLmRvbWFpbk5hbWUgXG4gICAgICAgIDogYCR7cHJvcHMuZW52aXJvbm1lbnR9LiR7cHJvcHMuZG9tYWluTmFtZX1gO1xuXG4gICAgICBjb25zdCBkb21haW4gPSBuZXcgYW1wbGlmeS5DZm5Eb21haW4odGhpcywgJ0FtcGxpZnlEb21haW4nLCB7XG4gICAgICAgIGFwcElkOiB0aGlzLmFtcGxpZnlBcHAuYXR0ckFwcElkLFxuICAgICAgICBkb21haW5OYW1lOiBwcm9wcy5kb21haW5OYW1lLFxuICAgICAgICBzdWJEb21haW5TZXR0aW5nczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGJyYW5jaE5hbWUsXG4gICAgICAgICAgICBwcmVmaXg6IHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZHVjdGlvbicgPyAnJyA6IHByb3BzLmVudmlyb25tZW50XG4gICAgICAgICAgfVxuICAgICAgICBdLFxuICAgICAgICBlbmFibGVBdXRvU3ViRG9tYWluOiBmYWxzZVxuICAgICAgfSk7XG5cbiAgICAgIC8vIE91dHB1dCBkb21haW4gVVJMXG4gICAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQW1wbGlmeURvbWFpblVybCcsIHtcbiAgICAgICAgdmFsdWU6IGBodHRwczovLyR7ZG9tYWluTmFtZX1gLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0FtcGxpZnkgYXBwIGRvbWFpbiBVUkwnXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBTdG9yZSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgaW4gUGFyYW1ldGVyIFN0b3JlIGZvciBvdGhlciBzdGFja3NcbiAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCAnQW1wbGlmeUFwcElkJywge1xuICAgICAgcGFyYW1ldGVyTmFtZTogYC9waG90b2dyYXBoeS1wb3J0Zm9saW8vJHtwcm9wcy5lbnZpcm9ubWVudH0vYW1wbGlmeS9hcHAtaWRgLFxuICAgICAgc3RyaW5nVmFsdWU6IHRoaXMuYW1wbGlmeUFwcC5hdHRyQXBwSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FtcGxpZnkgQXBwIElEJ1xuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBbXBsaWZ5QXBwSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hbXBsaWZ5QXBwLmF0dHJBcHBJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQW1wbGlmeSBBcHAgSUQnLFxuICAgICAgZXhwb3J0TmFtZTogYFBob3RvZ3JhcGh5UG9ydGZvbGlvLSR7cHJvcHMuZW52aXJvbm1lbnR9LUFtcGxpZnlBcHBJZGBcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBbXBsaWZ5QXBwVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7YnJhbmNoTmFtZX0uJHt0aGlzLmFtcGxpZnlBcHAuYXR0ckRlZmF1bHREb21haW59YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQW1wbGlmeSBhcHAgVVJMJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBQaG90b2dyYXBoeVBvcnRmb2xpby0ke3Byb3BzLmVudmlyb25tZW50fS1BbXBsaWZ5QXBwVXJsYFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FtcGxpZnlDb25zb2xlVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vYW1wbGlmeS9ob21lP3JlZ2lvbj0ke3RoaXMucmVnaW9ufSMvJHt0aGlzLmFtcGxpZnlBcHAuYXR0ckFwcElkfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FtcGxpZnkgY29uc29sZSBVUkwnXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==