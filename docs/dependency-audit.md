# Dependency audit

`npm audit --omit=dev` (what ships to the server): **0 vulnerabilities** as of 13 Oct 2026.

## 13 Oct 2026

The weekly health check had flagged high-severity advisories since 8 Oct. Fixed:

- **next 16.3.7 → 16.4.0** (and `eslint-config-next` to match): six advisories, among
  them cache poisoning of SSG/ISR pages, SSRF in image optimisation, and draft-mode
  content leaking into cached responses. This is the one that mattered: it runs in
  production.
- **Overrides** in `package.json` for three transitive dependencies of build tools:
  `source-map-js` ^1.2.2 (Tailwind/PostCSS), and `mysql2` ^3.24.6 and `deepmerge-ts`
  ^8.0.2 (the Prisma CLI; this app uses PostgreSQL, so `mysql2` is never loaded).
  `npm audit fix --force` would instead have *downgraded* Prisma to 6.x and
  `eslint-config-next` to 14.x - not taken.

## Left open, on purpose

- **braces ≤ 3.0.3** - stack-exhaustion DoS from deeply nested glob patterns. No fixed
  release exists yet (3.0.3 is the latest). It reaches this repo only through developer
  tools - the `shadcn` CLI and the Next.js ESLint plugin, both devDependencies - which
  run on a developer's machine against this repo's own globs; nothing in the deployed
  app uses it. `npm audit` reports it as 8 entries (braces and the packages above it in
  that chain). Revisit when braces publishes a fix.
