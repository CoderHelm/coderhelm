# Contributing to Coderhelm (Frontend)

Thanks for your interest in contributing to the Coderhelm marketing & legal site — the Next.js static frontend hosted at [coderhelm.com](https://coderhelm.com).

## Prerequisites

- **Node.js** 20+ (`node -v` to verify)
- **npm** (ships with Node.js)

## Local Development

```bash
# Clone the repository
git clone https://github.com/CoderHelm/coderhelm.git
cd coderhelm

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The site will be available at **http://localhost:3000**.

## Project Structure

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js App Router pages (landing page, global layout, styles) |
| `src/app/(legal)/` | Route group for legal pages (terms, privacy, acceptable-use, contact) |
| `src/components/` | Shared React components (Nav, Footer, WaitlistForm, etc.) |
| `public/` | Static assets served at the site root (favicon, images) |
| `brand/` | Brand guidelines, logos, and icon assets |

## Available Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `npm run dev` | Start the Next.js development server with hot reload |
| `build` | `npm run build` | Build the static export to the `out/` directory |
| `start` | `npm run start` | Serve the production build locally |
| `lint` | `npm run lint` | Run ESLint across the project |

## Code Style

This project uses:

- **TypeScript** for type safety
- **Tailwind CSS v4** for styling
- **ESLint** for linting (config in `eslint.config.mjs`)

Before opening a PR, always run:

```bash
npm run lint
```

Fix any reported issues before submitting.

## Adding a New Page

This site uses the **Next.js App Router** convention — each route is a directory inside `src/app/` containing a `page.tsx` file.

For legal or informational pages, place them inside the `src/app/(legal)/` route group. The `(legal)` prefix is a Next.js route group — it applies a shared layout (`src/app/(legal)/layout.tsx`) without adding a URL segment.

**Static-export constraint:** The project sets `output: "export"` in `next.config.js`, which means every page must be statically renderable at build time. Do not use server-side features like `cookies()`, `headers()`, or dynamic route handlers. Ensure any new page can be fully pre-rendered.

## Commit & PR Guidelines

- **Branch naming:** `feat/<short-description>`, `fix/<short-description>`, or `docs/<short-description>`
- **Commit title format:** keep it short and imperative (e.g. `Add privacy policy page`)
- **PR scope:** each pull request should address a single concern — avoid mixing unrelated changes in one PR
