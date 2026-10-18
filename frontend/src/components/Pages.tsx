import { GameCards } from "./GameCards";
import { GameArt } from "./GameArt";
import { Avatar } from "./Avatar";
import { useState, useEffect, type FormEvent, type ReactNode } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowLeft,
  ArrowUpRight,
  Clock3,
  Search,
  X,
  Medal,
  Award,
  Brain,
  CalendarDays,
  Check,
  Copy,
  Crown,
  Gamepad2,
  Heart,
  Plus,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import {
  achievements,
  games,
  gameIds,
  type Account,
  type Player,
  type RoomState,
  type RoomSettings,
  type GameId,
} from "@duo-clash/shared";
import { api, post } from "../lib/api";
import { command, useApp } from "../lib/context";
const icons = [Brain, Sparkles, Zap, Zap];
export function Heading({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="section-kicker">{kicker}</span>
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <Gamepad2 size={28} />
      <p>{children}</p>
    </div>
  );
}
export function QueryStatus({
  loading,
  error,
}: {
  loading: boolean;
  error: Error | null;
}) {
  return loading ? (
    <p className="loading" role="status">
      Loading…
    </p>
  ) : error ? (
    <p className="error-box" role="alert">
      {error.message}
    </p>
  ) : null;
}
interface HistoryRow {
  _id: string;
  userId: string;
  matchId: string;
  score: number;
  points: number;
  placement: number;
  won: boolean;
  ratingBefore: number;
  ratingAfter: number;
  completedAt: string;
}
function History() {
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["history", page],
    queryFn: () =>
      api<{ results: HistoryRow[] }>(`/users/me/history?page=${page}`),
  });
  return (
    <section className="panel">
      <div className="panel-title">
        <h2>Recent matches</h2>
        <span className="muted">Your results, saved</span>
      </div>
      <QueryStatus loading={q.isLoading} error={q.error} />
      {q.data && !q.data.results.length && (
        <Empty>
          Your first match is waiting. Pick a game and start playing.
        </Empty>
      )}
      {q.data?.results.map((r) => (
        <Link
          className="history-row"
          to={"/app/profile?match=" + r.matchId}
          key={r._id}
        >
          <span className={"result-badge " + (r.won ? "won" : "")}>
            {r.won ? <Crown size={18} /> : <Swords size={18} />}
          </span>
          <div>
            <strong>{r.won ? "Victory" : `Finished #${r.placement}`}</strong>
            <small>{new Date(r.completedAt).toLocaleString()}</small>
          </div>
          <span>
            <strong>{r.score} pts</strong>
            <small>
              {r.ratingAfter - r.ratingBefore > 0 ? "+" : ""}
              {r.ratingAfter - r.ratingBefore} rating
            </small>
          </span>
        </Link>
      ))}
      <div className="pagination">
        <button
          className="btn btn-outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          className="btn btn-outline"
          disabled={(q.data?.results.length ?? 0) < 20}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
export function Dashboard() {
  const { user } = useApp();
  return (
    <div className="home-view">
      <Heading
        kicker="A little play goes a long way"
        title={`Hey, ${user.displayName}.`}
      >
        <Link className="btn btn-outline" to="/app/rooms/join">
          <Users size={17} />
          Join with code
        </Link>
      </Heading>
      <section className="dashboard-hero">
        <div className="hero-poster-copy">
          <span className="poster-label">
            <span />
            Made for your people
          </span>
          <h2>
            Great games.
            <br />
            <span>Even better company.</span>
          </h2>
          <p>
            A quick challenge. A friendly rivalry.
            <br />
            Something to smile about together.
          </p>
          <Link className="btn btn-white btn-large" to="/app/rooms/create">
            Create a challenge
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <GameArt game="hero" className="hero-characters" />
      </section>
      <nav className="quick-menu" aria-label="Quick play">
        <Link to="/app/rooms/create">
          <span className="quick-icon violet">
            <Plus size={23} />
          </span>
          <span>Create room</span>
        </Link>
        <Link to="/app/rooms/join">
          <span className="quick-icon blue">
            <Users size={22} />
          </span>
          <span>Join room</span>
        </Link>
        <Link to="/app/daily">
          <span className="quick-icon peach">
            <CalendarDays size={22} />
          </span>
          <span>Daily challenge</span>
        </Link>
        <Link to="/app/friends">
          <span className="quick-icon pink">
            <Heart size={22} />
          </span>
          <span>My people</span>
        </Link>
      </nav>
      <div className="metric-grid">
        {[
          [Trophy, user.points.toLocaleString(), "Total points"],
          [ShieldCheck, user.rating, "Rating"],
          [Gamepad2, user.matches, "Played"],
          [Crown, user.wins, "Wins"],
        ].map(([Icon, value, label]) => {
          const I = Icon as typeof Trophy;
          return (
            <div className="metric" key={String(label)}>
              <span className="metric-symbol">
                <I size={19} />
              </span>
              <div>
                <strong>{String(value)}</strong>
                <span>{String(label)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="section-heading compact">
        <div>
          <h2>
            Your next challenge<span className="heading-dot">.</span>
          </h2>
          <p>A little something for every kind of clever.</p>
        </div>
        <Link className="text-link" to="/app/play">
          View all
          <ArrowRight size={15} />
        </Link>
      </div>
      <GameCards />
      <div className="dashboard-lower">
        <History />
        <DailyChallenge compact />
      </div>
    </div>
  );
}
export function PlayPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  return (
    <>
      <Heading kicker="A good time starts here" title="What's your game?">
        <Link className="btn btn-outline" to="/app/rooms/join">
          <Users size={17} />
          Join a room
        </Link>
      </Heading>
      <label className="search-field">
        <Search size={19} />
        <input
          type="search"
          aria-label="Search games"
          placeholder="Find your next favourite game"
          value={search}
          onChange={(e) =>
            setParams(e.target.value ? { q: e.target.value } : {}, {
              replace: true,
            })
          }
        />
        {search && (
          <button
            aria-label="Clear search"
            onClick={() => setParams({}, { replace: true })}
          >
            <X size={17} />
          </button>
        )}
      </label>
      <GameCards search={search} />
      <section className="panel instructions">
        <div className="section-heading">
          <h2>Three steps. Endless rematches.</h2>
          <Swords size={23} />
        </div>
        <ol>
          <li>
            <strong>Make it your game.</strong> Pick your favourites, choose
            your rounds, and create a room.
          </li>
          <li>
            <strong>Bring your people.</strong> Share your code. Everyone joins
            on their own device and marks ready.
          </li>
          <li>
            <strong>Play for the crown.</strong> Clever answers, good memories,
            quick fingers. Find your superpower.
          </li>
        </ol>
        <p className="muted">
          Play solo to warm up, go head-to-head in ranked mode, or bring a group
          of up to eight.
        </p>
      </section>
    </>
  );
}
export function CreateRoom() {
  const { socket, setRoom, notify, room } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const selected = Number(params.get("game"));
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<{ categories: string[] }>("/categories"),
  });
  const [settings, setSettings] = useState<RoomSettings>({
    name: "Friendly rivalry",
    gameIds:
      params.has("game") && games[selected]
        ? [games[selected].id]
        : [...gameIds],
    rounds: 10,
    maxPlayers: 2,
    duration: 15,
    ranked: false,
    category: "All",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await command<RoomState>(socket, "room:create", settings);
      setRoom(r);
      navigate("/app/rooms/" + r.code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        kicker="Make room for a little fun"
        title="Create a challenge."
      />
      <form className="panel setup-form" onSubmit={submit}>
        {room && (
          <p className="notice">
            You already have a room.{" "}
            <Link to={"/app/rooms/" + room.code}>Return to it</Link> or leave it
            before creating another.
          </p>
        )}
        <label className="field-label">
          Room name
          <input
            required
            maxLength={48}
            value={settings.name}
            onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          />
        </label>
        <fieldset className="game-picker">
          <legend>Choose your games</legend>
          {games.map((g, i) => {
            const Icon = icons[i];
            const checked = settings.gameIds.includes(g.id);
            return (
              <label className={checked ? "selected" : ""} key={g.id}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSettings({
                      ...settings,
                      gameIds: checked
                        ? settings.gameIds.filter((id) => id !== g.id)
                        : [...settings.gameIds, g.id],
                    })
                  }
                />
                <Icon size={22} />
                <span>{g.title}</span>
                {checked && <Check size={17} />}
              </label>
            );
          })}
        </fieldset>
        <div className="form-grid">
          <label className="field-label">
            Rounds
            <select
              aria-label="Rounds"
              value={settings.rounds}
              onChange={(e) =>
                setSettings({ ...settings, rounds: Number(e.target.value) })
              }
            >
              {[1, 3, 5, 10, 15, 20].map((n) => (
                <option key={n} value={n}>
                  {n} round{n !== 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Player limit
            <select
              aria-label="Player limit"
              value={settings.maxPlayers}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxPlayers: Number(e.target.value),
                  ranked: Number(e.target.value) === 2 && settings.ranked,
                })
              }
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "Solo practice" : `Up to ${n} players`}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Answer time
            <select
              aria-label="Answer time"
              value={settings.duration}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  duration: Number(e.target.value) as 15 | 30 | 45,
                })
              }
            >
              {[15, 30, 45].map((n) => (
                <option key={n} value={n}>
                  {n} seconds
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Quiz category
            <select
              aria-label="Quiz category"
              value={settings.category}
              onChange={(e) =>
                setSettings({ ...settings, category: e.target.value })
              }
            >
              {[
                "All",
                ...(categories.data?.categories ?? [
                  "General Knowledge",
                  "Science",
                  "Technology",
                  "Geography",
                  "Sports",
                  "Entertainment",
                  "Word Knowledge",
                  "Couple Questions",
                  "Family-Friendly Trivia",
                ]),
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="check-label">
          <input
            type="checkbox"
            disabled={settings.maxPlayers !== 2}
            checked={settings.ranked}
            onChange={(e) =>
              setSettings({ ...settings, ranked: e.target.checked })
            }
          />
          Ranked head-to-head (two players only)
        </label>
        <p className="muted">
          Memory includes a viewing period. Reflex Race uses a random signal and
          a five-second response window.
        </p>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <button
          disabled={busy || !settings.gameIds.length || !!room}
          className="btn btn-primary btn-large"
        >
          {busy ? "Creating…" : "Create room"}
          <ArrowRight size={17} />
        </button>
      </form>
    </>
  );
}
export function JoinRoom() {
  const { socket, setRoom } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await command<RoomState>(socket, "room:join", {
        code: code.trim().toUpperCase(),
      });
      setRoom(r);
      navigate("/app/rooms/" + r.code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading kicker="Good company is a code away" title="Join a challenge." />
      <form className="panel join-form" onSubmit={submit}>
        <div className="modal-icon">
          <Users size={25} />
        </div>
        <h2>Got an invite?</h2>
        <p className="muted">Enter the room code shared by your friend.</p>
        <label className="field-label">
          Invite code
          <input
            autoFocus
            required
            maxLength={10}
            placeholder="DUO-ABC234"
            value={code}
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary modal-submit" disabled={busy}>
          {busy ? "Joining…" : "Join room"}
          <ArrowRight size={17} />
        </button>
      </form>
    </>
  );
}
export { Leaderboard } from "./Leaderboard";
interface Daily {
  id: string;
  gameId: GameId;
  reward: number;
  description: string;
  completed: boolean;
}
export function DailyChallenge({ compact = false }: { compact?: boolean }) {
  const q = useQuery({
    queryKey: ["daily"],
    queryFn: () => api<Daily>("/challenges/daily"),
  });
  const g = games.find((g) => g.id === q.data?.gameId);
  return (
    <>
      {!compact && (
        <Heading
          kicker="ONE DAY. ONE CHALLENGE."
          title="A little daily ritual."
        />
      )}
      <section className="daily-card">
        <CalendarDays size={28} />
        <span className="section-kicker">TODAY’S CHALLENGE · UTC</span>
        <h2>{g?.title ?? "Your daily challenge"}</h2>
        <QueryStatus loading={q.isLoading} error={q.error} />
        <p>{q.data?.description}</p>
        {q.data && (
          <>
            <strong className="daily-reward">
              +{q.data.reward} bonus points
            </strong>
            {q.data.completed ? (
              <p className="daily-complete">
                <Check size={18} />
                Complete! Come back tomorrow.
              </p>
            ) : (
              <Link
                className="btn btn-white"
                to={
                  "/app/rooms/create?game=" +
                  games.findIndex((x) => x.id === q.data?.gameId)
                }
              >
                Take the challenge
                <ArrowRight size={16} />
              </Link>
            )}
          </>
        )}
      </section>
    </>
  );
}
export function Achievements() {
  const { user } = useApp();
  return (
    <>
      <Heading kicker="Little wins. Big smiles." title="Your trophy cabinet." />
      <div className="achievement-grid">
        {achievements.map((a) => {
          const earned = user.achievements.includes(a.id);
          return (
            <article
              className={"panel achievement " + (earned ? "earned" : "locked")}
              key={a.id}
            >
              <span className="achievement-icon">
                <Award size={28} />
              </span>
              <h2>{a.title}</h2>
              <p>{a.description}</p>
              <span className="achievement-state">
                {earned ? "Unlocked" : "Keep playing"}
              </span>
            </article>
          );
        })}
      </div>
    </>
  );
}
export function Friends() {
  const { notify } = useApp();
  const query = useQueryClient();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["friends"],
    queryFn: () =>
      api<{
        friends: {
          id: string;
          status: string;
          incoming: boolean;
          user: Player;
          online: boolean;
        }[];
        blocked: Player[];
      }>("/friends"),
    refetchInterval: 30000,
  });
  const run = async (path: string, body: unknown = {}, method = "POST") => {
    setBusy(true);
    try {
      await api(path, {
        method,
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      await query.invalidateQueries({ queryKey: ["friends"] });
      setUsername("");
      notify("Updated.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading kicker="Better with your people" title="Friends & rivals." />
      <form
        className="panel inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run("/friends/requests", { username });
        }}
      >
        <label className="field-label">
          Find a friend by username
          <input
            required
            minLength={3}
            maxLength={24}
            placeholder="Their username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          Send request
          <Plus size={16} />
        </button>
      </form>
      <section className="panel">
        <QueryStatus loading={q.isLoading} error={q.error} />
        {q.data && !q.data.friends.length && (
          <Empty>Add someone you know to start a friendly rivalry.</Empty>
        )}
        {q.data?.friends.map((f) => (
          <div className="friend-row" key={f.id}>
            <Avatar player={f.user} />
            <Link to={"/app/players/" + f.user.username}>
              <strong>{f.user.displayName}</strong>
              <small>
                @{f.user.username} ·{" "}
                {f.status === "pending"
                  ? f.incoming
                    ? "Wants to be friends"
                    : "Request sent"
                  : f.online
                    ? "Online"
                    : "Offline"}
              </small>
            </Link>
            <div className="row-actions">
              {f.status === "pending" && f.incoming ? (
                <>
                  <button
                    disabled={busy}
                    className="btn btn-primary"
                    onClick={() => void run(`/friends/requests/${f.id}/accept`)}
                  >
                    Accept
                  </button>
                  <button
                    disabled={busy}
                    className="btn btn-outline"
                    onClick={() =>
                      void run(`/friends/requests/${f.id}/decline`)
                    }
                  >
                    Decline
                  </button>
                </>
              ) : (
                <button
                  disabled={busy}
                  className="btn btn-outline"
                  onClick={() =>
                    void run("/friends/" + f.user.id, {}, "DELETE")
                  }
                >
                  {f.status === "pending" ? "Cancel" : "Remove"}
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
      {!!q.data?.blocked.length && (
        <section className="panel">
          <h2>Blocked players</h2>
          {q.data.blocked.map((p) => (
            <div className="friend-row" key={p.id}>
              <strong>@{p.username}</strong>
              <button
                disabled={busy}
                className="btn btn-outline"
                onClick={() => void run("/blocks/" + p.id, {}, "DELETE")}
              >
                Unblock
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
export function Profile() {
  const { user, notify } = useApp();
  const { username } = useParams();
  const [params] = useSearchParams();
  const [report, setReport] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const isMe = !username || username === user.username;
  const q = useQuery({
    queryKey: ["profile", username],
    queryFn: () => api<{ user: Player }>("/users/" + username),
    enabled: !isMe,
  });
  const p = isMe ? user : q.data?.user;
  const match = useQuery({
    queryKey: ["result", params.get("match")],
    queryFn: () =>
      api<{
        match: { rounds: { round: number; answer: string }[] };
        results: HistoryRow[];
      }>("/matches/" + params.get("match") + "/results"),
    enabled: !!params.get("match") && isMe,
  });
  const action = async (type: "block" | "report") => {
    if (!p) return;
    setBusy(true);
    try {
      await post(
        type === "block" ? "/blocks" : "/reports",
        type === "block"
          ? { userId: p.id }
          : { targetId: p.id, category: "other", description: reason },
      );
      notify(type === "block" ? "Player blocked." : "Report submitted.");
      setReport(false);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        kicker="A little about you"
        title={isMe ? "Your profile" : (p?.displayName ?? "Player profile")}
      >
        {isMe && (
          <Link className="btn btn-outline" to="/app/settings">
            Edit profile
          </Link>
        )}
      </Heading>
      <QueryStatus loading={!isMe && q.isLoading} error={q.error} />
      {p && (
        <>
          <section className="panel profile-card">
            <div className="profile-cover" aria-hidden="true">
              <GameArt game="quick-quiz" />
              <GameArt game="memory-rush" />
            </div>
            <Avatar player={p} large />
            <div>
              <h2>{p.displayName}</h2>
              <p>
                @{p.username} · Level {p.level}
              </p>
              <span className="muted">
                {p.points.toLocaleString()} points · {p.rating} rating ·{" "}
                {p.wins} wins / {p.matches} matches
              </span>
            </div>
            {!isMe && (
              <div className="row-actions">
                <button
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => void action("block")}
                >
                  Block
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => setReport(!report)}
                >
                  Report
                </button>
              </div>
            )}
          </section>
          {report && (
            <form
              className="panel"
              onSubmit={(e) => {
                e.preventDefault();
                void action("report");
              }}
            >
              <label className="field-label">
                What happened?
                <textarea
                  required
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button disabled={busy} className="btn btn-primary">
                Send report
              </button>
            </form>
          )}
          <section className="panel">
            <h2>Achievements</h2>
            {!p.achievements.length ? (
              <p className="muted">The adventure is just beginning.</p>
            ) : (
              <div className="badge-list">
                {achievements
                  .filter((a) => p.achievements.includes(a.id))
                  .map((a) => (
                    <span key={a.id}>
                      <Award size={16} />
                      {a.title}
                    </span>
                  ))}
              </div>
            )}
          </section>
        </>
      )}
      {match.isFetching && <p role="status">Loading match…</p>}
      {match.error && <p className="error-box">{match.error.message}</p>}
      {match.data && (
        <section className="panel">
          <h2>Match recap</h2>
          {match.data.results.map((r) => (
            <p key={r._id}>
              {r.userId === user.id ? "You" : "Player"} · #{r.placement} ·{" "}
              {r.score} points · {r.ratingAfter - r.ratingBefore} rating
            </p>
          ))}
          {match.data.match.rounds.map((r) => (
            <p key={r.round}>
              Round {r.round}: {r.answer}
            </p>
          ))}
        </section>
      )}
      {isMe && <History />}
    </>
  );
}
export function SettingsPage() {
  const { user, refresh, notify } = useApp();
  const [name, setName] = useState(user.displayName);
  const [avatar, setAvatar] = useState(user.avatar);
  const [visibility, setVisibility] = useState(user.visibility);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const query = useQueryClient();
  const navigate = useNavigate();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: name, avatar, visibility }),
      });
      await refresh();
      notify("Profile saved.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/users/me", {
        method: "DELETE",
        body: JSON.stringify({ password }),
      });
      query.setQueryData(["me"], null);
      query.clear();
      navigate("/");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading kicker="Make yourself at home" title="Your settings." />
      <form className="panel setup-form" onSubmit={save}>
        <h2>Your character, your style.</h2>
        <div
          className="avatar-picker"
          role="group"
          aria-label="Choose your character"
        >
          {[
            ["sparkles", "Nova"],
            ["heart", "Sunny"],
            ["bolt", "Kai"],
            ["brain", "Jules"],
            ["crown", "Robin"],
            ["moon", "Sky"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-label={`Choose ${label}`}
              aria-pressed={avatar === id}
              className={avatar === id ? "selected" : ""}
              onClick={() => setAvatar(id)}
            >
              <Avatar player={{ displayName: label, avatar: id }} />
              <span>{label}</span>
              {avatar === id && <Check size={13} />}
            </button>
          ))}
        </div>
        <label className="field-label">
          Display name
          <input
            required
            minLength={2}
            maxLength={32}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <label className="field-label">
          Profile visibility
          <select
            aria-label="Profile visibility"
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as "public" | "private")
            }
          >
            <option value="public">Public profile & leaderboards</option>
            <option value="private">
              Private profile (hidden from leaderboards)
            </option>
          </select>
        </label>
        <div className="field-label">
          Theme
          <span className="muted" style={{ display: "block", marginTop: 4, fontWeight: "normal" }}>
            Automatically syncs with your device’s light/dark mode preference.
          </span>
        </div>
        <p className="muted">
          Username: @{user.username} · Email: {user.email}
        </p>
        <button disabled={busy} className="btn btn-primary">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
      <section className="panel setup-form">
        <h2>Account</h2>
        <Link className="text-link" to="/forgot-password">
          Reset password
          <ArrowRight size={16} />
        </Link>
        <p className="muted">
          Deleting your account removes your profile, sessions, friendships, and
          personal results. Historical matches retain anonymized identifiers.
        </p>
        <button
          className="btn btn-danger"
          onClick={() => setDeleting(!deleting)}
        >
          Delete account
        </button>
        {deleting && (
          <form onSubmit={remove}>
            <label className="field-label">
              Confirm with your password
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button disabled={busy} className="btn btn-danger modal-submit">
              Permanently delete my account
            </button>
          </form>
        )}
      </section>
    </>
  );
}
interface AdminQuestion {
  _id: string;
  category: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  active: boolean;
}
export function Admin() {
  const { notify } = useApp();
  const client = useQueryClient();
  const [tab, setTab] = useState("questions");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AdminQuestion | null>(null);
  const empty = {
    category: "General Knowledge",
    prompt: "",
    options: ["", "", "", ""],
    answer: 0,
    explanation: "",
    active: true,
  };
  const [draft, setDraft] = useState(empty);
  const stats = useQuery({
    queryKey: ["admin", "stats"],
    queryFn: () => api<Record<string, number>>("/admin/stats"),
  });
  const q = useQuery({
    queryKey: ["admin", "questions"],
    queryFn: () => api<{ questions: AdminQuestion[] }>("/admin/questions"),
  });
  const reports = useQuery({
    queryKey: ["admin", "reports"],
    queryFn: () =>
      api<{
        reports: {
          _id: string;
          targetId: string;
          description: string;
          status: string;
        }[];
      }>("/admin/reports"),
  });
  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () =>
      api<{ users: (Player & { status: string })[] }>("/admin/users"),
  });
  const audit = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: () =>
      api<{
        audit: {
          _id: string;
          action: string;
          targetId: string;
          createdAt: string;
        }[];
      }>("/admin/audit"),
  });
  const run = async (path: string, body: unknown, method = "PATCH") => {
    setBusy(true);
    try {
      await api(path, { method, body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: ["admin"] });
      setEditing(null);
      setDraft(empty);
      notify("Saved.");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading kicker="ADMINISTRATION" title="Keep the games good." />
      <div className="metric-grid">
        {Object.entries(stats.data ?? {}).map(([label, n]) => (
          <div className="metric" key={label}>
            <strong>{n}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="tabs">
        {["questions", "reports", "users", "audit"].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <QueryStatus loading={stats.isLoading} error={stats.error} />
      {tab === "questions" && (
        <>
          <form
            className="panel setup-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                "/admin/questions" + (editing ? "/" + editing._id : ""),
                draft,
                editing ? "PATCH" : "POST",
              );
            }}
          >
            <h2>{editing ? "Edit question" : "Add a question"}</h2>
            <label className="field-label">
              Category
              <input
                required
                maxLength={40}
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
              />
            </label>
            <label className="field-label">
              Question
              <input
                required
                minLength={5}
                maxLength={300}
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
            </label>
            {draft.options.map((o, i) => (
              <label key={i} className="field-label">
                Option {i + 1}
                <input
                  required
                  maxLength={120}
                  value={o}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: draft.options.map((x, j) =>
                        j === i ? e.target.value : x,
                      ),
                    })
                  }
                />
              </label>
            ))}
            <label className="field-label">
              Correct option
              <select
                aria-label="Correct option"
                value={draft.answer}
                onChange={(e) =>
                  setDraft({ ...draft, answer: Number(e.target.value) })
                }
              >
                {[0, 1, 2, 3].map((i) => (
                  <option key={i} value={i}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Explanation
              <input
                value={draft.explanation}
                maxLength={500}
                onChange={(e) =>
                  setDraft({ ...draft, explanation: e.target.value })
                }
              />
            </label>
            <button className="btn btn-primary modal-submit" disabled={busy}>
              Save question
            </button>
            {editing && (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setEditing(null);
                  setDraft(empty);
                }}
              >
                Cancel editing
              </button>
            )}
          </form>
          <section className="panel">
            <QueryStatus loading={q.isLoading} error={q.error} />
            {q.data?.questions.map((x) => (
              <div className="admin-row" key={x._id}>
                <div>
                  <strong>{x.prompt}</strong>
                  <small>
                    {x.category} · {x.active ? "Active" : "Inactive"}
                  </small>
                </div>
                <div className="row-actions">
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setEditing(x);
                      setDraft({ ...x, explanation: x.explanation ?? "" });
                      window.scrollTo(0, 0);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    disabled={busy}
                    className="btn btn-outline"
                    onClick={() =>
                      void run("/admin/questions/" + x._id, {
                        active: !x.active,
                      })
                    }
                  >
                    {x.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
      {tab === "reports" && (
        <section className="panel">
          <QueryStatus loading={reports.isLoading} error={reports.error} />
          {!reports.data?.reports.length && (
            <Empty>No reports to review.</Empty>
          )}
          {reports.data?.reports.map((r) => (
            <div className="admin-row" key={r._id}>
              <div>
                <strong>{r.description}</strong>
                <small>
                  {r.targetId} · {r.status}
                </small>
              </div>
              <button
                disabled={busy}
                className="btn btn-outline"
                onClick={() =>
                  void run("/admin/reports/" + r._id, { status: "resolved" })
                }
              >
                Resolve
              </button>
              <button
                disabled={busy}
                className="btn btn-outline"
                onClick={() =>
                  void run("/admin/reports/" + r._id, { status: "dismissed" })
                }
              >
                Dismiss
              </button>
            </div>
          ))}
        </section>
      )}
      {tab === "users" && (
        <section className="panel">
          <QueryStatus loading={users.isLoading} error={users.error} />
          {users.data?.users.map((u) => (
            <div className="admin-row" key={u.id}>
              <strong>@{u.username}</strong>
              <span>{u.status}</span>
              <button
                disabled={busy}
                className="btn btn-outline"
                onClick={() =>
                  void run("/admin/users/" + u.id, {
                    status: u.status === "active" ? "suspended" : "active",
                  })
                }
              >
                {u.status === "active" ? "Suspend" : "Restore"}
              </button>
            </div>
          ))}
        </section>
      )}
      {tab === "audit" && (
        <section className="panel">
          <QueryStatus loading={audit.isLoading} error={audit.error} />
          {audit.data?.audit.map((a) => (
            <p key={a._id}>
              {new Date(a.createdAt).toLocaleString()} · {a.action} ·{" "}
              {a.targetId}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
