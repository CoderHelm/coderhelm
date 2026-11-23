import { expect, test, type Frame, type Page, type Route } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The App map's layout on a map shaped like a real team's: about twenty
// parts in four columns, four outside services, a busy main server with
// eight connections, two content editors that both reach the content
// service, a long app name and a three-line description. Made-up names.
// Checks, inside the viewer's frame, what a person sees: no line runs along
// or through a card, no two lines meet a card at the same point, and the
// map's title and description never sit over a card, zoomed in or out, on a
// desktop or a phone. Every API call is answered here.

const SHOTS_DIR = process.env.E2E_SHOTS_DIR || path.join("test-results", "shots");
const HARBOR = JSON.parse(fs.readFileSync(path.join(__dirname, "app-map-harbor.json"), "utf8"));

type Part = [id: string, label: string, kind: string, summary: string];
const PARTS: Part[] = [
  ["web", "Marina website", "ui", "Where boaters find a slip, book it and pay."],
  ["mobile", "Marina mobile app", "ui", "The phone app for bookings, check-in and gate codes."],
  ["webeditor", "Website content editor", "ui", "Where staff write the pages and offers the website shows."],
  ["mobileeditor", "Mobile app content editor", "ui", "Where staff write the screens and notices the mobile app shows."],
  ["kiosk", "Dock kiosk", "ui", "The screen at the dock office for walk-up bookings."],
  ["main", "Main server", "service", "Takes every booking, payment and account request."],
  ["gate", "Gate access service", "service", "Opens the dock gates for boaters with a booking."],
  ["notify", "Notifications", "service", "Sends booking emails and text messages."],
  ["search", "Slip search", "service", "Finds open slips by size, dates and price."],
  ["media", "Image and video helpers", "library", "Resizes photos and makes video previews of each slip."],
  ["analytics", "Analytics pipelines", "worker", "Counts bookings and visits every night."],
  ["auth", "Sign-in and accounts", "library", "Boater accounts, passwords and sign-in links."],
  ["billing", "Billing", "library", "Charges cards, refunds and monthly invoices."],
  ["bookings", "Booking rules", "library", "Who may book which slip, and for how long."],
  ["pricing", "Pricing", "library", "Slip prices by season, size and length of stay."],
  ["reports", "Staff reports", "worker", "Weekly occupancy and revenue reports for staff."],
  ["db", "Bookings database", "database", "Slips, boaters, bookings and payments."],
  ["cache", "Fast lookups", "database", "Open slips and prices, kept close at hand."],
  ["queue", "Job queue", "queue", "Emails, reports and media jobs waiting their turn."],
  ["sanity", "Sanity", "external", "Holds the website's and the app's written content."],
  ["stripe", "Stripe", "external", "Card payments and refunds."],
  ["mux", "Mux", "external", "Video hosting for slip tours."],
  ["twilio", "Twilio", "external", "Text messages to boaters."],
];
const CALLS: [string, string][] = [
  ["web", "main"], ["mobile", "main"], ["kiosk", "main"], ["web", "search"], ["mobile", "gate"],
  ["webeditor", "sanity"], ["mobileeditor", "sanity"], ["web", "sanity"], ["mobile", "sanity"], ["webeditor", "media"], ["mobileeditor", "media"],
  ["main", "auth"], ["main", "billing"], ["main", "bookings"], ["main", "pricing"], ["main", "db"], ["main", "queue"], ["main", "cache"], ["main", "notify"],
  ["search", "cache"], ["search", "pricing"], ["gate", "bookings"], ["gate", "db"], ["notify", "queue"], ["notify", "twilio"],
  ["billing", "stripe"], ["billing", "db"], ["bookings", "db"], ["media", "mux"], ["media", "queue"], ["analytics", "db"], ["reports", "db"], ["reports", "analytics"],
];

