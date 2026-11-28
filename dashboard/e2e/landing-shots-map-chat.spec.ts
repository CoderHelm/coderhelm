import { expect, test, type Frame, type Page, type Route } from "@playwright/test";
import path from "node:path";
import { SHOTS_DIR, capture, prepare } from "./landing-shots-kit";

// The App map and Chat pictures on coderhelm.com's home page, from made up
// data only: team Acme, its repositories acme/web and acme/api, invented
// people. Every API call is answered here.
//   LANDING_SHOTS_DIR=/tmp/landing E2E_STATIC=1 npx playwright test e2e/landing-shots-map-chat.spec.ts

test.skip(!SHOTS_DIR, "LANDING_SHOTS_DIR not set");
test.use({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });

const now = Date.now();
const iso = (minsAgo: number) => new Date(now - minsAgo * 60_000).toISOString();
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
const ME = { user_id: "u_1", team_id: "t_1", github_login: null, email: "dana@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false };

/** The common calls every page makes; `extra` answers the page's own. */
async function mockApi(page: Page, extra: (p: string, method: string, body: Record<string, unknown> | null, route: Route) => Promise<unknown> | undefined) {
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const body = req.postData() ? (JSON.parse(req.postData()!) as Record<string, unknown>) : null;
    if (p === "/api/me") return json(route, ME);
    if (p === "/api/usage") return json(route, { month: "2026-11", total_tokens: 0, tokens_in: 0, tokens_out: 0, total_runs: 0, max_tokens: 0 });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "acme", status: "active", current: true }] });
    if (p === "/api/repos") return json(route, { repos: [{ name: "acme/web" }, { name: "acme/api" }] });
    let handled = false;
    const mark = new Proxy(route, { get: (t, k) => { if (k === "fulfill") handled = true; const v = Reflect.get(t, k); return typeof v === "function" ? v.bind(t) : v; } });
    await extra(p, method, body, mark);
    if (!handled) return json(route, {});
  });
}

// ---------------------------------------------------------------- App map

type Ev = { file: string; line: number; how: "code" | "inferred"; confidence: number };

