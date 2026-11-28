#!/usr/bin/env node
// Draws public/og-image.png, the 1200x630 picture link previews show (Hacker
// News, X, Slack). It is the home page in small: the mark, the headline from
// src/content/site.ts in the site's fonts and colors (brand/BRAND.md), and a
// crop of the run page screenshot (made up data, public/shots/home).
//
//   node scripts/og-image.mjs     (needs Playwright's Chromium and the network
//                                  for Google Fonts, as the site build does)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = fs.readFileSync(path.join(ROOT, "src/content/site.ts"), "utf8");
// The home page's h1, read from the content file so the two never differ.
const h1 = /slug: "",[\s\S]*?\bh1: "([^"]+)"/.exec(site)?.[1];
if (!h1) throw new Error("home h1 not found in src/content/site.ts");
const shot = fs.readFileSync(path.join(ROOT, "public/shots/home/hero-main-1280.webp")).toString("base64");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;600&family=Newsreader:opsz,wght@6..72,500&display=block" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;background:#f7f6f2;color:#18181b;font-family:Geist,sans-serif;position:relative}
  .brand{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:12px;font-weight:600;font-size:26px;letter-spacing:-0.01em}
  .brand svg{width:30px;height:30px}
  h1{position:absolute;left:72px;top:150px;width:560px;font-family:Newsreader,serif;font-weight:500;font-size:56px;line-height:1.06;letter-spacing:-0.02em}
  .foot{position:absolute;left:72px;bottom:60px;width:520px;font-size:21px;line-height:1.4;color:#46464e}
  .shot{position:absolute;left:680px;top:72px;width:780px;border:1px solid #dcd9d0;border-radius:14px;overflow:hidden;background:#fff;
        box-shadow:0 1px 2px rgba(24,24,27,.05),0 28px 56px -28px rgba(24,24,27,.28)}
  .shot img{display:block;width:100%}
</style></head><body>
  <div class="brand"><svg viewBox="96 86 320 340" aria-hidden="true"><polygon points="106,416 158,416 226,96 174,96" fill="#18181b"/><polygon points="196,416 248,416 316,96 264,96" fill="#3B82F6"/><polygon points="286,416 338,416 406,96 354,96" fill="#18181b"/></svg>CoderHelm</div>
  <h1>${h1}</h1>
  <p class="foot">On GitHub and Jira. On CoderHelm's cloud or in your own AWS account.</p>
  <div class="shot"><img src="data:image/webp;base64,${shot}" alt=""></div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const out = path.join(ROOT, "public/og-image.png");
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${path.relative(ROOT, out)}`);
