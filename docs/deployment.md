# Deployment Guide

## Prerequisites

1. **AWS CLI configured** with appropriate permissions
2. **Node.js 18+** installed
3. **AWS CDK** installed globally: `npm install -g aws-cdk`

## Quick Deployment

### Without Custom Domain
```bash
cd infrastructure
./deploy.sh
```

### With Custom Domain
```bash
cd infrastructure
./deploy.sh yourdomain.com Z1234567890ABC
```

## Manual Deployment Steps

### 1. Install Dependencies
```bash
cd infrastructure
npm install
```

### 2. Bootstrap CDK (first time only)
```bash
cdk bootstrap
```

### 3. Deploy Infrastructure
```bash
# Without domain
cdk deploy --all

# With domain
cdk deploy --all \
  --context domainName=yourdomain.com \
  --context hostedZoneId=Z1234567890ABC
```

## Infrastructure Components

### ✅ S3 Bucket (Private)
- **Encryption**: SSE-S3
- **Versioning**: Enabled
- **Public Access**: Blocked
- **Lifecycle**: Old versions deleted after 30 days

### ✅ CloudFront Distribution
- **Protocol**: HTTPS-only (TLS 1.2+)
- **Caching**: Optimized for static assets
- **Compression**: Enabled
- **HTTP Version**: HTTP/2 and HTTP/3

### ✅ Origin Access Control (OAC)
- **S3 Access**: CloudFront only
- **Signing**: SigV4 always
- **Security**: Explicit deny for direct access

### ✅ Security Headers
- **HSTS**: 1 year, includeSubdomains, preload
- **CSP**: Restrictive content security policy
- **X-Frame-Options**: DENY
- **X-Content-Type-Options**: nosniff
- **Referrer-Policy**: strict-origin-when-cross-origin

### ✅ ACM Certificate (if domain provided)
- **Validation**: DNS validation
- **Domains**: apex + www subdomain
- **Auto-renewal**: Enabled

### ✅ Route 53 Records (if domain provided)
- **A Records**: IPv4 alias to CloudFront
- **AAAA Records**: IPv6 alias to CloudFront
- **Domains**: Both apex and www

## Cache Behaviors

| Path Pattern | TTL | Compression | Headers |
|--------------|-----|-------------|---------|
| Default | 1 day | ✅ | Security headers |
| `/images/*` | 30 days | ✅ | Cache-friendly |
| `*.html` | 1 hour | ✅ | Short cache |
| `/api/*` | No cache | ❌ | CORS enabled |

## Security Features

### 🔒 HTTPS Enforcement
- Redirect HTTP to HTTPS
- TLS 1.2+ minimum
- Perfect Forward Secrecy

### 🛡️ Content Security Policy
```
default-src 'self'; 
img-src 'self' data: https:; 
script-src 'self' 'unsafe-eval' 'unsafe-inline'; 
style-src 'self' 'unsafe-inline'; 
font-src 'self' data:; 
connect-src 'self' https://*.amazonaws.com;
```

### 🚫 Access Controls
- S3 bucket: CloudFront OAC only
- Direct S3 access: Explicitly denied
- API endpoints: CORS configured

## Post-Deployment Steps

### 1. Upload Website Files
```bash
# Get bucket name from outputs
aws s3 sync ./frontend/out/ s3://BUCKET-NAME/
```

### 2. Invalidate CloudFront Cache
```bash
# Get distribution ID from outputs
aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION-ID \
  --paths "/*"
```

### 3. Configure DNS (Custom Domain)
If using external DNS provider, point to CloudFront:
- **Type**: CNAME
- **Name**: yourdomain.com
- **Value**: d1234567890.cloudfront.net

### 4. Test Security Headers
```bash
curl -I https://yourdomain.com
```

Should include:
- `strict-transport-security`
- `x-frame-options: DENY`
- `x-content-type-options: nosniff`
- `content-security-policy`

## Troubleshooting

### Certificate Validation Stuck
- Ensure DNS records are properly configured
- Check Route 53 hosted zone settings
- Validation can take up to 30 minutes

### 403 Forbidden Errors
- Verify OAC configuration
- Check S3 bucket policy
- Ensure files are uploaded to correct bucket

### Cache Issues
- Create CloudFront invalidation
- Check cache behaviors configuration
- Verify TTL settings

## Cost Optimization

### Estimated Monthly Costs (Low Traffic)
- **CloudFront**: $1-5
- **S3**: $1-3
- **Route 53**: $0.50 (hosted zone)
- **ACM**: Free
- **Total**: ~$5-10/month

### Cost Monitoring
- Billing alarms configured at $50/month
- CloudWatch metrics enabled
- Usage dashboards available

## Security Best Practices

✅ **Implemented**
- HTTPS everywhere
- Security headers
- Private S3 bucket
- OAC for S3 access
- WAF protection
- Certificate auto-renewal

🔄 **Recommended**
- Regular security audits
- CloudTrail logging
- Access logging analysis
- Penetration testing
