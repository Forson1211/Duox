import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  Check,
  MessageCircle,
  Smile,
  X,
} from "lucide-react";
import type { ChatMessage, RoomState } from "@duo-clash/shared";
import { command, useApp } from "../lib/context";
import { PresenceAvatar } from "./Avatar";

const messageKey = (m: ChatMessage) => m.id ?? `${m.userId}:${m.at}:${m.text}`;
const sameDay = (a: number, b: number) =>
  new Date(a).toDateString() === new Date(b).toDateString();
const emojiChoices = [
  "\u{1F44B}",
  "\u{1F604}",
  "\u{1F602}",
  "\u{1F60E}",
  "\u{1F525}",
  "\u{1F44F}",
  "\u{1F91D}",
  "\u{1F3C6}",
  "\u{1F49C}",
  "\u{1F389}",
  "\u{1F914}",
  "\u{1F4AA}",
];
function dayLabel(at: number) {
  if (sameDay(at, Date.now())) return "Today";
  if (sameDay(at, Date.now() - 86400000)) return "Yesterday";
  return new Date(at).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function RoomChat({ room }: { room: RoomState }) {
  const { socket, user, connected } = useApp();
  const messages = room.chatMessages ?? [];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const [preview, setPreview] = useState<ChatMessage>();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const seen = useRef(new Set(messages.map(messageKey)));
  const pinned = useRef(true);
  const sendingRef = useRef(false);
  const pending = useRef<{ text: string; id: string }>();
  const input = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const lastMessage = messages.at(-1);
  const lastKey = lastMessage ? messageKey(lastMessage) : "";
  const onlineCount = room.players.filter((p) => p.connected).length;
  const scrollToLatest = () => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
    pinned.current = true;
    setNewBelow(false);
  };
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
  useLayoutEffect(() => {
    if (!open) return;
    if (pinned.current || lastMessage?.userId === user.id) scrollToLatest();
    else setNewBelow(true);
  }, [open, lastKey]);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height =
      Math.min(input.current.scrollHeight, 112) + "px";
    if (pinned.current) scrollToLatest();
  }, [draft, open]);
  useEffect(() => {
    if (!open || !log.current) return;
    const observer = new ResizeObserver(() => {
      if (pinned.current) scrollToLatest();
    });
    observer.observe(log.current);
    return () => observer.disconnect();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    pinned.current = true;
    scrollToLatest();
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (emojiOpen) {
        setEmojiOpen(false);
        input.current?.focus();
      } else {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, emojiOpen]);
  const close = () => {
    setOpen(false);
    setEmojiOpen(false);
    trigger.current?.focus();
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (
      !text ||
      sendingRef.current ||
      !connected ||
      room.status === "cancelled"
    )
      return;
    if (pending.current?.text !== text)
      pending.current = { text, id: crypto.randomUUID() };
    sendingRef.current = true;
    setSending(true);
    setEmojiOpen(false);
    setError("");
    try {
      await command(socket, "chat:send", {
        code: room.code,
        ...pending.current,
      });
      setDraft((current) => (current.trim() === text ? "" : current));
      pending.current = undefined;
      pinned.current = true;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const insertEmoji = (emoji: string) => {
    const start = input.current?.selectionStart ?? draft.length;
    const end = input.current?.selectionEnd ?? start;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length > 500) return;
    setDraft(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(
        start + emoji.length,
        start + emoji.length,
      );
    });
  };
  const canCompose = connected && room.status !== "cancelled";
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
            aria-labelledby="room-chat-title"
          >
            <header className="chat-header">
              <span className="chat-header-icon" aria-hidden="true">
                <MessageCircle size={21} />
              </span>
              <div className="chat-heading">
                <h2 id="room-chat-title">Room chat</h2>
                <span className="chat-room-status">
                  <i className={connected ? "is-online" : ""} />
                  {connected
                    ? `${room.players.length} players \u00b7 ${onlineCount} online`
                    : "Reconnecting..."}
                </span>
              </div>
              <button
                type="button"
                className="chat-close"
                aria-label="Close chat"
                onClick={close}
              >
                <X size={19} />
              </button>
            </header>
            <div className="chat-conversation">
              <div
                ref={log}
                className="chat-log"
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                aria-label="Messages"
                onScroll={() => {
                  const el = log.current;
                  if (!el) return;
                  pinned.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 64;
                  if (pinned.current) setNewBelow(false);
                }}
              >
                {!messages.length && (
                  <div className="chat-empty">
                    <span className="chat-empty-icon">
                      <MessageCircle size={27} />
                    </span>
                    <strong>Good company. Great conversation.</strong>
                    <p>Say hello, celebrate a win, or plan your next round.</p>
                  </div>
                )}
                {messages.map((m, index) => {
                  const mine = m.userId === user.id;
                  const previous = messages[index - 1];
                  const newDay = !previous || !sameDay(previous.at, m.at);
                  const grouped =
                    !newDay &&
                    previous.userId === m.userId &&
                    m.at - previous.at < 180000;
                  const member = room.players.find((p) => p.id === m.userId);
                  return (
                    <div className="chat-entry" key={messageKey(m)}>
                      {newDay && (
                        <div className="chat-day">
                          <span>{dayLabel(m.at)}</span>
                        </div>
                      )}
                      <article
                        className={`chat-message ${mine ? "chat-mine" : "chat-incoming"} ${grouped ? "chat-grouped" : ""}`}
                      >
                        {!mine && (
                          <span className="chat-avatar-slot">
                            {!grouped && (
                              <PresenceAvatar
                                player={m}
                                online={!!member?.connected}
                              />
                            )}
                          </span>
                        )}
                        <div className="chat-message-content">
                          {mine && <span className="sr-only">You: </span>}
                          {!mine && !grouped && (
                            <strong className="chat-sender">
                              {m.displayName}
                            </strong>
                          )}
                          <p
                            className={`chat-bubble ${/^\p{Extended_Pictographic}(?:\uFE0F|\u200D|\p{Extended_Pictographic}|\p{Emoji_Modifier}){0,8}$/u.test(m.text.trim()) ? "chat-emoji-only" : ""}`}
                          >
                            {m.text}
                          </p>
                          <div className="chat-meta">
                            <time dateTime={new Date(m.at).toISOString()}>
                              {new Date(m.at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </time>
                            {mine && <Check size={12} aria-label="Sent" />}
                          </div>
                        </div>
                      </article>
                    </div>
                  );
                })}
              </div>
              {newBelow && (
                <button
                  type="button"
                  className="chat-new-messages"
                  onClick={scrollToLatest}
                >
                  New messages <ArrowDown size={14} />
                </button>
              )}
            </div>
            <footer className="chat-footer">
              {error && (
                <p className="chat-error" role="alert">
                  {error}
                </p>
              )}
              {emojiOpen && (
                <div
                  className="chat-emoji-picker"
                  role="group"
                  aria-label="Choose an emoji"
                >
                  {emojiChoices.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      aria-label={`Insert ${emoji}`}
                      onClick={() => insertEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <form className="chat-composer" onSubmit={(e) => void send(e)}>
                <button
                  type="button"
                  className="chat-emoji-button"
                  aria-label="Choose emoji"
                  aria-expanded={emojiOpen}
                  disabled={!canCompose}
                  onClick={() => setEmojiOpen((v) => !v)}
                >
                  <Smile size={20} />
                </button>
                <label className="sr-only" htmlFor="chat-message-input">
                  Message
                </label>
                <textarea
                  ref={input}
                  id="chat-message-input"
                  rows={1}
                  maxLength={500}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    room.status === "cancelled"
                      ? "This match has ended"
                      : "Type a message..."
                  }
                  disabled={!canCompose}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button
                  type="submit"
                  className="chat-send"
                  aria-label="Send message"
                  disabled={!draft.trim() || sending || !canCompose}
                >
                  <ArrowUp size={20} strokeWidth={2.5} />
                </button>
              </form>
              <div className="chat-composer-hint">
                <span>
                  Enter to send <i /> Shift + Enter for a new line
                </span>
                {draft.length > 450 && <span>{draft.length}/500</span>}
              </div>
            </footer>
          </section>,
          document.body,
        )}
    </div>
  );
}
