import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, RotateCcw, LogOut, CircleX } from "lucide-react";
import type { ClientEvents, RoomState } from "@duo-clash/shared";
import { command, useApp } from "../lib/context";
import { RoomChat } from "./RoomChat";
export function RoomControls({
  room,
  onLeave,
}: {
  room: RoomState;
  onLeave: () => Promise<void>;
}) {
  const { user, socket, connected } = useApp();
  const host = room.hostId === user.id;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"quit" | "restart" | "cancel">();
  const dialog = useRef<HTMLDivElement>(null);
  const active = ["starting", "playing", "paused", "round-results"].includes(
    room.status,
  );
  const pausedBy =
    room.players.find((p) => p.id === room.pause?.byId)?.displayName ??
    "A player";
  const requester = room.players.find((p) => p.id === room.restartRequestedBy);
  const execute = async (event: keyof ClientEvents) => {
    setBusy(true);
    setError("");
    try {
      await command(socket, event, {});
      setConfirm(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!confirm) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirm(undefined);
      if (e.key === "Tab") {
        const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        );
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [confirm]);
  return (
    <>
      <div
        className="room-controls"
        data-host={host}
        role="group"
        aria-label="Game controls"
      >
        {active && !room.persisted && (
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy || !connected}
            onClick={() =>
              void execute(
                room.status === "paused" ? "room:resume" : "room:pause",
              )
            }
          >
            {room.status === "paused" ? (
              <Play size={16} />
            ) : (
              <Pause size={16} />
            )}
            {room.status === "paused" ? "Resume" : "Pause"}
          </button>
        )}
        {room.status !== "waiting" && (
          <button
            type="button"
            className="btn btn-outline"
            disabled={
              busy ||
              !connected ||
              (!host && (!active || room.restartRequestedBy === user.id))
            }
            onClick={() =>
              host
                ? setConfirm("restart")
                : void execute("match:restart-request")
            }
          >
            <RotateCcw size={16} />
            {!host && room.restartRequestedBy === user.id
              ? "Restart requested"
              : "Restart"}
          </button>
        )}
        <RoomChat key={room.code} room={room} />
        <button
          type="button"
          className="btn btn-outline control-quit"
          disabled={busy || !connected}
          onClick={() => setConfirm("quit")}
        >
          <LogOut size={16} />
          Quit game
        </button>
        {host &&
          !room.persisted &&
          !["completed", "cancelled"].includes(room.status) && (
            <button
              type="button"
              className="btn btn-outline control-cancel"
              disabled={busy || !connected}
              onClick={() => setConfirm("cancel")}
            >
              <CircleX size={16} />
              Cancel game
            </button>
          )}
      </div>
      {room.status === "paused" && (
        <section className="pause-notice" role="status">
          <Pause size={20} />
          <div>
            <strong>Game paused for everyone</strong>
            <p>
              {pausedBy} paused the match. The clock and answers are frozen.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !connected}
            onClick={() => void execute("room:resume")}
          >
            Resume game
          </button>
        </section>
      )}
      {requester && host && active && (
        <div className="notice restart-request" role="status">
          <span>{requester.displayName} asked to restart the match.</span>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy || !connected}
            onClick={() => setConfirm("restart")}
          >
            Restart match
          </button>
        </div>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {confirm &&
        createPortal(
          <div className="room-dialog-backdrop">
            <div
              ref={dialog}
              className="panel room-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="room-action-title"
            >
              <h2 id="room-action-title">
                {confirm === "quit"
                  ? "Leave this game?"
                  : confirm === "cancel"
                    ? "Cancel this match?"
                    : "Restart this match?"}
              </h2>
              <p>
                {confirm === "quit"
                  ? active && !room.persisted
                    ? "You will leave the room and end this unfinished match for everyone. Unsaved scores will be discarded."
                    : "You will leave this room. Saved results stay in your history."
                  : confirm === "cancel"
                    ? "This ends the match for everyone. Unsaved scores will be discarded. You can start a fresh match afterward."
                    : "Everyone starts again from round one with a fresh score. Saved results from earlier completed matches are kept."}
              </p>
              <div className="lobby-buttons">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={() => setConfirm(undefined)}
                >
                  Keep playing
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || !connected}
                  onClick={() => {
                    if (confirm === "quit") {
                      setBusy(true);
                      void onLeave().finally(() => {
                        setBusy(false);
                        setConfirm(undefined);
                      });
                    } else
                      void execute(
                        confirm === "cancel" ? "match:cancel" : "match:restart",
                      );
                  }}
                >
                  {confirm === "quit"
                    ? "Quit now"
                    : confirm === "cancel"
                      ? "Cancel match"
                      : "Restart now"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