/** A store's website (acme/web) and its API (acme/api): parts, data stores, outside services and the links between them. */
function acmeMap() {
  const nodes: Record<string, unknown>[] = [];
  const stats = (repos: string[]) => ({ files: 0, loc: 0, langs: {}, repos });
  const top = (id: string, label: string, kind: string, summary: string, repo: string, path: string, role?: string) =>
    nodes.push({ id, parent: null, label, ...(role ? { role } : {}), kind, summary, details: "", tags: [], paths: [path], packages: [], hosts: [], level: "system", repos: [repo], stats: stats([repo]) });
  top("web", "web", "ui", "The online store: product pages, the cart and checkout.", "web", "web", "Storefront website");
  top("admin", "Store admin", "ui", "Where staff edit products, prices and refunds.", "web", "web/app/admin/");
  top("api", "api", "service", "Takes carts, orders and accounts from the website.", "api", "api", "Store API");
  top("payments", "Payments service", "service", "Charges cards, issues refunds and records each payment.", "api", "api/services/payments/");
  top("jobs", "Background jobs", "worker", "Sends receipts, syncs stock and retries failed charges.", "api", "api/jobs/");
  const store = (id: string, label: string, summary: string) =>
    nodes.push({ id, parent: null, label, kind: "data", summary, details: "", tags: [], paths: [], packages: [], hosts: [], level: "system", stats: stats([]) });
  store("db", "Orders database", "Orders, customers, products and payments.");
  store("cache", "Session cache", "Carts and signed-in sessions, kept close at hand.");
  store("queue", "Job queue", "Work handed to the background jobs.");
  store("search", "Product search", "The search index behind the store's search box.");
  const ext = (id: string, label: string, summary: string) =>
    nodes.push({ id, parent: null, label, kind: "external", summary, details: "", tags: [], paths: [], packages: [], hosts: [], level: "system", vendor: label, how: "catalog", evidence: [], stats: stats([]) });
  ext("cards", "Card processor", "Takes the card payments and sends payment events back.");
  ext("mail", "Email service", "Order receipts and password resets.");

  type File = { p: string; n: string; r: string; l: string; loc: number; name: string; d: string; s?: [string, string, number, number, string][] };
  const files: File[] = [];
  const file = (p: string, n: string, name: string, d: string, s?: File["s"]) => {
    files.push({ p, n, r: p.split("/")[0], l: p.endsWith(".py") ? "python" : "typescript", loc: 120, name, d, ...(s ? { s } : {}) });
    return p;
  };
  const many = (n: string, dir: string, names: string[]) => names.map((x) => file(`${dir}/${x}`, n, x.replace(/\.[a-z]+$/, "").replace(/[-_/]/g, " "), `Part of ${n}.`));
  // The website.
  const checkoutPage = file("web/app/checkout/page.tsx", "web", "Checkout page", "The address, delivery and card steps.", [["CheckoutPage", "function", 14, 1, ""]]);
  const cartPage = file("web/app/cart/page.tsx", "web", "Cart page", "The cart with quantities and the total.");
  const apiClient = file("web/lib/api-client.ts", "web", "Store API client", "Every request the website makes to the API.", [["placeOrder", "function", 42, 1, "POST /orders"]]);
  many("web", "web/app", ["products/[slug]/page.tsx", "search/page.tsx", "account/page.tsx", "account/orders/page.tsx", "layout.tsx", "page.tsx"]);
  many("web", "web/components", ["ProductCard.tsx", "CartDrawer.tsx", "AddressForm.tsx", "CardForm.tsx", "Header.tsx", "Footer.tsx", "PriceTag.tsx"]);
  const adminRefunds = file("web/app/admin/refunds/page.tsx", "admin", "Refunds", "Staff issue a refund for an order.");
  many("admin", "web/app/admin", ["products/page.tsx", "prices/page.tsx", "orders/page.tsx"]);
  // The API.
  const ordersRoute = file("api/src/routes/orders.ts", "api", "Orders", "Creates an order from a cart and asks Payments to charge it.", [["createOrder", "function", 31, 1, "POST /orders"]]);
  const cartsRoute = file("api/src/routes/carts.ts", "api", "Carts", "Reads and updates a cart.");
  const dbClient = file("api/src/db/client.ts", "api", "Database client", "Connects to the orders database.");
  const sessions = file("api/src/auth/sessions.ts", "api", "Sessions", "Signed-in sessions in the cache.");
  const searchClient = file("api/src/search/products.ts", "api", "Product search", "Queries the search index.");
  const enqueue = file("api/src/queue/enqueue.ts", "api", "Enqueue", "Hands work to the background jobs.");
  many("api", "api/src", ["server.ts", "routes/accounts.ts", "routes/products.ts", "middleware/auth.ts", "middleware/rate-limit.ts", "db/migrations.ts"]);
  const payClient = file("api/src/payments/client.ts", "api", "Payments client", "Calls the payments service with an idempotency key.", [["charge", "function", 18, 1, "POST /payments/charges"]]);
  const charges = file("api/services/payments/src/charges.ts", "payments", "Charges", "Charges a card through the card processor.", [["createCharge", "function", 22, 1, ""]]);
  const webhooks = file("api/services/payments/src/webhooks.ts", "payments", "Payment events", "Receives the card processor's events and marks orders paid.");
  const refunds = file("api/services/payments/src/refunds.ts", "payments", "Refunds", "Refunds a payment in full or in part.");
  many("payments", "api/services/payments/src", ["server.ts", "ledger.ts", "idempotency.ts"]);
  const receipts = file("api/jobs/send-receipt.ts", "jobs", "Send receipt", "Emails the receipt once an order is paid.");
  const stockSync = file("api/jobs/sync-stock.ts", "jobs", "Sync stock", "Keeps stock counts in step with the warehouse file.");
  const retry = file("api/jobs/retry-charges.ts", "jobs", "Retry charges", "Retries charges that failed for a temporary reason.");
  const indexer = file("api/jobs/reindex-products.ts", "jobs", "Reindex products", "Rebuilds the search index after product changes.");

  const routes = [
    { f: ordersRoute, m: "POST", p: "/orders", l: 31, h: "createOrder", name: "Place an order", d: "Creates the order and charges the card." },
    { f: cartsRoute, m: "PUT", p: "/carts/:id", l: 12, h: "updateCart", name: "Update a cart", d: "Changes the items in a cart." },
    { f: charges, m: "POST", p: "/payments/charges", l: 22, h: "createCharge", name: "Charge a card", d: "Charges the card for an order." },
    { f: webhooks, m: "POST", p: "/payments/events", l: 9, h: "onEvent", name: "Payment events", d: "The card processor's events." },
    { f: refunds, m: "POST", p: "/payments/refunds", l: 15, h: "createRefund", name: "Refund a payment", d: "Refunds a payment." },
  ];
  const ev = (f: string, line: number, how: "code" | "inferred" = "code"): Ev[] => [{ file: f, line, how, confidence: how === "code" ? 0.95 : 0.7 }];
  const links: Record<string, unknown>[] = [];
  const link = (a: string, b: string, k: string, label: string, e: Ev[]) => links.push({ a, b, k, w: 1, labels: [label], evidence: e, inferred: e[0].how === "inferred" });
  link(`f:${checkoutPage}`, `f:${apiClient}`, "import", "placeOrder", ev(checkoutPage, 3));
  link(`f:${cartPage}`, `f:${apiClient}`, "import", "updateCart", ev(cartPage, 2));
  link(`f:${apiClient}`, "r:0", "http", "POST /orders", ev(apiClient, 44));
  link(`f:${apiClient}`, "r:1", "http", "PUT /carts/:id", ev(apiClient, 61));
  link(`f:${adminRefunds}`, "r:4", "http", "POST /payments/refunds", ev(adminRefunds, 27));
  link(`f:${ordersRoute}`, `f:${payClient}`, "import", "charge", ev(ordersRoute, 5));
  link(`f:${payClient}`, "r:2", "http", "PAYMENTS_URL /payments/charges", ev(payClient, 24, "inferred"));
  link(`f:${charges}`, "n:cards", "import", "the card processor's package", ev(charges, 2));
  link("n:cards", "r:3", "http", "payment events webhook", ev(webhooks, 9, "inferred"));
  link(`f:${refunds}`, "n:cards", "import", "the card processor's package", ev(refunds, 2));
  link(`f:${ordersRoute}`, `f:${dbClient}`, "import", "db", ev(ordersRoute, 4));
  link(`f:${dbClient}`, "n:db", "data", "DATABASE_URL", ev(dbClient, 6, "inferred"));
  link(`f:${charges}`, "n:db", "data", "writes payments", ev(charges, 40, "inferred"));
  link(`f:${webhooks}`, "n:db", "data", "marks orders paid", ev(webhooks, 31, "inferred"));
  link(`f:${sessions}`, "n:cache", "data", "REDIS_URL", ev(sessions, 8, "inferred"));
  link(`f:${cartsRoute}`, "n:cache", "data", "carts", ev(cartsRoute, 20, "inferred"));
  link(`f:${searchClient}`, "n:search", "data", "SEARCH_URL", ev(searchClient, 10, "inferred"));
  link(`f:${enqueue}`, "n:queue", "data", "QUEUE_URL", ev(enqueue, 7, "inferred"));
  link(`f:${webhooks}`, `f:${enqueue}`, "import", "enqueue", ev(webhooks, 4));
  link("n:queue", `f:${receipts}`, "trigger", "order.paid", ev(receipts, 3, "inferred"));
  link("n:queue", `f:${retry}`, "trigger", "charge.failed", ev(retry, 3, "inferred"));
  link(`f:${receipts}`, "n:mail", "http", "MAIL_API_URL", ev(receipts, 12, "inferred"));
  link(`f:${retry}`, "r:2", "http", "POST /payments/charges", ev(retry, 30));
  link(`f:${stockSync}`, "n:db", "data", "updates stock", ev(stockSync, 18, "inferred"));
  link(`f:${indexer}`, "n:search", "data", "rebuilds the index", ev(indexer, 22, "inferred"));
  link(`f:${indexer}`, "n:db", "data", "reads products", ev(indexer, 14, "inferred"));

  const st = (node: string, note: string, e: Ev[]) => ({ node, note, evidence: e });
  const flows = [
    {
      id: "checkout",
      title: "Check out and pay",
      entry: `f:${checkoutPage}`,
      description: "From the checkout page to a paid order and a receipt.",
      steps: [
        st(`f:${checkoutPage}`, "The checkout page's Pay button", ev(checkoutPage, 88)),
        st(`f:${apiClient}`, "placeOrder sends the cart to the API", ev(apiClient, 44)),
        st("r:0", "The API creates the order", ev(ordersRoute, 31)),
        st("r:2", "Payments charges the card", ev(charges, 22)),
        st("n:cards", "The card processor takes the payment", ev(charges, 2)),
        st("r:3", "Its event marks the order paid", ev(webhooks, 9, "inferred")),
        st(`f:${receipts}`, "A job emails the receipt", ev(receipts, 12, "inferred")),
      ],
    },
    {
      id: "refund",
      title: "Refund an order",
      entry: `f:${adminRefunds}`,
      description: "Staff refund an order from the store admin.",
      steps: [st(`f:${adminRefunds}`, "The refund form", ev(adminRefunds, 27)), st("r:4", "Payments refunds the charge", ev(refunds, 15)), st("n:cards", "The card processor returns the money", ev(refunds, 2))],
    },
    {
      id: "search",
      title: "Search for a product",
      entry: `f:${searchClient}`,
      description: "The search box, the API and the index.",
      steps: [st(`f:${searchClient}`, "The API queries the index", ev(searchClient, 10)), st("n:search", "The product search index", ev(searchClient, 10, "inferred"))],
    },
  ];
  const screens = [
    ["/", "Home page"],
    ["/products/:slug", "Product page"],
    ["/cart", "Cart"],
    ["/checkout", "Checkout"],
    ["/account/orders", "Your orders"],
  ].map(([url, name]) => ({ id: `screen:web:${url}`, app: "web", fw: "next-app", file: url === "/checkout" ? checkoutPage : url === "/cart" ? cartPage : files[0].p, url, name, description: `The ${name.toLowerCase()} of the store.`, nav: { app: "web", navigator: "", group: "", gate: null }, behind: [] }));

  const count = new Map<string, number>();
  for (const f of files) count.set(f.n, (count.get(f.n) ?? 0) + 1);
  for (const n of nodes) {
    const c = count.get(n.id as string) ?? 0;
    n.stats = { files: c * 9, loc: c * 9 * 120, langs: c ? { typescript: c * 9 * 120 } : {}, repos: (n.stats as { repos: string[] }).repos };
  }
  return {
    schema: "floorplan/graph@1",
    project: { name: "Acme store", summary: "Acme's online store and the API behind it: orders, payments and the jobs that follow up." },
    meta: {
      agent: "none",
      audience: "everyone",
      counts: { files: files.length * 9, loc: files.length * 9 * 120, unassigned: 0 },
      generatedAt: iso(12),
      exported: { at: iso(12), by: "CoderHelm" },
      repos: [
        { path: "web", name: "web", branch: "main", head: "3f1c9a2e7b".repeat(4), remote: null },
        { path: "api", name: "api", branch: "main", head: "8d2e4b6a1c".repeat(4), remote: null },
      ],
      rootName: "root",
    },
    nodes,
    files,
    routes,
    links,
    screens,
    flows,
    tour: [{ ref: "n:web", note: "What shoppers see.", title: "Website" }],
    health: { summary: { high: 0, medium: 0, low: 0 }, issues: [] },
    coderhelm: { repos: { web: "acme/web", api: "acme/api" }, floorplan: "floorplan--v0.11.0" },
  };
}

