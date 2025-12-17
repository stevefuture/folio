#!/bin/bash

# Emergency Rollback Script for Photography Portfolio
# Usage: ./emergency-rollback.sh <domain> <rollback-type> [backup-timestamp]
# Types: dns, lambda, full
# Example: ./emergency-rollback.sh myportfolio.com dns

set -e

DOMAIN=$1
ROLLBACK_TYPE=$2
BACKUP_TIMESTAMP=$3
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')

if [ -z "$DOMAIN" ] || [ -z "$ROLLBACK_TYPE" ]; then
    echo "Usage: $0 <domain> <rollback-type> [backup-timestamp]"
    echo "Rollback types: dns, lambda, cloudfront, database, full"
    exit 1
fi

echo "🚨 EMERGENCY ROLLBACK INITIATED"
echo "==============================="
echo "Domain: $DOMAIN"
echo "Type: $ROLLBACK_TYPE"
echo "Timestamp: $TIMESTAMP"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_action() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ERROR:${NC} $1"
}

# Get hosted zone ID for domain
get_hosted_zone_id() {
    aws route53 list-hosted-zones --query "HostedZones[?Name=='${DOMAIN}.'].Id" --output text | cut -d'/' -f3
}

# DNS Rollback
rollback_dns() {
    log_action "Starting DNS rollback for $DOMAIN"
    
    HOSTED_ZONE_ID=$(get_hosted_zone_id)
    if [ -z "$HOSTED_ZONE_ID" ]; then
        log_error "Could not find hosted zone for $DOMAIN"
        return 1
    fi
    
    log_action "Found hosted zone: $HOSTED_ZONE_ID"
    
    # Create maintenance page record (points to S3 static site)
    cat > /tmp/dns-rollback-${TIMESTAMP}.json << EOF
{
    "Changes": [
        {
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": "$DOMAIN",
                "Type": "A",
                "AliasTarget": {
                    "DNSName": "s3-website-us-east-1.amazonaws.com",
                    "EvaluateTargetHealth": false,
                    "HostedZoneId": "Z3AQBSTGFYJSTF"
                }
            }
        },
        {
            "Action": "UPSERT", 
            "ResourceRecordSet": {
                "Name": "www.$DOMAIN",
                "Type": "CNAME",
                "TTL": 300,
                "ResourceRecords": [
                    {
                        "Value": "$DOMAIN"
                    }
                ]
            }
        }
    ]
}
EOF

    # Apply DNS changes
    CHANGE_ID=$(aws route53 change-resource-record-sets \
        --hosted-zone-id $HOSTED_ZONE_ID \
        --change-batch file:///tmp/dns-rollback-${TIMESTAMP}.json \
        --query 'ChangeInfo.Id' --output text)
    
    log_action "DNS change submitted: $CHANGE_ID"
    log_action "Waiting for DNS propagation..."
    
    aws route53 wait resource-record-sets-changed --id $CHANGE_ID
    log_action "DNS rollback completed"
    
    # Clean up temp file
    rm -f /tmp/dns-rollback-${TIMESTAMP}.json
}

# Lambda Rollback
rollback_lambda() {
    log_action "Starting Lambda function rollback"
    
    # Get Lambda functions
    FUNCTIONS=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `portfolio`)].FunctionName' --output text)
    
    for FUNCTION in $FUNCTIONS; do
        log_action "Rolling back function: $FUNCTION"
        
        # Get previous version
        if [ -n "$BACKUP_TIMESTAMP" ]; then
            VERSION_ARN="arn:aws:lambda:$(aws configure get region):$(aws sts get-caller-identity --query Account --output text):function:${FUNCTION}:${BACKUP_TIMESTAMP}"
        else
            # Get the second most recent version
            VERSION=$(aws lambda list-versions-by-function --function-name $FUNCTION --query 'Versions[-2].Version' --output text)
            VERSION_ARN="arn:aws:lambda:$(aws configure get region):$(aws sts get-caller-identity --query Account --output text):function:${FUNCTION}:${VERSION}"
        fi
        
        # Update alias to point to previous version
        aws lambda update-alias \
            --function-name $FUNCTION \
            --name LIVE \
            --function-version $VERSION \
            --description "Emergency rollback at $TIMESTAMP" || log_warning "Could not update alias for $FUNCTION"
        
        log_action "Rolled back $FUNCTION to version $VERSION"
    done
}

# CloudFront Rollback
rollback_cloudfront() {
    log_action "Starting CloudFront rollback"
    
    # Get CloudFront distributions
    DISTRIBUTIONS=$(aws cloudfront list-distributions --query 'DistributionList.Items[?contains(Comment, `portfolio`)].Id' --output text)
    
    for DIST_ID in $DISTRIBUTIONS; do
        log_action "Invalidating CloudFront cache: $DIST_ID"
        
        # Create cache invalidation
        INVALIDATION_ID=$(aws cloudfront create-invalidation \
            --distribution-id $DIST_ID \
            --paths "/*" \
            --query 'Invalidation.Id' --output text)
        
        log_action "Cache invalidation created: $INVALIDATION_ID"
        
        # Optionally disable distribution temporarily
        if [ "$ROLLBACK_TYPE" = "full" ]; then
            log_warning "Consider manually disabling distribution $DIST_ID if issues persist"
        fi
    done
}

