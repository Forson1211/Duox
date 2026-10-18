import type { GameId } from "@duo-clash/shared";
const files: Record<GameId, string> = {
  "quick-quiz": "quiz",
  "memory-rush": "memory",
  "word-blitz": "word",
  "reflex-race": "reflex",
};
export function GameArt({
  game,
  className = "",
}: {
  game: GameId | "hero";
  className?: string;
}) {
  return (
    <img
      className={`game-art ${className}`}
      src={`/art/${game === "hero" ? "hero" : files[game]}.png`}
      width={512}
      height={512}
      alt=""
      aria-hidden="true"
      loading={game === "hero" ? "eager" : "lazy"}
      draggable={false}
    />
  );
}