/** A map shaped like the team's: one file per part, a line per call between parts. */
export function marinaMap() {
  const nodes = PARTS.map(([id, label, kind, summary]) => ({
    id, parent: null, label, kind, summary, details: "", tags: [],
    paths: kind === "external" ? [] : [`marina/${id}`], packages: kind === "external" ? [id] : [], hosts: [],
    stats: kind === "external" ? { files: 0, loc: 0, langs: {}, repos: [] } : { files: 160, loc: 9000, langs: { typescript: 9000 }, repos: ["marina"] },
  }));
  const files = PARTS.filter((p) => p[2] !== "external").map(([id, label]) => ({ p: `marina/${id}/index.ts`, n: id, r: "marina", l: "typescript", loc: 60, name: label, d: `The ${label.toLowerCase()} entry point.` }));
  const ext = new Set(PARTS.filter((p) => p[2] === "external").map((p) => p[0]));
  const links = CALLS.map(([a, b]) => ({ a: `f:marina/${a}/index.ts`, b: ext.has(b) ? `n:${b}` : `f:marina/${b}/index.ts`, k: ext.has(b) ? "import" : "http", w: 3 }));
  return {
    ...HARBOR,
    project: {
      name: "Marina Booking, Gate Access and Content Digital Platform",
      summary:
        "Boaters find and book a slip on the website, the phone app or the dock kiosk, pay by card and get a gate code. Staff write the website's and the app's pages in the content editors, see weekly reports, and every booking, payment, message and video goes through the main server and the services around it.",
    },
    nodes, files, routes: [], links, flows: [], tour: [], screens: [],
    health: { summary: { high: 0, medium: 0, low: 0 }, issues: [] }, recent: undefined,
    coderhelm: { repos: { marina: "marina/marina" }, floorplan: "floorplan--v0.11.0" },
  };
}

/**
 * A map shaped like a large team's real one: 12 top-level parts (a website,
 * a phone app, two content editors, a main server, pipelines, cloud setup,
 * outside services) over 9 repositories, about 3,800 files spread unevenly
 * between them, about 11,000 import lines between files and 75 web requests
 * matched to endpoints, 110 endpoints, 20 Floorplan checks, and a long name
 * with a three-line description. Made-up names.
 */
