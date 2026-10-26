// The install guide's live calls under real headers: the built site served
// with the Content-Security-Policy CloudFront sends (scripts/serve-out.mjs,
// from infra/lib/docs-csp.json), and every other origin a real HTTPS server
// with real CORS answers (no page.route). The browser reaches them through a
// local proxy, so CoderHelm's API, S3 and the install are other origins as
// in production: a CSP or CORS block fails these tests.
import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const SITE = `http://localhost:${process.env.E2E_PORT ?? 3460}`;
const INSTALL_HOST = 'd111test.cloudfront.net';
const CSP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'infra', 'lib', 'docs-csp.json'), 'utf8'));

type Hit = { host: string; method: string; path: string; origin?: string };
/** How CoderHelm's API answers CORS: as fixed (`*` for the name check), or as before the fix (nothing). */
type ApiCors = 'gateway' | 'none';

interface Servers {
  proxy: string;
  hits: Hit[];
  setApiCors: (c: ApiCors) => void;
  close: () => Promise<void>;
}

function selfSigned(): { key: string; cert: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-csp-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=mock', '-keyout', key, '-out', cert], { stdio: 'ignore' });
  return { key: fs.readFileSync(key, 'utf8'), cert: fs.readFileSync(cert, 'utf8') };
}

const SETUP = {
  schema: 1, service: 'coderhelm', self_hosted: true, setup_open: true, version: 'v0.7.0', checked_at: '2026-10-25T12:00:00Z', ready: false, github_manifest_ready: true,
  checks: [
    { id: 'api', label: 'CoderHelm answers', status: 'pass', code: 'ok' },
    { id: 'github_app', label: 'GitHub App created', status: 'fail', code: 'missing' },
    { id: 'github_installed', label: 'GitHub App installed on your repositories', status: 'wait', code: 'needs_app' },
    { id: 'models', label: 'Claude access', status: 'pass', code: 'ok' },
    { id: 'email', label: 'Email', status: 'warn', code: 'sandbox', required: false },
    { id: 'admin', label: 'First admin signed up', status: 'wait', code: 'not_signed_up' },
  ],
};

/** The other origins, each answering CORS the way the real one does. */
async function startServers(): Promise<Servers> {
  const hits: Hit[] = [];
  let apiCors: ApiCors = 'gateway';
  const { key, cert } = selfSigned();
  const tls = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const url = new URL(req.url ?? '/', `https://${host}`);
    const origin = req.headers.origin;
    hits.push({ host, method: req.method ?? 'GET', path: url.pathname, origin });
    const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...headers });
      res.end(JSON.stringify(body));
    };
    const anyOrigin = { 'access-control-allow-origin': '*' };

    if (host === 'api.coderhelm.com') {
      // middleware/cors.rs in coderhelm-platform: the name check answers any origin, never with credentials.
      const m = /^\/hybrid\/names\/([^/]+)$/.exec(url.pathname);
      const cors = apiCors === 'gateway' && m ? anyOrigin : {};
      if (req.method === 'OPTIONS') {
        res.writeHead(204, apiCors === 'gateway' && m ? { ...anyOrigin, 'access-control-allow-methods': 'GET' } : {});
        return res.end();
      }
      if (!m) return json(404, { error: 'not found' });
      const name = decodeURIComponent(m[1]);
      if (name === 'admin') return json(200, { name, available: false, code: 'reserved', error: 'That name is reserved. Try another one.' }, cors);
      if (name === 'taken-co') return json(200, { name, available: false, code: 'taken', error: 'That name is taken. Try another one.' }, cors);
      return json(200, { name, hostname: `${name}.coderhelm.com`, available: true, code: 'ok', error: null }, cors);
    }
    if (host === 'coderhelm-public.s3.amazonaws.com' && url.pathname === '/launch/latest.json') {
      return json(200, { version: 'v0.7.0', templateUrl: 'https://coderhelm-public.s3.amazonaws.com/launch/v0.7.0/coderhelm-launch.yaml' }, anyOrigin);
    }
    if (/^coderhelm-setup-[a-z0-9]{16}\.s3\.[a-z0-9-]+\.amazonaws\.com$/.test(host) && url.pathname === '/status.json') {
      return json(200, { schema: 1, phase: 'done', url: `https://${INSTALL_HOST}`, step: 10, steps: 10 }, anyOrigin);
    }
    if (host === INSTALL_HOST) {
      // The install's own setup routes (routes::setup_checks, routes::hybrid_install): `*`, no credentials.
      if (url.pathname === '/api/setup/status') return json(200, SETUP, { ...anyOrigin, 'access-control-allow-methods': 'GET' });
      if (url.pathname.startsWith('/api/setup/hybrid')) return json(200, { registered: true }, anyOrigin);
    }
    json(404, { error: 'not found' });
  });
  await new Promise<void>((r) => tls.listen(0, '127.0.0.1', r));
  const tlsPort = (tls.address() as net.AddressInfo).port;

  // An HTTPS proxy: every CONNECT goes to the TLS server above, which tells the hosts apart.
  const proxy = http.createServer((_, res) => res.writeHead(405).end());
  proxy.on('connect', (_req, client: net.Socket, head) => {
    const upstream = net.connect(tlsPort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  const proxyPort = (proxy.address() as net.AddressInfo).port;

  return {
    proxy: `http://127.0.0.1:${proxyPort}`,
    hits,
    setApiCors: (c) => {
      apiCors = c;
    },
    close: async () => {
      proxy.closeAllConnections();
      tls.closeAllConnections();
      await Promise.all([new Promise((r) => proxy.close(r)), new Promise((r) => tls.close(r))]);
    },
  };
}

let servers: Servers;
test.beforeAll(async () => {
  servers = await startServers();
});
test.afterAll(async () => {
  await servers.close();
});

async function context(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    baseURL: SITE,
    ignoreHTTPSErrors: true,
    proxy: { server: servers.proxy, bypass: 'localhost,127.0.0.1' },
  });
  await ctx.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__CH_NAME_DEBOUNCE_MS = 20;
    w.__CH_POLL_MS = 150;
    w.__CH_HYBRID_RETRY_MS = 50;
    window.open = (() => null) as typeof window.open;
  });
  return ctx;
}

