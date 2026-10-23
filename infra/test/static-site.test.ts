// What a deploy must never do again (2026-10-23): delete the previous build's
// /_next/ files, upload pages before the files they name, cache pages so
// they outlive those files, or answer a missing script with an HTML page.
//
//   npm test   (compiles with tsc, then runs node --test)

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vm from "node:vm";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { AppStack } from "../lib/app-stack";
import { FrontendStack } from "../lib/frontend-stack";
import { ASSET_CACHE_CONTROL, PAGE_CACHE_CONTROL, SWEEP_CODE, pageRoutes } from "../lib/static-site";

const env = { account: "111111111111", region: "us-east-1" };
const webAclArn = "arn:aws:wafv2:us-east-1:111111111111:global/webacl/test/0";

/** A small static export: two pages, Next's own 404 dirs, and a hashed chunk. */
function fixtureOut(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "coderhelm-out-"));
  for (const f of [
    "index.html",
    "index.txt",
    "support/ticket/index.html",
    "support/ticket/index.txt",
    "404/index.html",
    "_not-found/index.html",
    "404.html",
    "index.md",
    "_next/static/chunks/main-app-abc123.js",
    "_next/static/css/abc123.css",
  ]) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), "x");
  }
  return dir;
}

type Resources = Record<string, { Type: string; Properties: any; DependsOn?: string[] }>;

function synth(kind: "app" | "site"): Resources {
  const app = new cdk.App();
  const outDir = fixtureOut();
  const stack = kind === "app"
    ? new AppStack(app, "App", { env, stage: "test", webAclArn, outDir })
    : new FrontendStack(app, "Site", { env, stage: "test", webAclArn, outDir });
  return Template.fromStack(stack).toJSON().Resources;
}

const ofType = (r: Resources, type: string) => Object.entries(r).filter(([, v]) => v.Type === type);

function deployments(r: Resources) {
  const all = ofType(r, "Custom::CDKBucketDeployment");
  const find = (pred: (p: any) => boolean, what: string) => {
    const hit = all.filter(([, v]) => pred(v.Properties));
    assert.equal(hit.length, 1, `exactly one ${what} deployment`);
    return { id: hit[0][0], props: hit[0][1].Properties, dependsOn: hit[0][1].DependsOn ?? [] };
  };
  return {
    assets: find((p) => JSON.stringify(p.Include) === JSON.stringify(["_next/*"]), "/_next/"),
    pages: find((p) => (p.Exclude ?? []).includes("_next/*") && p.DistributionId !== undefined, "page"),
    all,
  };
}

/** Loads a CloudFront function's code and returns its handler. */
function cfFunction(r: Resources, name: RegExp) {
  const fn = ofType(r, "AWS::CloudFront::Function").find(([, v]) => name.test(v.Properties.Name));
  assert.ok(fn, `function ${name}`);
  const sandbox: any = {};
  vm.runInNewContext(`${fn![1].Properties.FunctionCode}\nthis.handler = handler;`, sandbox);
  return sandbox.handler as (event: any) => any;
}

function distribution(r: Resources) {
  const [[, d]] = ofType(r, "AWS::CloudFront::Distribution");
  return d.Properties.DistributionConfig;
}

for (const kind of ["app", "site"] as const) {
  test(`${kind}: /_next/ files are kept across deploys and cached as immutable`, () => {
    const { assets } = deployments(synth(kind));
    assert.equal(assets.props.Prune, false);
    assert.deepEqual(assets.props.Exclude, ["*"]);
    assert.equal(assets.props.SystemMetadata["cache-control"], ASSET_CACHE_CONTROL);
    assert.equal(ASSET_CACHE_CONTROL, "public, max-age=31536000, immutable");
  });

  test(`${kind}: pages revalidate, go up after the /_next/ files, and invalidate CloudFront`, () => {
    const r = synth(kind);
    const { assets, pages, all } = deployments(r);
    assert.equal(pages.props.SystemMetadata["cache-control"], PAGE_CACHE_CONTROL);
    assert.match(PAGE_CACHE_CONTROL, /max-age=0\b/);
    assert.match(PAGE_CACHE_CONTROL, /must-revalidate/);
    assert.ok(pages.dependsOn.includes(assets.id), "the page deployment depends on the /_next/ deployment");
    assert.deepEqual(pages.props.DistributionPaths, ["/*"]);
    // Nothing else uploads /_next/ and could prune it.
    for (const [id, d] of all) {
      if (id === assets.id) continue;
      const p = d.Properties;
      const coversNext = p.DestinationBucketKeyPrefix === undefined && !(p.Exclude ?? []).some((e: string) => e === "_next/*" || e === "*");
      assert.ok(!coversNext, `${id} must exclude _next/*`);
    }
  });

  test(`${kind}: the sweep runs after the pages on every deploy`, () => {
    const r = synth(kind);
    const { pages } = deployments(r);
    const [[, sweep]] = ofType(r, "Custom::NextAssetSweep");
    assert.ok(sweep.DependsOn!.includes(pages.id));
    assert.equal(sweep.Properties.Prefix, "_next/");
    assert.equal(sweep.Properties.RetainDays, "30");
    assert.equal(sweep.Properties.Build, pages.props.SourceObjectKeys[0].replace(/\.zip$/, ""));
  });

  test(`${kind}: no distribution-wide 404 page, so a missing script is never HTML`, () => {
    const r = synth(kind);
    const errors = distribution(r).CustomErrorResponses ?? [];
    assert.ok(!errors.some((e: any) => e.ErrorCode === 404), "no 404 error response");
    // LIST access: S3 answers a missing key with 404, not 403 (which is mapped to a page).
    const policy = ofType(r, "AWS::S3::BucketPolicy")
      .map(([, v]) => JSON.stringify(v.Properties.PolicyDocument)).join();
    assert.match(policy, /s3:ListBucket/);
  });

  test(`${kind}: unknown pages get the 404 page with a 404 status; files pass through`, () => {
    const r = synth(kind);
    const rewrite = cfFunction(r, kind === "app" ? /spa-rewrite$/ : /url-rewrite$/);
    const respond = cfFunction(r, kind === "app" ? /not-found-status$/ : /vary-accept$/);
    const req = (uri: string) => rewrite({ request: { uri, headers: { host: { value: "app.example.test" } }, querystring: {} } }).uri;

    assert.equal(req("/"), "/index.html");
    assert.equal(req("/support/ticket"), "/support/ticket/index.html");
    assert.equal(req("/support/ticket/"), "/support/ticket/index.html");
    assert.equal(req("/no/such/page/"), "/errors/404.html");
    assert.equal(req("/404/"), "/errors/404.html");
    assert.equal(req("/_next/static/chunks/gone-123.js"), "/_next/static/chunks/gone-123.js");
    assert.equal(req("/_next/static/css/gone.css"), "/_next/static/css/gone.css");
    assert.equal(req("/favicon.svg"), "/favicon.svg");

    const res = (uri: string, statusCode: number) =>
      respond({ request: { uri }, response: { statusCode, statusDescription: "", headers: {} } });
    assert.equal(res("/errors/404.html", 200).statusCode, 404);
    assert.equal(res("/errors/404.html", 304).statusCode, 304);
    assert.equal(res("/support/ticket/index.html", 200).statusCode, 200);
  });
}