export function largeRealShapedMap() {
  const parts: [string, string, string, string, number][] = [
    ["web", "Website", "ui", "The public website where members find classes, book them and pay.", 1090],
    ["studio", "Website content editor", "ui", "Where staff write the website's pages and offers.", 180],
    ["mobile", "Fitness mobile app", "ui", "The phone app for bookings, check-in and the member card.", 760],
    ["mobilecms", "Mobile app content editor", "ui", "Where staff write the screens and notices the app shows.", 80],
    ["api", "Main server", "service", "Takes every booking, payment and account request from the website and the app.", 900],
    ["lambdas", "Image and video helpers", "worker", "Small cloud functions that resize images and make video previews.", 5],
    ["data", "Analytics pipelines", "worker", "Scheduled data jobs and models that count bookings and visits.", 320],
    ["display", "Class schedule display", "ui", "A screen listing upcoming classes at each location.", 38],
    ["tools", "Developer tools", "library", "Scripts and helpers the team runs by hand.", 260],
    ["infra", "Cloud setup", "infra", "The cloud hosting, set up as code.", 170],
    ["payments", "Payments provider", "external", "Card payments and refunds.", 0],
    ["content", "Content service", "external", "Holds the written content the website and the app show.", 0],
  ];
  const repos = ["site", "site-studio", "app", "app-cms", "server", "helpers", "pipelines", "screens", "devtools"];
  const nodes = parts.map(([id, label, kind, summary, n]) => ({
    id, parent: null, label, kind, summary, details: "", tags: [], paths: n ? [`${repos[parts.findIndex((p) => p[0] === id) % repos.length]}/`] : [], packages: [], hosts: [],
    stats: { files: n, loc: n * 90, langs: n ? { typescript: n * 90 } : {}, repos: n ? [repos[parts.findIndex((p) => p[0] === id) % repos.length]] : [] },
  }));
  const files: { p: string; n: string; r: string; l: string; loc: number; name: string; d: string }[] = [];
  parts.forEach(([id, label, , , n], pi) => {
    const r = repos[pi % repos.length];
    for (let i = 0; i < n; i++) files.push({ p: `${r}/src/${id}/area${i % 25}/file${i}.ts`, n: id, r, l: "typescript", loc: 90, name: `${label} file ${i}`, d: `Part of the ${label.toLowerCase()}: one screen, route or helper.` });
  });
  const byPart = new Map<string, string[]>();
  for (const f of files) byPart.set(f.n, [...(byPart.get(f.n) ?? []), f.p]);
  const pick = (part: string, i: number) => { const xs = byPart.get(part)!; return xs[i % xs.length]; };
  const links: { a: string; b: string; k: string; w: number }[] = [];
  for (let i = 0; i < 11_142; i++) {
    const f = files[(i * 7) % files.length];
    // Most imports stay inside a part; some cross to the server, the tools or the content editor.
    const to = i % 9 === 0 ? pick(["api", "tools", "studio"][i % 3], i) : pick(f.n, i * 13 + 1);
    links.push({ a: `f:${f.p}`, b: `f:${to}`, k: "import", w: 1 });
  }
  for (let i = 0; i < 75; i++) links.push({ a: `f:${pick(["web", "mobile", "display"][i % 3], i)}`, b: `f:${pick("api", i * 3)}`, k: "http", w: 1 });
  links.push({ a: `f:${pick("api", 1)}`, b: "n:payments", k: "import", w: 4 }, { a: `f:${pick("web", 2)}`, b: "n:content", k: "import", w: 6 }, { a: `f:${pick("mobilecms", 3)}`, b: "n:content", k: "import", w: 3 });
  const routes = Array.from({ length: 110 }, (_, i) => ({ m: ["GET", "POST", "PUT"][i % 3], p: `/api/area${i % 20}/item${i}`, f: pick("api", i * 5), l: 10 + i, name: `Endpoint ${i}`, d: "Answers a booking request." }));
  const issues = Array.from({ length: 20 }, (_, i) => ({ id: `open-endpoints:${pick("web", i * 11)}`, kind: "open-endpoints", severity: i % 4 ? "medium" : "high", title: "An endpoint anyone can call", detail: "", items: [`f:${pick("web", i * 11)}`], notes: {}, locations: [{ file: pick("web", i * 11), line: 3 }], fix: "" }));
  return {
    ...HARBOR,
    project: {
      name: "Riverside Clubs Digital Platform",
      summary: "Riverside Clubs' apps and back office: a public website (Next.js with a hosted content service), a fitness mobile app (React Native), a main server (NestJS) behind them, analytics pipelines, and cloud hosting set up as code.",
    },
    nodes, files, routes, links, flows: [], tour: [], screens: [],
    health: { summary: { high: 5, medium: 15, low: 0 }, issues: issues.map((x) => ({ ...x, source: "floorplan", title: `Floorplan check: ${x.title}` })), checked: [], appWide: [] },
    recent: undefined,
    coderhelm: { repos: Object.fromEntries(repos.map((r) => [r, `riverside/${r}`])), floorplan: "floorplan--v0.11.0" },
    meta: { ...HARBOR.meta, repos },
  };
}

/**
 * A part as big as the largest on a real map: a member portal of 1,008 files
 * in 60 feature folders of 14 files, 40 tests and 128 files loose in its
 * root, which the viewer alone drew as one board of 1,008 cards.
 */
