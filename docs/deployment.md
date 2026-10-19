# Deployment and operations

## Vercel: account creation and login

Deploy this repository with **Root Directory set to the repository root** (leave the field empty), not `frontend` or `backend`. The root `vercel.json` builds all three workspaces, serves `frontend/dist`, and routes `/api/*` to `api/index.js` before the SPA fallback. Nested page URLs such as `/login` and `/register` resolve to the built app.

Set these in Vercel **Settings > Environment Variables**, for Production and any Preview environments you use:

```dotenv
MONGODB_URI=mongodb+srv://USER:ENCODED_PASSWORD@CLUSTER.mongodb.net/duo_clash?retryWrites=true&w=majority
FRONTEND_ORIGIN=https://duoxgame.vercel.app
NODE_ENV=production
```

Use your existing Atlas database to retain accounts. Earlier source revisions contained an embedded Atlas password; rotate that database user password and update `MONGODB_URI` on the host. The real `backend/.env` stays local and is not uploaded by Git. Configure Atlas network access for the backend host. Do not put database credentials in `VITE_*` variables. For trusted preview URLs or a custom domain, add their exact HTTPS origins to `FRONTEND_ORIGIN`, separated by commas; arbitrary Vercel domains are not trusted.

Remove old `VITE_API_URL` and `VITE_SOCKET_URL` overrides for this same-origin deployment. The browser uses `/api/v1` and the host-only `duo_session` cookie. The cookie is HTTP-only, Secure in production, and SameSite=Lax. Redeploy after changing settings or environment variables; frontend environment values are compiled at build time. If replacing a cached build, redeploy without the previous build cache.

Check `https://duoxgame.vercel.app/api/v1/health`: it must return HTTP 200 JSON with `database: "connected"`. Missing/unreachable MongoDB returns HTTP 503 JSON. A Vercel `FUNCTION_INVOCATION_FAILED` text response indicates a function import/startup failure; inspect the function logs. An HTML response under `/api/` indicates the frontend-only configuration or a stale API URL. The app now connects before account routes, shares concurrent connection attempts, and retries after initialization failures.

Run `npm run test:deployment` to build and exercise the actual production handler in Chromium against an isolated MongoDB replica set. This checks cold-start registration, browser cookie persistence, login/logout, and a complete ranked six-game match across three independent API processes and two mobile browser contexts. It verifies refresh reconnection, saved results, rankings, rematch, leaving, and API JSON responses.

The production handler is rebuilt from source. It imports the single `backend/dist/index.js` output; it does not depend on untracked `dist/app.js` or `dist/models.js` files left over from local builds. Runtime packages remain external so MongoDB and Socket.IO retain their package paths. No database credentials are embedded in the source or example configuration.

The complete game uses authenticated HTTP polling on Vercel. Health reports `transport: "http"`; the frontend selects this automatically. Private room snapshots, membership, and revision numbers are stored in MongoDB. Per-room leases serialize commands across function instances; revision checks reject stale writes. A unique membership index prevents one player occupying multiple rooms. Timers advance from scheduled deadlines on incoming requests, so refreshing or switching instances does not restart a round. Final scores save immediately after the final answer, before the results animation. Online presence uses expiring heartbeats.

Polling adjusts to the game phase, including faster checks during Reflex Race. Reaction scores include network and polling latency; a persistent Socket.IO host gives a more immediate reflex experience. Polling and authentication rate limits currently live per function instance; sustained high-volume deployments need a distributed rate limiter and measured capacity planning.

## Production

Run `npm ci && npm run build`, then `npm start`. Express serves the built frontend, SPA routes, API, and Socket.IO. Use one HTTPS origin with a persistent Node host/container and WebSocket support.

```dotenv
NODE_ENV=production
PORT=4000
FRONTEND_ORIGIN=https://your-game.example
MONGODB_URI=mongodb+srv://USER:ENCODED_PASSWORD@CLUSTER.mongodb.net/duo_clash?retryWrites=true&w=majority
EMAIL_HOST=your-smtp-host
EMAIL_PORT=587
EMAIL_USER=your-smtp-user
EMAIL_PASSWORD=your-smtp-password
EMAIL_FROM=DUO CLASH <games@your-domain.example>
```

Store credentials in the host's secret manager. Session tokens are random and stored as hashes; SESSION_SECRET is unnecessary. Production validates an explicit MongoDB URI and HTTPS frontend origin. Configure SMTP for password recovery. The repository also includes the complete Vercel HTTP game configuration above.

Forward HTTPS, WebSocket upgrade headers, and the browser's host/origin through a reverse proxy. Production Express trusts exactly one proxy hop; adapt this if your topology differs and prevent direct access bypassing the trusted proxy. Health probe: `/api/v1/health`. Do not use request-only serverless hosting for the Socket.IO backend.

Run one backend instance. Scaling requires shared live-room coordination, distributed locks/rate limits, and a Socket.IO Redis adapter. Sticky sessions alone do not share game state.

## Split origins

Prefer a same-origin reverse proxy. For separate same-site subdomains, configure VITE_API_URL to the full API base and VITE_SOCKET_URL to the API origin before building. Set backend FRONTEND_ORIGIN to the exact web origin, enable credentials, and include the API/WebSocket origin in CSP connect-src. Unrelated top-level sites require revisiting SameSite/third-party-cookie behavior and explicit CSRF protection; this release uses SameSite=Lax.

## Database and operations

Use MongoDB Atlas or another replica set with transaction support. Restrict its network allowlist to backend egress, enable TLS, and grant scoped database permissions. Initialization creates indexes and adds missing original question seeds on both hosting modes. Existing questions are preserved, including administrator edits and inactive status. Accounts and completed history remain intact. Initialization does not bulk-cancel unfinished matches.

Use provider snapshots/point-in-time backups as appropriate and verify restoration into a separate database. Session/reset records have expiry indexes. Live rooms expire after two hours; historical results, reports, and audits are retained. Define and implement the retention policy required for your deployment before public launch.

Register the intended administrator, temporarily set ADMIN_BOOTSTRAP_EMAIL, run `npm run admin`, then remove the variable. There is no public admin registration.

## Release verification

Run `npm run check`, `npm run test:browser`, and `npm audit`. Test actual Atlas connectivity and SMTP delivery; isolated local tests do not verify cloud credentials. Verify HTTPS cookies, proxy headers, invitations, reconnection, and a two-device match on the deployed domain. Load test expected concurrency and exercise backup restoration before public traffic.

## Troubleshooting

- PowerShell blocks npm.ps1: use npm.cmd/npx.cmd without changing execution policy.
- Database connection refused: start `npm run db` or configure Atlas. Local port is 27018.
- Transactions unsupported: use the included replica-set helper or Atlas rather than standalone mongod.
- Binary download unavailable: allow MongoDB downloads or provide MONGOMS_SYSTEM_BINARY pointing to a compatible installed mongod.
- Login/cookies fail: use one consistent hostname, exact FRONTEND_ORIGIN, HTTPS in production.
- Socket disconnects: forward upgrade headers and review proxy idle timeouts.
- Live room lost after restart: persistent Node hosting uses the single-process Socket.IO coordinator; Vercel rooms use durable snapshots and resume across instances.
- Browser test port busy: stop the frontend on 5173; browser checks start their own isolated app.
