import { ArrowUpRight, Clock3, Users, SearchX } from "lucide-react";
import { Link } from "react-router-dom";
import { games } from "@duo-clash/shared";
import { GameArt } from "./GameArt";
export function GameCards({
  search = "",
  onPlay,
}: {
  search?: string;
  onPlay?: (index: number) => void;
}) {
  const filtered = games
    .map((game, index) => ({ ...game, index }))
    .filter((g) =>
      `${g.title} ${g.category} ${g.description}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );
  if (!filtered.length)
    return (
      <div className="empty-state">
        <SearchX size={32} />
        <h3>No games found</h3>
        <p>Try “quiz”, “memory”, “word”, or “reflex”.</p>
      </div>
    );
  return (
    <div className="game-grid">
      {filtered.map((game) => (
        <article className={`game-card game-${game.tone}`} key={game.id}>
          <div className="game-cover">
            <span className="cover-tag">
              <Clock3 size={12} />
              {game.id === "reflex-race" ? "~10 sec" : "15 sec"} / round
            </span>
            <GameArt game={game.id} />
          </div>
          <div className="game-card-copy">
            <span className="game-category">{game.category}</span>
            <h3>{game.title}</h3>
            <p>{game.description}</p>
            <div className="game-card-bottom">
              <span>
                <Users size={14} />
                1–8 players
              </span>
              {onPlay ? (
                <button
                  className="game-play"
                  aria-label={`Play ${game.title}`}
                  onClick={() => onPlay(game.index)}
                >
                  <ArrowUpRight size={19} />
                </button>
              ) : (
                <Link
                  className="game-play"
                  aria-label={`Play ${game.title}`}
                  to={`/app/rooms/create?game=${game.index}`}
                >
                  <ArrowUpRight size={19} />
                </Link>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
