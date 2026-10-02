# Potties Order Desk: working rules

## Deploys cost money: work on `dev`, go live only when asked
- Netlify builds and publishes **every push to `main`** (the live app at potties-orders.netlify.app).
- The Netlify free plan allows about 20 production deploys a month. When it runs out, the whole site is paused until the next month.
- So:
  - **Do all work on the `dev` branch** and push to `dev` as often as needed. Netlify does not build `dev`.
  - Test locally before pushing: `npm test`, `npm run lint`, `npm run build`, and the browser checks.
  - **Only merge `dev` into `main` and push when the owner says to go live** (for example "push live" or "go live").
  - Batch several changes into one go-live.
  - After going live, the version at the bottom of every page (and `/api/health`) shows the short commit hash. Use it to confirm the deploy.
- Never push to `main` just to test something.

## Local setup
See README.md → Local development. Postgres runs locally; `npm run db:seed` loads example data (password `potties-demo-2026`).
