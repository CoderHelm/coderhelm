import { expect, test, type APIRequestContext } from "@playwright/test";
import { ROUTES } from "../src/lib/routes";
import { PLACEHOLDER_ORIGIN } from "../src/lib/link-preview";

// What Teams, Slack, iMessage, LinkedIn, X and email clients see when someone
// pastes a link to a dashboard page. Unfurlers don't run scripts or sign in,
// so this reads each page's raw HTML, the way they do: every route in
// lib/routes.ts has its own title and description, and an Open Graph and
// Twitter card picture at an absolute address on the dashboard's own origin.

const BUILD_ORIGIN = (process.env.NEXT_PUBLIC_DASHBOARD_URL || "").replace(/\/+$/, "") || PLACEHOLDER_ORIGIN;

interface Head {
  html: string;
  head: string;
  titles: string[];
  meta: Map<string, string[]>;
  links: { rel: string; href: string }[];
}

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? decode(m[1]) : null;
}

async function readHead(request: APIRequestContext, path: string): Promise<Head> {
  const res = await request.get(path, { headers: { "user-agent": "Mozilla/5.0 (compatible; link-preview-check)" } });
  expect(res.status(), `${path} answers`).toBe(200);
  const html = await res.text();
  const end = html.indexOf("</head>");
  expect(end, `${path} has a <head>`).toBeGreaterThan(0);
  const head = html.slice(0, end);
  const meta = new Map<string, string[]>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = attr(tag, "property") ?? attr(tag, "name");
    const content = attr(tag, "content");
    if (key && content !== null) meta.set(key, [...(meta.get(key) ?? []), content]);
  }
  const links = (head.match(/<link\b[^>]*>/gi) ?? []).map((t) => ({ rel: attr(t, "rel") ?? "", href: attr(t, "href") ?? "" }));
  const titles = [...head.matchAll(/<title>([^<]*)<\/title>/gi)].map((m) => decode(m[1]));
  return { html, head, titles, meta, links };
}

const one = (h: Head, key: string, path: string): string => {
  const v = h.meta.get(key) ?? [];
  expect(v, `${path}: exactly one ${key}`).toHaveLength(1);
  return v[0];
};

/** "/settings/team" is served at "/settings/team/". */
const served = (route: string) => (route === "/" ? "/" : `${route}/`);

test.describe("link previews", () => {
  test("every route has its own title, description and an absolute preview picture", async ({ request }) => {
    for (const [route, info] of Object.entries(ROUTES)) {
      const path = served(route);
      const h = await readHead(request, path);
      const name = info.tab ?? info.label;
      const title = `${name} · Coderhelm`;

      // The title and description are the table's, word for word: nothing
      // from a team's data (a run's title, a ticket, a team name) can be here.
      expect(h.titles, `${path}: one <title>`).toEqual([title]);
      expect(info.description.length, `${route}: description length`).toBeGreaterThanOrEqual(40);
      expect(info.description.length, `${route}: description fits a Teams or Slack card`).toBeLessThanOrEqual(160);
      expect(one(h, "description", path)).toBe(info.description);
      expect(one(h, "og:title", path)).toBe(title);
      expect(one(h, "og:description", path)).toBe(info.description);
      expect(one(h, "twitter:title", path)).toBe(title);
      expect(one(h, "twitter:description", path)).toBe(info.description);
      expect(one(h, "og:site_name", path)).toBe("Coderhelm");
      expect(one(h, "og:type", path)).toBe("website");
      expect(one(h, "twitter:card", path)).toBe("summary_large_image");
      expect(one(h, "theme-color", path)).toMatch(/^#[0-9a-f]{6}$/i);

      // Absolute, on the dashboard's own origin, one origin for all of them
      // (a self-hosted install's upload swaps that one string for its address).
      const url = one(h, "og:url", path);
      const image = one(h, "og:image", path);
      expect(url, `${path}: og:url`).toBe(`${BUILD_ORIGIN}${path}`);
      expect(image, `${path}: og:image`).toMatch(new RegExp(`^${BUILD_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/og/[a-z0-9-]+\\.png$`));
      expect(new URL(image).protocol).toBe("https:");
      expect(one(h, "twitter:image", path)).toBe(image);
      expect(one(h, "og:image:secure_url", path)).toBe(image);
      expect(one(h, "og:image:width", path)).toBe("1200");
      expect(one(h, "og:image:height", path)).toBe("630");
      expect(one(h, "og:image:type", path)).toBe("image/png");
      expect(one(h, "og:image:alt", path)).toMatch(/^Coderhelm: /);

      // Icons, and no redirect an unfurler would follow before reading the tags.
      expect(h.links.some((l) => l.rel === "apple-touch-icon" && l.href === "/apple-touch-icon.png"), `${path}: apple-touch-icon`).toBe(true);
      expect(h.links.some((l) => l.rel === "icon" && l.href === "/favicon.ico"), `${path}: favicon.ico`).toBe(true);
      expect(h.head).not.toMatch(/http-equiv="refresh"/i);
    }
  });

  test("a self-hosted build names no CoderHelm server in its previews", async ({ request }) => {
    test.skip(!!process.env.NEXT_PUBLIC_DASHBOARD_URL, "the hosted build points at its own address");
    for (const route of ["/", "/releases", "/runs/detail", "/settings/system"]) {
      const h = await readHead(request, served(route));
      const preview = [...h.meta.entries()].filter(([k]) => k.startsWith("og:") || k.startsWith("twitter:")).flatMap(([, v]) => v);
      expect(preview.join(" ")).not.toMatch(/coderhelm\.com/i);
      expect(one(h, "og:image", route).startsWith(`${PLACEHOLDER_ORIGIN}/`)).toBe(true);
    }
  });

  test("each preview picture is a 1200x630 PNG served by the dashboard", async ({ request }) => {
    const images = new Set<string>();
    for (const route of Object.keys(ROUTES)) {
      const h = await readHead(request, served(route));
      images.add(new URL(one(h, "og:image", route)).pathname);
    }
    expect(images.size).toBeGreaterThan(10);
    for (const p of images) {
      const res = await request.get(p);
      expect(res.status(), p).toBe(200);
      expect(res.headers()["content-type"], p).toContain("image/png");
      const png = await res.body();
      expect(png.subarray(1, 4).toString("ascii"), p).toBe("PNG");
      // IHDR: width and height, big-endian, at bytes 16 and 20.
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], p).toEqual([1200, 630]);
    }
    for (const icon of ["/favicon.ico", "/favicon.svg", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png"]) {
      expect((await request.get(icon)).status(), icon).toBe(200);
    }
  });

  test("the tags stay in the head after the page starts", async ({ page }) => {
    // Signed out: the page shows sign-in, and the preview tags are still there.
    await page.route((url) => /^\/(api|auth)\//.test(url.pathname), (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: "unauthorized" }) }),
    );
    await page.goto("/releases/");
    await expect(page).toHaveTitle(/Coderhelm/);
    const image = await page.locator('head meta[property="og:image"]').first().getAttribute("content");
    expect(image).toMatch(/\/og\/releases\.png$/);
  });
});
