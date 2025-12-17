#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LeanTestingStack } from '../lib/lean-testing-stack';

const app = new cdk.App();

new LeanTestingStack(app, 'PortfolioLeanTestingStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    Project: 'PhotographyPortfolio',
    Environment: 'lean-testing',
    CostOptimized: 'true'
  }
});
