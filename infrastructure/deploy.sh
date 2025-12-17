#!/bin/bash

# Photography Portfolio CDK Deployment Script with Phased Deployment
# Usage: ./deploy.sh [environment] [base-domain] [hosted-zone-id] [--phase]
# Examples:
#   ./deploy.sh staging example.com Z1234567890ABC --minimal    # MVP ($5-15/month)
#   ./deploy.sh staging example.com Z1234567890ABC --enhanced   # Security + perf ($25-50/month)
#   ./deploy.sh production example.com Z1234567890ABC --enterprise # Full features ($50-100/month)

set -e

ENVIRONMENT=${1:-staging}
BASE_DOMAIN=$2
HOSTED_ZONE_ID=$3
PHASE=${4:-"--enhanced"}  # Default to enhanced

# Set deployment phase from environment variable if available
if [ ! -z "$DEPLOYMENT_PHASE" ]; then
    PHASE="--$DEPLOYMENT_PHASE"
fi

echo "🚀 Deploying Photography Portfolio"
echo "📊 Environment: $ENVIRONMENT"
echo "🎯 Phase: ${PHASE#--}"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    echo "❌ Invalid environment. Use 'staging' or 'production'"
    exit 1
fi

# Validate phase
case $PHASE in
    --minimal|--enhanced|--enterprise)
        ;;
    *)
        echo "❌ Invalid phase: $PHASE"
        echo "Valid phases: --minimal, --enhanced, --enterprise"
        exit 1
        ;;
esac

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

# Deploy based on phase
case $PHASE in
    --minimal)
        echo "🏗️ Deploying minimal infrastructure (Phase 1)..."
        STACKS="PortfolioInfrastructureStack PortfolioFrontendStack"
        ;;
    --enhanced)
        echo "🏗️ Deploying enhanced infrastructure (Phase 2)..."
        STACKS="PortfolioInfrastructureStack PortfolioFrontendStack PortfolioEnhancedWAFStack PortfolioImageOptimizationStack PortfolioSEOAutomationStack"
        ;;
    --enterprise)
        echo "🏗️ Deploying enterprise infrastructure (Phase 3)..."
        STACKS="--all"
        ;;
esac

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
    cdk deploy $STACKS \
        --context environment=$ENVIRONMENT \
        --context baseDomain=$BASE_DOMAIN \
        --context hostedZoneId=$HOSTED_ZONE_ID \
        --context deploymentPhase=${PHASE#--} \
        --require-approval never \
        --outputs-file "outputs-$ENVIRONMENT.json"
else
    echo "📡 Deploying without custom domain (using CloudFront URL)"
    
    # Deploy without domain
    cdk deploy $STACKS \
        --context environment=$ENVIRONMENT \
        --context deploymentPhase=${PHASE#--} \
        --require-approval never \
        --outputs-file "outputs-$ENVIRONMENT.json"
fi

echo "✅ Deployment complete for $ENVIRONMENT environment!"
echo ""
echo "📋 Phase ${PHASE#--} includes:"
case $PHASE in
    --minimal)
        echo "  ✅ Static website hosting"
        echo "  ✅ Custom domain with HTTPS"
        echo "  ✅ Basic API and database"
        echo "  ✅ Simple contact form"
        echo "  💰 Estimated cost: $5-15/month"
        ;;
    --enhanced)
        echo "  ✅ All minimal features plus:"
        echo "  ✅ Image optimization (WebP/AVIF)"
        echo "  ✅ Admin authentication with MFA"
        echo "  ✅ Enhanced WAF security"
        echo "  ✅ SEO automation"
        echo "  💰 Estimated cost: $25-50/month"
        ;;
    --enterprise)
        echo "  ✅ All enhanced features plus:"
        echo "  ✅ Multi-region disaster recovery"
        echo "  ✅ Automated backups"
        echo "  ✅ Advanced security monitoring"
        echo "  ✅ Enterprise-grade reliability"
        echo "  💰 Estimated cost: $50-100/month"
        ;;
esac

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

echo ""
echo "📈 To upgrade to next phase:"
case $PHASE in
    --minimal)
        echo "  ./deploy.sh $ENVIRONMENT $BASE_DOMAIN $HOSTED_ZONE_ID --enhanced"
        ;;
    --enhanced)
        echo "  ./deploy.sh $ENVIRONMENT $BASE_DOMAIN $HOSTED_ZONE_ID --enterprise"
        ;;
    --enterprise)
        echo "  Already at highest phase. Consider scale optimization."
        ;;
esac
