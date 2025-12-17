# Multi-Environment Deployment Guide

## Environment Setup

### Domain Structure
- **Production**: `yourdomain.com`
- **Staging**: `staging.yourdomain.com`

### Stack Naming
- **Production**: `PhotographyPortfolio-*`
- **Staging**: `PhotographyPortfolio-staging-*`

## Quick Deployment Commands

### Staging Environment
```bash
cd infrastructure
./deploy.sh staging yourdomain.com Z1234567890ABC
```
**Result**: Deploys to `staging.yourdomain.com`

### Production Environment
```bash
cd infrastructure
./deploy.sh production yourdomain.com Z1234567890ABC
```
**Result**: Deploys to `yourdomain.com`

### Without Custom Domain (CloudFront only)
```bash
cd infrastructure
./deploy.sh staging    # or production
```

## Manual Deployment

### Staging
```bash
cdk deploy --all \
  --context environment=staging \
  --context baseDomain=yourdomain.com \
  --context hostedZoneId=Z1234567890ABC
```

### Production
```bash
cdk deploy --all \
  --context environment=production \
  --context baseDomain=yourdomain.com \
  --context hostedZoneId=Z1234567890ABC
```

## Environment Differences

| Feature | Staging | Production |
|---------|---------|------------|
| **Domain** | `staging.yourdomain.com` | `yourdomain.com` |
| **Price Class** | 100 (US/Europe) | All (Global) |
| **HTML Cache** | 5 minutes | 1 hour |
| **Image Cache** | 1 day | 30 days |
| **Asset Cache** | 30 days | 1 year |
| **Rate Limit** | 1000/min | 2000/min |
| **Billing Alarm** | $25 | $100 |

## Workflow Recommendations

### 1. Development Cycle
```bash
# 1. Deploy to staging
./deploy.sh staging yourdomain.com Z1234567890ABC

# 2. Test on staging.yourdomain.com
# 3. Deploy to production when ready
./deploy.sh production yourdomain.com Z1234567890ABC
```

### 2. Content Updates
```bash
# Upload to staging first
aws s3 sync ./frontend/out/ s3://staging-bucket-name/

# Test, then upload to production
aws s3 sync ./frontend/out/ s3://production-bucket-name/
```

### 3. DNS Configuration
Add these records to your domain:

**For staging.yourdomain.com:**
- Type: CNAME
- Name: staging
- Value: `d1234567890.cloudfront.net` (from staging outputs)

**For yourdomain.com:**
- Type: A (Alias)
- Name: @ (apex)
- Value: CloudFront distribution (from production outputs)

## Environment Variables

### Required for Custom Domain
```bash
export BASE_DOMAIN=yourdomain.com
export HOSTED_ZONE_ID=Z1234567890ABC
export ENVIRONMENT=staging  # or production
```

### Optional Configuration
```bash
export CDK_DEFAULT_REGION=us-east-1
export CDK_DEFAULT_ACCOUNT=123456789012
```

## Outputs and Monitoring

### Output Files
- `outputs-staging.json` - Staging deployment details
- `outputs-production.json` - Production deployment details

### Key Outputs
```json
{
  "PhotographyPortfolio-staging-Frontend": {
    "DistributionDomainName": "d1234567890.cloudfront.net",
    "WebsiteUrl": "https://staging.yourdomain.com",
    "WebsiteBucketName": "photographyportfolio-staging-frontend-websitebucket..."
  }
}
```

## Security Considerations

### Staging Environment
- Same security headers as production
- Lower rate limits for testing
- Separate Cognito user pool
- Isolated from production data

### Production Environment
- Full WAF protection
- Higher rate limits
- Production-grade monitoring
- Backup and disaster recovery

## Cost Management

### Staging Optimizations
- Price Class 100 (US/Europe only)
- Lower billing alarm threshold ($25)
- Shorter cache TTLs for faster testing

### Production Optimizations
- Price Class All (global distribution)
- Longer cache TTLs for performance
- Higher billing threshold ($100)

## Troubleshooting

### Certificate Issues
```bash
# Check certificate status
aws acm list-certificates --region us-east-1

# Describe specific certificate
aws acm describe-certificate --certificate-arn arn:aws:acm:...
```

### DNS Propagation
```bash
# Check DNS resolution
dig staging.yourdomain.com
dig yourdomain.com

# Check from different locations
nslookup staging.yourdomain.com 8.8.8.8
```

### Stack Conflicts
```bash
# List all stacks
cdk list

# Delete staging stack if needed
cdk destroy PhotographyPortfolio-staging-Frontend
cdk destroy PhotographyPortfolio-staging-Backend
cdk destroy PhotographyPortfolio-staging-Infra
```

## Best Practices

### 1. Always Test on Staging First
- Deploy new features to staging
- Test functionality and performance
- Validate security headers and SSL
- Check mobile responsiveness

### 2. Use Environment-Specific Configurations
- Different cache TTLs for testing vs production
- Separate monitoring thresholds
- Isolated user pools and data

### 3. Automate Deployments
```bash
# CI/CD pipeline example
./deploy.sh staging yourdomain.com Z1234567890ABC
# Run tests
./deploy.sh production yourdomain.com Z1234567890ABC
```

### 4. Monitor Both Environments
- Set up CloudWatch dashboards
- Configure billing alarms
- Monitor performance metrics
- Track error rates

This multi-environment setup ensures safe, reliable deployments with proper testing before production releases.
