#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SimpleDevStack } from '../lib/simple-dev-stack';

const app = new cdk.App();

const domain = app.node.tryGetContext('domain');
const hostedZoneId = app.node.tryGetContext('hostedZoneId');

new SimpleDevStack(app, 'PortfolioDevStack', {
  domain,
  hostedZoneId,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  tags: {
    Project: 'PhotographyPortfolio',
    Environment: 'dev'
  }
});