export function onePartOfAThousandFiles() {
  const g = marinaMap();
  const files: { p: string; n: string; r: string; l: string; loc: number; name: string; d: string }[] = [];
  for (let f = 0; f < 60; f++) for (let i = 0; i < 14; i++) files.push({ p: `marina/portal/feature${String(f).padStart(2, "0")}/part${i}.ts`, n: "web", r: "marina", l: "typescript", loc: 40, name: `Feature ${f} part ${i}`, d: "One piece of the member portal." });
  for (let i = 0; i < 40; i++) files.push({ p: `marina/portal/__tests__/case${i}.test.ts`, n: "web", r: "marina", l: "typescript", loc: 40, name: `Test ${i}`, d: "A test." });
  for (let i = 0; i < 128; i++) files.push({ p: `marina/portal/loose${String(i).padStart(3, "0")}.ts`, n: "web", r: "marina", l: "typescript", loc: 40, name: `Loose ${i}`, d: "A helper." });
  const links = [...g.links, ...files.slice(0, 600).map((f, i) => ({ a: `f:${f.p}`, b: `f:${files[(i * 7 + 3) % files.length].p}`, k: "import", w: 1 }))];
  return { ...g, files: [...g.files, ...files], links };
}

async function mockApi(page: Page, graph: unknown) {
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  await page.route((url) => url.hostname !== "localhost", (route) => route.abort());
  await page.route((url) => url.hostname === "localhost" && /^\/(api|auth)\//.test(url.pathname), async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === "/api/me") return json(route, { user_id: "u_1", team_id: "t_1", github_login: null, email: "person@example.com", avatar_url: "", role: "admin", auth_provider: "email", mfa_enabled: false });
    if (p === "/api/banners") return json(route, { banners: [] });
    if (p === "/api/teams") return json(route, { teams: [{ team_id: "t_1", org: "marina", status: "active", current: true }] });
    if (p === "/api/app-map") return json(route, { status: { state: "ready", updating: false, step: "", note: "", floorplan: "floorplan--v0.11.0", built_at: Math.floor(Date.now() / 1000) - 600, built_repos: 3 }, graph });
    return json(route, {});
  });
}

interface Problems {
  alongOrThrough: string[];
  sharedPorts: string[];
  minGap: number;
  /** The closest two lines come where they meet the same side of a card. */
  minPortGap: number;
}

/** What the drawn layout gets wrong, measured from the lines and cards the viewer drew. */
async function layoutProblems(frame: Frame): Promise<Problems> {
  return frame.evaluate(() => {
    const num = (el: Element, a: string) => Number(el.getAttribute(a) || 0);
    const cards = Array.from(document.querySelectorAll("#viewport .node")).filter((g) => g.querySelector("foreignObject")).map((g) => {
      const m = /translate\(([-\d.]+)[ ,]+([-\d.]+)\)/.exec(g.getAttribute("transform") || "") || ["", "0", "0"];
      const fo = g.querySelector("foreignObject")!;
      const gutter = -num(fo, "x");
      const name = (g.querySelector(".card")?.textContent || "").trim().slice(0, 30);
      return { name, x: Number(m[1]), y: Number(m[2]), width: num(fo, "width") - 2 * gutter, height: num(fo, "height") - 2 * gutter };
    });
    const MARGIN = 12; // a line closer than this to a card it doesn't join reads as running along it
    const touches = (c: (typeof cards)[number], p: { x: number; y: number }) =>
      p.x >= c.x - 3 && p.x <= c.x + c.width + 3 && p.y >= c.y - 3 && p.y <= c.y + c.height + 3;
    const alongOrThrough: string[] = [];
    let minGap = Infinity;
    const traces = Array.from(document.querySelectorAll("#viewport .edges .edge path.trace"));
    traces.forEach((t, n) => {
      const pts = Array.from((t.getAttribute("d") || "").matchAll(/([-\d.]+),([-\d.]+)/g)).map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
      if (pts.length < 2) return;
      const ends = cards.filter((c) => touches(c, pts[0]) || touches(c, pts[pts.length - 1]));
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const [x1, x2] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
        const [y1, y2] = [Math.min(a.y, b.y), Math.max(a.y, b.y)];
        for (const c of cards) {
          if (ends.includes(c)) continue;
          const dx = Math.max(0, c.x - x2, x1 - (c.x + c.width));
          const dy = Math.max(0, c.y - y2, y1 - (c.y + c.height));
          const gap = Math.max(dx, dy);
          minGap = Math.min(minGap, gap);
          if (gap < MARGIN) alongOrThrough.push(`line ${n} (${ends.map((e) => e.name).join(" to ")}) passes ${gap.toFixed(0)}px from ${c.name}`);
        }
      }
    });
    const ports = new Map<string, number>();
    for (const c of Array.from(document.querySelectorAll("#viewport circle.port"))) {
      const key = `${Math.round(num(c, "cx"))},${Math.round(num(c, "cy"))}`;
      ports.set(key, (ports.get(key) || 0) + 1);
    }
    const sharedPorts = [...ports.entries()].filter(([, k]) => k > 1).map(([k, n]) => `${n} lines at ${k}`);
    // Ports on the same side of a card share an x; the gap between neighbours.
    const pts = [...ports.keys()].map((k) => k.split(",").map(Number));
    let minPortGap = Infinity;
    for (const c of cards) {
      for (const side of [c.x, c.x + c.width]) {
        const ys = pts.filter(([x, y]) => Math.abs(x - side) < 2 && y >= c.y - 1 && y <= c.y + c.height + 1).map(([, y]) => y).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i++) minPortGap = Math.min(minPortGap, ys[i] - ys[i - 1]);
      }
    }
    return { alongOrThrough, sharedPorts, minGap: Math.round(minGap), minPortGap: Math.round(minPortGap) };
  });
}

