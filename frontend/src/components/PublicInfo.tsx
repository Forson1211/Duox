import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
const sections = {
  privacy: {
    title: "Your privacy",
    lead: "Your people, your games, your choice.",
    items: [
      [
        "Your account",
        "Your email is used to identify your account and deliver recovery emails when available. It is never shown on public profiles. Passwords are stored as secure hashes.",
      ],
      [
        "What other players see",
        "Your display name, username, avatar, points, rating, and achievements appear on your public profile. Set your profile to private in Settings to hide it from public profiles and rankings.",
      ],
      [
        "Room chat",
        "Messages are shared with people in your room and restored when you reconnect. The room keeps its recent conversation until it expires. Your name and avatar can be found in Friends so people can send you requests; private profile statistics stay hidden.",
      ],
      [
        "Your game history",
        "Completed matches and rewards are saved so your progress survives signing out. Temporary room state expires. Session cookies keep you signed in.",
      ],
      [
        "Deleting your account",
        "Use Delete account in Settings. This removes your profile, sessions, friendships, and personal result records. Shared match records can retain anonymous participant identifiers.",
      ],
    ],
  },
  terms: {
    title: "Play fairly. Have fun.",
    lead: "A little competition works best with a little kindness.",
    items: [
      [
        "Keep it friendly",
        "Respect the people you play with. Do not use abusive names, impersonate another player, or harass anyone.",
      ],
      [
        "Keep it fair",
        "Answers, deadlines, scores, and rewards are checked by the server. Do not automate submissions or try to alter another player’s game.",
      ],
      [
        "Points are for play",
        "Points, achievements, and ratings are virtual game progress. They have no cash value. Ranked rating changes apply to supported head-to-head matches.",
      ],
      [
        "Report a problem",
        "You can block or report another player from their profile. Reports may lead to an account being suspended by the game operator.",
      ],
    ],
  },
  contact: {
    title: "Help & contact",
    lead: "A few useful ways to get back to the good part.",
    items: [
      [
        "Joining your people",
        "Ask your host for the DUO- invite code, or open their invitation link after signing in. A full room or a match already in progress cannot accept new players.",
      ],
      [
        "Lost connection?",
        "Keep your game page open while it reconnects. Reloading restores your current room and accepted answers. Your timer continues while you are disconnected.",
      ],
      [
        "Account access",
        "Use Forgot password on the login page. Recovery emails need to be enabled by the game operator. If email recovery is unavailable, contact the operator who manages your game.",
      ],
      [
        "Player conduct",
        "Open a player’s profile to report abuse, cheating, or impersonation. Blocking also removes the friendship and prevents new room joins between you.",
      ],
    ],
  },
  accessibility: {
    title: "Made for more ways to play",
    lead: "Use a keyboard, a touchscreen, or the controls that work for you.",
    items: [
      [
        "Keyboard controls",
        "Use Tab to move through controls and Enter to activate them. Quiz and Number Circuit use number keys 1–4. Memory Rush uses 1–4 for tiles. Type answers for Word Blitz and Code Breaker. Reflex Race supports Space.",
      ],
      [
        "Your preferences",
        "Light and dark themes automatically follow your device’s appearance. Animations respect the reduced-motion preference. Audio cues can be muted in every game.",
      ],
      [
        "Clear feedback",
        "Readiness, submitted answers, results, and connection state have text labels. Color is supported by labels and symbols rather than being the only cue.",
      ],
      [
        "Take your time",
        "Room hosts can choose longer supported answer windows. Code Breaker gives at least 30 seconds. Reaction rounds remain timed and include network latency.",
      ],
    ],
  },
};
export function PublicInfo({
  page,
  dark,
}: {
  page: keyof typeof sections;
  dark: boolean;
}) {
  const content = sections[page];
  return (
    <main className={`app info-page ${dark ? "theme-dark" : ""}`}>
      <div className="info-wrap">
        <Link className="text-link" to="/">
          <ArrowLeft size={17} />
          Back to DUOX
        </Link>
        <header>
          <span className="section-kicker">GOOD GAMES. GOOD COMPANY.</span>
          <h1>{content.title}</h1>
          <p>{content.lead}</p>
        </header>
        <article className="panel info-content">
          {content.items.map(([title, body]) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </article>
        <nav aria-label="Help links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Fair play</Link>
          <Link to="/contact">Help & contact</Link>
          <Link to="/accessibility">Accessibility</Link>
        </nav>
      </div>
    </main>
  );
}
