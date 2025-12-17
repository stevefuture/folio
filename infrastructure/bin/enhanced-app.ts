#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EnhancedDevStack } from '../lib/enhanced-dev-stack';

const app = new cdk.App();

const domain = app.node.tryGetContext('domain');
const hostedZoneId = app.node.tryGetContext('hostedZoneId');

new EnhancedDevStack(app, 'PortfolioEnhancedStack', {
  domain,
  hostedZoneId,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    Project: 'PhotographyPortfolio',
    Environment: 'enhanced'
  }
});
