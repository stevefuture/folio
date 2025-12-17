#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SimpleEnhancedStack } from '../lib/simple-enhanced-stack';

const app = new cdk.App();

new SimpleEnhancedStack(app, 'PortfolioSimpleEnhancedStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    Project: 'PhotographyPortfolio',
    Environment: 'enhanced'
  }
});
