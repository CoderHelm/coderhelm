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
import { DOCS_CSP, DocsStack, INSTALL_GUIDE_CSP, INSTALL_GUIDE_PATH, docsRedirects } from "../lib/docs-stack";
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

function synth(kind: "app" | "site" | "docs"): Resources {
  const app = new cdk.App();
  const outDir = fixtureOut();
  const stack = kind === "app"
    ? new AppStack(app, "App", { env, stage: "test", webAclArn, outDir })
    : kind === "docs"
      ? new DocsStack(app, "Docs", { env, stage: "test", webAclArn, outDir, redirects: { "/api/routes/": "/support/ticket/" } })
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

for (const kind of ["app", "site", "docs"] as const) {
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

test("docs: Markdown for known pages, the 404 page for unknown ones", () => {
  const rewrite = cfFunction(synth("docs"), /docs-url-rewrite$/);
  const md = { accept: { value: "text/markdown" } };
  assert.equal(rewrite({ request: { uri: "/", headers: md } }).uri, "/index.md");
  assert.equal(rewrite({ request: { uri: "/support/ticket/", headers: md } }).uri, "/support/ticket.md");
  assert.equal(rewrite({ request: { uri: "/support/ticket", headers: md } }).uri, "/support/ticket.md");
  assert.equal(rewrite({ request: { uri: "/nope/", headers: md } }).uri, "/errors/404.html");
  assert.equal(rewrite({ request: { uri: "/schema/plugin-manifest.v1.json", headers: {} } }).uri, "/schema/plugin-manifest.v1.json");
  assert.equal(rewrite({ request: { uri: "/llms.txt", headers: {} } }).uri, "/llms.txt");
});

test("docs: a page that moved answers 301 to where it went, its Markdown twin too", () => {
  const rewrite = cfFunction(synth("docs"), /docs-url-rewrite$/);
  for (const uri of ["/api/routes/", "/api/routes"]) {
    const r = rewrite({ request: { uri, headers: {} } });
    assert.equal(r.statusCode, 301, uri);
    assert.equal(r.headers.location.value, "/support/ticket/");
  }
  const md = rewrite({ request: { uri: "/api/routes.md", headers: {} } });
  assert.equal(md.statusCode, 301);
  assert.equal(md.headers.location.value, "/support/ticket.md");
  // Pages that didn't move are served as before.
  assert.equal(rewrite({ request: { uri: "/support/ticket/", headers: {} } }).uri, "/support/ticket/index.html");
});

test("docs: a redirect must leave a real page and land on one", () => {
  const pages = ["/", "/api/"];
  assert.deepEqual(docsRedirects(pages, { "/api/routes/": "/api/" }), { "/api/routes/": "/api/" });
  assert.throws(() => docsRedirects(pages, { "/api/routes/": "/nowhere/" }), /not a page/);
  assert.throws(() => docsRedirects(pages, { "/api/": "/" }), /still exists/);
  assert.throws(() => docsRedirects(pages, { "api/routes": "/api/" }), /page paths/);
});

test("docs: the committed redirect map covers the old API routes page", () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "..", "docs", "redirects.json"), "utf8")).redirects;
  assert.equal(map["/api/routes/"], "/api/");
});

test("docs: docs.coderhelm.com with its own certificate and DNS records", () => {
  const r = synth("docs");
  assert.deepEqual(distribution(r).Aliases, ["docs.coderhelm.com"]);
  const [[, cert]] = ofType(r, "AWS::CertificateManager::Certificate");
  assert.equal(cert.Properties.DomainName, "docs.coderhelm.com");
  assert.equal(cert.Properties.ValidationMethod, "DNS");
  const records = ofType(r, "AWS::Route53::RecordSet").map(([, v]) => `${v.Properties.Type} ${v.Properties.Name}`);
  assert.deepEqual(records.sort(), ["A docs.coderhelm.com.", "AAAA docs.coderhelm.com."]);
});

test("docs: Markdown, llms.txt, the schema and the validator go up with their own content types", () => {
  const { all } = deployments(synth("docs"));
  const typeOf = (include: string) =>
    all.find(([, d]) => JSON.stringify(d.Properties.Include) === JSON.stringify([include]))?.[1].Properties.SystemMetadata["content-type"];
  assert.equal(typeOf("*.md"), "text/markdown; charset=utf-8");
  assert.equal(typeOf("schema/*"), "application/schema+json; charset=utf-8");
  assert.equal(typeOf("tools/*"), "text/javascript; charset=utf-8");
  assert.equal(typeOf("errors/404.html"), undefined);
});

