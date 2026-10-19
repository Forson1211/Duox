import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Crown, Search, Trophy, X } from "lucide-react";
import type { Player } from "@duo-clash/shared";
import { Avatar } from "./Avatar";
import { api } from "../lib/api";
import { useApp } from "../lib/context";
type Leader = Player & { rank: number; periodPoints: number };
interface Rankings {
  leaders: Leader[];
  total: number;
  currentPlayer: Leader | null;
}
export function Leaderboard() {
  const { user } = useApp();
  const [scope, setScope] = useState("weekly");
  const [page, setPage] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const rankings = useQuery({
    queryKey: ["leaders", scope, page, query],
    queryFn: () =>
      api<Rankings>(
        `/leaderboards/${scope}?page=${page}&q=${encodeURIComponent(query)}`,
      ),
  });
  const leaders = rankings.data?.leaders ?? [];
  const podium = page === 1 && !query ? leaders.filter((p) => p.rank <= 3) : [];
  const rows = leaders;
  const current = rankings.data?.currentPlayer;
  return (
    <div className="leaderboard-view">
      <div className="board-title">
        <Link className="icon-btn" to="/app" aria-label="Back to home">
          <ArrowLeft size={21} />
        </Link>
        <h1>Leaderboard</h1>
        <button
          className="icon-btn"
          aria-label="Search players"
          aria-expanded={searchOpen}
          onClick={() => {
            setSearchOpen(!searchOpen);
            if (searchOpen) setSearch("");
          }}
        >
          {searchOpen ? <X size={20} /> : <Search size={20} />}
        </button>
      </div>
      <div className="board-tabs" role="group" aria-label="Leaderboard period">
        {[
          ["weekly", "Weekly"],
          ["global", "All time"],
          ["friends", "Friends"],
          ["seasonal", "Season"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={scope === id}
            className={scope === id ? "active" : ""}
            onClick={() => {
              setScope(id);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {searchOpen && (
        <label className="search-field board-search">
          <Search size={18} />
          <input
            autoFocus
            type="search"
            aria-label="Find a player"
            placeholder="Find your people"
            value={search}
            maxLength={32}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      {rankings.isLoading ? (
        <div className="podium-skeleton" role="status">
          <div />
          <div />
          <div />
          <span>Finding the front-runners…</span>
        </div>
      ) : rankings.error ? (
        <div className="error-box" role="alert">
          {rankings.error.message}
          <button className="text-link" onClick={() => void rankings.refetch()}>
            Try again
          </button>
        </div>
      ) : !leaders.length ? (
        <section className="board-empty">
          <div>
            <Trophy size={45} />
          </div>
          <h2>
            {query
              ? "No players found"
              : scope === "friends"
                ? "A little friendly competition?"
                : "Your crown is waiting."}
          </h2>
          <p>
            {query
              ? "Try another name or username."
              : scope === "friends"
                ? "Add your people, play a match, and see who comes out on top."
                : "Play a challenge and be the first to make your mark."}
          </p>
          <Link
            className="btn btn-primary"
            to={scope === "friends" ? "/app/friends" : "/app/rooms/create"}
          >
            {scope === "friends" ? "Find your people" : "Let’s play"}
            <ArrowRight size={17} />
          </Link>
        </section>
      ) : (
        <>
          {!!podium.length && (
            <section className="podium" aria-label="Top three challengers">
              {podium.map((p) => (
                <Link
                  to={"/app/players/" + p.username}
                  className={`podium-player place-${p.rank}`}
                  key={p.id}
                >
                  {p.rank === 1 && (
                    <Crown
                      className="podium-crown"
                      size={33}
                      fill="currentColor"
                    />
                  )}
                  <span className="podium-avatar">
                    <Avatar player={p} large />
                    <span className="podium-medal">{p.rank}</span>
                  </span>
                  <strong>{p.displayName}</strong>
                  <span className="podium-points">
                    <Trophy size={12} />
                    {p.periodPoints.toLocaleString()}
                    <small> pts</small>
                  </span>
                  <span className="podium-pillar">
                    <span>
                      {p.rank === 1 ? "1st" : p.rank === 2 ? "2nd" : "3rd"}
                    </span>
                  </span>
                </Link>
              ))}
            </section>
          )}
          <section className="standings-sheet">
            <div className="standings-heading">
              <h2>{query ? "Search results" : "The challengers"}</h2>
              <span>{rankings.data?.total} players</span>
            </div>
            <div className="ranking-labels">
              <span>Rank</span>
              <span>Player</span>
              <span>Points</span>
            </div>
            <div className="ranking-list">
              {rows.map((p) => (
                <Link
                  className={`ranking-row ${p.id === user.id ? "you" : ""}`}
                  to={"/app/players/" + p.username}
                  key={p.id}
                >
                  <span className="rank-number">{p.rank}</span>
                  <Avatar player={p} />
                  <div>
                    <strong>
                      {p.displayName}
                      {p.id === user.id ? " (you)" : ""}
                    </strong>
                    <small>@{p.username}</small>
                  </div>
                  <strong>
                    {p.periodPoints.toLocaleString()}
                    <small> pts</small>
                  </strong>
                </Link>
              ))}
              {!rows.length && (
                <p className="board-footnote">
                  A few good rivals make the game even better.
                  <br />
                  <Link to="/app/friends">
                    Invite your people <ArrowRight size={13} />
                  </Link>
                </p>
              )}
            </div>
            {(page > 1 || (rankings.data?.total ?? 0) > 20) && (
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
                  disabled={page * 20 >= (rankings.data?.total ?? 0)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </section>
        </>
      )}
      {current && (
        <Link className="your-standing" to="/app/profile">
          <span className="rank-number">{current.rank}</span>
          <Avatar player={current} />
          <div>
            <strong>
              {user.displayName}
              <span>You</span>
            </strong>
            <small>Your spot in this leaderboard</small>
          </div>
          <strong>
            {current.periodPoints.toLocaleString()}
            <small> pts</small>
          </strong>
        </Link>
      )}
      <p className="board-period-note">
        {scope === "weekly"
          ? "A fresh start every Monday, 00:00 UTC."
          : scope === "seasonal"
            ? "A new season every calendar quarter."
            : scope === "friends"
              ? "Good friends. Great rivals."
              : "Every challenge adds to your story."}
      </p>
    </div>
  );
}
