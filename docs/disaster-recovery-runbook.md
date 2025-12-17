# Disaster Recovery Runbook - Photography Portfolio

## Emergency Contact Information

**Primary Contacts**
- System Administrator: [Your Email]
- AWS Account Owner: [Owner Email]
- Emergency Phone: [Phone Number]

**AWS Support**
- Support Plan: [Basic/Developer/Business/Enterprise]
- Case Priority: High (Production system down)

## Recovery Scenarios & Procedures

### Scenario 1: Regional Failure (us-east-1)
**Symptoms**: Complete inability to access application, AWS console shows region issues
**RTO Target**: 15 minutes (automatic) + 30 minutes (verification)
**RPO Target**: 5 minutes

#### Automatic Failover Process
1. **Route 53 Health Checks** detect primary region failure
2. **DNS automatically routes** traffic to us-west-2
3. **CloudFront** serves from backup distribution
4. **Application connects** to Global Table replica

#### Manual Verification Steps
```bash
# 1. Verify DNS propagation
dig yourdomain.com
nslookup yourdomain.com 8.8.8.8

# 2. Test application functionality
curl -I https://yourdomain.com/health
curl -I https://yourdomain.com/api/projects

# 3. Check DynamoDB Global Table status
aws dynamodb describe-table --table-name PhotographyPortfolio-global --region us-west-2

# 4. Verify S3 access
aws s3 ls s3://portfolio-backup-production-us-west-2/ --region us-west-2
```

#### Post-Failover Actions
- [ ] Monitor application performance in backup region
- [ ] Notify stakeholders of regional failover
- [ ] Update monitoring dashboards to backup region
- [ ] Prepare for failback when primary region recovers

### Scenario 2: Data Corruption/Accidental Deletion
**Symptoms**: Missing or corrupted data in DynamoDB or S3
**RTO Target**: 30 minutes
**RPO Target**: 1 hour (PITR) or 24 hours (daily backup)

#### DynamoDB Recovery Procedure
```bash
# 1. Identify corruption timestamp
aws dynamodb describe-table --table-name PhotographyPortfolio

# 2. List available backups
aws dynamodb list-backups --table-name PhotographyPortfolio

# 3. Restore from Point-in-Time Recovery
aws dynamodb restore-table-from-backup \
  --target-table-name PhotographyPortfolio-restored \
  --backup-arn arn:aws:dynamodb:us-east-1:ACCOUNT:table/PhotographyPortfolio/backup/BACKUP-ID

# 4. Or restore to specific point in time
aws dynamodb restore-table-to-point-in-time \
  --source-table-name PhotographyPortfolio \
  --target-table-name PhotographyPortfolio-restored \
  --restore-date-time 2024-01-15T10:30:00.000Z

# 5. Verify restored data
aws dynamodb scan --table-name PhotographyPortfolio-restored --max-items 10

# 6. Switch application to restored table (update Lambda environment variables)
aws lambda update-function-configuration \
  --function-name portfolio-api-production \
  --environment Variables='{TABLE_NAME=PhotographyPortfolio-restored}'
```

#### S3 Recovery Procedure
```bash
# 1. Identify affected objects and timestamp
aws s3api list-object-versions --bucket portfolio-media-production

# 2. Restore from version (if versioning enabled)
aws s3api copy-object \
  --copy-source portfolio-media-production/path/to/file.jpg?versionId=VERSION-ID \
  --bucket portfolio-media-production \
  --key path/to/file.jpg

# 3. Or restore from cross-region replica
aws s3 sync s3://portfolio-backup-production-us-west-2/media/ \
  s3://portfolio-media-production/media/ \
  --region us-west-2

# 4. Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION-ID \
  --paths "/*"
```

### Scenario 3: Complete Account Compromise
**Symptoms**: Unauthorized access, resources deleted, credentials compromised
**RTO Target**: 4 hours
**RPO Target**: 24 hours

#### Immediate Response (0-30 minutes)
```bash
# 1. Secure the account
# - Change root password
# - Enable MFA on root account
# - Rotate all IAM access keys
# - Delete suspicious IAM users/roles

# 2. Activate backup AWS account
# - Switch to pre-configured backup account
# - Verify access to backup resources

# 3. Assess damage
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteTable \
  --start-time 2024-01-15T00:00:00Z

# 4. Preserve evidence
aws s3 sync s3://aws-cloudtrail-logs-ACCOUNT-REGION/ ./incident-logs/
```

#### Recovery Process (30 minutes - 4 hours)
```bash
# 1. Deploy infrastructure in backup account
cd infrastructure
export AWS_PROFILE=backup-account
cdk deploy --all --context environment=recovery

# 2. Restore DynamoDB data from cross-account backup
aws dynamodb restore-table-from-backup \
  --target-table-name PhotographyPortfolio \
  --backup-arn arn:aws:dynamodb:us-east-1:BACKUP-ACCOUNT:table/PhotographyPortfolio/backup/LATEST

# 3. Restore S3 data from cross-account replica
aws s3 sync s3://portfolio-backup-BACKUP-ACCOUNT/ s3://portfolio-media-recovery/

# 4. Update DNS to point to recovery environment
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch file://dns-failover.json

# 5. Deploy application code
aws lambda update-function-code \
  --function-name portfolio-api-recovery \
  --zip-file fileb://portfolio-api.zip
```

### Scenario 4: Database Performance Issues
**Symptoms**: High latency, throttling, connection timeouts
**RTO Target**: 1 hour
**RPO Target**: Real-time