async function mapFrame(page: Page): Promise<Frame> {
  await expect.poll(() => page.frames().some((f) => f.url().includes("/app-map/frame.html")), { timeout: 60_000 }).toBe(true);
  return page.frames().find((f) => f.url().includes("/app-map/frame.html"))!;
}

test("app map: the system board for acme/web and acme/api", async ({ page }) => {
  const graph = acmeMap();
  await prepare(page);
  await mockApi(page, async (p, _m, _b, route) => {
    if (p === "/api/app-map") return json(route, { status: { state: "ready", updating: false, step: "", note: "", floorplan: "floorplan--v0.11.0", built_at: Math.floor(Date.now() / 1000) - 720, built_repos: 2 }, graph });
  });
  await page.goto("/app-map");
  const frame = await mapFrame(page);
  await expect(frame.locator("#viewport g.node").first()).toBeVisible({ timeout: 60_000 });
  for (const name of ["Payments service", "Orders database", "Card processor"]) await expect(frame.locator("#viewport g.node", { hasText: name }).first()).toBeVisible();
  await page.getByRole("button", { name: "Full screen" }).click();
  await page.waitForTimeout(1500);
  await capture(page, "app-map");
  // The map draws in its own frame with its own colors: the light picture
  // takes the viewer's own light theme too, over the page capture() mirrored.
  await frame.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS_DIR!, "app-map.png"), animations: "disabled" });
});