/** Whether the map's title block covers any card on screen (it is kept off the canvas: never). */
async function headerOverCards(frame: Frame): Promise<string[]> {
  return frame.evaluate(() => {
    const ctx = document.getElementById("context");
    if (!ctx) return [];
    if (getComputedStyle(ctx).display !== "none") return ["the title block is on the canvas"];
    const r = ctx.getBoundingClientRect();
    const out: string[] = [];
    for (const n of Array.from(document.querySelectorAll("#viewport .node .card"))) {
      const c = n.getBoundingClientRect();
      if (c.right > r.left && c.left < r.right && c.bottom > r.top && c.top < r.bottom) out.push((n.textContent || "").trim().slice(0, 40));
    }
    return out;
  });
}

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  // The dev server's overlay button, out of the picture (a static build has none, and its CSP may refuse the tag).
  await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
  await page.waitForTimeout(400);
  await page.getByTestId("app-map-frame").screenshot({ path: path.join(SHOTS_DIR, `${name}.png`) });
}

async function open(page: Page, graph: unknown = marinaMap()): Promise<Frame> {
  await mockApi(page, graph);
  await page.goto("/app-map");
  const outer = page.getByTestId("app-map-frame").frameLocator("iframe");
  await expect(outer.getByText("Main server").first()).toBeVisible({ timeout: 60_000 });
  const frame = page.frames().find((f) => f.url().includes("/app-map/frame.html"));
  expect(frame).toBeTruthy();
  // The cards finish rising in.
  await page.waitForTimeout(800);
  return frame!;
}

/** Zooms the viewer with its own buttons. */
async function zoom(frame: Frame, label: "Zoom in" | "Zoom out", times: number) {
  for (let i = 0; i < times; i++) await frame.evaluate((id) => (document.getElementById(id) as HTMLButtonElement).click(), label === "Zoom in" ? "z-in" : "z-out");
  await frame.waitForTimeout(400);
}

