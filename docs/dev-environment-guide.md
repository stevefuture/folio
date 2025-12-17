# Dev Environment Management Guide

## 🎯 **Cost-Optimized Development Setup**

The dev environment is designed to be **completely shut down** when not in use, saving **$3-8/month** in AWS costs.

## 💰 **Cost Breakdown**

### **When Running**
```
CloudFront:       $1-2/month   (minimal traffic)
S3 Storage:       $0.23/month  (10GB images)
DynamoDB:         $0.50/month  (on-demand, minimal data)
Lambda:           $0.20/month  (ARM64, 512MB, limited concurrency)
API Gateway:      $0.10/month  (regional, minimal requests)
CloudWatch:       $0.50/month  (7-day log retention)
Route 53:         $0.50/month  (if using custom domain)
─────────────────────────────────────────────────
TOTAL:           $3-8/month
```

### **When Stopped**
```
All Resources:    $0/month    (everything deleted)
─────────────────────────────────────────────────
SAVINGS:         $3-8/month
```

## 🚀 **Quick Commands**

### **Start Development**
```bash
# With custom domain
./scripts/dev-environment.sh start dev.myportfolio.com Z1234567890ABC

# Without custom domain (uses CloudFront URL)
./scripts/dev-environment.sh start

# Ready in: 10-15 minutes
# Cost: $3-8/month while running
```

### **Stop Development (Save Money)**
```bash
./scripts/dev-environment.sh stop

# Deletes ALL dev resources
# Savings: $3-8/month
# Data: Completely removed (use for dev only!)
```

### **Check Status**
```bash
./scripts/dev-environment.sh status

# Shows:
# - Active CloudFormation stacks
# - S3 buckets and storage usage
# - DynamoDB tables
# - Lambda functions
# - CloudFront distributions
```

### **View Cost Information**
```bash
./scripts/dev-environment.sh cost

# Shows detailed cost breakdown
# Running vs stopped comparison
# Money-saving tips
```

## 🔧 **Dev Environment Features**

### **Cost Optimizations**
- **On-Demand DynamoDB**: Pay only for actual usage
- **ARM64 Lambda**: 20% cost savings vs x86
- **Minimal Memory**: 512MB vs 1024MB production
- **Short Log Retention**: 7 days vs 30 days
- **Regional API**: No global endpoints
- **Price Class 100**: US/Europe only CDN
- **Auto-Cleanup**: 30-day file expiration

### **Development-Friendly**
- **Fast Deployment**: 10-15 minutes to start
- **Easy Cleanup**: One command to delete everything
- **Same Architecture**: Identical to production structure
- **Isolated**: Completely separate from staging/production
- **Scalable**: Can upgrade to enhanced features if needed

## 📋 **Typical Development Workflow**

### **Daily Development**
```bash
# Morning: Start dev environment
./scripts/dev-environment.sh start dev.myportfolio.com Z123

# Develop and test your changes
# Access at: https://dev.myportfolio.com

# Evening: Stop to save money
./scripts/dev-environment.sh stop
```

### **Weekend/Holiday Breaks**
```bash
# Stop environment during breaks
./scripts/dev-environment.sh stop

# Restart when you return
./scripts/dev-environment.sh start dev.myportfolio.com Z123
```

### **Cost Savings Example**
```
Always-on dev environment:    $8/month  × 12 = $96/year
Stop nights/weekends:         $4/month  × 12 = $48/year
Stop during 2-week vacation:  $6/month  × 12 = $72/year

SAVINGS: $24-48/year just by stopping when not developing!
```

## ⚠️ **Important Notes**

### **Data Persistence**
- **Dev data is NOT persistent** - stopping deletes everything
- **Use for development only** - not for important data
- **Export important test data** before stopping
- **Production/staging data is always safe**

### **Domain Configuration**
- **Custom domain optional** for dev environment
- **CloudFront URL works fine** for development
- **DNS changes take 5-10 minutes** to propagate
- **SSL certificate auto-provisioned** if using custom domain

### **Resource Limits**
- **Lambda concurrency**: Limited to 5 concurrent executions
- **API throttling**: 100 requests/second (vs 1000 in production)
- **Storage**: 30-day auto-cleanup of old files
- **Monitoring**: Basic CloudWatch only

## 🎯 **When to Use Each Environment**

### **Dev Environment** ($3-8/month, can stop)
- **Active development** and feature building
- **Learning AWS services** and testing configurations
- **Experimenting** with new ideas
- **Personal projects** and prototyping

### **Staging Environment** ($15-30/month, always-on)
- **Pre-production testing** with production-like data
- **Client demos** and stakeholder reviews
- **Integration testing** with external services
- **Performance testing** under load

### **Production Environment** ($50-880/month, always-on)
- **Live website** serving real users
- **Business-critical** operations
- **Full monitoring** and alerting
- **Disaster recovery** and backups

## 🔄 **Migration Between Environments**

### **Dev → Staging**
```bash
# Test in dev first
./scripts/dev-environment.sh start

# When ready, deploy to staging
./deploy.sh staging staging.myportfolio.com Z123 --enhanced

# Keep dev running for continued development
```

### **Staging → Production**
```bash
# Final testing in staging
./production-readiness-check.sh staging.myportfolio.com staging

# Deploy to production
./deploy.sh production myportfolio.com Z123 --enterprise

# Production readiness validation
./production-readiness-check.sh myportfolio.com production
```

## 💡 **Pro Tips**

### **Maximize Savings**
- **Stop every night** if not doing evening development
- **Stop during weekends** unless actively coding
- **Stop during vacations** and breaks
- **Use CloudFront URL** instead of custom domain for simple testing

### **Development Efficiency**
- **Start environment** only when ready to code
- **Keep staging running** for demos and testing
- **Use production** for final validation before launch
- **Export test data** before stopping dev environment

### **Cost Monitoring**
```bash
# Check current AWS costs
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity MONTHLY \
  --metrics BlendedCost

# Monitor dev environment costs specifically
aws ce get-cost-and-usage \
  --time-period Start=2024-01-01,End=2024-01-31 \
  --granularity DAILY \
  --group-by Type=DIMENSION,Key=SERVICE \
  --filter file://dev-cost-filter.json
```

This dev environment setup gives you **full development capabilities** while **minimizing costs** through smart resource management and the ability to completely shut down when not needed.
