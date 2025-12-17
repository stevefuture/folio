# Professional Photographer Portfolio

A fully serverless, AWS-native portfolio website with dynamic image carousel and admin management capabilities.

## Architecture

- **Frontend**: Next.js 14 with React 18
- **Hosting**: S3 (private) + CloudFront (OAC)
- **Backend**: Lambda + API Gateway
- **Database**: DynamoDB
- **Media**: S3 + Serverless Image Handler
- **Auth**: Cognito (admin MFA)
- **Email**: SES
- **Security**: WAF, IAM least privilege
- **IaC**: AWS CDK

## Features

- Dynamic full-viewport image carousel
- Multi-project portfolio galleries
- Admin content management
- SEO optimized (SSR, JSON-LD)
- WCAG 2.1 AA compliant
- Core Web Vitals optimized

## Structure

```
frontend/     - Next.js application
backend/      - Lambda functions
infrastructure/ - AWS CDK stacks
docs/         - Documentation
```

## Deployment

```bash
cd infrastructure
npm install
cdk deploy --all
```

## Security

- HTTPS everywhere
- CSP headers
- OAC for S3 access
- MFA for admin users
- WAF protection
# folio
