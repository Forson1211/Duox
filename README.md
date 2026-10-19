# DUO CLASH

Private multiplayer mini-games for friendly rivalries, group challenges, and solo practice. React, TypeScript, Vite, Express, Socket.IO, and MongoDB, with the original purple design and locally served Bricolage Grotesque typography.

## Run locally

Use Node.js 22.14+ and npm. In Windows PowerShell, use `npm.cmd` if your execution policy blocks `npm.ps1`.

```powershell
npm.cmd install
npm.cmd run db
```

Keep the database terminal open. In a second terminal, from this folder:

```powershell
npm.cmd run dev
```

Open **http://localhost:5173** and register. No fake players or leaderboard entries are seeded. The API listens on port 4000.

The database helper downloads MongoDB on its first run, starts a replica set on **127.0.0.1:27018**, and stores data in `backend/.data/mongo`. Preserve that directory to retain accounts and results. Press Ctrl+C to stop cleanly. It leaves existing MongoDB services on port 27017 alone.

The defaults work without `.env` files. Copy `backend/.env.example` to `backend/.env` for custom settings; restart the backend after editing it. The frontend normally uses same-origin API/socket proxies. See `frontend/.env.example` for optional overrides.

## Implemented

- Registration, login/logout, salted scrypt password hashes, HTTP-only cookie sessions, expiry, and password reset.
- Private invite codes/links and safe room previews, configurable playlists and rounds, 1–8 players, ready states, host controls, reconnection, host transfer, and rematches.
- **Quick Quiz:** multiple-choice original starter questions across nine categories; first answer only, server scoring, answers revealed after each round.
- **Memory Rush:** randomly generated growing sequences, timed viewing, ordered input, and server validation.
- **Word Blitz:** scrambled words and clues, normalized answer checks, bounded speed bonuses.
- **Reflex Race:** private random signal, false-start penalties, minimum reaction threshold, server-observed timing.
- **Number Circuit:** generated arithmetic with four choices and increasing difficulty.
- **Code Breaker:** generated three-digit deduction puzzles with a unique solution, exact/misplaced clues, and at least 30 seconds to solve.
- Transactional, idempotent results; lifetime points; separate Elo ratings for ranked two-player matches.
- Global, UTC weekly, quarterly seasonal, and friends leaderboards with pagination.
- Profiles/privacy, history/recaps, achievements, automatic one-time daily rewards, settings, and device-synced light/dark themes.
- Friend requests, acceptance/decline, presence, removal, reporting, blocking/unblocking.
- Server-protected admin statistics, question/category editing, activation, report review, suspension/restoration, and audit trail.
- Responsive desktop/mobile navigation, accessible focus, reduced-motion support, and genuine loading/error/empty states.

## Play with two people

1. Open a normal browser and a private/incognito window; register different accounts.
2. Player one creates a challenge and shares its code or invite link.
3. Player two joins and clicks **I’m ready**; the automatically ready host starts.
4. Complete the rounds. Results save automatically and appear in profiles and rankings.
5. Use **Rematch** or **Return home**. Refresh during a round to check reconnection.

For two devices on your Wi-Fi, set `FRONTEND_ORIGIN=http://YOUR_PC_LAN_IP:5173` in `backend/.env`, restart the backend, and use that URL on both devices. Allow trusted LAN traffic through your firewall if needed. Use one consistent hostname for cookies. Remote play requires HTTPS hosting; see [deployment](docs/deployment.md).

## Checks

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd audit
npx.cmd playwright install chromium
npm.cmd run test:browser
npm.cmd run test:deployment
```

`lint` checks strict TypeScript across workspaces. Tests use isolated MongoDB replica sets, not your Atlas database. Browser checks build the frontend and start their own app on port 5173, use independent Chromium contexts, exercise games/social/admin, check themes/mobile overflow/font loading, and save screenshots under `artifacts/`. Stop an existing frontend before running browser checks. First-run MongoDB/Chromium downloads require network access.

`test:deployment` runs the compiled production API in three independent processes against an isolated database. Two mobile browser contexts complete a ranked playlist of all six games, refresh mid-match, check saved results/rankings, rematch, and leave. It also checks registration, secure cookies, login, and logout. Vercel setup is documented in [deployment](docs/deployment.md#vercel-account-creation-and-login).

Executed check results are recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Atlas and email

Create an Atlas cluster, a database user with read/write access to `duo_clash`, and a network allowlist for your backend host. Set `MONGODB_URI` to its SRV connection string in `backend/.env` or your host's secret manager. URL-encode special password characters. Atlas supplies the transactions required by this app. Skip `npm run db` when using Atlas. The backend fails clearly if MongoDB is unavailable or does not support transactions.

Configure `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, and `EMAIL_FROM` for SMTP password resets. Without SMTP, development returns a reset link to the requesting UI, labeled as development-only. Production never returns reset tokens and requires SMTP for recovery. Never commit secrets or real `.env` files.

## Administrator and content

Register a normal account. Set `ADMIN_BOOTSTRAP_EMAIL` in `backend/.env` to that account, then run `npm.cmd run admin`. Reload the app and open **Admin**. Remove the bootstrap variable afterward. Public registration cannot grant admin roles. `npm.cmd run seed` adds missing original questions without overwriting admin edits or creating players.

## Structure

- `frontend/src/components/`: authentication, dashboard, social/admin, lobby, games.
- `frontend/src/lib/`: credentialed API client, adaptive HTTP/Socket.IO connection, app context.
- `backend/src/app.ts`: REST API, middleware, sockets, static hosting.
- `backend/src/rooms.ts`: authoritative lifecycle, membership, persistence.
- `backend/src/games.ts`: challenge creation, safe views, validation, scoring.
- `backend/src/puzzles.ts`: unique-solution code puzzles and generated arithmetic.
- `backend/src/durable.ts`: shared room snapshots, presence, leases, revision checks.
- `backend/src/models.ts`: indexed database models.
- `backend/scripts/`: local database, seed, admin bootstrap.
- `shared/src/`: types, schemas, games, achievements, scoring helpers.
- `backend/tests/`, `frontend/src/tests/`, `scripts/browser-check.ts`: verification.

See [architecture](docs/architecture.md), [API](docs/api.md), and [deployment](docs/deployment.md).

## Release boundaries

Vercel uses MongoDB-backed live rooms, short-lived leases, revision checks, and authenticated HTTP polling. A match survives function changes and refreshes; scheduled deadlines catch up on the next request. Persistent Node hosting uses Socket.IO and one in-memory coordinator by default. These transports share the same scoring and lifecycle rules. Reflex scores include network latency. SMTP credentials are required for production recovery emails. Guest accounts, public matchmaking, tournaments, and unrestricted messaging remain outside this release. Production load testing and backup restoration are operational checks, separate from the automated game tests.
