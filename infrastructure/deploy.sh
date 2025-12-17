#!/bin/bash

# Photography Portfolio CDK Deployment Script
# Usage: ./deploy.sh [environment] [base-domain] [hosted-zone-id]
# Examples:
#   ./deploy.sh staging example.com Z1234567890ABC  # Deploys to staging.example.com
#   ./deploy.sh production example.com Z1234567890ABC  # Deploys to example.com

set -e

ENVIRONMENT=${1:-staging}
BASE_DOMAIN=$2
HOSTED_ZONE_ID=$3

echo "🚀 Deploying Photography Portfolio - Environment: $ENVIRONMENT"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    echo "❌ Invalid environment. Use 'staging' or 'production'"
    exit 1
fi

# Check if CDK is installed
if ! command -v cdk &> /dev/null; then
    echo "❌ AWS CDK not found. Installing..."
    npm install -g aws-cdk
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Set environment variables
export ENVIRONMENT=$ENVIRONMENT

# Deploy with or without domain
if [ ! -z "$BASE_DOMAIN" ] && [ ! -z "$HOSTED_ZONE_ID" ]; then
    DOMAIN_NAME=$BASE_DOMAIN
    if [ "$ENVIRONMENT" != "production" ]; then
        DOMAIN_NAME="$ENVIRONMENT.$BASE_DOMAIN"
    fi
    
    echo "🌐 Deploying with domain: $DOMAIN_NAME"
    export BASE_DOMAIN=$BASE_DOMAIN
    export HOSTED_ZONE_ID=$HOSTED_ZONE_ID
    
    # Deploy with domain
    cdk deploy --all \
        --context environment=$ENVIRONMENT \
        --context baseDomain=$BASE_DOMAIN \
        --context hostedZoneId=$HOSTED_ZONE_ID \
        --require-approval never \
        --outputs-file "outputs-$ENVIRONMENT.json"
else
    echo "📡 Deploying without custom domain (using CloudFront URL)"
    
    # Deploy without domain
    cdk deploy --all \
        --context environment=$ENVIRONMENT \
        --require-approval never \
        --outputs-file "outputs-$ENVIRONMENT.json"
fi

echo "✅ Deployment complete for $ENVIRONMENT environment!"
echo ""
echo "📋 Next steps:"
echo "1. Upload your website files to the S3 bucket"
if [ "$ENVIRONMENT" = "staging" ]; then
    echo "2. Test on staging environment before production deployment"
fi
echo "3. Configure your domain DNS (if using custom domain)"
echo "4. Set up Cognito admin user"
echo ""

OUTPUT_FILE="outputs-$ENVIRONMENT.json"
if [ -f "$OUTPUT_FILE" ]; then
    echo "🔗 Important URLs ($ENVIRONMENT):"
    cat "$OUTPUT_FILE" | grep -E "(DistributionDomainName|WebsiteUrl)" || echo "Check $OUTPUT_FILE for deployment details"
fi

echo ""
echo "🎯 Environment: $ENVIRONMENT"
if [ ! -z "$DOMAIN_NAME" ]; then
    echo "🌐 URL: https://$DOMAIN_NAME"
fi
