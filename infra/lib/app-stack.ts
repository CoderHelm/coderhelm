import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import {
  NextExportDeployment,
  NOT_FOUND_PAGE,
  checkFunctionSize,
  notFoundStatusCode,
  pageRoutes,
  routeTable,
} from "./static-site";

interface AppStackProps extends cdk.StackProps {
  stage: string;
  webAclArn: string;
  /** The dashboard's static export. Defaults to ../dashboard/out. */
  outDir?: string;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    const prefix = `coderhelm-${props.stage}`;
    const domainName = "app.coderhelm.com";
    const outDir = props.outDir ?? "../dashboard/out";

    // Route53 hosted zone (must exist in the account)
    const hostedZone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: "coderhelm.com",
    });

    // ACM certificate (must be us-east-1 for CloudFront)
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // S3 bucket for the dashboard app
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: `${prefix}-app`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // CloudFront OAC
    const oac = new cloudfront.S3OriginAccessControl(this, "OAC", {
      originAccessControlName: `${prefix}-app-oac`,
    });

    // Security headers
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "SecurityHeaders",
      {
        responseHeadersPolicyName: `${prefix}-app-security-headers`,
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
              "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.coderhelm.com https://stream.coderhelm.com https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com; font-src 'self'",
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

    // Page paths open the page's index.html. A path that is no page of the
    // dashboard opens the 404 page right here, so the distribution needs no
    // 404 error response, which would also answer a missing /_next/ script
    // with HTML. Files (a dot in the last segment) pass through untouched:
    // S3 answers a missing one with a plain 404.
    const spaRewrite = new cloudfront.Function(this, "SpaRewrite", {
      functionName: `${prefix}-app-spa-rewrite`,
      code: cloudfront.FunctionCode.fromInline(checkFunctionSize("SpaRewrite", `
var PAGES = ${routeTable(pageRoutes(outDir))};
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.startsWith('/errors/') || uri.startsWith('/_next/')) return request;
  if (uri.endsWith('/') || uri.indexOf('.') === -1) {
    var page = uri.endsWith('/') ? uri : uri + '/';
    request.uri = PAGES[page] ? page + 'index.html' : ${JSON.stringify(NOT_FOUND_PAGE)};
  }
  return request;
}
      `)),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const notFoundStatus = new cloudfront.Function(this, "NotFoundStatus", {
      functionName: `${prefix}-app-not-found-status`,
      code: cloudfront.FunctionCode.fromInline(notFoundStatusCode()),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // CloudFront distribution
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        // LIST lets S3 answer 404 for a page that does not exist. With READ
        // only, S3 hides missing keys behind 403, so a mistyped address
        // showed "Access denied" instead of "Page not found".
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket, {
          originAccessControl: oac,
          originAccessLevels: [cloudfront.AccessLevel.READ, cloudfront.AccessLevel.LIST],
        }),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy,
        functionAssociations: [
          {
            function: spaRewrite,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
          {
            function: notFoundStatus,
            eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
          },
        ],
      },
      defaultRootObject: "index.html",
      webAclId: props.webAclArn,
      domainNames: [domainName],
      certificate,
      // Error responses apply to every path, scripts included, so there is
      // no 404 entry: unknown pages get the 404 page from SpaRewrite, and a
      // missing /_next/ file stays a plain 404. With LIST access S3 answers
      // a missing key with 404, so a 403 here comes from the WAF.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 403,
          responsePagePath: "/errors/403.html",
          ttl: cdk.Duration.minutes(5),
        },
        {
          httpStatus: 500,
          responseHttpStatus: 500,
          responsePagePath: "/errors/500.html",
          ttl: cdk.Duration.seconds(10),
        },
        {
          httpStatus: 502,
          responseHttpStatus: 502,
          responsePagePath: "/errors/502.html",
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

    // DNS: app.coderhelm.com → CloudFront
    new route53.ARecord(this, "AliasRecord", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(distribution)
      ),
    });

    // Dashboard build: /_next/ files first and kept across deploys, then the
    // pages that name them (see static-site.ts).
    new NextExportDeployment(this, "DeploySite", {
      bucket: siteBucket,
      distribution,
      outDir,
    });

    // Deploy error pages
    new s3deploy.BucketDeployment(this, "DeployErrorPages", {
      sources: [s3deploy.Source.asset("./error-pages")],
      destinationBucket: siteBucket,
      destinationKeyPrefix: "errors",
    });

    new cdk.CfnOutput(this, "DistributionUrl", {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
  }
}
