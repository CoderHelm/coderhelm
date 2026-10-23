import * as fs from "node:fs";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3assets from "aws-cdk-lib/aws-s3-assets";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cr from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

// Deploying a Next.js static export (`out/`) to S3 behind CloudFront without
// breaking pages that are already open.
//
// Every build names its scripts and styles by content hash under /_next/.
// A page loaded before a deploy (an open tab, or HTML a browser or CloudFront
// still holds) keeps asking for the old names. On 2026-10-23 three deploys in
// an hour each deleted the previous build's files (BucketDeployment prunes by
// default), the old names came back as the branded 404 page in HTML, and the
// app sat on an unstyled "Loading..." for good. So:
//
//   1. /_next/ files are never deleted by a deploy (prune: false) and are
//      cached for a year as immutable. A sweep after each deploy removes the
//      ones no build has shipped for RETAIN_DAYS.
//   2. Pages and the payloads next to them (index.txt) are revalidated on
//      every visit, and go up only after the /_next/ files they name.
//   3. A missing page gets the branded 404, but a missing /_next/ file gets a
//      plain 404 that no browser mistakes for a script or stylesheet (see
//      pageRoutes and the functions below).

/** Days a /_next/ file stays after the last deploy that shipped it. */
export const RETAIN_DAYS = 30;

/** Hashed build files: the name changes whenever the content does. */
export const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * Pages and their payloads: browsers ask again on every visit (a 304 when
 * nothing changed); CloudFront keeps a copy for five minutes, and each deploy
 * invalidates it.
 */
export const PAGE_CACHE_CONTROL = "public, max-age=0, s-maxage=300, must-revalidate";

/** Where a page request goes when no page has that path. */
export const NOT_FOUND_PAGE = "/errors/404.html";

/** CloudFront Functions code must stay under 10 KB. */
const FUNCTION_CODE_LIMIT = 10 * 1024;

/**
 * Every page in a static export, as "/path/" (the export uses trailing
 * slashes). The viewer-request function sends any other page path to the 404
 * page itself, so CloudFront never needs a distribution-wide 404 error page,
 * the setting that also turned a missing script into HTML.
 */
export function pageRoutes(outDir: string): string[] {
  if (!fs.existsSync(outDir)) {
    throw new Error(`No build at ${outDir}: build the site before synth.`);
  }
  const routes: string[] = [];
  const walk = (dir: string, route: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (route === "/" && ["_next", "errors", "404", "_not-found"].includes(entry.name)) continue;
      walk(path.join(dir, entry.name), `${route}${entry.name}/`);
    }
    if (fs.existsSync(path.join(dir, "index.html"))) routes.push(route);
  };
  walk(outDir, "/");
  return routes.sort();
}

/** The route table as a JS object literal for function code. */
export function routeTable(routes: string[]): string {
  return `{${routes.map((r) => `${JSON.stringify(r)}:1`).join(",")}}`;
}

/** Fails synth when function code would be refused by CloudFront. */
export function checkFunctionSize(name: string, code: string): string {
  if (Buffer.byteLength(code, "utf8") > FUNCTION_CODE_LIMIT) {
    throw new Error(`CloudFront function ${name} is over 10 KB (${Buffer.byteLength(code, "utf8")} bytes).`);
  }
  return code;
}

/**
 * Viewer-response code: the 404 page that the viewer-request function served
 * in place of an unknown page goes out as a 404, not a 200. Only a 200 is
 * changed, so a 304 revalidation stays a 304. `extra` runs first, with
 * `response` and `uri` in scope.
 */
export function notFoundStatusCode(extra = ""): string {
  return `
function handler(event) {
  var response = event.response;
  var uri = event.request.uri;
${extra}
  if (uri === ${JSON.stringify(NOT_FOUND_PAGE)} && response.statusCode === 200) {
    response.statusCode = 404;
    response.statusDescription = 'Not Found';
    response.headers['cache-control'] = { value: 'no-store' };
  }
  return response;
}
`;
}

