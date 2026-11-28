# CoderHelm Brand Guidelines

## The Name
- **Product**: CoderHelm, one word with a capital C and a capital H, everywhere people read it: the site, the dashboard, the docs, emails, the repositories and posts. The dashboard's UI lint (`dashboard/scripts/ui-lint.mjs`, rule `brand`) fails on any other spelling.
- **Lowercase only in identifiers**: the bot login `coderhelm[bot]`, the `coderhelm` label, the `/coderhelm` command, package names and addresses.
- **Domain**: coderhelm.com

## The Mark

Three forward-leaning parallelogram slashes: **///**

The mark represents:
- **Three strokes**, the middle one in Accent Blue on the site and in marketing (`icon-accent.svg`)
- **Forward momentum** (leaning right)
- **Precision** (parallel, uniform, geometric)
- **Code** (forward slashes are native to programming)

### Design Specs
- Lean angle: ~12° from vertical
- Stroke aspect ratio: ~1:6 (width to height)
- Gap between strokes: ~73% of stroke width
- All edges are straight lines (no curves)

## Files

| File | Usage |
|------|-------|
| `icon-white.svg` | Mark only, white fill — for dark backgrounds |
| `icon-black.svg` | Mark only, black fill — for light backgrounds |
| `icon-accent.svg` | Mark with blue center slash — for marketing |
| `logo-dark.svg` | Full logo on black background |
| `logo-light.svg` | Full logo on white background |
| `favicon.svg` | 32x32 favicon, white mark on black rounded square |
| `github-avatar.svg` | GitHub App avatar, white mark on black circle |

## Colors

| Name | Hex | Usage |
|------|-----|-------|
| Black | `#000000` | Primary background, text on light |
| White | `#FFFFFF` | Primary text, mark on dark |
| Accent Blue | `#3B82F6` | Interactive elements, links, accent mark |
| Gray 400 | `#9CA3AF` | Secondary text |
| Gray 800 | `#1F2937` | Card backgrounds |
| Gray 900 | `#111827` | Page background (dark mode) |

## Typography

| Usage | Font | Weight |
|-------|------|--------|
| Wordmark / Logo | Geist Mono | SemiBold (600) |
| Headings | Geist Sans | Bold (700) |
| Body | Geist Sans | Regular (400) |
| Code / Data | Geist Mono | Regular (400) |

Fallback stack: `'JetBrains Mono', 'SF Mono', 'Fira Code', monospace`

## Logo Usage

- Minimum clear space: 1x the width of a single slash stroke on all sides
- Minimum size: 24px height for mark, 16px for favicon
- Never stretch, rotate, or skew the mark
- Never change the angle or spacing of the slashes
- The mark can be used without the wordmark
- The wordmark should not be used without the mark

## Dark Mode (Primary)
The default presentation is **white on black** — matching the Vercel aesthetic.
Light mode is the secondary variant.
