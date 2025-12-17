# AWS Serverless Photographer Portfolio - Reference Architecture

## Architecture Overview
**Multi-tier serverless architecture with strict security boundaries and dual access patterns (public/admin)**

## Components & Services

### **Presentation Layer**
- **Route 53**: DNS resolution for custom domain
- **ACM Certificate**: TLS/SSL certificate management
- **CloudFront Distribution**: Global CDN with edge locations
  - Origin Access Control (OAC) to S3
  - WAF Web ACL attached
  - Cache behaviors: Static assets (365d), API (no cache), Images (optimized)

### **Security Perimeter**
- **AWS WAF**: Web Application Firewall
  - Rate limiting (2000 req/min per IP)
  - AWS Managed Rules (Common, Bad Inputs)
  - Geo-blocking capabilities
  - DDoS protection via CloudFront

### **Application Layer**
- **S3 Website Bucket**: Static website hosting (private)
  - Next.js static export
  - Security headers via CloudFront
  - Versioning enabled
  - Intelligent tiering lifecycle
- **API Gateway**: RESTful API endpoints
  - CORS enabled
  - Request/response validation
  - Throttling and usage plans

### **Compute Layer**
- **Lambda Functions**:
  - Portfolio API (Node.js 18.x, 512MB, 30s timeout)
  - Image Processing (Node.js 18.x, 1024MB, 60s timeout)
  - Contact Form Handler (SES integration)

### **Data Layer**
- **DynamoDB Table**: NoSQL database
  - Partition Key: PK (PROJECT, CAROUSEL, USER)
  - Sort Key: SK (timestamp, ID)
  - Pay-per-request billing
  - Point-in-time recovery
  - Deletion protection
- **S3 Media Bucket**: Image storage
  - Versioning enabled
  - Server-side encryption (SSE-S3)
  - Intelligent tiering
  - Private access only

### **Authentication & Authorization**
- **Cognito User Pool**: Admin authentication
  - MFA required (TOTP)
  - Advanced security mode
  - Device tracking
  - Strong password policy
- **Cognito Identity Pool**: Temporary AWS credentials

### **Monitoring & Operations**
- **CloudWatch**: Logs, metrics, alarms
- **SNS Topics**: Cost and security alerts
- **X-Ray**: Distributed tracing (optional)

## Data Flow Patterns

### **Public User Journey**
```
Internet → Route 53 → CloudFront → WAF → S3 (Static Site)
                                 ↓
                            API Gateway → Lambda → DynamoDB
                                 ↓
                            S3 (Images) ← CloudFront (Image Cache)
```

### **Admin User Journey**
```
Admin → Cognito Auth → CloudFront → Protected Routes
                            ↓
                       API Gateway (Authenticated) → Lambda → DynamoDB/S3
                            ↓
                       SES (Email notifications)
```

### **Image Processing Flow**
```
Admin Upload → S3 (Original) → Lambda Trigger → Image Processing
                                      ↓
                               S3 (Optimized) → CloudFront Invalidation
```

## Security Boundaries

### **Internet Boundary**
- **Entry Point**: CloudFront only
- **Protection**: WAF rules, DDoS protection
- **Encryption**: TLS 1.2+ enforced

### **Application Boundary**
- **S3 Access**: OAC only (no public access)
- **API Access**: CORS policies, rate limiting
- **Authentication**: Cognito for admin functions

### **Data Boundary**
- **DynamoDB**: VPC endpoints (optional)
- **Encryption**: At rest and in transit
- **Access**: IAM roles with least privilege

## Access Patterns

### **Public Access (Unauthenticated)**
1. **Website Browsing**:
   - Route 53 → CloudFront → S3 (static files)
   - Cache: 1 year for assets, 1 hour for HTML

2. **Portfolio Viewing**:
   - CloudFront → API Gateway → Lambda → DynamoDB
   - Read-only operations: GET /api/projects, GET /api/carousel

3. **Image Loading**:
   - CloudFront → S3 (via OAC)
   - Optimized delivery with compression

4. **Contact Form**:
   - API Gateway → Lambda → SES
   - Rate limited, validation enforced

### **Admin Access (Authenticated)**
1. **Authentication Flow**:
   - Cognito User Pool → MFA Challenge → JWT Token
   - Token validation via API Gateway authorizer

2. **Content Management**:
   - Authenticated API calls → Lambda → DynamoDB
   - CRUD operations: Projects, images, carousel config

3. **Image Upload**:
   - Pre-signed S3 URLs → Direct upload → Lambda processing
   - Automatic optimization and thumbnail generation

4. **Analytics Dashboard**:
   - CloudWatch metrics → Lambda aggregation → Admin UI

## Network Architecture

### **Edge Locations**
- CloudFront: Global distribution (200+ locations)
- Route 53: Anycast DNS resolution

### **Regional Services (us-east-1)**
- API Gateway, Lambda, DynamoDB
- S3 buckets (website + media)
- Cognito User Pool
- CloudWatch, SNS

### **Cross-Region (Optional)**
- S3 Cross-Region Replication for disaster recovery
- DynamoDB Global Tables for multi-region

## Security Controls

### **Identity & Access Management**
- **Lambda Execution Roles**: Minimal permissions
- **S3 Bucket Policies**: OAC-only access
- **API Gateway**: Resource-based policies
- **Cognito**: MFA, device tracking, risk detection

### **Data Protection**
- **Encryption at Rest**: S3 (SSE-S3), DynamoDB (AWS managed)
- **Encryption in Transit**: TLS 1.2+ everywhere
- **Data Classification**: Public (portfolio), Private (admin data)

### **Network Security**
- **WAF Rules**: OWASP Top 10 protection
- **VPC**: Not required (serverless)
- **Security Groups**: Managed by AWS services

## Cost Optimization

### **Tiered Storage**
- S3 Intelligent Tiering: Automatic cost optimization
- CloudFront: Edge caching reduces origin requests

### **Serverless Scaling**
- Lambda: Pay per invocation
- DynamoDB: On-demand billing
- API Gateway: Pay per request

### **Monitoring**
- CloudWatch billing alarms
- Cost allocation tags
- Usage dashboards

## Disaster Recovery

### **Backup Strategy**
- DynamoDB: Point-in-time recovery (35 days)
- S3: Versioning + Cross-Region Replication
- Lambda: Code in version control

### **Recovery Objectives**
- RTO: 4 hours (infrastructure rebuild)
- RPO: 1 hour (DynamoDB backup frequency)

## Compliance & Governance

### **Security Standards**
- AWS Well-Architected Framework alignment
- HTTPS everywhere
- Least privilege access
- Audit logging via CloudTrail

### **Operational Excellence**
- Infrastructure as Code (CDK)
- Automated deployments
- Monitoring and alerting
- Documentation and runbooks

This architecture provides a production-ready, secure, and cost-effective foundation for a photographer portfolio website with clear separation between public and administrative functions.