// Runs after each deploy. Every deploy rewrites all of its own /_next/ files
// (the deployment extracts the build fresh, so `aws s3 sync` sees every file
// as newer), so a file last written more than RETAIN_DAYS before the newest
// one has not been part of any build for that long. Measuring from the newest
// file rather than from now means a quiet month between deploys never removes
// the files the live pages use, which an S3 lifecycle rule on age would.
export const SWEEP_CODE = `
const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const s3 = new S3Client({});
const DAY = 24 * 60 * 60 * 1000;

exports.handler = async (event) => {
  const { Bucket, Prefix, RetainDays } = event.ResourceProperties;
  const id = "sweep:" + Bucket + "/" + Prefix;
  if (event.RequestType === "Delete") return { PhysicalResourceId: id };
  try {
    const objects = [];
    let token;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token }));
      for (const o of page.Contents || []) objects.push({ key: o.Key, at: o.LastModified.getTime() });
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    if (objects.length === 0) return { PhysicalResourceId: id, Data: { Deleted: "0" } };
    const newest = Math.max(...objects.map((o) => o.at));
    const cutoff = newest - Number(RetainDays) * DAY;
    const stale = objects.filter((o) => o.at < cutoff).map((o) => o.key);
    for (let i = 0; i < stale.length; i += 1000) {
      const res = await s3.send(new DeleteObjectsCommand({
        Bucket,
        Delete: { Objects: stale.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
      }));
      if (res.Errors && res.Errors.length) console.error("Some deletes failed", JSON.stringify(res.Errors.slice(0, 5)));
    }
    console.log(JSON.stringify({ bucket: Bucket, prefix: Prefix, kept: objects.length - stale.length, deleted: stale.length }));
    return { PhysicalResourceId: id, Data: { Deleted: String(stale.length) } };
  } catch (err) {
    // Old files only cost storage; never fail (and roll back) a deploy over them.
    console.error("Sweep failed; old /_next/ files stay until the next deploy", err);
    return { PhysicalResourceId: id, Data: { Deleted: "0" } };
  }
};
`;

export interface NextExportDeploymentProps {
  bucket: s3.IBucket;
  distribution: cloudfront.IDistribution;
  /** The static export directory (`next build` with output: "export"). */
  outDir: string;
  /** More paths the page deployment leaves to other deployments, such as "*.md". */
  pageExclude?: string[];
}

/**
 * Ships a static export in order: /_next/ files first (kept across deploys),
 * then the pages that name them (with a CloudFront invalidation), then the
 * sweep of /_next/ files no build has shipped for RETAIN_DAYS.
 */
export class NextExportDeployment extends Construct {
  readonly assets: s3deploy.BucketDeployment;
  readonly pages: s3deploy.BucketDeployment;
  readonly sweep: cdk.CustomResource;

  constructor(scope: Construct, id: string, props: NextExportDeploymentProps) {
    super(scope, id);

    // One upload of the build, shared by both deployments.
    const build = new s3assets.Asset(this, "Build", { path: props.outDir });
    const source = s3deploy.Source.bucket(build.bucket, build.s3ObjectKey);

    this.assets = new s3deploy.BucketDeployment(this, "Assets", {
      sources: [source],
      destinationBucket: props.bucket,
      exclude: ["*"],
      include: ["_next/*"],
      prune: false,
      cacheControl: [s3deploy.CacheControl.fromString(ASSET_CACHE_CONTROL)],
      memoryLimit: 512,
    });

    // Prunes pages that no longer exist; the exclude list keeps /_next/ and
    // the other deployments' files out of both the upload and the prune.
    this.pages = new s3deploy.BucketDeployment(this, "Pages", {
      sources: [source],
      destinationBucket: props.bucket,
      exclude: ["_next/*", "errors/*", ...(props.pageExclude ?? [])],
      prune: true,
      cacheControl: [s3deploy.CacheControl.fromString(PAGE_CACHE_CONTROL)],
      distribution: props.distribution,
      distributionPaths: ["/*"],
      memoryLimit: 512,
    });
    this.pages.node.addDependency(this.assets);

    const sweepFn = new lambda.Function(this, "SweepFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(SWEEP_CODE),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      logGroup: new logs.LogGroup(this, "SweepLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    props.bucket.grantRead(sweepFn, "_next/*");
    props.bucket.grantDelete(sweepFn, "_next/*");
    const provider = new cr.Provider(this, "SweepProvider", {
      onEventHandler: sweepFn,
      logGroup: new logs.LogGroup(this, "SweepProviderLogs", {
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    this.sweep = new cdk.CustomResource(this, "Sweep", {
      serviceToken: provider.serviceToken,
      resourceType: "Custom::NextAssetSweep",
      properties: {
        Bucket: props.bucket.bucketName,
        Prefix: "_next/",
        RetainDays: String(RETAIN_DAYS),
        // Changes with every build, so the sweep runs on every deploy.
        Build: build.assetHash,
      },
    });
    this.sweep.node.addDependency(this.pages);
  }
}