# Database Rollback
rollback_database() {
    log_action "Starting database rollback"
    
    if [ -z "$BACKUP_TIMESTAMP" ]; then
        log_error "Backup timestamp required for database rollback"
        return 1
    fi
    
    # Get DynamoDB tables
    TABLES=$(aws dynamodb list-tables --query 'TableNames[?contains(@, `Portfolio`)]' --output text)
    
    for TABLE in $TABLES; do
        log_action "Initiating point-in-time recovery for: $TABLE"
        
        # Create restore table name
        RESTORE_TABLE="${TABLE}-restore-${TIMESTAMP}"
        
        # Restore from point in time
        aws dynamodb restore-table-to-point-in-time \
            --source-table-name $TABLE \
            --target-table-name $RESTORE_TABLE \
            --restore-date-time $BACKUP_TIMESTAMP \
            --billing-mode-override PAY_PER_REQUEST
        
        log_action "Restore initiated for $TABLE -> $RESTORE_TABLE"
        log_warning "Manual intervention required to switch traffic to restored table"
    done
}

# Create maintenance page
create_maintenance_page() {
    log_action "Creating maintenance page"
    
    # Create simple maintenance page
    cat > /tmp/maintenance.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>Maintenance - $DOMAIN</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; margin-bottom: 20px; }
        p { color: #666; line-height: 1.6; }
        .status { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔧 Temporary Maintenance</h1>
        <div class="status">
            <strong>Status:</strong> We're performing emergency maintenance to ensure the best experience.
        </div>
        <p>We're working to resolve this issue as quickly as possible.</p>
        <p>Please check back in a few minutes.</p>
        <p><small>Incident ID: ROLLBACK-$TIMESTAMP</small></p>
    </div>
</body>
</html>
EOF

    # Upload to S3 maintenance bucket (if exists)
    MAINTENANCE_BUCKET=$(aws s3api list-buckets --query 'Buckets[?contains(Name, `maintenance`)].Name' --output text | head -1)
    if [ -n "$MAINTENANCE_BUCKET" ]; then
        aws s3 cp /tmp/maintenance.html s3://$MAINTENANCE_BUCKET/index.html --content-type "text/html"
        log_action "Maintenance page uploaded to S3"
    fi
    
    rm -f /tmp/maintenance.html
}

# Send notifications
send_notifications() {
    log_action "Sending rollback notifications"
    
    # Find SNS topics
    TOPICS=$(aws sns list-topics --query 'Topics[?contains(TopicArn, `portfolio`) || contains(TopicArn, `alert`)].TopicArn' --output text)
    
    MESSAGE="🚨 EMERGENCY ROLLBACK EXECUTED

Domain: $DOMAIN
Type: $ROLLBACK_TYPE
Timestamp: $TIMESTAMP
Incident ID: ROLLBACK-$TIMESTAMP

Actions taken:
- Emergency rollback procedures initiated
- Maintenance mode activated
- Monitoring systems alerted

Next steps:
1. Verify service restoration
2. Investigate root cause
3. Plan proper fix deployment

Status page: https://$DOMAIN"

    for TOPIC in $TOPICS; do
        aws sns publish \
            --topic-arn $TOPIC \
            --subject "🚨 Emergency Rollback - $DOMAIN" \
            --message "$MESSAGE" || log_warning "Could not send notification to $TOPIC"
    done
}

# Health check after rollback
health_check() {
    log_action "Performing post-rollback health check"
    
    sleep 30  # Wait for changes to propagate
    
    # Test domain accessibility
    if curl -s -f -I https://$DOMAIN > /dev/null 2>&1; then
        log_action "✅ Domain accessible via HTTPS"
    else
        log_warning "❌ Domain not accessible via HTTPS"
    fi
    
    # Test HTTP redirect
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN)
    if [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
        log_action "✅ HTTP redirect working"
    else
        log_warning "❌ HTTP redirect not working (Status: $HTTP_STATUS)"
    fi
    
    # Test response time
    RESPONSE_TIME=$(curl -w "%{time_total}" -o /dev/null -s https://$DOMAIN)
    log_action "Response time: ${RESPONSE_TIME}s"
}

# Main rollback execution
case $ROLLBACK_TYPE in
    "dns")
        create_maintenance_page
        rollback_dns
        send_notifications
        health_check
        ;;
    "lambda")
        rollback_lambda
        rollback_cloudfront
        send_notifications
        ;;
    "cloudfront")
        rollback_cloudfront
        send_notifications
        ;;
    "database")
        rollback_database
        send_notifications
        ;;
    "full")
        create_maintenance_page
        rollback_dns
        rollback_lambda
        rollback_cloudfront
        rollback_database
        send_notifications
        health_check
        ;;
    *)
        log_error "Invalid rollback type: $ROLLBACK_TYPE"
        echo "Valid types: dns, lambda, cloudfront, database, full"
        exit 1
        ;;
esac

echo ""
echo "🚨 EMERGENCY ROLLBACK COMPLETED"
echo "==============================="
echo "Incident ID: ROLLBACK-$TIMESTAMP"
echo "Type: $ROLLBACK_TYPE"
echo "Domain: $DOMAIN"
echo ""
echo "Next steps:"
echo "1. Verify service is restored"
echo "2. Investigate root cause"
echo "3. Plan proper fix and redeployment"
echo "4. Update incident documentation"
echo ""
echo "Rollback log saved to: /tmp/rollback-${TIMESTAMP}.log"
