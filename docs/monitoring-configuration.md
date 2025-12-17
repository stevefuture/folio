# CloudWatch Monitoring Configuration

## 📊 Dashboard Overview

### Main Portfolio Dashboard
**URL**: `https://console.aws.amazon.com/cloudwatch/home#dashboards:name=portfolio-{environment}`

**Widgets**:
- **Frontend Performance**: CloudFront requests, error rates, cache hit ratio
- **Backend Performance**: Lambda invocations, errors, duration, DynamoDB operations  
- **Security Monitoring**: WAF blocked requests, active alarms

### Performance Dashboard
**URL**: `https://console.aws.amazon.com/cloudwatch/home#dashboards:name=portfolio-performance-{environment}`

**Widgets**:
- **Response Times**: Origin latency, API duration
- **Throughput**: Request volume, invocation rates

### Security Dashboard  
**URL**: `https://console.aws.amazon.com/cloudwatch/home#dashboards:name=portfolio-security-{environment}`

**Widgets**:
- **Threat Detection**: Blocked requests, suspicious IPs, attack attempts
- **Security Events**: Real-time log analysis

## 🚨 Critical Alarms

### Frontend Performance
```typescript
// High 4xx Error Rate (>5%)
Metric: AWS/CloudFront/4xxErrorRate
Threshold: 5%
Action: SNS Alert

// Slow Response Time (>3s)  
Metric: AWS/CloudFront/OriginLatency
Threshold: 3000ms
Action: SNS Alert
```

### Backend Errors
```typescript
// API Lambda Errors (>5 errors)
Metric: AWS/Lambda/Errors
Threshold: 5 errors
Action: SNS Alert

// API Duration (>10s)
Metric: AWS/Lambda/Duration  
Threshold: 10000ms
Action: SNS Alert
```

### Database Issues
```typescript
// DynamoDB Throttling
Metric: AWS/DynamoDB/ThrottledRequests
Threshold: 1 throttle
Action: SNS Alert
```

### Security Threats
```typescript
// Suspicious Activity (>100 blocked/5min)
Metric: AWS/WAFv2/BlockedRequests
Threshold: 100 requests
Action: SNS Alert

// Attack Attempts (>5 attempts)
Metric: Portfolio/Security/AttackAttempts  
Threshold: 5 attempts
Action: SNS Alert
```

## 📋 Log Groups & Retention

### Application Logs
```
/aws/lambda/{api-function-name}     - 30 days
/aws/lambda/{image-opt-function}    - 30 days  
/aws/lambda/{seo-function}          - 30 days
```

### Security Logs
```
/aws/wafv2/portfolio-{environment}  - 30 days
/aws/cloudtrail/portfolio-{env}     - 90 days
```

## 🔍 Log Insights Queries

### Error Analysis
```sql
-- API Errors
fields @timestamp, @message, @requestId
| filter @message like /ERROR/
| sort @timestamp desc
| limit 100

-- Performance Issues  
fields @timestamp, @duration, @requestId
| filter @type = "REPORT"
| stats avg(@duration), max(@duration) by bin(5m)
```

### Security Analysis
```sql
-- Security Events
fields @timestamp, @message
| filter @message like /BLOCK/ or @message like /RATE_LIMIT/
| stats count() by bin(1h)

-- Top Blocked IPs
fields @timestamp, @message  
| filter @message like /BLOCK/
| parse @message /clientIP":"(?<ip>[^"]+)/
| stats count() as blocks by ip
| sort blocks desc
| limit 10
```

## 📈 Key Metrics to Monitor

### Frontend Performance
- **Cache Hit Rate**: >90% (good), <80% (investigate)
- **4xx Error Rate**: <1% (good), >5% (critical)  
- **Origin Latency**: <1s (good), >3s (critical)

### Backend Performance  
- **Lambda Duration**: <2s (good), >10s (critical)
- **Lambda Errors**: <1% (good), >5% (critical)
- **DynamoDB Latency**: <10ms (good), >100ms (investigate)

### Security Metrics
- **Blocked Requests**: <10/min (normal), >100/5min (investigate)
- **Failed Logins**: <5/hour (normal), >20/hour (investigate)

## 🔧 Monitoring Setup Commands

### Deploy Monitoring Stack
```bash
# Include monitoring in deployment
./deploy.sh production yourdomain.com Z123 --enterprise

# Set alert email
export ALERT_EMAIL=admin@yourdomain.com
```

### View Dashboards
```bash
# Get dashboard URLs
aws cloudwatch list-dashboards --query 'DashboardEntries[?contains(DashboardName, `portfolio`)].{Name:DashboardName,URL:DashboardArn}'

# Export dashboard
aws cloudwatch get-dashboard --dashboard-name portfolio-production
```

### Check Alarms
```bash
# List active alarms
aws cloudwatch describe-alarms --state-value ALARM --query 'MetricAlarms[].{Name:AlarmName,State:StateValue,Reason:StateReason}'

# Alarm history
aws cloudwatch describe-alarm-history --alarm-name HighErrorRate
```

## 📱 Alert Configuration

### SNS Topic Setup
```bash
# Subscribe to alerts
aws sns subscribe \
  --topic-arn arn:aws:sns:region:account:portfolio-alerts-production \
  --protocol email \
  --notification-endpoint admin@yourdomain.com
```

### Alert Severity Levels
- **CRITICAL**: Service down, high error rates, security breaches
- **WARNING**: Performance degradation, moderate error rates  
- **INFO**: Deployment notifications, maintenance windows

## 🎯 Monitoring Best Practices

### Dashboard Organization
- **Executive View**: High-level KPIs and business metrics
- **Operations View**: Technical metrics and system health
- **Security View**: Threat detection and security events

### Alarm Tuning
- **Start Conservative**: Set thresholds based on baseline performance
- **Reduce Noise**: Adjust thresholds to minimize false positives
- **Escalation**: Different notification channels for different severities

### Log Management
- **Structured Logging**: Use consistent JSON format
- **Correlation IDs**: Track requests across services
- **Retention Policies**: Balance cost vs. compliance requirements

## 🔄 Automated Responses

### Auto-Scaling Triggers
```typescript
// Scale Lambda concurrency on high load
if (invocations > threshold) {
  increaseConcurrency();
}

// Scale DynamoDB on throttling
if (throttles > 0) {
  increaseCapacity();
}
```

### Security Automation
```typescript
// Block suspicious IPs
if (blockedRequests > 100) {
  addToBlockList(sourceIP);
  notifySecurityTeam();
}
```

This monitoring configuration provides comprehensive visibility into your serverless portfolio's performance, errors, and security events with automated alerting and response capabilities.