test.describe("App map layout", () => {
  test("lines keep clear of cards and never share a port", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const frame = await open(page);
    await shot(page, "app-map-layout-overview");
    const p = await layoutProblems(frame);
    console.log(`app-map layout: ${JSON.stringify({ along: p.alongOrThrough.length, shared: p.sharedPorts.length, minGap: p.minGap, minPortGap: p.minPortGap })}`);
    expect(p.alongOrThrough, "a line runs along or through a card it doesn't join").toEqual([]);
    expect(p.sharedPorts, "two lines meet a card at the same point").toEqual([]);
    expect(p.minPortGap, "lines meeting one side of a card are packed tight").toBeGreaterThanOrEqual(14);
  });

  test("a part of a thousand files opens at once, in boards of at most 30 cards, laid out off the frame's thread", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const frame = await open(page, onePartOfAThousandFiles());
    const facts = await frame.evaluate(() => {
      const w = window as unknown as { __coderhelmGroupMs: number; __coderhelmElkRan: string; Floorplan: { state: { kinds: Record<string, boolean> } } };
      return { groupMs: w.__coderhelmGroupMs, ran: w.__coderhelmElkRan, imports: w.Floorplan.state.kinds.import };
    });
    // Grouping runs once, quickly; layouts run in ELK's worker; import lines start hidden.
    expect(facts.groupMs).toBeLessThan(250);
    expect(facts.ran).toBe("worker");
    expect(facts.imports).toBe(false);
    const opened = await frame.evaluate(async () => {
      const F = (window as unknown as { Floorplan: { go: (id: string) => Promise<void>; children: (id: string) => unknown[]; graph: { nodes: { id: string }[] } } }).Floorplan;
      const t = performance.now();
      await F.go("n:web");
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const ms = performance.now() - t;
      const cards = document.querySelectorAll("#viewport .node .card").length;
      // Every board on the map, as the viewer would draw it.
      let largest = 0;
      for (const n of F.graph.nodes) largest = Math.max(largest, F.children(`n:${n.id}`).length);
      return { ms, cards, largest };
    });
    console.log(`app-map large part: ${JSON.stringify({ ...facts, ...opened })}`);
    expect(opened.ms).toBeLessThan(5_000);
    expect(opened.cards).toBeGreaterThan(1);
    expect(opened.cards).toBeLessThanOrEqual(30);
    expect(opened.largest).toBeLessThanOrEqual(30);
    await shot(page, "app-map-large-part-opened");
    // The frame still answers.
    await zoom(frame, "Zoom in", 1);
    expect(errors).toEqual([]);
  });

  for (const size of [{ name: "desktop", width: 1440, height: 1000 }, { name: "laptop", width: 1280, height: 800 }, { name: "phone", width: 390, height: 844 }])
  for (const map of [{ name: "23-parts", graph: marinaMap }, { name: "large", graph: largeRealShapedMap }]) {
    test(`the title and description never sit over the cards (${map.name}, ${size.name})`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      const g = map.graph();
      const frame = await open(page, g);
      // Above the map instead, in the page.
      const title = page.getByTestId("app-map-title");
      await expect(title.getByRole("heading")).toHaveText(g.project.name);
      await expect(title).toContainText(g.project.summary);
      const titleBox = (await title.boundingBox())!;
      const frameBox = (await page.getByTestId("app-map-frame").boundingBox())!;
      expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(frameBox.y);
      expect(await headerOverCards(frame), "at first").toEqual([]);
      await page.screenshot({ path: path.join(SHOTS_DIR, `app-map-title-${map.name}-${size.name}.png`), fullPage: true });
      await zoom(frame, "Zoom in", 3);
      await shot(page, `app-map-header-${map.name}-zoomed-in-${size.name}`);
      expect(await headerOverCards(frame), "zoomed in").toEqual([]);
      await zoom(frame, "Zoom out", 6);
      await shot(page, `app-map-header-${map.name}-zoomed-out-${size.name}`);
      expect(await headerOverCards(frame), "zoomed out").toEqual([]);
      // Dragged up under the title.
      const box = (await page.getByTestId("app-map-frame").boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 220, { steps: 8 });
      await page.mouse.up();
      await frame.waitForTimeout(400);
      await shot(page, `app-map-header-${map.name}-panned-${size.name}`);
      expect(await headerOverCards(frame), "panned").toEqual([]);
    });
  }
});