test('the guide is served with the install guide policy; other pages reach only their own origin and Google Analytics', async ({ request }) => {
  const guide = await request.get('/self-host/install/');
  expect(guide.headers()['content-security-policy']).toBe(CSP.installGuide);
  expect(CSP.installGuide).toContain("connect-src 'self' https:");
  expect(CSP.installGuide).toContain("form-action 'self' https://github.com");
  const other = await request.get('/');
  expect(other.headers()['content-security-policy']).toBe(CSP.docs);
  // Beyond its own origin, a docs page may reach Google Analytics only (e2e/analytics.spec.ts).
  expect(CSP.docs).toContain("connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com;");
});

test('real headers: the name check says Available, Taken or Reserved from CoderHelm’s API on another origin', async ({ browser }) => {
  servers.setApiCors('gateway');
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|CORS/i.test(m.text())) violations.push(m.text());
  });
  await page.goto('/self-host/install/');
  await page.locator('[data-setup="hybrid"]').click();
  const input = page.getByLabel('Your CoderHelm address name');
  await input.fill('example-co');
  await expect(page.getByTestId('name-picker')).toHaveAttribute('data-name-state', 'free');
  await expect(page.getByTestId('name-picker-status')).toContainText('Available: example-co.coderhelm.com is free');
  await input.fill('taken-co');
  await expect(page.getByTestId('name-picker-status')).toHaveText('Taken: That name is taken. Try another one.');
  await input.fill('admin');
  await expect(page.getByTestId('name-picker-status')).toHaveText('Reserved: That name is reserved. Try another one.');
  const checks = servers.hits.filter((h) => h.host === 'api.coderhelm.com' && h.method === 'GET');
  expect(checks.map((h) => h.path)).toEqual(expect.arrayContaining(['/hybrid/names/example-co', '/hybrid/names/taken-co', '/hybrid/names/admin']));
  expect(checks.every((h) => h.origin === SITE)).toBe(true);
  // The start screen reads the latest release from the public bucket too.
  expect(servers.hits.map((h) => `${h.host} ${h.path}`)).toContain('coderhelm-public.s3.amazonaws.com /launch/latest.json');
  expect(violations).toEqual([]);
  await ctx.close();
});

test('real headers: without the CORS header (the old API) the check fails, so a CORS block is caught', async ({ browser }) => {
  servers.setApiCors('none');
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto('/self-host/install/');
  await page.locator('[data-setup="hybrid"]').click();
  await page.getByLabel('Your CoderHelm address name').fill('nocors-co');
  await expect(page.getByTestId('name-picker')).toHaveAttribute('data-name-state', 'offline');
  await expect(page.getByTestId('name-picker-status')).toContainText('Couldn’t check right now');
  servers.setApiCors('gateway');
  await ctx.close();
});

test('real headers: the S3 progress file and the install’s own checks all load', async ({ browser }) => {
  servers.setApiCors('gateway');
  const ctx = await context(browser);
  const page = await ctx.newPage();
  const id = 'abcd1234efgh5678';
  await page.addInitScript((sid) => {
    if (sessionStorage.getItem('seeded')) return;
    const s = {
      statusId: sid, setupToken: 'Tk'.repeat(20), region: 'eu-west-1', stage: 'prod', email: 'ada@example.com', provider: 'bedrock', org: '',
      version: 'v0.7.0', url: '', launchedAt: Date.now() - 6 * 60_000, attempt: 1,
    };
    localStorage.setItem(`coderhelm-install:${sid}`, JSON.stringify(s));
    localStorage.setItem('coderhelm-install:last', sid);
    sessionStorage.setItem('seeded', '1');
  }, id);
  await page.goto('/self-host/install/');
  // The progress file says done; the install answers its checks; GitHub is next.
  await expect(page.getByTestId('screen-github')).toBeVisible();
  await expect(page.getByTestId('step-title')).toHaveText('Connect GitHub');
  const hosts = new Set(servers.hits.map((h) => `${h.host} ${h.path}`));
  expect(hosts).toContain(`coderhelm-setup-${id}.s3.eu-west-1.amazonaws.com /status.json`);
  expect(hosts).toContain(`${INSTALL_HOST} /api/setup/status`);
  await ctx.close();
});

test('the docs policy really blocks: a page outside the guide cannot call other origins', async ({ browser }) => {
  const ctx = await context(browser);
  const page = await ctx.newPage();
  await page.goto('/');
  const result = await page.evaluate(() => fetch('https://api.coderhelm.com/hybrid/names/x').then(() => 'loaded', () => 'blocked'));
  expect(result).toBe('blocked');
  await ctx.close();
});
