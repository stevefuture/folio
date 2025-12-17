"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FrontendStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const iam = require("aws-cdk-lib/aws-iam");
const route53 = require("aws-cdk-lib/aws-route53");
const targets = require("aws-cdk-lib/aws-route53-targets");
const acm = require("aws-cdk-lib/aws-certificatemanager");
class FrontendStack extends cdk.Stack {
    constructor(scope, id, props) {
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
                target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
                comment: 'Photography Portfolio - Apex domain'
            });
            // WWW subdomain A record
            new route53.ARecord(this, 'WwwRecord', {
                zone: hostedZone,
                recordName: `www.${props.domainName}`,
                target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
                comment: 'Photography Portfolio - WWW subdomain'
            });
            // AAAA records for IPv6
            new route53.AaaaRecord(this, 'ApexRecordIPv6', {
                zone: hostedZone,
                recordName: props.domainName,
                target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution))
            });
            new route53.AaaaRecord(this, 'WwwRecordIPv6', {
                zone: hostedZone,
                recordName: `www.${props.domainName}`,
                target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution))
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
exports.FrontendStack = FrontendStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZnJvbnRlbmQtc3RhY2suanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJmcm9udGVuZC1zdGFjay50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSxtQ0FBbUM7QUFDbkMseUNBQXlDO0FBQ3pDLHlEQUF5RDtBQUN6RCw4REFBOEQ7QUFDOUQsMkNBQTJDO0FBQzNDLG1EQUFtRDtBQUNuRCwyREFBMkQ7QUFDM0QsMERBQTBEO0FBVzFELE1BQWEsYUFBYyxTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBSzFDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBeUI7UUFDakUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsOENBQThDO1FBQzlDLElBQUksQ0FBQyxhQUFhLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDeEQsU0FBUyxFQUFFLElBQUk7WUFDZixVQUFVLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLFVBQVU7WUFDMUMsaUJBQWlCLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFNBQVM7WUFDakQsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTTtZQUN2QyxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLG1CQUFtQjtvQkFDdkIsTUFBTSxFQUFFLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxPQUFPO29CQUN0QywyQkFBMkIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7aUJBQ25EO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCx1Q0FBdUM7UUFDdkMsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtnQkFDMUQsVUFBVSxFQUFFLEtBQUssQ0FBQyxVQUFV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LEtBQUssRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVU7WUFDcEMsV0FBVyxFQUFFLCtCQUErQjtZQUM1QyxVQUFVLEVBQUUsb0NBQW9DO1NBQ2pELENBQUMsQ0FBQztRQUVILElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1lBQ3JCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZ0JBQWdCLEVBQUU7Z0JBQ3hDLEtBQUssRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWM7Z0JBQ3RDLFdBQVcsRUFBRSxxQkFBcUI7Z0JBQ2xDLFVBQVUsRUFBRSxxQ0FBcUM7YUFDbEQsQ0FBQyxDQUFDO1FBQ0wsQ0FBQztRQUVELElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3JCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO2dCQUNwQyxLQUFLLEVBQUUsV0FBVyxLQUFLLENBQUMsVUFBVSxFQUFFO2dCQUNwQyxXQUFXLEVBQUUsYUFBYTtnQkFDMUIsVUFBVSxFQUFFLGlDQUFpQzthQUM5QyxDQUFDLENBQUM7UUFDTCxDQUFDO0lBQ0gsQ0FBQztDQUNGO0FBMVFELHNDQTBRQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBvcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5cbmludGVyZmFjZSBGcm9udGVuZFN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGFwaTogYW55O1xuICB1c2VyUG9vbDogYW55O1xuICBkb21haW5OYW1lPzogc3RyaW5nO1xuICBob3N0ZWRab25lSWQ/OiBzdHJpbmc7XG4gIGVudmlyb25tZW50Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRnJvbnRlbmRTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBkaXN0cmlidXRpb246IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgd2Vic2l0ZUJ1Y2tldDogczMuQnVja2V0O1xuICBwdWJsaWMgcmVhZG9ubHkgY2VydGlmaWNhdGU/OiBhY20uQ2VydGlmaWNhdGU7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IEZyb250ZW5kU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciBzdGF0aWMgc2l0ZSBob3N0aW5nIChwcml2YXRlKVxuICAgIHRoaXMud2Vic2l0ZUJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1dlYnNpdGVCdWNrZXQnLCB7XG4gICAgICB2ZXJzaW9uZWQ6IHRydWUsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnRGVsZXRlT2xkVmVyc2lvbnMnLFxuICAgICAgICAgIHN0YXR1czogczMuTGlmZWN5Y2xlUnVsZVN0YXR1cy5FTkFCTEVELFxuICAgICAgICAgIG5vbmN1cnJlbnRWZXJzaW9uRXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApXG4gICAgICAgIH1cbiAgICAgIF1cbiAgICB9KTtcblxuICAgIC8vIEFDTSBDZXJ0aWZpY2F0ZSAoaWYgZG9tYWluIHByb3ZpZGVkKVxuICAgIGlmIChwcm9wcy5kb21haW5OYW1lKSB7XG4gICAgICB0aGlzLmNlcnRpZmljYXRlID0gbmV3IGFjbS5DZXJ0aWZpY2F0ZSh0aGlzLCAnQ2VydGlmaWNhdGUnLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6IHByb3BzLmRvbWFpbk5hbWUsXG4gICAgICAgIHN1YmplY3RBbHRlcm5hdGl2ZU5hbWVzOiBbYHd3dy4ke3Byb3BzLmRvbWFpbk5hbWV9YF0sXG4gICAgICAgIHZhbGlkYXRpb246IGFjbS5DZXJ0aWZpY2F0ZVZhbGlkYXRpb24uZnJvbURucygpLFxuICAgICAgICBjZXJ0aWZpY2F0ZU5hbWU6ICdQaG90b2dyYXBoeVBvcnRmb2xpb0NlcnQnXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBPcmlnaW4gQWNjZXNzIENvbnRyb2xcbiAgICBjb25zdCBvYWMgPSBuZXcgY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NDb250cm9sKHRoaXMsICdPQUMnLCB7XG4gICAgICBkZXNjcmlwdGlvbjogJ09BQyBmb3IgcGhvdG9ncmFwaGVyIHBvcnRmb2xpbyBzdGF0aWMgc2l0ZScsXG4gICAgICBvcmlnaW5BY2Nlc3NDb250cm9sT3JpZ2luVHlwZTogY2xvdWRmcm9udC5PcmlnaW5BY2Nlc3NDb250cm9sT3JpZ2luVHlwZS5TMyxcbiAgICAgIHNpZ25pbmc6IGNsb3VkZnJvbnQuU2lnbmluZy5TSUdWNF9BTFdBWVNcbiAgICB9KTtcblxuICAgIC8vIFNlY3VyaXR5IEhlYWRlcnMgUmVzcG9uc2UgUG9saWN5XG4gICAgY29uc3Qgc2VjdXJpdHlIZWFkZXJzUG9saWN5ID0gbmV3IGNsb3VkZnJvbnQuUmVzcG9uc2VIZWFkZXJzUG9saWN5KHRoaXMsICdTZWN1cml0eUhlYWRlcnMnLCB7XG4gICAgICByZXNwb25zZUhlYWRlcnNQb2xpY3lOYW1lOiAnUGhvdG9ncmFwaHlQb3J0Zm9saW9TZWN1cml0eUhlYWRlcnMnLFxuICAgICAgY29tbWVudDogJ1NlY3VyaXR5IGhlYWRlcnMgZm9yIHBob3RvZ3JhcGh5IHBvcnRmb2xpbycsXG4gICAgICBzZWN1cml0eUhlYWRlcnNCZWhhdmlvcjoge1xuICAgICAgICBjb250ZW50VHlwZU9wdGlvbnM6IHsgb3ZlcnJpZGU6IHRydWUgfSxcbiAgICAgICAgZnJhbWVPcHRpb25zOiB7IGZyYW1lT3B0aW9uOiBjbG91ZGZyb250LkhlYWRlcnNGcmFtZU9wdGlvbi5ERU5ZLCBvdmVycmlkZTogdHJ1ZSB9LFxuICAgICAgICByZWZlcnJlclBvbGljeTogeyBcbiAgICAgICAgICByZWZlcnJlclBvbGljeTogY2xvdWRmcm9udC5IZWFkZXJzUmVmZXJyZXJQb2xpY3kuU1RSSUNUX09SSUdJTl9XSEVOX0NST1NTX09SSUdJTiwgXG4gICAgICAgICAgb3ZlcnJpZGU6IHRydWUgXG4gICAgICAgIH0sXG4gICAgICAgIHN0cmljdFRyYW5zcG9ydFNlY3VyaXR5OiB7XG4gICAgICAgICAgYWNjZXNzQ29udHJvbE1heEFnZTogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzE1MzYwMDApLFxuICAgICAgICAgIGluY2x1ZGVTdWJkb21haW5zOiB0cnVlLFxuICAgICAgICAgIHByZWxvYWQ6IHRydWUsXG4gICAgICAgICAgb3ZlcnJpZGU6IHRydWVcbiAgICAgICAgfSxcbiAgICAgICAgY29udGVudFNlY3VyaXR5UG9saWN5OiB7XG4gICAgICAgICAgY29udGVudFNlY3VyaXR5UG9saWN5OiBcImRlZmF1bHQtc3JjICdzZWxmJzsgaW1nLXNyYyAnc2VsZicgZGF0YTogaHR0cHM6OyBzY3JpcHQtc3JjICdzZWxmJyAndW5zYWZlLWV2YWwnICd1bnNhZmUtaW5saW5lJzsgc3R5bGUtc3JjICdzZWxmJyAndW5zYWZlLWlubGluZSc7IGZvbnQtc3JjICdzZWxmJyBkYXRhOjsgY29ubmVjdC1zcmMgJ3NlbGYnIGh0dHBzOi8vKi5hbWF6b25hd3MuY29tO1wiLFxuICAgICAgICAgIG92ZXJyaWRlOiB0cnVlXG4gICAgICAgIH1cbiAgICAgIH0sXG4gICAgICBjdXN0b21IZWFkZXJzQmVoYXZpb3I6IHtcbiAgICAgICAgY3VzdG9tSGVhZGVyczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGhlYWRlcjogJ1gtUm9ib3RzLVRhZycsXG4gICAgICAgICAgICB2YWx1ZTogJ2luZGV4LCBmb2xsb3cnLFxuICAgICAgICAgICAgb3ZlcnJpZGU6IHRydWVcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGhlYWRlcjogJ0NhY2hlLUNvbnRyb2wnLFxuICAgICAgICAgICAgdmFsdWU6ICdwdWJsaWMsIG1heC1hZ2U9MzE1MzYwMDAsIGltbXV0YWJsZScsXG4gICAgICAgICAgICBvdmVycmlkZTogZmFsc2VcbiAgICAgICAgICB9XG4gICAgICAgIF1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIHdpdGggT0FDXG4gICAgdGhpcy5kaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0Rpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGNvbW1lbnQ6ICdQaG90b2dyYXBoeSBQb3J0Zm9saW8gRGlzdHJpYnV0aW9uJyxcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IG9yaWdpbnMuUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0NvbnRyb2wodGhpcy53ZWJzaXRlQnVja2V0LCB7XG4gICAgICAgICAgb3JpZ2luQWNjZXNzQ29udHJvbDogb2FjXG4gICAgICAgIH0pLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRUQsXG4gICAgICAgIHJlc3BvbnNlSGVhZGVyc1BvbGljeTogc2VjdXJpdHlIZWFkZXJzUG9saWN5LFxuICAgICAgICBjb21wcmVzczogdHJ1ZSxcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfR0VUX0hFQURfT1BUSU9OU1xuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxCZWhhdmlvcnM6IHtcbiAgICAgICAgJy9hcGkvKic6IHtcbiAgICAgICAgICBvcmlnaW46IG5ldyBvcmlnaW5zLlJlc3RBcGlPcmlnaW4ocHJvcHMuYXBpKSxcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5IVFRQU19PTkxZLFxuICAgICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfRElTQUJMRUQsXG4gICAgICAgICAgb3JpZ2luUmVxdWVzdFBvbGljeTogY2xvdWRmcm9udC5PcmlnaW5SZXF1ZXN0UG9saWN5LkNPUlNfUzNfT1JJR0lOLFxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0FMTCxcbiAgICAgICAgICByZXNwb25zZUhlYWRlcnNQb2xpY3k6IGNsb3VkZnJvbnQuUmVzcG9uc2VIZWFkZXJzUG9saWN5LkNPUlNfQUxMT1dfQUxMX09SSUdJTlNcbiAgICAgICAgfSxcbiAgICAgICAgJy9pbWFnZXMvKic6IHtcbiAgICAgICAgICBvcmlnaW46IG9yaWdpbnMuUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0NvbnRyb2wodGhpcy53ZWJzaXRlQnVja2V0LCB7XG4gICAgICAgICAgICBvcmlnaW5BY2Nlc3NDb250cm9sOiBvYWNcbiAgICAgICAgICB9KSxcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5IVFRQU19PTkxZLFxuICAgICAgICAgIGNhY2hlUG9saWN5OiBuZXcgY2xvdWRmcm9udC5DYWNoZVBvbGljeSh0aGlzLCAnSW1hZ2VDYWNoZVBvbGljeScsIHtcbiAgICAgICAgICAgIGNhY2hlUG9saWN5TmFtZTogJ1Bob3RvZ3JhcGh5UG9ydGZvbGlvSW1hZ2VzJyxcbiAgICAgICAgICAgIGNvbW1lbnQ6ICdDYWNoZSBwb2xpY3kgZm9yIHBvcnRmb2xpbyBpbWFnZXMnLFxuICAgICAgICAgICAgZGVmYXVsdFR0bDogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24uZGF5cygzNjUpLFxuICAgICAgICAgICAgbWluVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgICAgIGtleUJlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlS2V5QmVoYXZpb3IuYWxsKCksXG4gICAgICAgICAgICBoZWFkZXJCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUhlYWRlckJlaGF2aW9yLmFsbG93TGlzdCgnQWNjZXB0JywgJ0FjY2VwdC1FbmNvZGluZycpLFxuICAgICAgICAgICAgcXVlcnlTdHJpbmdCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZVF1ZXJ5U3RyaW5nQmVoYXZpb3IuYWxsb3dMaXN0KCd3JywgJ2gnLCAncScsICdmJyksXG4gICAgICAgICAgICBlbmFibGVBY2NlcHRFbmNvZGluZ0d6aXA6IHRydWUsXG4gICAgICAgICAgICBlbmFibGVBY2NlcHRFbmNvZGluZ0Jyb3RsaTogdHJ1ZVxuICAgICAgICAgIH0pLFxuICAgICAgICAgIGNvbXByZXNzOiB0cnVlLFxuICAgICAgICAgIHJlc3BvbnNlSGVhZGVyc1BvbGljeTogc2VjdXJpdHlIZWFkZXJzUG9saWN5XG4gICAgICAgIH0sXG4gICAgICAgICcqLmh0bWwnOiB7XG4gICAgICAgICAgb3JpZ2luOiBvcmlnaW5zLlMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NDb250cm9sKHRoaXMud2Vic2l0ZUJ1Y2tldCwge1xuICAgICAgICAgICAgb3JpZ2luQWNjZXNzQ29udHJvbDogb2FjXG4gICAgICAgICAgfSksXG4gICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgICAgY2FjaGVQb2xpY3k6IG5ldyBjbG91ZGZyb250LkNhY2hlUG9saWN5KHRoaXMsICdIdG1sQ2FjaGVQb2xpY3knLCB7XG4gICAgICAgICAgICBjYWNoZVBvbGljeU5hbWU6ICdQaG90b2dyYXBoeVBvcnRmb2xpb0h0bWwnLFxuICAgICAgICAgICAgZGVmYXVsdFR0bDogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgICAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgICAgICAgIG1pblR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMClcbiAgICAgICAgICB9KSxcbiAgICAgICAgICByZXNwb25zZUhlYWRlcnNQb2xpY3k6IHNlY3VyaXR5SGVhZGVyc1BvbGljeSxcbiAgICAgICAgICBjb21wcmVzczogdHJ1ZVxuICAgICAgICB9XG4gICAgICB9LFxuICAgICAgZG9tYWluTmFtZXM6IHByb3BzLmRvbWFpbk5hbWUgPyBbcHJvcHMuZG9tYWluTmFtZSwgYHd3dy4ke3Byb3BzLmRvbWFpbk5hbWV9YF0gOiB1bmRlZmluZWQsXG4gICAgICBjZXJ0aWZpY2F0ZTogdGhpcy5jZXJ0aWZpY2F0ZSxcbiAgICAgIG1pbmltdW1Qcm90b2NvbFZlcnNpb246IGNsb3VkZnJvbnQuU2VjdXJpdHlQb2xpY3lQcm90b2NvbC5UTFNfVjFfMl8yMDIxLFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgIGVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy9pbmRleC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpXG4gICAgICAgIH1cbiAgICAgIF0sXG4gICAgICBwcmljZUNsYXNzOiBjbG91ZGZyb250LlByaWNlQ2xhc3MuUFJJQ0VfQ0xBU1NfMTAwLFxuICAgICAgZW5hYmxlSXB2NjogdHJ1ZSxcbiAgICAgIGh0dHBWZXJzaW9uOiBjbG91ZGZyb250Lkh0dHBWZXJzaW9uLkhUVFAyX0FORF8zXG4gICAgfSk7XG5cbiAgICAvLyBTMyBidWNrZXQgcG9saWN5IGZvciBPQUMgKGFsbG93IENsb3VkRnJvbnQgYWNjZXNzIG9ubHkpXG4gICAgdGhpcy53ZWJzaXRlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgc2lkOiAnQWxsb3dDbG91ZEZyb250U2VydmljZVByaW5jaXBhbCcsXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICBwcmluY2lwYWxzOiBbbmV3IGlhbS5TZXJ2aWNlUHJpbmNpcGFsKCdjbG91ZGZyb250LmFtYXpvbmF3cy5jb20nKV0sXG4gICAgICBhY3Rpb25zOiBbJ3MzOkdldE9iamVjdCddLFxuICAgICAgcmVzb3VyY2VzOiBbYCR7dGhpcy53ZWJzaXRlQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAnQVdTOlNvdXJjZUFybic6IGBhcm46YXdzOmNsb3VkZnJvbnQ6OiR7dGhpcy5hY2NvdW50fTpkaXN0cmlidXRpb24vJHt0aGlzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZH1gXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSk7XG5cbiAgICAvLyBFeHBsaWNpdCBkZW55IGZvciBhbGwgb3RoZXIgYWNjZXNzXG4gICAgdGhpcy53ZWJzaXRlQnVja2V0LmFkZFRvUmVzb3VyY2VQb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgc2lkOiAnRGVueURpcmVjdEFjY2VzcycsXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuREVOWSxcbiAgICAgIHByaW5jaXBhbHM6IFtuZXcgaWFtLkFueVByaW5jaXBhbCgpXSxcbiAgICAgIGFjdGlvbnM6IFsnczM6KiddLFxuICAgICAgcmVzb3VyY2VzOiBbdGhpcy53ZWJzaXRlQnVja2V0LmJ1Y2tldEFybiwgYCR7dGhpcy53ZWJzaXRlQnVja2V0LmJ1Y2tldEFybn0vKmBdLFxuICAgICAgY29uZGl0aW9uczoge1xuICAgICAgICBTdHJpbmdOb3RFcXVhbHM6IHtcbiAgICAgICAgICAnQVdTOlNvdXJjZUFybic6IGBhcm46YXdzOmNsb3VkZnJvbnQ6OiR7dGhpcy5hY2NvdW50fTpkaXN0cmlidXRpb24vJHt0aGlzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZH1gXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KSk7XG5cbiAgICAvLyBSb3V0ZSA1MyByZWNvcmRzIChpZiBkb21haW4gYW5kIGhvc3RlZCB6b25lIHByb3ZpZGVkKVxuICAgIGlmIChwcm9wcy5kb21haW5OYW1lICYmIHByb3BzLmhvc3RlZFpvbmVJZCkge1xuICAgICAgY29uc3QgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXModGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICAgIGhvc3RlZFpvbmVJZDogcHJvcHMuaG9zdGVkWm9uZUlkLFxuICAgICAgICB6b25lTmFtZTogcHJvcHMuZG9tYWluTmFtZVxuICAgICAgfSk7XG5cbiAgICAgIC8vIEFwZXggZG9tYWluIEEgcmVjb3JkXG4gICAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdBcGV4UmVjb3JkJywge1xuICAgICAgICB6b25lOiBob3N0ZWRab25lLFxuICAgICAgICByZWNvcmROYW1lOiBwcm9wcy5kb21haW5OYW1lLFxuICAgICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgICBuZXcgdGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KHRoaXMuZGlzdHJpYnV0aW9uKVxuICAgICAgICApLFxuICAgICAgICBjb21tZW50OiAnUGhvdG9ncmFwaHkgUG9ydGZvbGlvIC0gQXBleCBkb21haW4nXG4gICAgICB9KTtcblxuICAgICAgLy8gV1dXIHN1YmRvbWFpbiBBIHJlY29yZFxuICAgICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnV3d3UmVjb3JkJywge1xuICAgICAgICB6b25lOiBob3N0ZWRab25lLFxuICAgICAgICByZWNvcmROYW1lOiBgd3d3LiR7cHJvcHMuZG9tYWluTmFtZX1gLFxuICAgICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgICBuZXcgdGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KHRoaXMuZGlzdHJpYnV0aW9uKVxuICAgICAgICApLFxuICAgICAgICBjb21tZW50OiAnUGhvdG9ncmFwaHkgUG9ydGZvbGlvIC0gV1dXIHN1YmRvbWFpbidcbiAgICAgIH0pO1xuXG4gICAgICAvLyBBQUFBIHJlY29yZHMgZm9yIElQdjZcbiAgICAgIG5ldyByb3V0ZTUzLkFhYWFSZWNvcmQodGhpcywgJ0FwZXhSZWNvcmRJUHY2Jywge1xuICAgICAgICB6b25lOiBob3N0ZWRab25lLFxuICAgICAgICByZWNvcmROYW1lOiBwcm9wcy5kb21haW5OYW1lLFxuICAgICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgICBuZXcgdGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KHRoaXMuZGlzdHJpYnV0aW9uKVxuICAgICAgICApXG4gICAgICB9KTtcblxuICAgICAgbmV3IHJvdXRlNTMuQWFhYVJlY29yZCh0aGlzLCAnV3d3UmVjb3JkSVB2NicsIHtcbiAgICAgICAgem9uZTogaG9zdGVkWm9uZSxcbiAgICAgICAgcmVjb3JkTmFtZTogYHd3dy4ke3Byb3BzLmRvbWFpbk5hbWV9YCxcbiAgICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgICAgbmV3IHRhcmdldHMuQ2xvdWRGcm9udFRhcmdldCh0aGlzLmRpc3RyaWJ1dGlvbilcbiAgICAgICAgKVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gT3V0cHV0c1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEaXN0cmlidXRpb25Eb21haW5OYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMuZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIGRvbWFpbiBuYW1lJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdQaG90b2dyYXBoeVBvcnRmb2xpby1EaXN0cmlidXRpb25Eb21haW4nXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGlzdHJpYnV0aW9uSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5kaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIElEJyxcbiAgICAgIGV4cG9ydE5hbWU6ICdQaG90b2dyYXBoeVBvcnRmb2xpby1EaXN0cmlidXRpb25JZCdcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJzaXRlQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLndlYnNpdGVCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUzMgYnVja2V0IGZvciB3ZWJzaXRlIGhvc3RpbmcnLFxuICAgICAgZXhwb3J0TmFtZTogJ1Bob3RvZ3JhcGh5UG9ydGZvbGlvLVdlYnNpdGVCdWNrZXQnXG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy5jZXJ0aWZpY2F0ZSkge1xuICAgICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NlcnRpZmljYXRlQXJuJywge1xuICAgICAgICB2YWx1ZTogdGhpcy5jZXJ0aWZpY2F0ZS5jZXJ0aWZpY2F0ZUFybixcbiAgICAgICAgZGVzY3JpcHRpb246ICdBQ00gY2VydGlmaWNhdGUgQVJOJyxcbiAgICAgICAgZXhwb3J0TmFtZTogJ1Bob3RvZ3JhcGh5UG9ydGZvbGlvLUNlcnRpZmljYXRlQXJuJ1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYgKHByb3BzLmRvbWFpbk5hbWUpIHtcbiAgICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJzaXRlVXJsJywge1xuICAgICAgICB2YWx1ZTogYGh0dHBzOi8vJHtwcm9wcy5kb21haW5OYW1lfWAsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnV2Vic2l0ZSBVUkwnLFxuICAgICAgICBleHBvcnROYW1lOiAnUGhvdG9ncmFwaHlQb3J0Zm9saW8tV2Vic2l0ZVVybCdcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxufVxuIl19