# Deployment and operations

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

Store credentials in the host's secret manager. Session tokens are random and stored as hashes; SESSION_SECRET is unnecessary. Production validates an explicit MongoDB URI and HTTPS frontend origin. Configure SMTP for password recovery. This local task has not published a public deployment.

Forward HTTPS, WebSocket upgrade headers, and the browser's host/origin through a reverse proxy. Production Express trusts exactly one proxy hop; adapt this if your topology differs and prevent direct access bypassing the trusted proxy. Health probe: `/api/v1/health`. Do not use request-only serverless hosting for the Socket.IO backend.

Run one backend instance. Scaling requires shared live-room coordination, distributed locks/rate limits, and a Socket.IO Redis adapter. Sticky sessions alone do not share game state.

## Split origins

Prefer a same-origin reverse proxy. For separate same-site subdomains, configure VITE_API_URL to the full API base and VITE_SOCKET_URL to the API origin before building. Set backend FRONTEND_ORIGIN to the exact web origin, enable credentials, and include the API/WebSocket origin in CSP connect-src. Unrelated top-level sites require revisiting SameSite/third-party-cookie behavior and explicit CSRF protection; this release uses SameSite=Lax.

## Database and operations

Use MongoDB Atlas or another replica set with transaction support. Restrict its network allowlist to backend egress, enable TLS, and grant scoped database permissions. Startup initializes indexes, cancels unfinished matches from a previous process, and adds missing original question seeds. Accounts, completed history, and admin-edited content remain intact.

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
- Live room lost after restart: expected for the single-process coordinator; completed results persist.
- Browser test port busy: stop the frontend on 5173; browser checks start their own isolated app.
