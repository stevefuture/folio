import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

interface FrontendStackProps extends cdk.StackProps {
  api: any;
  userPool: any;
  domainName?: string;
  hostedZoneId?: string;
  environment?: string;
}

export class FrontendStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly websiteBucket: s3.Bucket;
  public readonly certificate?: acm.Certificate;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // S3 bucket for static site hosting (private)
    this.websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: 'DeleteOldVersions',
          status: s3.LifecycleRuleStatus.ENABLED,
          noncurrentVersionExpiration: cdk.Duration.days(30)
        }
      ]
    });

    // ACM Certificate (if domain provided)
    if (props.domainName) {
      this.certificate = new acm.Certificate(this, 'Certificate', {
        domainName: props.domainName,
        subjectAlternativeNames: [`www.${props.domainName}`],
        validation: acm.CertificateValidation.fromDns(),
        certificateName: 'PhotographyPortfolioCert'
      });
    }

    // Origin Access Control
    const oac = new cloudfront.OriginAccessControl(this, 'OAC', {
      description: 'OAC for photographer portfolio static site',
      originAccessControlOriginType: cloudfront.OriginAccessControlOriginType.S3,
      signing: cloudfront.Signing.SIGV4_ALWAYS
    });

    // Security Headers Response Policy
    const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: 'PhotographyPortfolioSecurityHeaders',
      comment: 'Security headers for photography portfolio',
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { 
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, 
          override: true 
        },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(31536000),
          includeSubdomains: true,
          preload: true,
          override: true
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self' https://*.amazonaws.com;",
          override: true
        }
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'X-Robots-Tag',
            value: 'index, follow',
            override: true
          },
          {
            header: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
            override: false
          }
        ]
      }
    });

    // CloudFront distribution with OAC
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Photography Portfolio Distribution',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.websiteBucket, {
          originAccessControl: oac
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeadersPolicy,
        compress: true,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.RestApiOrigin(props.api),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS
        },
        '/images/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.websiteBucket, {
            originAccessControl: oac
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          cachePolicy: new cloudfront.CachePolicy(this, 'ImageCachePolicy', {
            cachePolicyName: 'PhotographyPortfolioImages',
            comment: 'Cache policy for portfolio images',
            defaultTtl: cdk.Duration.days(30),
            maxTtl: cdk.Duration.days(365),
            minTtl: cdk.Duration.seconds(0),
            keyBehavior: cloudfront.CacheKeyBehavior.all(),
            headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Accept', 'Accept-Encoding'),
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.allowList('w', 'h', 'q', 'f'),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true
          }),
          compress: true,
          responseHeadersPolicy: securityHeadersPolicy
        },
        '*.html': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.websiteBucket, {
            originAccessControl: oac
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'HtmlCachePolicy', {
            cachePolicyName: 'PhotographyPortfolioHtml',
            defaultTtl: cdk.Duration.hours(1),
            maxTtl: cdk.Duration.days(1),
            minTtl: cdk.Duration.seconds(0)
          }),
          responseHeadersPolicy: securityHeadersPolicy,
          compress: true
        }
      },
      domainNames: props.domainName ? [props.domainName, `www.${props.domainName}`] : undefined,
      certificate: this.certificate,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5)
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(5)
        }
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      enableIpv6: true,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3
    });

    // S3 bucket policy for OAC (allow CloudFront access only)
    this.websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'AllowCloudFrontServicePrincipal',
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
      actions: ['s3:GetObject'],
      resources: [`${this.websiteBucket.bucketArn}/*`],
      conditions: {
        StringEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`
        }
      }
    }));

    // Explicit deny for all other access
    this.websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
      sid: 'DenyDirectAccess',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [this.websiteBucket.bucketArn, `${this.websiteBucket.bucketArn}/*`],
      conditions: {
        StringNotEquals: {
          'AWS:SourceArn': `arn:aws:cloudfront::${this.account}:distribution/${this.distribution.distributionId}`
        }
      }
    }));

    // Route 53 records (if domain and hosted zone provided)
    if (props.domainName && props.hostedZoneId) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.domainName
      });

      // Apex domain A record
      new route53.ARecord(this, 'ApexRecord', {
        zone: hostedZone,
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution)
        ),
        comment: 'Photography Portfolio - Apex domain'
      });

      // WWW subdomain A record
      new route53.ARecord(this, 'WwwRecord', {
        zone: hostedZone,
        recordName: `www.${props.domainName}`,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution)
        ),
        comment: 'Photography Portfolio - WWW subdomain'
      });

      // AAAA records for IPv6
      new route53.AaaaRecord(this, 'ApexRecordIPv6', {
        zone: hostedZone,
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution)
        )
      });

      new route53.AaaaRecord(this, 'WwwRecordIPv6', {
        zone: hostedZone,
        recordName: `www.${props.domainName}`,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution)
        )
      });
    }

    // Outputs
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: 'CloudFront distribution domain name',
      exportName: 'PhotographyPortfolio-DistributionDomain'
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
      exportName: 'PhotographyPortfolio-DistributionId'
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: this.websiteBucket.bucketName,
      description: 'S3 bucket for website hosting',
      exportName: 'PhotographyPortfolio-WebsiteBucket'
    });

    if (this.certificate) {
      new cdk.CfnOutput(this, 'CertificateArn', {
        value: this.certificate.certificateArn,
        description: 'ACM certificate ARN',
        exportName: 'PhotographyPortfolio-CertificateArn'
      });
    }

    if (props.domainName) {
      new cdk.CfnOutput(this, 'WebsiteUrl', {
        value: `https://${props.domainName}`,
        description: 'Website URL',
        exportName: 'PhotographyPortfolio-WebsiteUrl'
      });
    }
  }
}
