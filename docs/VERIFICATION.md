# Verification record — 2026-10-18

## Deployment authentication fix

- Live diagnostic: `/api/v1/health` and `/api/v1/auth/me` returned HTTP 500 with Vercel's `FUNCTION_INVOCATION_FAILED`; `/login` returned HTTP 404 at the time of inspection.
- Strict workspace TypeScript checks passed. A final backend type check also passed after the cookie cleanup change.
- Backend tests: **28 passed**, including production cold-start initialization, retry after missing configuration, concurrent registration/health requests sharing a connection, secure sessions, login/logout, and origin restrictions. The existing rematch assertion was updated to reflect the established behavior that the host is automatically ready.
- Frontend tests: **10 passed**, including HTML/platform responses, blank API environment values, and trailing-slash normalization.
- Production frontend and backend builds passed. The backend is now a 73 KB application bundle with runtime packages kept external.
- Compiled production browser check passed on a 390 px viewport: actual `api/index.js` entry point, cold-start account creation, Secure/HTTP-only/SameSite=Lax browser cookie, reload persistence, logout, wrong-password rejection, login, health JSON, and API 404 JSON. No uncaught browser exceptions. This uses built frontend assets and an isolated MongoDB replica set.
- Source and compiled entry points were checked for embedded MongoDB credentials; none remain. Real Atlas credentials and the new production deployment were not exercised.

## Earlier game verification

Executed against the earlier local implementation:

- `npm.cmd run check`: strict workspace type checks, frontend tests, backend tests, and production frontend/backend builds passed. This full run contained 21 backend tests and 3 frontend tests.
- `npm.cmd run test -w backend` after the last round-initialization/quiz changes: **22 tests passed**, including the added non-repeating question check.
- `npm.cmd run test:browser`: passed with two independent Chromium contexts. Verified locally loaded Bricolage Grotesque, registration, private rooms, ready states, synchronized ranked quiz, correct saved results, rematch/leave, Memory Rush, Word Blitz, Reflex Race, friend requests, persistent dark mode, authorized admin question creation, and no uncaught browser errors.
- Responsive browser checks: seven authenticated pages at widths **320, 390, and 768 pixels**, with no horizontal overflow.
- `npm.cmd audit --json`: **zero reported vulnerabilities**.
- Compiled-server smoke test: connected to the actual local MongoDB replica set; health, SPA routes, built CSS, and locally hosted Bricolage Grotesque WOFF2 assets returned successful responses.
- Persistent-database restart check: MongoDB was stopped and restarted using the same local data directory; all 20 seeded questions remained. The test instance was stopped afterward.
- Inspected desktop results and dark mobile dashboard screenshots, saved in `artifacts/`.

Backend tests cover authentication, password hashing/reset/expiry, origin restrictions, admin authorization, privacy, two-player scoring, symmetric Elo updates, duplicate/late answers, reconnection, idempotent results/rewards, all game rules, concurrent creates/joins, room expiry, stable completed winners, rematches, account deletion, question management, and results surviving application restart. Test accounts live only in isolated test databases.

External services not verified: Atlas credentials/network access, SMTP delivery, public HTTPS hosting/proxy configuration, backups/restoration, or production load. Live room coordination remains limited to a single backend instance; completed results and accounts are persisted in MongoDB.
