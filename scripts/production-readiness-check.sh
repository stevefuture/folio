#!/bin/bash

# Production Readiness Validation Script
# Usage: ./production-readiness-check.sh <domain> <environment>
# Example: ./production-readiness-check.sh myportfolio.com production

set -e

DOMAIN=${1:-"example.com"}
ENVIRONMENT=${2:-"production"}
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "🚀 Production Readiness Check - $TIMESTAMP"
echo "=========================================="
echo "Domain: $DOMAIN"
echo "Environment: $ENVIRONMENT"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

check_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    ((FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    ((WARNINGS++))
}

# 1. Infrastructure Checks
echo "🏗️  Infrastructure Validation"
echo "-----------------------------"

# Check if domain resolves
if dig +short $DOMAIN > /dev/null 2>&1; then
    check_pass "Domain $DOMAIN resolves"
else
    check_fail "Domain $DOMAIN does not resolve"
fi

# Check HTTPS
if curl -s -f -I https://$DOMAIN > /dev/null 2>&1; then
    check_pass "HTTPS accessible"
else
    check_fail "HTTPS not accessible"
fi

# Check HTTP redirect
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://$DOMAIN)
if [ "$HTTP_STATUS" = "301" ] || [ "$HTTP_STATUS" = "302" ]; then
    check_pass "HTTP redirects to HTTPS"
else
    check_warn "HTTP does not redirect to HTTPS (Status: $HTTP_STATUS)"
fi

# Check CloudFormation stacks
STACKS=$(aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query 'StackSummaries[?contains(StackName, `Portfolio`)].StackName' --output text)
if [ -n "$STACKS" ]; then
    check_pass "CloudFormation stacks deployed: $(echo $STACKS | wc -w) stacks"
else
    check_fail "No Portfolio CloudFormation stacks found"
fi

echo ""

# 2. Security Checks
echo "🔒 Security Validation"
echo "---------------------"

# Check SSL certificate
SSL_INFO=$(echo | openssl s_client -connect $DOMAIN:443 -servername $DOMAIN 2>/dev/null | openssl x509 -noout -dates 2>/dev/null)
if [ $? -eq 0 ]; then
    check_pass "SSL certificate valid"
    EXPIRY=$(echo "$SSL_INFO" | grep "notAfter" | cut -d= -f2)
    echo "   Certificate expires: $EXPIRY"
else
    check_fail "SSL certificate invalid or not found"
fi

# Check security headers
HEADERS=$(curl -s -I https://$DOMAIN)

if echo "$HEADERS" | grep -i "strict-transport-security" > /dev/null; then
    check_pass "HSTS header present"
else
    check_warn "HSTS header missing"
fi

if echo "$HEADERS" | grep -i "x-frame-options" > /dev/null; then
    check_pass "X-Frame-Options header present"
else
    check_warn "X-Frame-Options header missing"
fi

if echo "$HEADERS" | grep -i "content-security-policy" > /dev/null; then
    check_pass "Content Security Policy header present"
else
    check_warn "Content Security Policy header missing"
fi

# Check WAF (if CloudFront distribution exists)
DISTRIBUTIONS=$(aws cloudfront list-distributions --query 'DistributionList.Items[?contains(Comment, `portfolio`) || contains(Comment, `Portfolio`)].Id' --output text)
if [ -n "$DISTRIBUTIONS" ]; then
    check_pass "CloudFront distribution found"
    for DIST_ID in $DISTRIBUTIONS; do
        WAF_ID=$(aws cloudfront get-distribution --id $DIST_ID --query 'Distribution.DistributionConfig.WebACLId' --output text)
        if [ "$WAF_ID" != "None" ] && [ "$WAF_ID" != "" ]; then
            check_pass "WAF configured for distribution $DIST_ID"
        else
            check_warn "No WAF configured for distribution $DIST_ID"
        fi
    done
else
    check_fail "No CloudFront distribution found"
fi

echo ""

# 3. Performance Checks
echo "⚡ Performance Validation"
echo "------------------------"

# Check response time
RESPONSE_TIME=$(curl -w "%{time_total}" -o /dev/null -s https://$DOMAIN)
if (( $(echo "$RESPONSE_TIME < 3.0" | bc -l) )); then
    check_pass "Response time acceptable: ${RESPONSE_TIME}s"
else
    check_warn "Response time slow: ${RESPONSE_TIME}s (>3s)"
fi

# Check compression
if curl -s -H "Accept-Encoding: gzip" -I https://$DOMAIN | grep -i "content-encoding: gzip" > /dev/null; then
    check_pass "Gzip compression enabled"
else
    check_warn "Gzip compression not detected"
fi

# Check cache headers
CACHE_CONTROL=$(curl -s -I https://$DOMAIN | grep -i "cache-control" | head -1)
if [ -n "$CACHE_CONTROL" ]; then
    check_pass "Cache-Control headers present"
    echo "   $CACHE_CONTROL"
else
    check_warn "Cache-Control headers missing"
fi

echo ""

# 4. SEO Checks
echo "🎯 SEO Validation"
echo "-----------------"

# Check robots.txt
if curl -s -f https://$DOMAIN/robots.txt > /dev/null 2>&1; then
    check_pass "robots.txt accessible"
else
    check_warn "robots.txt not found"
fi

# Check sitemap
if curl -s -f https://$DOMAIN/sitemap.xml > /dev/null 2>&1; then
    check_pass "sitemap.xml accessible"
else
    check_warn "sitemap.xml not found"
fi

# Check meta tags
PAGE_CONTENT=$(curl -s https://$DOMAIN)
if echo "$PAGE_CONTENT" | grep -i "<title>" > /dev/null; then
    check_pass "Title tag present"
else
    check_warn "Title tag missing"
fi

if echo "$PAGE_CONTENT" | grep -i 'name="description"' > /dev/null; then
    check_pass "Meta description present"
else
    check_warn "Meta description missing"
fi

if echo "$PAGE_CONTENT" | grep -i 'property="og:' > /dev/null; then
    check_pass "Open Graph tags present"
else
    check_warn "Open Graph tags missing"
fi

echo ""

# 5. API Health Checks
echo "🔌 API Validation"
echo "-----------------"

# Check API health endpoint
if curl -s -f https://$DOMAIN/api/health > /dev/null 2>&1; then
    check_pass "API health endpoint accessible"
else
    check_warn "API health endpoint not accessible"
fi

# Check API response format
API_RESPONSE=$(curl -s https://$DOMAIN/api/health 2>/dev/null || echo "")
if echo "$API_RESPONSE" | grep -E '(status|health)' > /dev/null; then
    check_pass "API returns valid health response"
else
    check_warn "API health response format unclear"
fi

echo ""

# 6. Monitoring Checks
echo "📊 Monitoring Validation"
echo "-----------------------"

# Check CloudWatch dashboards
DASHBOARDS=$(aws cloudwatch list-dashboards --query 'DashboardEntries[?contains(DashboardName, `portfolio`)].DashboardName' --output text)
if [ -n "$DASHBOARDS" ]; then
    check_pass "CloudWatch dashboards configured: $(echo $DASHBOARDS | wc -w) dashboards"
else
    check_warn "No portfolio CloudWatch dashboards found"
fi

# Check CloudWatch alarms
ALARMS=$(aws cloudwatch describe-alarms --query 'MetricAlarms[?contains(AlarmName, `Portfolio`) || contains(AlarmName, `portfolio`)].AlarmName' --output text)
if [ -n "$ALARMS" ]; then
    check_pass "CloudWatch alarms configured: $(echo $ALARMS | wc -w) alarms"
else
    check_warn "No portfolio CloudWatch alarms found"
fi

# Check for active alarms
ACTIVE_ALARMS=$(aws cloudwatch describe-alarms --state-value ALARM --query 'MetricAlarms[?contains(AlarmName, `Portfolio`) || contains(AlarmName, `portfolio`)].AlarmName' --output text)
if [ -n "$ACTIVE_ALARMS" ]; then
    check_fail "Active alarms detected: $ACTIVE_ALARMS"
else
    check_pass "No active alarms"
fi

echo ""

# 7. Backup Validation
echo "💾 Backup Validation"
echo "--------------------"

# Check DynamoDB backup
TABLES=$(aws dynamodb list-tables --query 'TableNames[?contains(@, `Portfolio`)]' --output text)
for TABLE in $TABLES; do
    PITR=$(aws dynamodb describe-continuous-backups --table-name $TABLE --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' --output text 2>/dev/null || echo "DISABLED")
    if [ "$PITR" = "ENABLED" ]; then
        check_pass "Point-in-time recovery enabled for $TABLE"
    else
        check_warn "Point-in-time recovery disabled for $TABLE"
    fi
done

# Check S3 versioning
BUCKETS=$(aws s3api list-buckets --query 'Buckets[?contains(Name, `portfolio`)].Name' --output text)
for BUCKET in $BUCKETS; do
    VERSIONING=$(aws s3api get-bucket-versioning --bucket $BUCKET --query 'Status' --output text 2>/dev/null || echo "Disabled")
    if [ "$VERSIONING" = "Enabled" ]; then
        check_pass "Versioning enabled for bucket $BUCKET"
    else
        check_warn "Versioning disabled for bucket $BUCKET"
    fi
done

echo ""

# 8. Cost Monitoring
echo "💰 Cost Monitoring"
echo "------------------"

# Check for budget configuration
BUDGETS=$(aws budgets describe-budgets --account-id $(aws sts get-caller-identity --query Account --output text) --query 'Budgets[?contains(BudgetName, `portfolio`)].BudgetName' --output text 2>/dev/null || echo "")
if [ -n "$BUDGETS" ]; then
    check_pass "Cost budgets configured: $BUDGETS"
else
    check_warn "No cost budgets found"
fi

echo ""

# Summary
echo "📋 Summary"
echo "=========="
echo -e "✅ Passed: ${GREEN}$PASSED${NC}"
echo -e "⚠️  Warnings: ${YELLOW}$WARNINGS${NC}"
echo -e "❌ Failed: ${RED}$FAILED${NC}"
echo ""

# Overall assessment
if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}🎉 PRODUCTION READY${NC}: All checks passed!"
        exit 0
    else
        echo -e "${YELLOW}⚠️  PRODUCTION READY WITH WARNINGS${NC}: $WARNINGS warnings to address"
        exit 1
    fi
else
    echo -e "${RED}❌ NOT PRODUCTION READY${NC}: $FAILED critical issues must be resolved"
    exit 2
fi
