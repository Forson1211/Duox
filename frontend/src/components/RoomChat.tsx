import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, Send, X } from "lucide-react";
import type { ChatMessage, RoomState } from "@duo-clash/shared";
import { command, useApp } from "../lib/context";
import { Avatar } from "./Avatar";
const messageKey = (m: ChatMessage) => m.id ?? `${m.userId}:${m.at}:${m.text}`;
export function RoomChat({ room }: { room: RoomState }) {
  const { socket, user, connected } = useApp();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const [preview, setPreview] = useState<ChatMessage>();
  const seen = useRef(new Set<string>());
  const pending = useRef<{ text: string; id: string }>();
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const messages = room.chatMessages ?? [];
  useEffect(() => {
    const fresh = messages.filter((m) => !seen.current.has(messageKey(m)));
    for (const m of fresh) seen.current.add(messageKey(m));
    if (seen.current.size > 500)
      seen.current = new Set(messages.map(messageKey));
    const incoming = fresh.filter((m) => m.userId !== user.id);
    if (open) setUnread(0);
    else if (incoming.length) {
      setUnread((n) => n + incoming.length);
      setPreview(incoming.at(-1));
    }
  }, [room.chatMessages, open, user.id]);
  useEffect(() => {
    if (open && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, room.chatMessages?.length]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending || !connected || room.status === "cancelled") return;
    if (pending.current?.text !== text)
      pending.current = { text, id: crypto.randomUUID() };
    setSending(true);
    setError("");
    try {
      await command(socket, "chat:send", {
        code: room.code,
        ...pending.current,
      });
      setDraft("");
      pending.current = undefined;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="room-chat-control">
      <button
        ref={trigger}
        type="button"
        className="btn btn-outline chat-trigger"
        aria-expanded={open}
        aria-controls="room-chat-panel"
        onClick={() => setOpen((v) => !v)}
      >
        <MessageCircle size={17} /> Chat{" "}
        {unread > 0 && (
          <span
            className="chat-unread"
            aria-label={`${unread} unread messages`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {!open && unread > 0 && preview && (
        <button
          type="button"
          className="chat-preview"
          onClick={() => setOpen(true)}
        >
          <strong>{preview.displayName}</strong>
          <span>{preview.text}</span>
          <small>Read message</small>
        </button>
      )}
      {open &&
        createPortal(
          <section
            id="room-chat-panel"
            className="room-chat-panel"
            role="dialog"
            aria-label="Room chat"
          >
            <header>
              <div>
                <h2>Room chat</h2>
                <small>
                  {connected ? "Everyone in this room" : "Reconnecting..."}
                </small>
              </div>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close chat"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
              >
                <X size={19} />
              </button>
            </header>
            <div
              ref={log}
              className="chat-log"
              role="log"
              aria-live="polite"
              aria-label="Messages"
            >
              {!messages.length && (
                <div className="chat-empty">
                  <MessageCircle size={28} />
                  <strong>A little friendly banter?</strong>
                  <p>Say hello to the people in your room.</p>
                </div>
              )}
              {messages.map((m) => (
                <article
                  className={`chat-message ${m.userId === user.id ? "chat-mine" : ""}`}
                  key={messageKey(m)}
                >
                  <Avatar player={m} />
                  <div>
                    <div className="chat-meta">
                      <strong>
                        {m.userId === user.id ? "You" : m.displayName}
                      </strong>
                      <time dateTime={new Date(m.at).toISOString()}>
                        {new Date(m.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <p>{m.text}</p>
                  </div>
                </article>
              ))}
            </div>
            {error && (
              <p className="chat-error" role="alert">
                {error}
              </p>
            )}
            <form className="chat-composer" onSubmit={(e) => void send(e)}>
              <label className="sr-only" htmlFor="chat-message-input">
                Message
              </label>
              <textarea
                ref={input}
                id="chat-message-input"
                rows={2}
                maxLength={500}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  room.status === "cancelled"
                    ? "This match has ended"
                    : "Type a message..."
                }
                disabled={!connected || room.status === "cancelled"}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                aria-label="Send message"
                disabled={
                  !draft.trim() ||
                  sending ||
                  !connected ||
                  room.status === "cancelled"
                }
              >
                <Send size={18} />
              </button>
            </form>
          </section>,
          document.body,
        )}
    </div>
  );
}
