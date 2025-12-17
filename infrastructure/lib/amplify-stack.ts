import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

interface AmplifyStackProps extends cdk.StackProps {
  environment: string;
  domainName?: string;
  repositoryUrl: string;
  accessToken: string;
}

export class AmplifyStack extends cdk.Stack {
  public readonly amplifyApp: amplify.CfnApp;

  constructor(scope: Construct, id: string, props: AmplifyStackProps) {
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
