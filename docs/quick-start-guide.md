# Quick Start Guide - Photography Portfolio

## 🚀 Choose Your Deployment Phase

### Phase 1: MVP Launch ($5-15/month)
**Perfect for**: Personal portfolios, getting started quickly
**Timeline**: 30 minutes setup

```bash
# Clone and setup
git clone <your-repo>
cd folio/infrastructure
npm install

# Deploy minimal version
./deploy.sh staging yourdomain.com Z1234567890ABC --minimal
```

**What you get**:
- ✅ Professional website with custom domain
- ✅ Image gallery with basic optimization
- ✅ Contact form
- ✅ Admin interface for content updates
- ✅ HTTPS security

### Phase 2: Professional ($25-50/month)
**Perfect for**: Professional photographers, small businesses
**Timeline**: 1 hour setup

```bash
# Deploy enhanced version with security
./deploy.sh staging yourdomain.com Z1234567890ABC --enhanced
```

**Additional features**:
- ✅ Advanced image optimization (WebP/AVIF)
- ✅ Multi-factor authentication
- ✅ Enhanced security (WAF protection)
- ✅ SEO automation
- ✅ Performance monitoring

### Phase 3: Enterprise ($50-100/month)
**Perfect for**: High-traffic sites, business-critical portfolios
**Timeline**: 2 hours setup

```bash
# Deploy full enterprise version
./deploy.sh production yourdomain.com Z1234567890ABC --enterprise
```

**Enterprise features**:
- ✅ Multi-region disaster recovery
- ✅ Automated backups
- ✅ Advanced security monitoring
- ✅ 99.9% uptime SLA
- ✅ Cost optimization automation

## 📋 Prerequisites

1. **AWS Account** with appropriate permissions
2. **Domain name** registered (optional for testing)
3. **AWS CLI** configured with credentials
4. **Node.js** 18+ installed

## ⚡ 5-Minute Setup (No Domain)

```bash
# Quick test deployment without custom domain
cd folio/infrastructure
./deploy.sh staging --minimal

# Your site will be available at the CloudFront URL
```

## 🔧 Configuration

### Environment Variables
```bash
# Optional: Set deployment phase
export DEPLOYMENT_PHASE=minimal  # or enhanced, enterprise

# Optional: Set alert email for cost monitoring
export ALERT_EMAIL=your-email@domain.com
```

### Domain Setup
1. **Purchase domain** (Route 53 recommended)
2. **Get Hosted Zone ID** from Route 53 console
3. **Deploy with domain**:
   ```bash
   ./deploy.sh production yourdomain.com Z1234567890ABC --enhanced
   ```

## 📊 Cost Monitoring

Each phase includes automatic cost monitoring:

- **Budget alerts** at 80% and 100% of expected costs
- **Weekly optimization** recommendations
- **Cost dashboard** in CloudWatch
- **Automatic cleanup** of unused resources

## 🔄 Upgrading Between Phases

### Minimal → Enhanced
```bash
./deploy.sh staging yourdomain.com Z1234567890ABC --enhanced
```

### Enhanced → Enterprise
```bash
./deploy.sh production yourdomain.com Z1234567890ABC --enterprise
```

**Zero downtime upgrades** - your site stays online during transitions.

## 🛠️ Post-Deployment Steps

### 1. Upload Content
```bash
# Upload images to S3 bucket
aws s3 sync ./images/ s3://your-portfolio-bucket/images/

# Update portfolio data in DynamoDB
# Use the admin interface at https://yourdomain.com/admin
```

### 2. Configure Admin Access
```bash
# Create admin user in Cognito
aws cognito-idp admin-create-user \
  --user-pool-id <pool-id> \
  --username admin \
  --temporary-password TempPass123! \
  --message-action SUPPRESS
```

### 3. Test Everything
- ✅ Website loads at your domain
- ✅ Images display correctly
- ✅ Contact form works
- ✅ Admin login functions
- ✅ Mobile responsiveness

## 🚨 Troubleshooting

### Common Issues

**Domain not resolving**:
```bash
# Check DNS propagation
dig yourdomain.com
nslookup yourdomain.com
```

**Images not loading**:
```bash
# Verify S3 bucket permissions
aws s3api get-bucket-policy --bucket your-portfolio-bucket
```

**High costs**:
```bash
# Check cost dashboard
aws cloudwatch get-dashboard --dashboard-name portfolio-costs-staging
```

### Getting Help

1. **Check CloudFormation** console for deployment status
2. **Review CloudWatch logs** for Lambda function errors
3. **Monitor cost dashboard** for unexpected charges
4. **Use AWS Support** for infrastructure issues

## 📈 Scaling Recommendations

### Traffic Milestones

**1,000+ visitors/month**: Upgrade to Enhanced
- Better performance and security
- Image optimization reduces load times
- Admin authentication for content management

**10,000+ visitors/month**: Upgrade to Enterprise
- Multi-region reliability
- Advanced monitoring and alerting
- Automated backup and disaster recovery

**100,000+ visitors/month**: Consider Phase 4 optimizations
- Reserved capacity for predictable costs
- Advanced caching strategies
- Performance tuning

## 🎯 Success Metrics

### Phase 1 Success
- Site loads in <3 seconds
- Images display properly
- Contact form submissions work
- Monthly cost under $15

### Phase 2 Success
- Site loads in <2 seconds
- WebP images served to supported browsers
- Admin can update content easily
- Monthly cost under $50

### Phase 3 Success
- 99.9% uptime achieved
- Disaster recovery tested
- Security monitoring active
- Monthly cost under $100

## 🔗 Useful Commands

```bash
# Check deployment status
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Monitor costs
aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text)

# View CloudFront distributions
aws cloudfront list-distributions --query 'DistributionList.Items[].{Id:Id,Domain:DomainName,Status:Status}'

# Check S3 buckets
aws s3 ls

# View DynamoDB tables
aws dynamodb list-tables
```

Start with Phase 1 to get online quickly, then upgrade as your needs grow!
