import { RoomControls } from "./RoomControls";
import { PersonalBest } from "./Progress";
import { GameArt } from "./GameArt";
import { Avatar } from "./Avatar";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Copy,
  Crown,
  Delete,
  Home,
  Plus,
  RotateCcw,
  Share2,
  Shuffle,
  Swords,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import {
  playMemoryTile,
  playTileTap,
  playCorrect,
  playIncorrect,
  playGo,
  playClick,
  playLetterPlace,
  playLetterRemove,
  isSoundEnabled,
  setSoundEnabled,
} from "../lib/sound";
import {
  games,
  type RoomState,
  type Challenge,
  type Answer,
} from "@duo-clash/shared";
import { command, useApp } from "../lib/context";
import { Heading } from "./Pages";
export function RoomPage() {
  const { code } = useParams();
  const { room, socket, connected, setRoom, user, notify } = useApp();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const offset = useRef(0);
  const leaving = useRef(false);
  useEffect(() => {
    if (room) offset.current = room.serverNow - Date.now();
  }, [room?.serverNow]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset.current), 50);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (room?.status === "round-results") {
      const myScore = room.results
        .at(-1)
        ?.scores.find((s) => s.userId === user.id);
      if (myScore?.correct) {
        playCorrect();
      } else if (myScore) {
        playIncorrect();
      }
    }
  }, [room?.status, room?.round, user.id]);
  useEffect(() => {
    if (
      leaving.current ||
      !connected ||
      !socket ||
      !code ||
      room?.code === code
    )
      return;
    let active = true;
    void command<RoomState>(socket, "room:join", { code })
      .then((r) => {
        if (active) setRoom(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [connected, socket, code, room?.code]);
  const run = async (
    event: "room:ready" | "room:leave" | "match:start" | "match:rematch",
    payload: unknown = {},
  ) => {
    if (event === "room:leave") leaving.current = true;
    setBusy(true);
    setError("");
    try {
      await command(socket, event, payload);
      if (event === "room:leave") {
        setRoom(null);
        navigate("/app");
      }
    } catch (e) {
      if (event === "room:leave") leaving.current = false;
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!room || room.code !== code)
    return (
      <>
        <Heading kicker="PRIVATE CHALLENGE" title="Joining your people…" />
        {error ? (
          <div className="panel">
            <p className="error-box" role="alert">
              {error}
            </p>
            <Link className="btn btn-primary" to="/app/rooms/join">
              Try another code
            </Link>
          </div>
        ) : (
          <p role="status">
            {connected ? "Joining the room…" : "Connecting to the game server…"}
          </p>
        )}
      </>
    );
  const host = room.hostId === user.id;
  const me = room.players.find((p) => p.id === user.id);
  const countdown = Math.max(0, Math.ceil(((room.nextAt ?? now) - now) / 1000));
  const copy = async (link = false) => {
    try {
      const text = link
        ? `${window.location.origin}/app/rooms/join?code=${room.code}`
        : room.code;
      await navigator.clipboard.writeText(text);
      notify(link ? "Invite link copied." : "Room code copied.");
    } catch {
      notify("Copy this room code: " + room.code);
    }
  };
  return (
    <>
      <Heading
        kicker={
          room.settings.ranked
            ? "RANKED HEAD-TO-HEAD"
            : "YOUR PRIVATE PLAYGROUND"
        }
        title={room.settings.name}
      >
        <span className="room-code">
          <Users size={16} />
          {room.code}
          <button aria-label="Copy room code" onClick={() => void copy()}>
            <Copy size={15} />
          </button>
        </span>
      </Heading>
      {!connected && (
        <p className="notice" role="status">
          Connection lost. Reconnecting automatically. The server clock
          continues unless the match is paused.
        </p>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {(room.status === "playing" || room.status === "paused") && (
        <div className="live-score-strip" aria-label="Live scores">
          {[...room.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <div key={p.id} className={p.id === user.id ? "is-you" : ""}>
                <Avatar player={p} />
                <span>{p.id === user.id ? "You" : p.displayName}</span>
                <strong>{p.score}</strong>
              </div>
            ))}
        </div>
      )}
      <RoomControls room={room} onLeave={() => run("room:leave")} />
      <div
        className={`room-layout ${room.status === "playing" ? "round-in-progress" : ""}`}
      >
        <div className="room-main">
          {room.status === "cancelled" && (
            <section className="panel">
              <h2>This match has ended.</h2>
              <p className="muted">
                {room.cancelReason ?? "This room has expired."} Start a fresh
                match or return home. Saved results stay in your history.
              </p>
              <button
                className="btn btn-primary"
                disabled={busy || !connected}
                onClick={() => void run("room:leave")}
              >
                Return home
              </button>
            </section>
          )}
          {room.status === "waiting" && (
            <section className="panel lobby">
              <div className="lobby-symbol">
                <GameArt game="hero" />
              </div>
              <span className="section-kicker">GATHER YOUR PEOPLE</span>
              <h2>Good company. Great competition.</h2>
              <p className="muted">
                Share the code or invite link. Mark yourself ready when you’re
                set.
              </p>
              <div className="invite-code">
                {room.code}
                <button
                  className="icon-btn"
                  aria-label="Copy invite code"
                  onClick={() => void copy()}
                >
                  <Copy size={18} />
                </button>
              </div>
              <div className="lobby-buttons">
                <button
                  className="btn btn-outline"
                  onClick={() => void copy(true)}
                >
                  <Share2 size={16} />
                  Copy invite link
                </button>
                <button
                  disabled={busy || !connected}
                  className={me?.ready ? "btn btn-outline" : "btn btn-primary"}
                  onClick={() => void run("room:ready", { ready: !me?.ready })}
                >
                  {me?.ready ? (
                    <>
                      <Check size={16} />
                      Ready! (undo)
                    </>
                  ) : (
                    "I’m ready"
                  )}
                </button>
              </div>
              <div className="lobby-settings">
                <span>
                  {room.settings.rounds} round
                  {room.settings.rounds === 1 ? "" : "s"}
                </span>
                <span>{room.settings.duration}s answer time</span>
                <span>
                  {room.players.length}/{room.settings.maxPlayers} players
                </span>
              </div>
              <div className="badge-list">
                {room.settings.gameIds.map((id) => (
                  <span key={id}>{games.find((g) => g.id === id)?.title}</span>
                ))}
              </div>
              {host ? (
                <button
                  className="btn btn-primary btn-large"
                  disabled={
                    busy ||
                    !connected ||
                    room.players.some((p) => !p.ready || !p.connected) ||
                    (room.settings.ranked && room.players.length !== 2)
                  }
                  onClick={() => void run("match:start")}
                >
                  Start match
                  <ArrowRight size={17} />
                </button>
              ) : (
                <p className="muted">
                  The host will start when everyone is ready.
                </p>
              )}
              <p className="muted">
                {room.settings.maxPlayers === 1
                  ? "Solo practice earns points without affecting your competitive rating."
                  : "Players must join before the match starts."}
              </p>
            </section>
          )}
          {room.status === "starting" && (
            <section className="panel countdown-panel">
              <Swords size={44} />
              <h2>Get ready to clash.</h2>
              <strong>{countdown || "GO"}</strong>
              <p>Your first challenge is on its way.</p>
            </section>
          )}
          {(room.status === "playing" ||
            (room.status === "paused" && room.pause?.phase === "playing")) &&
            room.challenge && (
              <div hidden={room.status === "paused"}>
                <GameRound
                  key={room.challenge.id}
                  challenge={room.challenge}
                  now={room.pause?.at ?? now}
                  room={room}
                />
              </div>
            )}
          {room.status === "round-results" && (
            <section className="panel round-summary">
              <span className="section-kicker">
                ROUND {room.round} OF {room.settings.rounds}
              </span>
              <h2>That’s a wrap.</h2>
              <p className="answer-reveal">{room.results.at(-1)?.answer}</p>
              {room.results.at(-1)?.scores.map((s) => (
                <div className="round-score" key={s.userId}>
                  <span>
                    {room.players.find((p) => p.id === s.userId)?.displayName}
                  </span>
                  <small>{s.detail}</small>
                  <strong>+{s.points}</strong>
                </div>
              ))}
              <p className="muted">
                {room.round === room.settings.rounds
                  ? "Final results"
                  : "Next round"}{" "}
                in {countdown}…
              </p>
            </section>
          )}
          {room.status === "completed" && <PersonalBest />}
          {room.status === "completed" && (
            <section className="panel match-results">
              <div className="result-trophy">
                <Trophy size={43} />
              </div>
              <span className="section-kicker">CHALLENGE COMPLETE</span>
              <h2>
                {room.players.length === 1
                  ? "Nice practice!"
                  : room.winnerIds.length > 1
                    ? "An even match!"
                    : room.winnerIds.includes(user.id)
                      ? "The crown is yours."
                      : `${room.players.find((p) => room.winnerIds.includes(p.id))?.displayName} takes the crown.`}
              </h2>
              <p className="muted">
                {room.persisted
                  ? "Scores saved. Your profile and leaderboards are updated."
                  : "Saving your results…"}
              </p>
              {[...room.players]
                .sort((a, b) => b.score - a.score)
                .map((p, i) => (
                  <div className="final-score" key={p.id}>
                    <span>{i === 0 ? <Crown size={22} /> : i + 1}</span>
                    <div>
                      <strong>
                        {p.displayName}
                        {p.id === user.id ? " (you)" : ""}
                      </strong>
                      <small>
                        {(room.ratingChanges[p.id] ?? 0) > 0 ? "+" : ""}
                        {room.ratingChanges[p.id] ?? 0} rating
                      </small>
                    </div>
                    <strong>
                      {p.score}
                      <small> pts</small>
                    </strong>
                  </div>
                ))}
              <div className="lobby-buttons">
                {host ? (
                  <button
                    className="btn btn-primary"
                    disabled={busy || !connected || !room.persisted}
                    onClick={() => void run("match:rematch")}
                  >
                    <RotateCcw size={16} />
                    Rematch
                  </button>
                ) : (
                  <p className="muted">The host can set up a rematch.</p>
                )}
                <button
                  className="btn btn-outline"
                  disabled={busy || !connected}
                  onClick={() => void run("room:leave")}
                >
                  <Home size={16} />
                  Return home
                </button>
              </div>
              <details className="round-details">
                <summary>Round-by-round recap</summary>
                {room.results.map((r) => (
                  <div key={r.round}>
                    <strong>
                      Round {r.round} ·{" "}
                      {games.find((g) => g.id === r.gameId)?.title}
                    </strong>
                    <p>{r.answer}</p>
                    {r.scores.map((s) => (
                      <small key={s.userId}>
                        {
                          room.players.find((p) => p.id === s.userId)
                            ?.displayName
                        }
                        : {s.points} points · {s.detail}
                        <br />
                      </small>
                    ))}
                  </div>
                ))}
              </details>
            </section>
          )}
        </div>
        <aside className="room-scoreboard">
          <section className="panel">
            <div className="panel-title">
              <h2>
                {room.status === "waiting" ? "The crew" : "Live standings"}
              </h2>
              <span className="muted">{room.players.length} players</span>
            </div>
            {[...room.players]
              .sort((a, b) => b.score - a.score)
              .map((p) => (
                <div className="room-player" key={p.id}>
                  <Avatar player={p} />
                  <div>
                    <strong>
                      {p.displayName}
                      {p.id === user.id ? " (you)" : ""}
                      {p.id === room.hostId && <Crown size={12} />}
                    </strong>
                    <small>
                      {!p.connected
                        ? "Reconnecting…"
                        : room.status === "waiting"
                          ? p.ready
                            ? "Ready"
                            : "Not ready"
                          : room.submitted.includes(p.id)
                            ? "Submitted"
                            : room.status === "paused"
                              ? "Paused"
                              : room.status === "completed"
                                ? "Finished"
                                : room.status === "cancelled"
                                  ? "Match ended"
                                  : "Answering"}
                    </small>
                  </div>
                  <span
                    className={
                      room.status === "waiting" && p.ready
                        ? "ready-check"
                        : "player-live-score"
                    }
                  >
                    {room.status === "waiting" ? (
                      p.ready ? (
                        <Check size={18} />
                      ) : null
                    ) : (
                      p.score
                    )}
                  </span>
                </div>
              ))}
            {room.status === "waiting" &&
              Array.from(
                {
                  length: Math.min(
                    room.settings.maxPlayers - room.players.length,
                    3,
                  ),
                },
                (_, i) => (
                  <div className="open-slot" key={i}>
                    <Plus size={16} />
                    Waiting for a player…
                  </div>
                ),
              )}
          </section>
          {room.status === "waiting" && (
            <button
              disabled={busy || !connected}
              className="btn btn-outline leave-button"
              onClick={() => void run("room:leave")}
            >
              Leave room
            </button>
          )}
          <p className="fair-play">
            <ShieldIcon />
            Good games. Fair scores. One more rematch?
          </p>
        </aside>
      </div>
    </>
  );
}
function ShieldIcon() {
  return <Check size={16} />;
}
function ignoreGameKey(event: KeyboardEvent) {
  return (
    event.target instanceof HTMLElement &&
    !!event.target.closest(
      "input, textarea, select, button, [role=dialog], [contenteditable=true]",
    )
  );
}
export function GameRound({
  challenge: c,
  now,
  room,
}: {
  challenge: Challenge;
  now: number;
  room: RoomState;
}) {
  const { socket, user, connected } = useApp();
  const [word, setWord] = useState("");
  const [sequence, setSequence] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);
  const [falseStart, setFalseStart] = useState(false);
  const [reactionMs, setReactionMs] = useState<number | null>(null);
  const [playerTappedTile, setPlayerTappedTile] = useState<number | null>(null);
  const [rackLetters, setRackLetters] = useState<
    { char: string; origIndex: number }[]
  >([]);
  const [usedIndices, setUsedIndices] = useState<number[]>([]);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  useEffect(() => {
    if (c.gameId === "word-blitz" && c.letters) {
      setRackLetters(
        c.letters.split("").map((char, origIndex) => ({ char, origIndex })),
      );
      setWord("");
      setUsedIndices([]);
    }
  }, [c.id, c.gameId, c.letters]);

  const submitted = sent || room.submitted.includes(user.id);
  const remaining = Math.max(0, Math.ceil((c.deadline - now) / 1000));

  // Memory rush timing: blink off for last 200ms of every 650ms step to clearly show repeated tiles
  const viewing =
    room.status === "playing" &&
    c.gameId === "memory-rush" &&
    now < (c.showUntil ?? 0);
  const stepDuration = 650;
  const elapsedSinceStart = Math.max(0, now - c.startedAt);
  const activeStep = viewing
    ? Math.floor(elapsedSinceStart / stepDuration)
    : -1;
  const elapsedInStep = elapsedSinceStart % stepDuration;
  const isStepLit = viewing && elapsedInStep < 450;
  const activeTile = isStepLit ? c.sequence?.[activeStep] : undefined;

  // Sound cue on memory step
  const lastPlayedStep = useRef(-1);
  useEffect(() => {
    if (
      viewing &&
      isStepLit &&
      activeStep !== lastPlayedStep.current &&
      activeTile !== undefined
    ) {
      lastPlayedStep.current = activeStep;
      playMemoryTile(activeTile);
    }
  }, [viewing, isStepLit, activeStep, activeTile]);

  // Reflex race timing
  const go = c.signalAt !== undefined && now >= c.signalAt;
  const goPlayed = useRef(false);
  useEffect(() => {
    if (c.gameId === "reflex-race" && go && !goPlayed.current && !submitted) {
      goPlayed.current = true;
      playGo();
    }
  }, [c.gameId, go, submitted]);

  const disabled =
    submitted ||
    busy ||
    !connected ||
    room.status !== "playing" ||
    now >= c.deadline;
  const submitting = useRef(false);

  const send = async (value: Answer["value"]) => {
    if (disabled || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await command(socket, "answer:submit", {
        code: room.code,
        roundId: c.id,
        value,
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const handleReflexTap = () => {
    if (disabled) return;
    if (!go) {
      setFalseStart(true);
      playIncorrect();
      void send("tap");
    } else {
      const ms = Math.max(0, now - (c.signalAt ?? now));
      setReactionMs(ms);
      playCorrect();
      void send("tap");
    }
  };

  // Reflex race keyboard shortcut (Space)
  useEffect(() => {
    if (c.gameId !== "reflex-race" || disabled) return;
    const key = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return;
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        handleReflexTap();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [c.gameId, disabled, go, c.signalAt]);

  // Quick Quiz keyboard listener: A/1, B/2, C/3, D/4
  useEffect(() => {
    if (
      !["quick-quiz", "number-circuit"].includes(c.gameId) ||
      disabled ||
      !c.options
    )
      return;
    const key = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return;
      const k = e.key.toUpperCase();
      let index = -1;
      if (k === "A" || k === "1") index = 0;
      else if (k === "B" || k === "2") index = 1;
      else if (k === "C" || k === "3") index = 2;
      else if (k === "D" || k === "4") index = 3;
      if (index >= 0 && index < c.options!.length) {
        e.preventDefault();
        setChosen(index);
        playClick();
        void send(index);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [c.gameId, disabled, c.options]);

  const handleTileClick = (n: number) => {
    if (disabled || viewing || sequence.length >= targetLength) return;
    playTileTap(n);
    setPlayerTappedTile(n);
    setTimeout(() => setPlayerTappedTile(null), 200);
    const next = [...sequence, n];
    setSequence(next);
    if (next.length === targetLength) {
      playClick();
      void send(next);
    }
  };

  // Memory Rush keyboard listener: 1, 2, 3, 4, Backspace, Enter
  useEffect(() => {
    if (c.gameId !== "memory-rush" || disabled || viewing) return;
    const key = (e: KeyboardEvent) => {
      if (ignoreGameKey(e)) return;
      if (["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        handleTileClick(parseInt(e.key, 10) - 1);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (sequence.length > 0) {
          playClick();
          setSequence((prev) => prev.slice(0, -1));
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (sequence.length > 0) {
          playClick();
          void send(sequence);
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [c.gameId, disabled, viewing, sequence]);

  // Word Blitz interactive rack handlers
  const recomputeUsedIndices = (newWord: string) => {
    if (!c.letters) return;
    const available = c.letters
      .split("")
      .map((char, index) => ({ char, index }));
    const newUsed: number[] = [];
    for (const ch of newWord.toUpperCase()) {
      const match = available.find(
        (a) => a.char === ch && !newUsed.includes(a.index),
      );
      if (match) newUsed.push(match.index);
    }
    setUsedIndices(newUsed);
  };

  const handleRackLetterClick = (letter: string, origIndex: number) => {
    if (disabled || usedIndices.includes(origIndex)) return;
    playLetterPlace();
    setUsedIndices((prev) => [...prev, origIndex]);
    setWord((prev) => prev + letter);
  };

  const handleBackspace = () => {
    if (disabled || !word) return;
    playLetterRemove();
    const newWord = word.slice(0, -1);
    setWord(newWord);
    recomputeUsedIndices(newWord);
  };

  const handlePlacedLetterClick = (charIndex: number) => {
    if (disabled) return;
    playLetterRemove();
    const newWord = word.slice(0, charIndex) + word.slice(charIndex + 1);
    setWord(newWord);
    recomputeUsedIndices(newWord);
  };

  const handleWordInputChange = (val: string) => {
    const upper = val.toUpperCase();
    setWord(upper);
    recomputeUsedIndices(upper);
  };

  const shuffleRack = () => {
    playClick();
    setRackLetters((prev) => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    });
  };

  const clearWord = () => {
    playClick();
    setWord("");
    setUsedIndices([]);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  const targetLength =
    c.sequenceLength ?? c.sequence?.length ?? Math.max(sequence.length, 3);

  return (
    <section
      className="panel game-arena"
      data-game={c.gameId}
      data-round-id={c.id}
    >
      <div className="arena-top">
        <span className="section-kicker">
          ROUND {room.round} / {room.settings.rounds} ·{" "}
          {games.find((g) => g.id === c.gameId)?.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="sound-toggle-btn"
            onClick={toggleSound}
            title={soundOn ? "Mute audio" : "Unmute audio"}
            aria-label={soundOn ? "Mute audio" : "Unmute audio"}
          >
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <span
            className={"timer " + (remaining <= 5 ? "timer-low" : "")}
            role="timer"
          >
            {remaining}s
          </span>
        </div>
      </div>
      <div className="timer-track">
        <i
          style={{
            width:
              Math.max(
                0,
                Math.min(
                  100,
                  ((c.deadline - now) / (c.deadline - c.startedAt)) * 100,
                ),
              ) + "%",
          }}
        />
      </div>
      <h2>{c.prompt}</h2>
      <p className="answer-status" role="status">
        {submitted
          ? "Answer submitted. Waiting for the other players or the clock."
          : "Your answer is open. Everyone answers this round."}
      </p>
      {!games.some((game) => game.id === c.gameId) && (
        <div className="error-box" role="alert">
          This game needs the latest screen.{" "}
          <button
            className="btn btn-outline"
            onClick={() => window.location.reload()}
          >
            Reload game
          </button>
        </div>
      )}
      {c.gameId === "code-breaker" && !c.clues?.length && (
        <p className="notice">
          The puzzle is loading.{" "}
          <button
            type="button"
            className="text-link"
            onClick={() =>
              void command(socket, "room:sync", { code: room.code }).catch(
                (e) => setError(e.message),
              )
            }
          >
            Reload puzzle
          </button>
        </p>
      )}
      {c.gameId === "number-circuit" && (
        <div className="number-circuit" aria-label="Math challenge">
          <span className="circuit-eyebrow">QUICK THINKING. CLEAR MIND.</span>
          <div className="circuit-expression">
            {c.expression}
            <span>=</span>
            <b>?</b>
          </div>
          <p>Choose the result. Use keys 1 to 4 or tap your answer.</p>
        </div>
      )}
      {(c.gameId === "quick-quiz" || c.gameId === "number-circuit") && (
        <div className="quiz-options">
          {c.options?.map((o, i) => (
            <button
              key={i}
              className={chosen === i ? "chosen" : ""}
              disabled={disabled}
              onClick={() => {
                setChosen(i);
                playClick();
                void send(i);
              }}
            >
              <span className="quiz-key-badge">
                {String.fromCharCode(65 + i)}
              </span>
              <span>{o}</span>
              {chosen === i && submitted && <Check size={18} />}
            </button>
          ))}
        </div>
      )}
      {c.gameId === "word-blitz" && (
        <>
          <div className="word-slots" aria-label="Current word">
            {c.letters?.split("").map((_, i) => {
              const ch = word[i];
              return (
                <button
                  key={i}
                  type="button"
                  className={`word-slot ${ch ? "filled" : "empty"}`}
                  disabled={disabled || !ch}
                  onClick={() => ch && handlePlacedLetterClick(i)}
                  title={ch ? "Click to remove letter" : ""}
                >
                  {ch ?? ""}
                </button>
              );
            })}
          </div>
          <div className="letter-rack" aria-label={"Letters: " + c.letters}>
            {rackLetters.map(({ char, origIndex }, i) => (
              <button
                key={i}
                type="button"
                className={usedIndices.includes(origIndex) ? "used" : ""}
                disabled={disabled || usedIndices.includes(origIndex)}
                onClick={() => handleRackLetterClick(char, origIndex)}
                aria-label={`Letter ${char}`}
              >
                {char}
              </button>
            ))}
          </div>
          <div className="letter-rack-actions">
            <button
              type="button"
              className="btn btn-outline"
              disabled={disabled}
              onClick={shuffleRack}
            >
              <Shuffle size={14} />
              Shuffle
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={disabled || !word}
              onClick={handleBackspace}
            >
              <Delete size={14} />
              Backspace
            </button>
            <button
              type="button"
              className="btn btn-outline"
              disabled={disabled || !word}
              onClick={clearWord}
            >
              <RotateCcw size={14} />
              Clear
            </button>
          </div>
          <form
            className="word-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (word.trim()) void send(word.trim());
            }}
          >
            <label className="field-label">
              Your answer
              <input
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={64}
                value={word}
                disabled={disabled}
                onChange={(e) => handleWordInputChange(e.target.value)}
                placeholder="Unscramble the word"
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={disabled || !word.trim()}
            >
              Lock it in
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="muted">
            Click letters or type to solve. Check your spelling before
            submitting.
          </p>
        </>
      )}
      {c.gameId === "code-breaker" && (
        <div className="code-breaker">
          <p className="muted">
            Three digits. No repeats. Read every clue before you commit.
          </p>
          <div className="code-clues" aria-label="Code clues">
            {c.clues?.map((clue, index) => (
              <article className="code-clue" key={clue.guess}>
                <span className="clue-index">0{index + 1}</span>
                <span
                  className="clue-digits"
                  aria-label={"Guess " + clue.guess}
                >
                  {[...clue.guess].map((digit, i) => (
                    <b key={i}>{digit}</b>
                  ))}
                </span>
                <span className="clue-feedback">
                  <strong>{clue.placed} exact</strong>
                  <small>{clue.misplaced} right digit, other position</small>
                </span>
              </article>
            ))}
          </div>
          <form
            className="code-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (/^\d{3}$/.test(word)) void send(word);
            }}
          >
            <label className="field-label">
              Your secret code
              <input
                aria-label="Your secret code"
                inputMode="numeric"
                autoComplete="off"
                pattern="[0-9]{3}"
                maxLength={3}
                value={word}
                disabled={disabled}
                placeholder="000"
                onChange={(event) =>
                  setWord(event.target.value.replace(/\D/g, ""))
                }
              />
            </label>
            <button
              className="btn btn-primary"
              disabled={disabled || !/^\d{3}$/.test(word)}
            >
              Crack the code <ArrowRight size={16} />
            </button>
          </form>
          <p className="code-rule">
            Exact means the correct digit in the correct position. Other
            positions count correct digits in the wrong place.
          </p>
        </div>
      )}
      {c.gameId === "memory-rush" && (
        <>
          <p className="memory-instruction" aria-live="polite">
            {viewing
              ? "Watch carefully…"
              : submitted
                ? "Sequence submitted."
                : "Your turn. Repeat the sequence."}
          </p>
          <div className="memory-grid">
            {[0, 1, 2, 3].map((n) => (
              <button
                className={`memory-tile tile-${n} ${viewing && activeTile === n ? "lit" : ""} ${playerTappedTile === n ? "player-tap" : ""}`}
                key={n}
                aria-label={"Tile " + (n + 1)}
                disabled={disabled || viewing || sequence.length >= 9}
                onClick={() => handleTileClick(n)}
              >
                {n + 1}
              </button>
            ))}
          </div>
          {!viewing && (
            <>
              <div className="sequence-slots" aria-label="Sequence progress">
                {Array.from({ length: targetLength }).map((_, i) => (
                  <span
                    key={i}
                    className={`sequence-slot ${i < sequence.length ? "filled" : ""} ${i === sequence.length && !submitted ? "current" : ""}`}
                  >
                    {i < sequence.length ? sequence[i] + 1 : ""}
                  </span>
                ))}
              </div>
              <div className="lobby-buttons">
                <button
                  className="btn btn-outline"
                  disabled={disabled || !sequence.length}
                  onClick={() => {
                    playClick();
                    setSequence((prev) => prev.slice(0, -1));
                  }}
                >
                  Undo
                </button>
                <button
                  className="btn btn-primary"
                  disabled={disabled || !sequence.length}
                  onClick={() => {
                    playClick();
                    void send(sequence);
                  }}
                >
                  Submit sequence
                  <Check size={16} />
                </button>
              </div>
            </>
          )}
        </>
      )}
      {c.gameId === "reflex-race" && (
        <>
          <button
            className={`reflex-pad ${go ? "go" : ""} ${falseStart ? "false-start" : submitted ? "tapped" : ""}`}
            disabled={disabled}
            onClick={handleReflexTap}
          >
            <Zap size={48} />
            <strong>
              {falseStart
                ? "FALSE START!"
                : submitted
                  ? reactionMs !== null
                    ? `${reactionMs} ms!`
                    : "LOCKED IN"
                  : go
                    ? "GO!"
                    : "WAIT…"}
            </strong>
            <span>
              {falseStart
                ? "You pressed too early. 0 points this round."
                : submitted
                  ? "Your reaction is recorded. Waiting for others…"
                  : go
                    ? "Tap now or press Space!"
                    : "An early tap means zero points."}
            </span>
          </button>
          <p className="muted">
            Reaction times include network latency. Responses below 80 ms earn
            no points.
          </p>
        </>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {submitted && (
        <p className="submission-status" role="status">
          <Check size={17} />
          Answer locked in. Waiting for the round to finish…
        </p>
      )}
      <p className="muted arena-progress">
        {room.submitted.length} / {room.players.length} answers received
      </p>
    </section>
  );
}