// ---------------------------------------------------------------- Chat

const COMMIT = { web: "3f1c9a2e7b", api: "8d2e4b6a1c" } as const;
const src = (id: string, repo: "web" | "api", path: string, start: number, end: number, passage: string) => ({
  id,
  kind: "code",
  title: path,
  loc: `${repo} · lines ${start}-${end}`,
  as_of: "",
  passage,
  url: `https://github.com/acme/${repo}/blob/${COMMIT[repo]}/${path}#L${start}-L${end}`,
  authoritative: false,
  code: { repo: `acme/${repo}`, path, commit: COMMIT[repo], start_line: start, end_line: end },
});
const S1 = src("S1", "web", "lib/api-client.ts", 40, 58, "export async function placeOrder(cart: Cart) {\n  return post<Order>(\"/orders\", { cartId: cart.id, address: cart.address });\n}");
const S2 = src("S2", "api", "src/routes/orders.ts", 28, 64, "router.post(\"/orders\", async (req, res) => {\n  const order = await orders.create(req.body);\n  const charge = await payments.charge(order, { idempotencyKey: order.id });\n  res.status(201).json({ ...order, charge });\n});");
const S3 = src("S3", "api", "src/payments/client.ts", 12, 41, "export async function charge(order: Order, opts: { idempotencyKey: string }) {\n  return fetch(`${process.env.PAYMENTS_URL}/payments/charges`, {\n    method: \"POST\",\n    headers: { \"Idempotency-Key\": opts.idempotencyKey },\n    body: JSON.stringify({ amount: order.total, currency: order.currency }),\n    signal: AbortSignal.timeout(8000),\n  });\n}");
const S4 = src("S4", "api", "services/payments/src/webhooks.ts", 9, 37, "export async function onEvent(event: PaymentEvent) {\n  if (event.type === \"charge.succeeded\") await markPaid(event.orderId);\n  await enqueue(\"order.paid\", { orderId: event.orderId });\n}");
const S5 = src("S5", "api", "jobs/retry-charges.ts", 1, 30, "// Retries charges that failed for a temporary reason, at most three times.");
const CITED = [S1, S2, S3, S4, S5];
const QUESTION = "How does checkout talk to the payments service?";
const ANSWER = [
  "Checkout never calls the payments service from the browser. The website sends the cart to the API, and the API makes the charge on the server side.",
  "",
  "**The path of one order**",
  "1. **Website:** the Pay button calls `placeOrder`, which posts the cart to `POST /orders` on the API [S1].",
  "2. **API:** the orders route creates the order, then calls `payments.charge` with the order id as the idempotency key [S2].",
  "3. **Payments client:** `charge` posts to `PAYMENTS_URL/payments/charges` with an 8 second timeout, so a retry can never charge twice [S3].",
  "4. **Back again:** the payments service marks the order paid when the card processor's `charge.succeeded` event arrives, and queues the receipt email [S4].",
  "",
  "If a charge fails for a temporary reason, `retry-charges` tries it again up to three times with the same key [S5].",
].join("\n");
const ev = (type: string, data: unknown) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
const read = (n: string, repo: "web" | "api", path: string, lines: string, s: unknown[]) => [
  ev("tool_start", { id: n, name: "github__read_file", kind: "code" }),
  ev("tool_result", { id: n, name: "github__read_file", repo, label: `Read ${path} in ${repo}`, kind: "code", status: "success", summary: lines, sources: s }),
];
const USED = [
  { kind: "code", name: "github__search_code", repo: "api", label: "Searched api for “PAYMENTS_URL”", summary: "3 matches" },
  { kind: "code", name: "github__read_file", repo: "web", label: "Read lib/api-client.ts in web", summary: "Lines 40-58 of 120" },
  { kind: "code", name: "github__read_file", repo: "api", label: "Read src/routes/orders.ts in api", summary: "Lines 28-64 of 140" },
  { kind: "code", name: "github__read_file", repo: "api", label: "Read src/payments/client.ts in api", summary: "Lines 12-41 of 60" },
  { kind: "code", name: "github__read_file", repo: "api", label: "Read services/payments/src/webhooks.ts in api", summary: "Lines 9-37 of 52" },
  { kind: "code", name: "github__read_file", repo: "api", label: "Read jobs/retry-charges.ts in api", summary: "Lines 1-30 of 30" },
];
const STREAM = (id: string) =>
  ev("thread", { id, title: QUESTION }) +
  ev("tool_start", { id: "t0", name: "github__search_code", kind: "code" }) +
  ev("tool_result", { id: "t0", name: "github__search_code", repo: "api", label: "Searched api for “PAYMENTS_URL”", kind: "code", status: "success", summary: "3 matches", sources: [] }) +
  [...read("t1", "web", "lib/api-client.ts", "Lines 40-58 of 120", [S1]), ...read("t2", "api", "src/routes/orders.ts", "Lines 28-64 of 140", [S2]), ...read("t3", "api", "src/payments/client.ts", "Lines 12-41 of 60", [S3]), ...read("t4", "api", "services/payments/src/webhooks.ts", "Lines 9-37 of 52", [S4]), ...read("t5", "api", "jobs/retry-charges.ts", "Lines 1-30 of 30", [S5])].join("") +
  ev("text_reset", {}) +
  ev("text_delta", { text: ANSWER }) +
  ev("answer", { text: ANSWER, citations: CITED, grounded: true }) +
  ev("done", {});

