import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

interface FrontendStackProps extends cdk.StackProps {
  stage: string;
  webAclArn: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const prefix = `d3ftly-${props.stage}`;
    const domainNames = ["d3ftly.com", "www.d3ftly.com"];

    // Route53 hosted zone (must exist in the account)
    const hostedZone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: "d3ftly.com",
    });

    // ACM certificate (must be us-east-1 for CloudFront — this stack deploys to us-east-1)
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: "d3ftly.com",
      subjectAlternativeNames: ["www.d3ftly.com"],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // S3 bucket for static site
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: `${prefix}-frontend`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy:
        props.stage === "prod"
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.stage !== "prod",
    });

    // CloudFront OAC
    const oac = new cloudfront.S3OriginAccessControl(this, "OAC", {
      originAccessControlName: `${prefix}-oac`,
    });

    // Security headers policy
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "SecurityHeaders",
      {
        responseHeadersPolicyName: `${prefix}-security-headers`,
        securityHeadersBehavior: {
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentTypeOptions: { override: true },
          frameOptions: {
            frameOption: cloudfront.HeadersFrameOption.DENY,
            override: true,
          },
          xssProtection: {
            protection: true,
            modeBlock: true,
            override: true,
          },
          referrerPolicy: {
            referrerPolicy:
              cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          contentSecurityPolicy: {
            contentSecurityPolicy:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'",
            override: true,
          },
        },
        customHeadersBehavior: {
          customHeaders: [
            {
              header: "Permissions-Policy",
              value: "camera=(), microphone=(), geolocation=()",
              override: true,
            },
          ],
        },
      }
    );

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
      },
      defaultRootObject: "index.html",
      webAclId: props.webAclArn,
      domainNames,
      certificate,
      // Custom error responses: serve branded error pages
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 404,
          responsePagePath: "/errors/404.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 404,
          responsePagePath: "/errors/404.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 500,
          responseHttpStatus: 500,
          responsePagePath: "/errors/500.html",
          ttl: cdk.Duration.seconds(10),
        },
        {
          httpStatus: 503,
          responseHttpStatus: 503,
          responsePagePath: "/errors/503.html",
          ttl: cdk.Duration.seconds(10),
        },
      ],
    });

    // DNS: d3ftly.com → CloudFront
    new route53.ARecord(this, "ApexAlias", {
      zone: hostedZone,
      recordName: "d3ftly.com",
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
    });

    // DNS: www.d3ftly.com → CloudFront
    new route53.ARecord(this, "WwwAlias", {
      zone: hostedZone,
      recordName: "www.d3ftly.com",
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
    });

    // Deploy static site (runs on `cdk deploy`)
    new s3deploy.BucketDeployment(this, "DeploySite", {
      sources: [s3deploy.Source.asset("../out")],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ["/*"],
      exclude: ["errors/*"],
    });

    // Deploy error pages to /errors/ prefix
    new s3deploy.BucketDeployment(this, "DeployErrorPages", {
      sources: [s3deploy.Source.asset("./error-pages")],
      destinationBucket: siteBucket,
      destinationKeyPrefix: "errors",
    });

    // Outputs
    new cdk.CfnOutput(this, "DistributionUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
  }
}
