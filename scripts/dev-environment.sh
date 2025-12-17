#!/bin/bash

# Dev Environment Management Script
# Usage: ./dev-environment.sh <action> [domain] [hosted-zone-id]
# Actions: start, stop, status, cost
# Example: ./dev-environment.sh start dev.myportfolio.com Z1234567890ABC

set -e

ACTION=$1
DOMAIN=${2:-"dev.example.com"}
HOSTED_ZONE_ID=$3
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Start dev environment
start_dev() {
    log_info "🚀 Starting dev environment for $DOMAIN"
    
    # Deploy minimal dev stack
    cd ../infrastructure
    
    log_info "Deploying dev infrastructure..."
    if [ -n "$HOSTED_ZONE_ID" ]; then
        ./deploy.sh dev $DOMAIN $HOSTED_ZONE_ID --minimal
    else
        log_warning "No hosted zone provided, deploying without custom domain"
        ./deploy.sh dev --minimal
    fi
    
    # Enable DynamoDB on-demand (cost-effective for dev)
    log_info "Configuring DynamoDB for development..."
    TABLES=$(aws dynamodb list-tables --query 'TableNames[?contains(@, `Portfolio`) && contains(@, `dev`)]' --output text)
    for TABLE in $TABLES; do
        aws dynamodb modify-table \
            --table-name $TABLE \
            --billing-mode PAY_PER_REQUEST || log_warning "Could not modify $TABLE"
    done
    
    # Set minimal CloudWatch log retention
    log_info "Setting cost-effective log retention..."
    LOG_GROUPS=$(aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/portfolio-dev" --query 'logGroups[].logGroupName' --output text)
    for LOG_GROUP in $LOG_GROUPS; do
        aws logs put-retention-policy \
            --log-group-name $LOG_GROUP \
            --retention-in-days 7 || log_warning "Could not set retention for $LOG_GROUP"
    done
    
    log_success "✅ Dev environment started!"
    log_info "💰 Estimated cost: $3-8/month while running"
    
    if [ -n "$DOMAIN" ]; then
        log_info "🌐 Available at: https://$DOMAIN"
    fi
    
    # Show quick commands
    echo ""
    echo "📋 Quick Commands:"
    echo "  Stop environment:  ./dev-environment.sh stop"
    echo "  Check status:      ./dev-environment.sh status"
    echo "  View costs:        ./dev-environment.sh cost"
}

# Stop dev environment
stop_dev() {
    log_info "🛑 Stopping dev environment..."
    
    # Get all dev stacks
    DEV_STACKS=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query 'StackSummaries[?contains(StackName, `dev`) || contains(StackName, `Dev`)].StackName' \
        --output text)
    
    if [ -z "$DEV_STACKS" ]; then
        log_warning "No dev stacks found to delete"
        return
    fi
    
    log_info "Found dev stacks: $DEV_STACKS"
    
    # Confirm deletion
    echo -e "${YELLOW}⚠️  This will DELETE all dev resources and data!${NC}"
    read -p "Are you sure? (yes/no): " CONFIRM
    
    if [ "$CONFIRM" != "yes" ]; then
        log_info "Deletion cancelled"
        return
    fi
    
    # Delete stacks in reverse dependency order
    cd ../infrastructure
    
    log_info "Deleting CloudFormation stacks..."
    for STACK in $DEV_STACKS; do
        log_info "Deleting stack: $STACK"
        aws cloudformation delete-stack --stack-name $STACK
    done
    
    # Wait for deletions to complete
    log_info "Waiting for stack deletions to complete..."
    for STACK in $DEV_STACKS; do
        log_info "Waiting for $STACK deletion..."
        aws cloudformation wait stack-delete-complete --stack-name $STACK || log_warning "Stack $STACK deletion timeout"
    done
    
    # Clean up any remaining resources
    cleanup_remaining_resources
    
    log_success "✅ Dev environment stopped!"
    log_success "💰 Cost savings: ~$3-8/month"
}

# Cleanup remaining resources that might not be in stacks
cleanup_remaining_resources() {
    log_info "Cleaning up remaining dev resources..."
    
    # Delete dev S3 buckets
    DEV_BUCKETS=$(aws s3api list-buckets --query 'Buckets[?contains(Name, `dev`) && contains(Name, `portfolio`)].Name' --output text)
    for BUCKET in $DEV_BUCKETS; do
        log_info "Emptying and deleting bucket: $BUCKET"
        aws s3 rm s3://$BUCKET --recursive || log_warning "Could not empty $BUCKET"
        aws s3api delete-bucket --bucket $BUCKET || log_warning "Could not delete $BUCKET"
    done
    
    # Delete dev log groups
    DEV_LOG_GROUPS=$(aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/portfolio-dev" --query 'logGroups[].logGroupName' --output text)
    for LOG_GROUP in $DEV_LOG_GROUPS; do
        log_info "Deleting log group: $LOG_GROUP"
        aws logs delete-log-group --log-group-name $LOG_GROUP || log_warning "Could not delete $LOG_GROUP"
    done
}

# Check environment status
check_status() {
    log_info "📊 Dev Environment Status"
    echo "========================="
    
    # Check CloudFormation stacks
    DEV_STACKS=$(aws cloudformation list-stacks \
        --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
        --query 'StackSummaries[?contains(StackName, `dev`) || contains(StackName, `Dev`)].{Name:StackName,Status:StackStatus}' \
        --output table)
    
    if [ -n "$DEV_STACKS" ]; then
        echo "CloudFormation Stacks:"
        echo "$DEV_STACKS"
    else
        log_warning "No active dev stacks found"
    fi
    
    # Check key resources
    echo ""
    echo "Resources:"
    
    # S3 buckets
    DEV_BUCKETS=$(aws s3api list-buckets --query 'Buckets[?contains(Name, `dev`) && contains(Name, `portfolio`)].Name' --output text)
    if [ -n "$DEV_BUCKETS" ]; then
        echo "  S3 Buckets: $DEV_BUCKETS"
    else
        echo "  S3 Buckets: None"
    fi
    
    # DynamoDB tables
    DEV_TABLES=$(aws dynamodb list-tables --query 'TableNames[?contains(@, `dev`) && contains(@, `Portfolio`)]' --output text)
    if [ -n "$DEV_TABLES" ]; then
        echo "  DynamoDB Tables: $DEV_TABLES"
    else
        echo "  DynamoDB Tables: None"
    fi
    
    # Lambda functions
    DEV_FUNCTIONS=$(aws lambda list-functions --query 'Functions[?contains(FunctionName, `dev`) && contains(FunctionName, `portfolio`)].FunctionName' --output text)
    if [ -n "$DEV_FUNCTIONS" ]; then
        echo "  Lambda Functions: $DEV_FUNCTIONS"
    else
        echo "  Lambda Functions: None"
    fi
    
    # CloudFront distributions
    DEV_DISTRIBUTIONS=$(aws cloudfront list-distributions --query 'DistributionList.Items[?contains(Comment, `dev`)].{Id:Id,Status:Status,Domain:DomainName}' --output table)
    if [ -n "$DEV_DISTRIBUTIONS" ]; then
        echo "  CloudFront Distributions:"
        echo "$DEV_DISTRIBUTIONS"
    else
        echo "  CloudFront Distributions: None"
    fi
}

# Show cost information
show_costs() {
    log_info "💰 Dev Environment Costs"
    echo "========================"
    
    echo "When RUNNING:"
    echo "  CloudFront:       $1-2/month"
    echo "  S3 Storage:       $0.23/month"
    echo "  DynamoDB:         $0.50-1.50/month"
    echo "  Lambda:           $0.20-1.00/month"
    echo "  Route 53:         $0.50/month"
    echo "  CloudWatch:       $0.50-1.50/month"
    echo "  ─────────────────────────────"
    echo "  TOTAL:            $3-8/month"
    echo ""
    echo "When STOPPED:"
    echo "  All resources:    $0/month"
    echo "  ─────────────────────────────"
    echo "  SAVINGS:          $3-8/month"
    echo ""
    echo "💡 Tips:"
    echo "  - Stop when not developing (evenings/weekends)"
    echo "  - Start only when actively coding"
    echo "  - Potential savings: 70-80% vs always-on"
}

# Show usage
show_usage() {
    echo "Dev Environment Management"
    echo "========================="
    echo ""
    echo "Usage: $0 <action> [domain] [hosted-zone-id]"
    echo ""
    echo "Actions:"
    echo "  start   - Deploy and start dev environment"
    echo "  stop    - Stop and delete all dev resources"
    echo "  status  - Show current environment status"
    echo "  cost    - Show cost information"
    echo ""
    echo "Examples:"
    echo "  $0 start dev.myportfolio.com Z1234567890ABC"
    echo "  $0 start  # Deploy without custom domain"
    echo "  $0 stop"
    echo "  $0 status"
    echo "  $0 cost"
    echo ""
    echo "💡 The dev environment can be completely shut down to save $3-8/month"
}

# Main execution
case $ACTION in
    "start")
        start_dev
        ;;
    "stop")
        stop_dev
        ;;
    "status")
        check_status
        ;;
    "cost")
        show_costs
        ;;
    *)
        show_usage
        exit 1
        ;;
esac