test("docs: only the install guide may call other origins; every page keeps its security headers", () => {
  const r = synth("docs");
  const policies = Object.fromEntries(
    ofType(r, "AWS::CloudFront::ResponseHeadersPolicy").map(([id, v]) => [id, v.Properties.ResponseHeadersPolicyConfig]),
  );
  const csp = (c: any) => c.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy;
  const directive = (policy: string, name: string) =>
    policy.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " "));

  // The exact strings the docs e2e tests serve (lib/docs-csp.json). Beyond
  // the docs' own origin, only Google Analytics (docs/lib/analytics.ts): its
  // tag from googletagmanager.com, its hits to these hosts.
  const GA = "https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com";
  assert.equal(directive(DOCS_CSP, "script-src"), "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com");
  assert.equal(directive(DOCS_CSP, "img-src"), `img-src 'self' data: https: ${GA}`);
  assert.equal(directive(DOCS_CSP, "connect-src"), `connect-src 'self' ${GA}`);
  assert.equal(directive(DOCS_CSP, "form-action"), "form-action 'self'");
  assert.equal(directive(INSTALL_GUIDE_CSP, "connect-src"), `connect-src 'self' https: ${GA}`);
  assert.equal(directive(INSTALL_GUIDE_CSP, "form-action"), "form-action 'self' https://github.com");
  for (const name of ["default-src", "script-src", "style-src", "img-src", "font-src", "frame-ancestors", "base-uri"]) {
    assert.equal(directive(INSTALL_GUIDE_CSP, name), directive(DOCS_CSP, name), name);
  }

  const byCsp = (want: string) => Object.entries(policies).filter(([, c]) => csp(c) === want).map(([id]) => id);
  const [docsId] = byCsp(DOCS_CSP);
  const [installId] = byCsp(INSTALL_GUIDE_CSP);
  assert.ok(docsId && installId, "both policies are in the stack");
  // Everything but the CSP is the same on both.
  const rest = (c: any) => ({ ...c, Name: undefined, SecurityHeadersConfig: { ...c.SecurityHeadersConfig, ContentSecurityPolicy: undefined } });
  assert.deepEqual(rest(policies[installId]), rest(policies[docsId]));
  assert.equal(policies[installId].SecurityHeadersConfig.FrameOptions.FrameOption, "DENY");
  assert.equal(policies[installId].CorsConfig.AccessControlAllowCredentials, false);

  // The default behavior gets the docs policy; only the install guide's path the other.
  const [, dist] = ofType(r, "AWS::CloudFront::Distribution")[0];
  const cfg = dist.Properties.DistributionConfig;
  assert.deepEqual(cfg.DefaultCacheBehavior.ResponseHeadersPolicyId, { Ref: docsId });
  assert.equal(cfg.CacheBehaviors.length, 1);
  assert.equal(cfg.CacheBehaviors[0].PathPattern, INSTALL_GUIDE_PATH);
  assert.equal(INSTALL_GUIDE_PATH, "/self-host/install*");
  assert.deepEqual(cfg.CacheBehaviors[0].ResponseHeadersPolicyId, { Ref: installId });
  // The guide's pages are rewritten and cached like every other page.
  assert.deepEqual(cfg.CacheBehaviors[0].FunctionAssociations, cfg.DefaultCacheBehavior.FunctionAssociations);
  assert.equal(cfg.CacheBehaviors[0].CachePolicyId, cfg.DefaultCacheBehavior.CachePolicyId);
  assert.equal(cfg.CacheBehaviors[0].ViewerProtocolPolicy, "redirect-to-https");
});

test("site and app: the CSP lets Google Analytics 4 load and send from every host it uses", () => {
  const GA_HOSTS = ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://www.googletagmanager.com"];
  for (const kind of ["site", "app"] as const) {
    const [[, policy]] = ofType(synth(kind), "AWS::CloudFront::ResponseHeadersPolicy");
    const csp: string = policy.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy;
    const directive = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) ?? "";
    assert.ok(directive("script-src").split(" ").includes("https://www.googletagmanager.com"), `${kind} script-src`);
    // GA4 sends to regional hosts (region1.google-analytics.com), not only www.
    for (const h of GA_HOSTS) assert.ok(directive("connect-src").split(" ").includes(h), `${kind} connect-src ${h}`);
  }
});
