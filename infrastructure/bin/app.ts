#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { BackendStack } from '../lib/backend-stack';
import { ImageOptimizationStack } from '../lib/image-optimization-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

// Environment configuration
const environment = app.node.tryGetContext('environment') || process.env.ENVIRONMENT || 'staging';
const baseDomain = app.node.tryGetContext('baseDomain') || process.env.BASE_DOMAIN;
const hostedZoneId = app.node.tryGetContext('hostedZoneId') || process.env.HOSTED_ZONE_ID;

// Domain configuration based on environment
let domainName: string | undefined;
if (baseDomain) {
  domainName = environment === 'production' ? baseDomain : `${environment}.${baseDomain}`;
}

const stackPrefix = environment === 'production' ? 'PhotographyPortfolio' : `PhotographyPortfolio-${environment}`;

console.log(`🚀 Deploying ${environment} environment`);
if (domainName) {
  console.log(`🌐 Domain: ${domainName}`);
}

const infrastructure = new InfrastructureStack(app, `${stackPrefix}-Infra`, { 
  env,
  tags: {
    Environment: environment,
    Project: 'PhotographyPortfolio'
  }
});

const backend = new BackendStack(app, `${stackPrefix}-Backend`, { 
  env,
  table: infrastructure.table,
  bucket: infrastructure.bucket,
  tags: {
    Environment: environment,
    Project: 'PhotographyPortfolio'
  }
});

const imageOptimization = new ImageOptimizationStack(app, `${stackPrefix}-ImageOptimization`, {
  env,
  sourceBucket: infrastructure.bucket,
  environment,
  tags: {
    Environment: environment,
    Project: 'PhotographyPortfolio'
  }
});

const frontend = new FrontendStack(app, `${stackPrefix}-Frontend`, { 
  env,
  api: backend.api,
  userPool: infrastructure.userPool,
  domainName,
  hostedZoneId,
  environment,
  tags: {
    Environment: environment,
    Project: 'PhotographyPortfolio'
  }
});
