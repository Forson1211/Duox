# Development status

The game implements six playable games: Quick Quiz, Memory Rush, Word Blitz, Reflex Race, Number Circuit, and Code Breaker. They share authoritative scoring, private rooms, results, ratings, rematches, achievements, and daily rewards. Accounts, history, rankings, friends, privacy, blocking/reporting, and administration use real MongoDB data. Typography is locally served Bricolage Grotesque.

Vercel multiplayer uses durable MongoDB snapshots, leases, revision checks, and authenticated HTTP polling across instances. Persistent Node hosting retains native Socket.IO. See README.md and docs/architecture.md, docs/api.md, docs/deployment.md for behavior, setup, and transport limits; docs/VERIFICATION.md records executed checks.

Production recovery email requires SMTP credentials. Expected concurrency, distributed rate limiting, backup restoration, and retention policies remain operational work. Tournaments, public matchmaking, guest accounts, and unrestricted messaging are outside the implemented release.
