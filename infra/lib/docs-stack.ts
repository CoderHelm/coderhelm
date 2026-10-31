import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import * as fs from "fs";
import * as path from "path";
import { Construct } from "constructs";
import * as CSP from "./docs-csp.json";
import {
  NextExportDeployment,
  NOT_FOUND_PAGE,
  checkFunctionSize,
  notFoundStatusCode,
  pageRoutes,
  routeTable,
} from "./static-site";

interface DocsStackProps extends cdk.StackProps {
  stage: string;
  webAclArn: string;
  /** The docs site's static export. Defaults to ../docs/out. */
  outDir?: string;
  /**
   * Pages that moved or were removed, and where they went (page paths ending
   * in /). Defaults to ../docs/redirects.json.
   */
  redirects?: Record<string, string>;
}

/**
 * The docs' Content-Security-Policy (lib/docs-csp.json, which the docs e2e
 * tests also read). Pages load nothing from other origins; the install
 * guide's pages call CoderHelm's API, S3 progress files and the install
 * itself, which can be any https origin, and post the GitHub app manifest
 * form to github.com.
 */
export const DOCS_CSP = CSP.docs;
export const INSTALL_GUIDE_PATH = CSP.installGuidePath;
export const INSTALL_GUIDE_CSP = CSP.installGuide;
export const UNINSTALL_GUIDE_PATH = CSP.uninstallGuidePath;
export const UNINSTALL_GUIDE_CSP = CSP.uninstallGuide;

/** The docs' redirect map, checked against the pages of the build. */
export function docsRedirects(pages: string[], redirects: Record<string, string>): Record<string, string> {
  const live = new Set(pages);
  for (const [from, to] of Object.entries(redirects)) {
    if (!/^\/(.+\/)?$/.test(from) || !to.startsWith("/") || !to.endsWith("/")) {
      throw new Error(`Docs redirect ${from} -> ${to}: both must be page paths ending in /.`);
    }
    if (live.has(from)) throw new Error(`Docs redirect ${from}: that page still exists.`);
    if (!live.has(to)) throw new Error(`Docs redirect ${from}: its target ${to} is not a page.`);
  }
  return redirects;
}

/** docs.coderhelm.com: the developer docs (docs/), a static Next.js export. */
export class DocsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DocsStackProps) {
    super(scope, id, props);

    const prefix = `coderhelm-${props.stage}`;
    const domainName = "docs.coderhelm.com";
    const outDir = props.outDir ?? "../docs/out";
    const pages = pageRoutes(outDir);
    const redirects = docsRedirects(
      pages,
      props.redirects ??
        JSON.parse(fs.readFileSync(path.join(outDir, "..", "redirects.json"), "utf8")).redirects,
    );

    // Route53 hosted zone (in this account, like the site and the app)
    const hostedZone = route53.HostedZone.fromLookup(this, "Zone", {
      domainName: "coderhelm.com",
    });

