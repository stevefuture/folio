#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfrastructureStack } from '../lib/infrastructure-stack';
import { FrontendStack } from '../lib/frontend-stack';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'us-east-1'
};

const infrastructure = new InfrastructureStack(app, 'PhotographyPortfolioInfra', { env });
const backend = new BackendStack(app, 'PhotographyPortfolioBackend', { 
  env,
  table: infrastructure.table,
  bucket: infrastructure.bucket
});
const frontend = new FrontendStack(app, 'PhotographyPortfolioFrontend', { 
  env,
  api: backend.api,
  userPool: infrastructure.userPool
});