const thread = (id: string, title: string, minsAgo: number, over: Record<string, unknown> = {}) => ({ id, title, shared: false, mine: true, owner_email: "dana@example.com", created_at: iso(minsAgo), updated_at: iso(minsAgo), messages: 2, ...over });

test("chat: an answer about the code with numbered citations", async ({ page }) => {
  const NONE = { knowledge: [], connections: false, code: false, memories: false, data_sources: false, skills: false };
  const threads = [
    thread("th_1", "Where do we set the rate limit on sign in?", 45),
    thread("th_2", "What changed in the cart drawer this week?", 60 * 5),
    thread("th_3", "Why did the stock sync job run twice on Monday?", 60 * 26),
    thread("th_4", "Which endpoints in api have no tests?", 60 * 24 * 3),
    thread("th_5", "Onboarding notes for the payments service", 60 * 24 * 6, { mine: false, shared: true, owner_email: "priya@example.com" }),
    thread("th_6", "How are product images resized?", 60 * 24 * 9),
  ];
  let asked = false;
  await prepare(page);
  await mockApi(page, async (p, method, body, route) => {
    if (p === "/api/brain/token") return json(route, { token: "t" });
    if (p === "/api/brain/starters")
      return json(route, {
        starters: [
          { question: "How is api put together?", why: "From the api code", sources: { ...NONE, code: true, repo: "acme/api" } },
          { question: "What's the latest on ACME-214?", why: "From recent work in web", sources: { ...NONE, code: true, repo: "acme/web" } },
        ],
      });
    if (p === "/api/brain/sources")
      return json(route, {
        knowledge: [{ id: "kb_eng", name: "Engineering runbooks", ready: 12, authoritative: false }],
        connections: [],
        repos: ["acme/api", "acme/web"],
        repositories: [
          { name: "acme/api", short: "api", role: "backend" },
          { name: "acme/web", short: "web", role: "web" },
        ],
        can_ask: true,
      });
    if (p === "/api/brain/threads" && method === "GET") return json(route, { threads: asked ? [thread("th_new", QUESTION, 0), ...threads] : threads, can_ask: true });
    if (/^\/api\/brain\/threads\/[^/]+\/messages\/\d+\/feedback$/.test(p)) return json(route, { ok: true });
    const one = p.match(/^\/api\/brain\/threads\/([^/]+)$/);
    if (one)
      return json(route, {
        thread: thread(one[1], QUESTION, 0),
        messages: [
          { seq: 0, role: "user", content: QUESTION, citations: [], grounded: true, sources: { ...NONE, code: true }, mentions: [], attachments: [], used: [], at: iso(1) },
          { seq: 1, role: "assistant", content: ANSWER, citations: CITED, grounded: true, attachments: [], used: USED, at: iso(1) },
        ],
        can_ask: true,
      });
    if (p === "/api/brain/stream" && method === "POST") {
      void body;
      asked = true;
      return route.fulfill({ status: 200, contentType: "text/event-stream", body: STREAM("th_new") }).catch(() => {});
    }
  });
  // A taller window so the whole answer and its sources are in one picture.
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.goto("/chat");
  await page.waitForLoadState("networkidle");
  const box = page.getByRole("textbox", { name: "Message" });
  await box.fill(QUESTION);
  await box.press("Enter");
  await page.getByTestId("answer-actions").waitFor();
  await page.waitForTimeout(800);
  // Start the picture at the question, so the whole answer and its sources follow it.
  await page.getByTestId("chat-scroll").getByText(QUESTION, { exact: true }).first().evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    el.closest("[data-testid=chat-scroll]")?.scrollBy(0, -32);
  });
  await page.waitForTimeout(300);
  await capture(page, "chat");
});
