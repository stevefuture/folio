# AWS Security Review - Photography Portfolio

## Current Security Assessment

### ✅ **Implemented Security Measures**
- S3 bucket with private access + OAC
- Cognito User Pool with MFA enforcement
- Basic WAF with AWS Managed Rules
- HTTPS enforcement via CloudFront
- Basic security headers in Next.js config

### ❌ **Critical Security Gaps**
- Insufficient WAF rules for targeted attacks
- Missing comprehensive logging and monitoring
- Weak IAM policies (some overly permissive)
- Inadequate CSP headers
- No intrusion detection or alerting
- Missing API rate limiting
- No security scanning automation

## Security Recommendations by Category

### 1. WAF (Web Application Firewall) - CRITICAL

#### Current Issues
- Only basic AWS Managed Rules implemented
- No custom rules for application-specific threats
- Missing rate limiting and geo-blocking

#### Recommended WAF Rules

**High Priority Rules:**
```json
{
  "rules": [
    {
      "name": "AWSManagedRulesCommonRuleSet",
      "priority": 1,
      "action": "block"
    },
    {
      "name": "AWSManagedRulesKnownBadInputsRuleSet", 
      "priority": 2,
      "action": "block"
    },
    {
      "name": "AWSManagedRulesLinuxRuleSet",
      "priority": 3,
      "action": "block"
    },
    {
      "name": "AWSManagedRulesSQLiRuleSet",
      "priority": 4,
      "action": "block"
    },
    {
      "name": "RateLimitRule",
      "priority": 10,
      "rateLimit": 2000,
      "action": "block"
    },
    {
      "name": "AdminPathProtection",
      "priority": 15,
      "pathPattern": "/admin/*",
      "rateLimit": 100,
      "action": "block"
    },
    {
      "name": "APIRateLimit",
      "priority": 20,
      "pathPattern": "/api/*",
      "rateLimit": 500,
      "action": "block"
    }
  ]
}
```

**Custom Rules for Photography Portfolio:**
- Block requests to non-existent admin paths
- Rate limit image upload endpoints
- Protect against image-based attacks
- Block suspicious user agents

### 2. IAM Policies - HIGH PRIORITY

#### Current Issues
- Lambda roles may have excessive permissions
- Missing resource-specific restrictions
- No condition-based access controls

#### Recommended IAM Policies

