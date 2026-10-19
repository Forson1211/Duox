# Architecture and scoring

The React client renders API/socket state and collects input. The backend owns deadlines, eligibility, answers, scores, winners, ratings, achievements, and rewards. The shared workspace supplies types, schemas, game definitions, and deterministic scoring helpers. TanStack Query manages server data; React Hook Form and Zod validate authentication forms. Server validation always runs independently.

## Authentication

Passwords use scrypt with random 16-byte salts, N=32768, r=8, p=3, 64-byte keys, and a 64 MiB memory ceiling. Comparisons are constant-time. Sessions contain random 32-byte tokens; MongoDB stores only SHA-256 token hashes. Cookies are HTTP-only and SameSite=Lax; production adds Secure. The host-only cookie is named `duo_session`. Sessions last seven days. Every protected API request/socket command checks the session and account status. Reset tokens expire after 30 minutes, are single-use, and revoke sessions.

Helmet, explicit CORS/handshake origins, mutation Origin/Fetch Metadata checks, JSON/body limits, authentication/general/socket rate limits, role checks, public serializers, and centralized errors protect boundaries. Session tokens stay in HTTP-only cookies rather than LocalStorage. Production should use one HTTPS origin.

## Shared round engine

`waiting → starting → playing → round-results → playing … → completed`

Persistent Node hosting uses a 100 ms scheduler. Vercel uses durable snapshots and advances scheduled transitions during authenticated HTTP commands/polls, catching up missed deadlines without extending rounds. Clients offset display clocks using server timestamps. All answered players can close a round early. One valid answer per participant/round is accepted; old IDs, invalid types, duplicates, late answers, and nonmembers are rejected. Disconnecting does not extend time. Reconnection restores current state and submitted status.

Waiting-room disconnects have a 30-second grace period. Leaving transfers host status to the next player. Active matches continue and unanswered players score zero. Rooms expire after two hours. A rematch transaction creates a new match ID, retains the code, and resets scores, readiness, answers, rounds, and schedules.

All games use `newRound`, `safeChallenge`, and `scoreAnswer`. Quiz, word, arithmetic, and code answers and future reflex signal times stay private. Memory sequences are visible during the intentional viewing phase and removed from later snapshots. Automated play is not reliably distinguishable from human input in this release.

## Scores and progression

Correct quiz, word, memory, arithmetic, or code response:

`100 + round(50 × clamp(1 − elapsed / responseWindow, 0, 1))`

Wrong/missed answers score zero. Memory elapsed time starts after viewing. Reflex uses its five-second response window; early taps or responses under 80 ms score zero. Reaction time includes transport and scheduling latency.

Casual, solo, and group play never changes rating. Ranked matches require two participants. Elo uses K=32 and outcomes 1/0.5/0 for win/tie/loss:

`round(32 × (outcome − 1 / (1 + 10^((opponentRating − ownRating)/400))))`

Both updates use ratings from before the match. Progression points are independent. Ties share placement and do not count as wins.

Daily challenges rotate across games by UTC date. Earning at least 100 points in that day's game in a completed match awards 200 points once. Achievements derive from validated counters. The completion endpoint reads earned rewards and cannot grant arbitrary claims.

## MongoDB

Replica-set transactions atomically claim completion, insert results, update counters/achievements, and grant rewards. Unique `(matchId,userId)` and `(userId,day)` indexes prevent duplicate results and daily rewards. No endpoint accepts client scores or winner IDs.

Indexes cover normalized usernames/emails, session/reset token uniqueness and TTL, invite codes, history/time queries, friendships, and blocks. Lifetime counters live on User rather than in a second authoritative stats collection. Weekly/seasonal rankings aggregate persisted awards; weeks start Monday 00:00 UTC and seasons use calendar quarters. Rankings paginate in batches of 20. Private/suspended profiles are excluded.

Original content seeding is idempotent and preserves admin edits. Admins manage categories through question authoring/editing; active categories populate room creation. Blocking removes friendships and prevents future joins/requests, without ejecting players from an ongoing match.

Vercel live rooms are private MongoDB snapshots with TTL expiry, unique membership, renewable leases, and revision checks. Online presence has a separate TTL. Final results save immediately and transactionally, independently of the results screen. No startup operation bulk-cancels matches. The native Socket.IO hosting mode keeps one process as its live coordinator; multiple native socket hosts require a shared adapter/coordinator. Rate limits currently live in each API process. Account deletion removes private profile/session/social/result data; historical matches retain anonymized identifiers. Establish operational backup and retention policies before public launch.

## Generated mind games

Number Circuit generates addition, subtraction, multiplication, exact division, and later mixed-operation expressions. Each round has four distinct numeric choices. Code Breaker chooses a unique-digit three-digit code (leading zero allowed), generates exact-position and misplaced-digit clues, and verifies the remaining candidate set has exactly one solution. The secret itself is excluded from clues. Code rounds allow at least 30 seconds. Both games use the shared deadline, one-answer, speed-score, results, rematch, achievement, and daily-reward rules.
