# API and Socket.IO

Base: `/api/v1`. JSON bodies and responses; credentialed cookies. Errors use `{error: string}`. Validation returns 400, invalid sessions 401, forbidden actions 403, unavailable private resources 404, duplicates 409, rate limits 429. Passwords require 10–128 characters; usernames use 3–24 letters/digits/underscores and compare case-insensitively.

## Public/authentication

| Method | Path                          | Behavior                                                        |
| ------ | ----------------------------- | --------------------------------------------------------------- |
| GET    | `/health`                     | 200 when MongoDB is connected; otherwise 503                    |
| GET    | `/games`                      | Implemented game catalogue                                      |
| GET    | `/categories`                 | Active question categories                                      |
| GET    | `/achievements`               | Achievement definitions                                         |
| POST   | `/auth/register`              | `{displayName,username,email,password}`; account and cookie     |
| POST   | `/auth/login`                 | `{email,password}`; cookie                                      |
| POST   | `/auth/logout`                | Revoke current session, disconnect account sockets              |
| GET    | `/auth/me`                    | Private account data; authenticated                             |
| POST   | `/auth/forgot-password`       | `{email}`; SMTP delivery or development-only reset link         |
| POST   | `/auth/reset-password`        | `{token,password}`; consume token, revoke sessions              |
| GET    | `/leaderboards/:scope?page=1` | global/weekly/seasonal/friends; friends requires authentication |

Leaderboard responses contain `{leaders,total,page}`, 20 per page. Player records exclude email and password hashes.

## Protected accounts and social

| Method    | Path                            | Behavior                                                              |
| --------- | ------------------------------- | --------------------------------------------------------------------- |
| GET/PATCH | `/users/me`                     | Read/update displayName, avatar, theme, visibility                    |
| DELETE    | `/users/me`                     | `{password}`; requires leaving current room                           |
| GET       | `/users/me/history?page=1`      | Personal results, newest first                                        |
| GET       | `/users/me/achievements`        | Earned achievement IDs                                                |
| GET       | `/users/:username`              | Public profile; private profiles hidden                               |
| GET       | `/challenges/daily`             | UTC day/game/reward/rule/completion                                   |
| POST      | `/challenges/:day/complete`     | Read an earned completion; cannot mint points                         |
| GET       | `/friends`                      | Requests, accepted friends, presence, blocked list                    |
| POST      | `/friends/requests`             | `{username}`                                                          |
| POST      | `/friends/requests/:id/accept`  | Recipient accepts pending request                                     |
| POST      | `/friends/requests/:id/decline` | Recipient declines pending request                                    |
| DELETE    | `/friends/:userId`              | Remove friendship/cancel request                                      |
| POST      | `/blocks`                       | `{userId}`; removes friendship                                        |
| DELETE    | `/blocks/:userId`               | Unblock                                                               |
| POST      | `/reports`                      | `{targetId,category,description}`; abuse/cheating/impersonation/other |

## Protected matches

| Method | Path                        | Behavior                                   |
| ------ | --------------------------- | ------------------------------------------ |
| POST   | `/matches`                  | RoomSettings; attach socket with room:sync |
| POST   | `/matches/join`             | `{code}`                                   |
| GET    | `/matches/:matchId`         | Participants only                          |
| GET    | `/matches/:matchId/results` | Completed match/results; participants only |

RoomSettings: `{name,gameIds,rounds,maxPlayers,duration,ranked,category}`. Game IDs: quick-quiz, memory-rush, word-blitz, reflex-race, number-circuit, code-breaker. Rounds 1–20, slots 1–8, answer time 15/30/45 seconds. Ranked requires two slots and two participants. The client selects HTTP or Socket.IO from health `transport`, using the same typed commands.

## Admin

All routes require an authenticated server-side admin role.

| Method   | Path                   | Behavior                                                                            |
| -------- | ---------------------- | ----------------------------------------------------------------------------------- |
| GET      | `/admin/stats`         | Actual users, completed matches, open reports, active rooms                         |
| GET/POST | `/admin/questions`     | List/create category, prompt, four options, answer index, explanation, active state |
| PATCH    | `/admin/questions/:id` | Edit or activate/deactivate                                                         |
| GET      | `/admin/reports`       | Latest 100                                                                          |
| PATCH    | `/admin/reports/:id`   | status open/resolved/dismissed                                                      |
| GET      | `/admin/users`         | Latest 100 public user summaries/status                                             |
| PATCH    | `/admin/users/:id`     | status active/suspended; suspension revokes access                                  |
| GET      | `/admin/audit`         | Latest 100 audit records                                                            |

## Sockets

Endpoint `/socket.io`; same authenticated cookie and origin validation. Event types are in `shared/src/index.ts`. Client events take `(payload, acknowledgement)`; replies are `{ok:true,data}` or `{ok:false,error}`.

| Client event  | Payload                | Success data                                |
| ------------- | ---------------------- | ------------------------------------------- |
| room:create   | RoomSettings           | RoomState                                   |
| room:join     | `{code}`               | RoomState                                   |
| room:sync     | `{code?}`              | Existing membership state or null           |
| room:leave    | `{}`                   | undefined; waiting/completed/cancelled only |
| room:ready    | `{ready:boolean}`      | undefined                                   |
| match:start   | `{}`                   | undefined; host only, all connected/ready   |
| match:rematch | `{}`                   | undefined; host only after save             |
| answer:submit | `{code,roundId,value}` | undefined                                   |

Answer values: quiz/arithmetic choice index 0–3; memory tile-index array; word string; reflex literal `tap`; code string of exactly three digits. Clients cannot send scores, keys, ratings, or winner IDs.

Server `room:state` broadcasts authorized snapshots after state changes, submissions, reconnects, signal/viewing transitions, and completion. State includes public players/presence/readiness/scores, status, round, permitted challenge, submitted IDs, closed-round summaries, clock/deadlines, winners, save state, and rating changes. `room:error` carries a readable error. This consolidated snapshot protocol supports resynchronization without requiring separate events for every visual transition.

## Durable HTTP game transport

These authenticated routes use the same session cookie and command schemas:

- `GET /realtime/state` returns `{room: RoomState | null}` for the requesting player, advances due deadlines, and refreshes presence.
- `POST /realtime/command` accepts `{event,payload}` using the client-event table above and returns `{data,room}`. Failures use the standard API error status and JSON body.
- `GET /rooms/:code/preview` returns only `{code,settings,status,playerCount,canJoin}`. It honors blocks and expiry and excludes player identities and challenges.
- `GET /users/me/stats` returns `{bestScore,rank,winRate}` from persisted results and account counters. Private profiles have a null public rank.

Room snapshots and answers are never returned directly. The current permitted challenge is serialized through the same safe view used by Socket.IO.