    // ACM certificate (must be us-east-1 for CloudFront), validated by a DNS
    // record CDK writes into the zone.
    const certificate = new acm.Certificate(this, "Certificate", {
      domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: `${prefix}-docs`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Everything in it is rebuilt from git on every deploy.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const oac = new cloudfront.S3OriginAccessControl(this, "OAC", {
      originAccessControlName: `${prefix}-docs-oac`,
    });

    // The same security headers on every page; only the CSP differs on the
    // install guide (INSTALL_GUIDE_CSP).
    const securityHeaders = (id: string, name: string, csp: string) =>
      new cloudfront.ResponseHeadersPolicy(this, id, {
        responseHeadersPolicyName: `${prefix}-${name}`,
        securityHeadersBehavior: {
          strictTransportSecurity: {
            accessControlMaxAge: cdk.Duration.days(365),
            includeSubdomains: true,
            preload: true,
            override: true,
          },
          contentTypeOptions: { override: true },
          frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
          xssProtection: { protection: true, modeBlock: true, override: true },
          referrerPolicy: {
            referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
            override: true,
          },
          contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
        },
        // Editors and validators fetch the plugin manifest schema from other
        // origins. CloudFront refuses CORS headers as custom headers.
        corsBehavior: {
          accessControlAllowOrigins: ["*"],
          accessControlAllowMethods: ["GET", "HEAD"],
          accessControlAllowHeaders: ["*"],
          accessControlAllowCredentials: false,
          originOverride: true,
        },
        customHeadersBehavior: {
          customHeaders: [
            { header: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()", override: true },
          ],
        },
      });
    const responseHeadersPolicy = securityHeaders("SecurityHeaders", "docs-security-headers", DOCS_CSP);
    const installHeadersPolicy = securityHeaders("InstallGuideHeaders", "docs-install-headers", INSTALL_GUIDE_CSP);
    const uninstallHeadersPolicy = securityHeaders("UninstallGuideHeaders", "docs-uninstall-headers", UNINSTALL_GUIDE_CSP);

    // Page paths open the page's index.html. A path that is no page opens the
    // 404 page right here (no distribution-wide 404 response, which would
    // also answer a missing /_next/ script with HTML). Agents that send
    // `Accept: text/markdown` get the page's Markdown twin (/<page>.md, and
    // /index.md for the home page). A page that moved (docs/redirects.json)
    // answers 301 to where it went, and so does its old Markdown twin. Files
    // pass through untouched.
    const urlRewrite = new cloudfront.Function(this, "UrlRewrite", {
      functionName: `${prefix}-docs-url-rewrite`,
      code: cloudfront.FunctionCode.fromInline(checkFunctionSize("UrlRewrite", `
var PAGES = ${routeTable(pages)};
var MOVED = ${JSON.stringify(redirects)};
function moved(to) {
  return { statusCode: 301, statusDescription: 'Moved Permanently', headers: { location: { value: to } } };
}
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.startsWith('/errors/') || uri.startsWith('/_next/')) return request;
  if (uri.endsWith('.md') && MOVED[uri.slice(0, -3) + '/']) {
    var md = MOVED[uri.slice(0, -3) + '/'];
    return moved(md === '/' ? '/index.md' : md.slice(0, -1) + '.md');
  }
  if (uri.endsWith('/') || uri.indexOf('.') === -1) {
    var page = uri.endsWith('/') ? uri : uri + '/';
    if (MOVED[page]) return moved(MOVED[page]);
    if (!PAGES[page]) {
      request.uri = ${JSON.stringify(NOT_FOUND_PAGE)};
      return request;
    }
    var accept = request.headers.accept && request.headers.accept.value;
    if (accept && accept.indexOf('text/markdown') !== -1) {
      request.uri = page === '/' ? '/index.md' : page.slice(0, -1) + '.md';
      return request;
    }
    request.uri = page + 'index.html';
  }
  return request;
}
      `)),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // Pages vary by Accept (HTML or Markdown); the 404 page goes out as a 404.
    const varyAccept = new cloudfront.Function(this, "VaryAccept", {
      functionName: `${prefix}-docs-vary-accept`,
      code: cloudfront.FunctionCode.fromInline(notFoundStatusCode(`
  if (uri.endsWith('.html') || uri.endsWith('.md')) {
    response.headers['vary'] = { value: 'Accept' };
  }`)),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // LIST lets S3 answer a missing file with 404 instead of 403.
    const siteOrigin = origins.S3BucketOrigin.withOriginAccessControl(siteBucket, {
      originAccessControl: oac,
      originAccessLevels: [cloudfront.AccessLevel.READ, cloudfront.AccessLevel.LIST],
    });
    const pageBehavior = (policy: cloudfront.IResponseHeadersPolicy): cloudfront.BehaviorOptions => ({
      origin: siteOrigin,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      responseHeadersPolicy: policy,
      functionAssociations: [
        { function: urlRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        { function: varyAccept, eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE },
      ],
    });

    const distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: pageBehavior(responseHeadersPolicy),
      // The install guide alone may call other origins (INSTALL_GUIDE_CSP).
      additionalBehaviors: { [INSTALL_GUIDE_PATH]: pageBehavior(installHeadersPolicy), [UNINSTALL_GUIDE_PATH]: pageBehavior(uninstallHeadersPolicy) },
      defaultRootObject: "index.html",
      webAclId: props.webAclArn,
      domainNames: [domainName],
      certificate,
      // No 404 entry (see UrlRewrite). With LIST access S3 answers a missing
      // key with 404, so a 403 here comes from the WAF.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 403, responsePagePath: "/errors/403.html", ttl: cdk.Duration.minutes(5) },
        { httpStatus: 500, responseHttpStatus: 500, responsePagePath: "/errors/500.html", ttl: cdk.Duration.seconds(10) },
        { httpStatus: 502, responseHttpStatus: 502, responsePagePath: "/errors/502.html", ttl: cdk.Duration.seconds(10) },
        { httpStatus: 503, responseHttpStatus: 503, responsePagePath: "/errors/503.html", ttl: cdk.Duration.seconds(10) },
      ],
    });

    // DNS: docs.coderhelm.com → CloudFront (IPv4 and IPv6)
    new route53.ARecord(this, "AliasRecord", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });
    new route53.AaaaRecord(this, "AliasRecordV6", {
      zone: hostedZone,
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
    });

    // Site build: /_next/ files first and kept across deploys, then the pages
    // that name them (see static-site.ts). Files that need their own content
    // type go up in the deployments below.
    const SPECIAL = ["*.md", "llms.txt", "llms-full.txt", "schema/*", "tools/*"];
    new NextExportDeployment(this, "DeploySite", {
      bucket: siteBucket,
      distribution,
      outDir,
      pageExclude: SPECIAL,
    });

    const textCache = [
      s3deploy.CacheControl.setPublic(),
      s3deploy.CacheControl.maxAge(cdk.Duration.hours(1)),
      s3deploy.CacheControl.sMaxAge(cdk.Duration.days(1)),
    ];
    const typed = (id: string, include: string[], contentType: string) =>
      new s3deploy.BucketDeployment(this, id, {
        sources: [s3deploy.Source.asset(outDir)],
        destinationBucket: siteBucket,
        include,
        exclude: ["*"],
        contentType,
        cacheControl: textCache,
      });
    // Markdown twins and llms.txt for agents, with an explicit UTF-8 charset.
    typed("DeployMarkdown", ["*.md"], "text/markdown; charset=utf-8");
    typed("DeployLlmsTxt", ["llms.txt", "llms-full.txt"], "text/plain; charset=utf-8");
    // The plugin manifest schema at its stable URL, and the bundled validator.
    typed("DeploySchema", ["schema/*"], "application/schema+json; charset=utf-8");
    typed("DeployTools", ["tools/*"], "text/javascript; charset=utf-8");

    // Error pages: the shared 403/5xx pages, and the docs' own 404 page,
    // which the docs build writes to errors/404.html.
    new s3deploy.BucketDeployment(this, "DeployErrorPages", {
      sources: [s3deploy.Source.asset("./error-pages")],
      destinationBucket: siteBucket,
      destinationKeyPrefix: "errors",
      exclude: ["404.html"],
      prune: false,
    });
    new s3deploy.BucketDeployment(this, "DeployNotFoundPage", {
      sources: [s3deploy.Source.asset(outDir)],
      destinationBucket: siteBucket,
      include: ["errors/404.html"],
      exclude: ["*"],
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString("public, max-age=0, s-maxage=300, must-revalidate")],
    });

    new cdk.CfnOutput(this, "DistributionUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "DistributionId", { value: distribution.distributionId });
    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${domainName}` });
  }
}
