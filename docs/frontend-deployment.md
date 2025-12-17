# Frontend Deployment Guide

## Deployment Options

### Option 1: S3 + CloudFront (Static Export)
- **Best for**: Cost optimization, simple deployment
- **SSR**: Not supported (static export only)
- **Features**: Full CDN, custom domains, security headers

### Option 2: AWS Amplify (Full SSR)
- **Best for**: Full Next.js features, automatic deployments
- **SSR**: Full support including API routes
- **Features**: Git-based deployments, preview branches, built-in CI/CD

## Environment Configuration

### Environment Variables Structure

**Development** (`.env.development`):
```bash
NEXT_PUBLIC_ENVIRONMENT=development
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_ADMIN=true
NEXT_PUBLIC_DEBUG=true
```

**Staging** (`.env.staging`):
```bash
NEXT_PUBLIC_ENVIRONMENT=staging
NEXT_PUBLIC_API_URL=https://staging-api.yourdomain.com
NEXT_PUBLIC_SITE_URL=https://staging.yourdomain.com
NEXT_PUBLIC_ENABLE_ADMIN=true
```

**Production** (`.env.production`):
```bash
NEXT_PUBLIC_ENVIRONMENT=production
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

### Secure Environment Variables

**For S3 Deployment**:
- Store in AWS Systems Manager Parameter Store
- Access via build scripts or Lambda@Edge

**For Amplify Deployment**:
- Set in Amplify Console or CDK
- Automatic injection during build

## S3 + CloudFront Deployment

### Manual Deployment
```bash
# Build and export
npm run export

# Deploy to S3
aws s3 sync out/ s3://your-bucket-name/ --delete

# Invalidate CloudFront
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

### Automated Deployment Scripts
```bash
# Staging deployment
npm run deploy:staging

# Production deployment  
npm run deploy:production
```

### CDK Deployment
```bash
cd infrastructure
./deploy.sh staging yourdomain.com Z1234567890ABC
./deploy.sh production yourdomain.com Z1234567890ABC
```

## AWS Amplify Deployment

### Setup via CDK
```bash
cd infrastructure
cdk deploy PhotographyPortfolio-Amplify-staging
cdk deploy PhotographyPortfolio-Amplify-production
```

### Manual Setup via Console

1. **Connect Repository**:
   - Go to AWS Amplify Console
   - Connect GitHub repository
   - Select branch (main for production, staging for staging)

2. **Configure Build Settings**:
   - Use provided `amplify.yml`
   - Set environment variables
   - Configure custom domain

3. **Environment Variables**:
   ```
   DEPLOYMENT_TARGET=amplify
   NEXT_PUBLIC_ENVIRONMENT=production
   NEXT_PUBLIC_API_URL=https://api.yourdomain.com
   ```

### Branch Configuration

**Production Branch** (`main`):
- Domain: `yourdomain.com`
- Environment: `production`
- Analytics enabled
- Admin disabled

**Staging Branch** (`staging`):
- Domain: `staging.yourdomain.com`
- Environment: `staging`
- Admin enabled
- Debug mode on

## Environment-Specific Features

### Development
- Hot reload
- Debug mode enabled
- Admin panel accessible
- Mock API support
- Source maps included

### Staging
- Production build
- Admin panel accessible
- Environment banner
- Analytics disabled
- Debug logging

### Production
- Optimized build
- Admin panel disabled
- Analytics enabled
- Console logs removed
- Performance monitoring

## Security Configuration

### Content Security Policy
```javascript
// Automatically configured per environment
const cspDirectives = [
  "default-src 'self'",
  "img-src 'self' data: https: blob:",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.googletagmanager.com",
  "connect-src 'self' https://*.amazonaws.com"
];
```

### Security Headers
- **HSTS**: Enforced HTTPS
- **X-Frame-Options**: Prevent clickjacking
- **X-Content-Type-Options**: Prevent MIME sniffing
- **Referrer-Policy**: Control referrer information

## Performance Optimization

### Build Optimization
- **Bundle Splitting**: Vendor chunks separated
- **Tree Shaking**: Unused code removed
- **Image Optimization**: WebP/AVIF support
- **CSS Optimization**: Minification and purging

### Caching Strategy
- **Static Assets**: 1 year cache
- **HTML**: 1 hour cache (staging), 24 hours (production)
- **API Responses**: No cache
- **Images**: Immutable cache with optimization

## Monitoring & Analytics

### Build Monitoring
```bash
# Check build status (Amplify)
aws amplify get-job --app-id APP_ID --branch-name main --job-id JOB_ID

# Check deployment (S3)
aws s3 ls s3://your-bucket-name/ --recursive --human-readable
```

### Performance Monitoring
- **Core Web Vitals**: Automatic tracking
- **Google Analytics**: Environment-specific
- **Error Tracking**: Console errors in development
- **Build Metrics**: Bundle size analysis

## Troubleshooting

### Common Issues

**Build Failures**:
```bash
# Check Node.js version
node --version  # Should be 18+

# Clear cache
rm -rf .next node_modules
npm install
npm run build
```

**Environment Variables Not Loading**:
```bash
# Check file naming
ls -la .env*

# Verify NEXT_PUBLIC_ prefix for client-side variables
echo $NEXT_PUBLIC_API_URL
```

**S3 Deployment Issues**:
```bash
# Check AWS credentials
aws sts get-caller-identity

# Verify bucket permissions
aws s3api get-bucket-policy --bucket your-bucket-name
```

**Amplify Build Issues**:
```bash
# Check build logs in Amplify Console
# Verify amplify.yml configuration
# Check environment variables in Amplify settings
```

### Performance Issues

**Large Bundle Size**:
- Enable bundle analyzer: `ANALYZE=true npm run build`
- Check for duplicate dependencies
- Implement code splitting

**Slow Loading**:
- Enable image optimization
- Check CDN configuration
- Verify caching headers

## CI/CD Integration

### GitHub Actions (S3 Deployment)
```yaml
name: Deploy to S3
on:
  push:
    branches: [main, staging]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run deploy:${{ github.ref_name }}
```

### Amplify Auto-Deployment
- Automatic on git push
- Preview deployments for PRs
- Rollback capabilities
- Build notifications

## Cost Optimization

### S3 + CloudFront
- **Estimated Cost**: $5-20/month
- **Optimization**: Intelligent tiering, lifecycle policies
- **Monitoring**: CloudWatch billing alarms

### Amplify
- **Estimated Cost**: $15-50/month
- **Optimization**: Build minute limits, storage cleanup
- **Monitoring**: Amplify usage dashboard

This deployment configuration provides flexible, secure, and scalable options for hosting the photography portfolio with proper environment separation and security controls.