#### Immediate Actions
```bash
# 1. Check DynamoDB metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=PhotographyPortfolio \
  --start-time 2024-01-15T10:00:00Z \
  --end-time 2024-01-15T11:00:00Z \
  --period 300 \
  --statistics Sum

# 2. Enable DynamoDB auto-scaling (if not already enabled)
aws application-autoscaling register-scalable-target \
  --service-namespace dynamodb \
  --resource-id table/PhotographyPortfolio \
  --scalable-dimension dynamodb:table:ReadCapacityUnits \
  --min-capacity 5 \
  --max-capacity 1000

# 3. Switch to Global Table replica if needed
aws lambda update-function-configuration \
  --function-name portfolio-api-production \
  --environment Variables='{TABLE_NAME=PhotographyPortfolio-global,AWS_REGION=us-west-2}'
```

## Recovery Testing Procedures

### Monthly DR Drill Checklist
- [ ] **Week 1**: Test DynamoDB PITR restoration
- [ ] **Week 2**: Verify S3 cross-region replication
- [ ] **Week 3**: Test DNS failover mechanism
- [ ] **Week 4**: Full regional failover simulation

### Quarterly Full DR Test
```bash
# 1. Schedule maintenance window
# 2. Simulate primary region failure
aws route53 change-resource-record-sets --hosted-zone-id Z1234567890ABC \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"yourdomain.com","Type":"A","SetIdentifier":"Primary","Failover":"SECONDARY","TTL":60,"ResourceRecords":[{"Value":"1.2.3.4"}]}}]}'

# 3. Verify application functionality
curl -f https://yourdomain.com/health || echo "Health check failed"
curl -f https://yourdomain.com/api/projects || echo "API check failed"

# 4. Test admin functionality
# - Login to admin panel
# - Upload test image
# - Create test project
# - Verify data persistence

# 5. Measure recovery times
# - DNS propagation time
# - Application response time
# - Data consistency verification

# 6. Restore to primary region
aws route53 change-resource-record-sets --hosted-zone-id Z1234567890ABC \
  --change-batch '{"Changes":[{"Action":"UPSERT","ResourceRecordSet":{"Name":"yourdomain.com","Type":"A","SetIdentifier":"Primary","Failover":"PRIMARY","TTL":60,"ResourceRecords":[{"Value":"5.6.7.8"}]}}]}'
```

## Recovery Validation Checklist

### Application Functionality
- [ ] Homepage loads correctly
- [ ] Image gallery displays properly
- [ ] Contact form submits successfully
- [ ] Admin login works
- [ ] Image upload functions
- [ ] Project creation/editing works
- [ ] API endpoints respond correctly

### Data Integrity
- [ ] All projects visible
- [ ] Image metadata correct
- [ ] User accounts accessible
- [ ] Configuration settings preserved
- [ ] No data corruption detected

### Performance Validation
- [ ] Page load times < 3 seconds
- [ ] API response times < 500ms
- [ ] Image loading performance acceptable
- [ ] Database query performance normal
- [ ] CDN cache hit ratio > 80%

## Post-Recovery Actions

### Immediate (0-2 hours)
- [ ] Verify all systems operational
- [ ] Update monitoring dashboards
- [ ] Notify stakeholders of recovery completion
- [ ] Document any issues encountered
- [ ] Update recovery procedures if needed

### Short-term (2-24 hours)
- [ ] Monitor system stability
- [ ] Verify backup processes resume
- [ ] Check data consistency
- [ ] Review security logs
- [ ] Update incident documentation

### Long-term (1-7 days)
- [ ] Conduct post-incident review
- [ ] Update disaster recovery plan
- [ ] Implement lessons learned
- [ ] Test backup integrity
- [ ] Review and update RTO/RPO targets

## Emergency Escalation Matrix

| Severity | Response Time | Escalation Path |
|----------|---------------|-----------------|
| P0 - Critical | Immediate | System Admin → AWS Support → Management |
| P1 - High | 1 hour | System Admin → AWS Support |
| P2 - Medium | 4 hours | System Admin |
| P3 - Low | 24 hours | System Admin |

## Key Recovery Commands Reference

```bash
# Quick health check
curl -f https://yourdomain.com/health

# Check DynamoDB table status
aws dynamodb describe-table --table-name PhotographyPortfolio

# List recent backups
aws dynamodb list-backups --table-name PhotographyPortfolio --max-results 5

# Check S3 replication status
aws s3api get-bucket-replication --bucket portfolio-media-production

# Verify CloudFront distribution
aws cloudfront get-distribution --id DISTRIBUTION-ID

# Check Route 53 health checks
aws route53 list-health-checks

# Monitor CloudWatch alarms
aws cloudwatch describe-alarms --state-value ALARM
```

## Recovery Time Tracking

| Scenario | Target RTO | Target RPO | Last Test | Actual RTO | Actual RPO |
|----------|------------|------------|-----------|------------|------------|
| Regional Failure | 15 min | 5 min | 2024-01-15 | 12 min | 3 min |
| Data Corruption | 30 min | 1 hour | 2024-01-10 | 25 min | 45 min |
| Account Compromise | 4 hours | 24 hours | 2024-01-01 | 3.5 hours | 18 hours |
| Performance Issues | 1 hour | Real-time | 2024-01-12 | 45 min | 0 min |

This runbook should be reviewed and updated quarterly, with all procedures tested regularly to ensure effectiveness during actual disaster scenarios.