test("pageRoutes lists every page and none of Next's own 404 dirs", () => {
  assert.deepEqual(pageRoutes(fixtureOut()), ["/", "/support/ticket/"]);
});

/** Runs the sweep handler against an in-memory bucket. */
async function runSweep(objects: { Key: string; LastModified: Date }[]) {
  const deleted: string[] = [];
  const client = {
    async send(cmd: any) {
      if (cmd.kind === "list") return { Contents: objects, IsTruncated: false };
      deleted.push(...cmd.input.Delete.Objects.map((o: any) => o.Key));
      return {};
    },
  };
  const fakeSdk = {
    S3Client: function () { return client; },
    ListObjectsV2Command: function (this: any, input: any) { this.kind = "list"; this.input = input; },
    DeleteObjectsCommand: function (this: any, input: any) { this.kind = "delete"; this.input = input; },
  };
  const mod = { exports: {} as any };
  vm.runInNewContext(SWEEP_CODE, { require: () => fakeSdk, exports: mod.exports, module: mod, console: { log() {}, error() {} } });
  const out = await mod.exports.handler({ RequestType: "Update", ResourceProperties: { Bucket: "b", Prefix: "_next/", RetainDays: "30" } });
  return { deleted, out };
}

const DAY = 24 * 60 * 60 * 1000;

test("sweep removes files no build has shipped for 30 days", async () => {
  const now = Date.now();
  const { deleted } = await runSweep([
    { Key: "_next/static/chunks/current.js", LastModified: new Date(now) },
    { Key: "_next/static/chunks/last-week.js", LastModified: new Date(now - 7 * DAY) },
    { Key: "_next/static/chunks/old.js", LastModified: new Date(now - 31 * DAY) },
  ]);
  assert.deepEqual(deleted, ["_next/static/chunks/old.js"]);
});

test("sweep measures from the newest file, so a quiet month never removes the live build", async () => {
  const lastDeploy = Date.now() - 90 * DAY;
  const { deleted } = await runSweep([
    { Key: "_next/static/chunks/live.js", LastModified: new Date(lastDeploy) },
    { Key: "_next/static/chunks/previous.js", LastModified: new Date(lastDeploy - 2 * DAY) },
    { Key: "_next/static/chunks/ancient.js", LastModified: new Date(lastDeploy - 40 * DAY) },
  ]);
  assert.deepEqual(deleted, ["_next/static/chunks/ancient.js"]);
});

test("site: Markdown for known pages, the 404 page for unknown ones, and the host redirect still apply", () => {
  const rewrite = cfFunction(synth("site"), /url-rewrite$/);
  const md = { accept: { value: "text/markdown" }, host: { value: "coderhelm.com" } };
  assert.equal(rewrite({ request: { uri: "/", headers: md } }).uri, "/index.md");
  assert.equal(rewrite({ request: { uri: "/support/ticket/", headers: md } }).uri, "/support/ticket.md");
  assert.equal(rewrite({ request: { uri: "/nope/", headers: md } }).uri, "/errors/404.html");
  const redirect = rewrite({ request: { uri: "/x", headers: { host: { value: "www.coderhelm.ai" } } } });
  assert.equal(redirect.statusCode, 301);
});
