import { Link } from "react-router-dom";
import { useState } from "react";
import { Logo } from "./components/Logo";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Crown,
  Gamepad2,
  Heart,
  Menu,
  Moon,
  Plus,
  Sparkles,
  Swords,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { type Player } from "@duo-clash/shared";
import { api } from "./lib/api";
import { Avatar } from "./components/Avatar";
import { GameArt } from "./components/GameArt";
import { GameCards } from "./components/GameCards";
export default function Landing({
  dark,
  action,
}: {
  dark?: boolean;
  action: (
    kind: "create" | "join" | "login" | "register",
    game?: number,
  ) => void;
}) {
  const [menu, setMenu] = useState(false);
  const leaders = useQuery({
    queryKey: ["leaders", "weekly"],
    queryFn: () =>
      api<{ leaders: (Player & { rank: number; periodPoints: number })[] }>(
        "/leaderboards/weekly",
      ),
  });
  return (
    <div className={`app welcome-page ${dark ? "theme-dark" : ""}`}>
      <header className="welcome-header">
        <a className="brand" href="#home" aria-label="DUO CLASH">
          <Logo height={36} />
        </a>
        <nav className={menu ? "welcome-nav open" : "welcome-nav"}>
          <a href="#games" onClick={() => setMenu(false)}>
            The games
          </a>
          <a href="#how" onClick={() => setMenu(false)}>
            How it works
          </a>
          <a href="#leaderboard" onClick={() => setMenu(false)}>
            Leaderboard
          </a>
        </nav>
        <div className="welcome-actions">
          <button
            className="btn btn-outline welcome-login-btn"
            onClick={() => action("login")}
          >
            Log in
          </button>
          <button
            className="btn btn-primary welcome-play-btn"
            onClick={() => action("register")}
          >
            Let’s play
            <ArrowUpRight size={17} />
          </button>
          <button
            className="icon-btn welcome-menu"
            aria-label="Toggle menu"
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>
      <main id="home" className="welcome-main">
        <section className="welcome-hero">
          <div className="welcome-copy">
            <span className="welcome-tag">
              <Heart size={14} />
              Good company. A little competition.
            </span>
            <h1>
              Your people.
              <br />
              Your games.
              <br />
              <span>Your crown.</span>
            </h1>
            <p>
              Make a little time for a lot of fun. Challenge your favourite
              people to quick games, big laughs, and one more rematch.
            </p>
            <div className="welcome-cta">
              <button
                className="btn btn-primary btn-large"
                onClick={() => action("create")}
              >
                Create a challenge
                <ArrowUpRight size={19} />
              </button>
              <button
                className="btn btn-outline btn-large"
                onClick={() => action("join")}
              >
                <Users size={18} />
                Join with code
              </button>
            </div>
            <div className="welcome-promise">
              <span>
                <Check size={14} />
                1–8 players
              </span>
              <span>
                <Check size={14} />
                Your own devices
              </span>
              <span>
                <Check size={14} />
                Just good fun
              </span>
            </div>
          </div>
          <div className="welcome-art">
            <span className="art-orbit" />
            <GameArt game="hero" />
            <div className="art-caption">
              <span>
                <Swords size={18} />
              </span>
              <div>
                <strong>A good rivalry starts here.</strong>
                <small>Couples. Friends. Family. You.</small>
              </div>
            </div>
            <span className="welcome-star star-one">✦</span>
            <span className="welcome-star star-two">✦</span>
          </div>
        </section>
        <section id="games" className="welcome-games">
          <div className="section-heading">
            <div>
              <span className="section-kicker">Find your kind of fun</span>
              <h2>
                Little games. Big moments<span className="heading-dot">.</span>
              </h2>
            </div>
            <button className="text-link" onClick={() => action("create")}>
              Pick a game
              <ArrowRight size={16} />
            </button>
          </div>
          <GameCards onPlay={(index) => action("create", index)} />
        </section>
        <section id="how" className="how-section">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                Less planning. More playing.
              </span>
              <h2>Good times are three steps away.</h2>
            </div>
            <span className="little-crown">
              <Crown size={31} />
            </span>
          </div>
          <div className="how-grid">
            {[
              [
                Plus,
                "Make a room",
                "Choose your games and how you want to play.",
              ],
              [
                Users,
                "Bring your people",
                "Share a code. Join from wherever you are.",
              ],
              [
                Trophy,
                "Play for the crown",
                "Ready up, have fun, and settle it with a rematch.",
              ],
            ].map(([Icon, title, copy], i) => {
              const I = Icon as typeof Plus;
              return (
                <article key={String(title)}>
                  <span className="how-icon">
                    <I size={24} />
                  </span>
                  <span className="how-number">0{i + 1}</span>
                  <h3>{String(title)}</h3>
                  <p>{String(copy)}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="welcome-lower" id="leaderboard">
          <div className="panel welcome-leaders">
            <div className="section-heading">
              <div>
                <span className="section-kicker">
                  A little well-earned glory
                </span>
                <h2>This week’s challengers</h2>
              </div>
              <Trophy size={25} />
            </div>
            {leaders.isLoading ? (
              <p className="muted" role="status">
                Loading challengers…
              </p>
            ) : leaders.error ? (
              <p className="muted">
                Rankings are taking a little break. Try again shortly.
              </p>
            ) : !leaders.data?.leaders.length ? (
              <div className="empty-state">
                <Crown size={35} />
                <h3>The first crown could be yours.</h3>
                <p>Play a challenge to make your mark.</p>
                <button className="text-link" onClick={() => action("create")}>
                  Start playing
                  <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              leaders.data.leaders.slice(0, 3).map((p) => (
                <div className="welcome-leader" key={p.id}>
                  <span>{p.rank === 1 ? <Crown size={21} /> : p.rank}</span>
                  <Avatar player={p} />
                  <strong>{p.displayName}</strong>
                  <b>
                    {p.periodPoints.toLocaleString()}
                    <small> pts</small>
                  </b>
                </div>
              ))
            )}
          </div>
          <div className="welcome-invite">
            <span className="invite-heart">
              <Heart size={30} />
            </span>
            <h2>
              Less scrolling.
              <br />
              More “one more game.”
            </h2>
            <p>Your favourite people are just an invite away.</p>
            <button
              className="btn btn-white btn-large"
              onClick={() => action("create")}
            >
              Let’s make a memory
              <ArrowUpRight size={18} />
            </button>
          </div>
        </section>
        <footer className="welcome-footer">
          <a className="brand" href="#home" aria-label="DUO CLASH">
            <Logo height={28} />
          </a>
          <span>Challenge your people. Claim your crown.</span>
          <nav className="welcome-footer-links" aria-label="Useful links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Fair play</Link>
            <Link to="/contact">Help & contact</Link>
            <Link to="/accessibility">Accessibility</Link>
          </nav>
          <small>© 2026 DUO CLASH</small>
        </footer>
      </main>
    </div>
  );
}