**Lambda Execution Role (Least Privilege):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream", 
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:Query",
        "dynamodb:UpdateItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/PhotographyPortfolio",
        "arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/PhotographyPortfolio/index/*"
      ],
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:Attributes": [
            "PK", "SK", "Title", "Description", "Status", "IsVisible"
          ]
        }
      }
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::portfolio-bucket/*",
      "Condition": {
        "StringEquals": {
          "s3:ExistingObjectTag/Environment": "${Environment}"
        }
      }
    }
  ]
}
```

**Admin User Policy:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::portfolio-bucket/admin/*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "us-east-1"
        },
        "DateGreaterThan": {
          "aws:CurrentTime": "2024-01-01T00:00:00Z"
        }
      }
    },
    {
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "Bool": {
          "aws:MultiFactorAuthPresent": "false"
        }
      }
    }
  ]
}
```

### 3. Content Security Policy (CSP) - HIGH PRIORITY

#### Current Issues
- CSP headers too permissive
- Missing nonce-based script protection
- No report-uri for violation monitoring

#### Recommended CSP Headers

**Production CSP:**
```javascript
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'nonce-{NONCE}' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' https://fonts.gstatic.com",
  "connect-src 'self' https://*.amazonaws.com https://api.yourdomain.com",
  "media-src 'self' https://images.yourdomain.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "report-uri https://yourdomain.com/api/csp-report"
];
```

**Development CSP (More Permissive):**
```javascript
const devCspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: blob:",
  "connect-src 'self' ws: wss: https:",
  "report-uri https://staging.yourdomain.com/api/csp-report"
];
```

### 4. Logging & Monitoring - CRITICAL

#### Current Issues
- No centralized logging strategy
- Missing security event monitoring
- No log retention policies

#### Recommended Logging Implementation

**CloudWatch Log Groups:**
- `/aws/lambda/portfolio-api` - API access logs
- `/aws/waf/portfolio` - WAF blocked requests
- `/aws/cloudfront/portfolio` - CDN access logs
- `/aws/cognito/portfolio` - Authentication events
- `/security/portfolio` - Security events

**Security Events to Log:**
- Failed authentication attempts
- Admin panel access
- File upload attempts
- API rate limit violations
- WAF rule triggers
- Unusual traffic patterns

### 5. Alerting & Incident Response - HIGH PRIORITY

#### Recommended CloudWatch Alarms

**Security Alarms:**
- Multiple failed login attempts (>5 in 5 minutes)
- WAF blocks spike (>100 in 1 minute)
- Admin API access outside business hours
- Large file uploads (>10MB)
- Unusual geographic access patterns

**Operational Alarms:**
- Lambda error rate >1%
- DynamoDB throttling events
- CloudFront 4xx/5xx error spike
- API Gateway latency >2 seconds

## Enhanced Security Implementation

### 1. WAF Rules Enhancement

```typescript
// Enhanced WAF configuration
const enhancedWafRules = [
  // Geographic restrictions
  {
    name: 'GeoBlockRule',
    priority: 5,
    action: { block: {} },
    statement: {
      geoMatchStatement: {
        countryCodes: ['CN', 'RU', 'KP'] // Block high-risk countries
      }
    }
  },
  
  // Admin path protection
  {
    name: 'AdminPathProtection',
    priority: 15,
    action: { block: {} },
    statement: {
      andStatement: {
        statements: [
          {
            byteMatchStatement: {
              searchString: '/admin',
              fieldToMatch: { uriPath: {} },
              textTransformations: [{ priority: 0, type: 'LOWERCASE' }]
            }
          },
          {
            notStatement: {
              statement: {
                ipSetReferenceStatement: {
                  arn: 'arn:aws:wafv2:us-east-1:ACCOUNT:global/ipset/AdminAllowedIPs'
                }
              }
            }
          }
        ]
      }
    }
  },
  
  // Image upload protection
  {
    name: 'ImageUploadProtection',
    priority: 25,
    action: { block: {} },
    statement: {
      rateBasedStatement: {
        limit: 10,
        aggregateKeyType: 'IP',
        scopeDownStatement: {
          byteMatchStatement: {
            searchString: '/api/upload',
            fieldToMatch: { uriPath: {} }
          }
        }
      }
    }
  }
];
```

### 2. Enhanced Security Headers

```typescript
// Comprehensive security headers
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin'
};
```

### 3. API Security Enhancements

```typescript
// API Gateway security configuration
const apiSecurity = {
  throttling: {
    rateLimit: 1000,
    burstLimit: 2000
  },
  authentication: {
    cognitoAuthorizer: {
      type: 'COGNITO_USER_POOLS',
      authorizerUri: cognitoUserPoolArn,
      identitySource: 'method.request.header.Authorization'
    }
  },
  validation: {
    requestValidation: true,
    responseValidation: true
  }
};
```

### 4. Database Security

```typescript
// DynamoDB security enhancements
const dynamoDbSecurity = {
  encryption: {
    sseSpecification: {
      sseEnabled: true,
      kmsMasterKeyId: 'alias/portfolio-dynamodb-key'
    }
  },
  pointInTimeRecovery: true,
  backupPolicy: {
    pointInTimeRecoveryEnabled: true,
    continuousBackupsEnabled: true
  },
  streamSpecification: {
    streamEnabled: true,
    streamViewType: 'NEW_AND_OLD_IMAGES'
  }
};
```

## Security Monitoring Dashboard

### Key Metrics to Monitor

**Security Metrics:**
- WAF blocked requests per hour
- Failed authentication attempts
- Admin panel access frequency
- File upload volume and types
- Geographic distribution of requests

**Performance Metrics:**
- API response times
- Error rates by endpoint
- Database query performance
- CDN cache hit ratios

**Business Metrics:**
- Portfolio page views
- Contact form submissions
- Image gallery engagement
- Mobile vs desktop usage

## Incident Response Plan

### 1. Security Incident Classification

**P0 - Critical (Response: Immediate)**
- Data breach or unauthorized access
- Service completely unavailable
- Active attack in progress

**P1 - High (Response: 1 hour)**
- Elevated error rates
- Performance degradation
- Suspicious activity patterns

**P2 - Medium (Response: 4 hours)**
- Minor security violations
- Non-critical feature issues
- Monitoring alerts

### 2. Response Procedures

**Immediate Actions:**
1. Assess impact and scope
2. Contain the incident
3. Preserve evidence
4. Notify stakeholders
5. Begin remediation

**Investigation Steps:**
1. Review CloudWatch logs
2. Analyze WAF blocked requests
3. Check authentication logs
4. Examine database access patterns
5. Review file upload activities

## Cost-Effective Security Measures

### Free/Low-Cost Improvements
- Enable AWS Config rules
- Set up CloudTrail logging
- Configure GuardDuty
- Implement AWS Security Hub
- Use AWS Trusted Advisor

### Estimated Monthly Costs
- **WAF**: $5-15 (based on requests)
- **CloudWatch Logs**: $2-8 (based on volume)
- **GuardDuty**: $3-10 (based on events)
- **Config**: $2-6 (based on rules)
- **Total**: ~$15-40/month

## Implementation Priority

### Phase 1 (Week 1) - Critical
1. Enhanced WAF rules
2. Improved IAM policies
3. Comprehensive logging
4. Basic alerting

### Phase 2 (Week 2) - High Priority
1. CSP header implementation
2. Security monitoring dashboard
3. Incident response procedures
4. Backup and recovery testing

### Phase 3 (Week 3) - Medium Priority
1. Advanced threat detection
2. Automated security scanning
3. Performance optimization
4. Documentation updates

This security review provides a comprehensive roadmap for securing the photography portfolio while maintaining performance and cost-effectiveness.
