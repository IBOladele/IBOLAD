# Operator's Notebook

A philosophy-first personal website and blog built with Astro, TypeScript, Tailwind CSS, and MDX.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

## Adding A Blog Post

1. Create a new Markdown or MDX file in `src/content/blog/`.
2. Use the required frontmatter fields:

```md
---
title: "Your title"
description: "A short summary"
pubDate: 2026-02-15
tags: ["systems", "trust"]
pillar: "Continuity"
draft: false
---
```

- `updatedDate` is optional.
- `draft: true` keeps a post out of production builds.

## Update Site Metadata

Edit `src/consts.ts` to change the site name, description, and canonical URL before deploying.

## Deploy To Vercel

1. Push the repository to GitHub.
2. Import the project in Vercel.
3. Set the build command to `npm run build` and the output directory to `dist`.
4. Add the production URL to `src/consts.ts` and `astro.config.mjs`.

Vercel will auto-detect Astro and handle the rest.
