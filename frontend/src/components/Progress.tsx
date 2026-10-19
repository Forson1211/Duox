import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Crown, Users } from "lucide-react";
import { achievements, type Player } from "@duo-clash/shared";
import { api } from "../lib/api";
import { useApp } from "../lib/context";
import { Avatar } from "./Avatar";
interface Stats {
  bestScore: number;
  rank: number | null;
  winRate: number;
}
function useStats() {
  return useQuery({
    queryKey: ["stats"],
    queryFn: () => api<Stats>("/users/me/stats"),
  });
}
export function PlayerStanding() {
  const stats = useStats();
  if (!stats.data) return null;
  return (
    <p className="player-standing">
      <span>{stats.data.winRate}% win rate</span>
      <span>
        {stats.data.rank
          ? "#" + stats.data.rank + " overall"
          : "Private profile"}
      </span>
      <span>Best match: {stats.data.bestScore} pts</span>
    </p>
  );
}
export function PersonalBest() {
  const stats = useStats();
  return stats.data ? (
    <p className="personal-best">
      <Crown size={16} />
      Your personal best:{" "}
      <strong>{stats.data.bestScore.toLocaleString()} pts</strong>
    </p>
  ) : null;
}
export function HomeCommunity() {
  const { user } = useApp();
  const ranking = useQuery({
    queryKey: ["leaders", "preview"],
    queryFn: () =>
      api<{ leaders: (Player & { rank: number })[] }>("/leaderboards/global"),
  });
  const friends = useQuery({
    queryKey: ["friends"],
    queryFn: () =>
      api<{
        friends: {
          id: string;
          status: string;
          online: boolean;
          user: Player;
        }[];
      }>("/friends"),
    refetchInterval: 10000,
  });
  const online =
    friends.data?.friends.filter(
      (friend) => friend.status === "accepted" && friend.online,
    ) ?? [];
  const earned = achievements
    .filter((achievement) => user.achievements.includes(achievement.id))
    .slice(-2);
  return (
    <div className="community-grid">
      <section className="panel community-panel">
        <div className="section-heading">
          <h2>A little friendly competition</h2>
          <Link className="text-link" to="/app/leaderboard">
            View all
          </Link>
        </div>
        {ranking.isLoading ? (
          <p className="muted" role="status">
            Loading rankings…
          </p>
        ) : ranking.error ? (
          <p className="muted">Rankings are unavailable. Try again shortly.</p>
        ) : ranking.data?.leaders.length ? (
          ranking.data.leaders.slice(0, 3).map((player) => (
            <Link
              className="community-player"
              to={"/app/players/" + player.username}
              key={player.id}
            >
              <span className="community-rank">{player.rank}</span>
              <Avatar player={player} />
              <strong>{player.displayName}</strong>
              <span>{player.points.toLocaleString()} pts</span>
            </Link>
          ))
        ) : (
          <p className="muted">Finish your first match to make your mark.</p>
        )}
      </section>
      <section className="panel community-panel">
        <div className="section-heading">
          <h2>Your people</h2>
          <Link className="text-link" to="/app/friends">
            Find friends
          </Link>
        </div>
        {friends.isLoading ? (
          <p className="muted">Finding your people…</p>
        ) : friends.error ? (
          <p className="muted">Friends are unavailable. Try again shortly.</p>
        ) : online.length ? (
          online.slice(0, 3).map((friend) => (
            <Link
              className="community-player"
              to={"/app/players/" + friend.user.username}
              key={friend.id}
            >
              <Avatar player={friend.user} />
              <strong>{friend.user.displayName}</strong>
              <span className="presence-label">Online</span>
            </Link>
          ))
        ) : (
          <p className="community-empty">
            <Users size={21} />
            Invite a friend to start a little rivalry.
          </p>
        )}
        {!!earned.length && (
          <div className="recent-badges">
            <small>RECENT ACHIEVEMENTS</small>
            {earned.map((achievement) => (
              <Link to="/app/achievements" key={achievement.id}>
                <Crown size={15} />
                {achievement.title}
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
