import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  Gamepad2,
  Award,
  Users,
  Sparkles,
  ArrowRight,
  Check,
} from "lucide-react";
import type { NotificationItem, NotificationType } from "../lib/context";

function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getTypeIcon(type: NotificationType) {
  switch (type) {
    case "match":
      return <Gamepad2 size={16} />;
    case "achievement":
      return <Award size={16} />;
    case "friend":
      return <Users size={16} />;
    case "system":
    default:
      return <Sparkles size={16} />;
  }
}

interface NotificationCenterProps {
  notifications: NotificationItem[];
  unreadCount: number;
  onMarkRead: (id?: string) => void;
  onClear: () => void;
  onDismiss: (id: string) => void;
}

export function NotificationCenter({
  notifications,
  unreadCount,
  onMarkRead,
  onClear,
  onDismiss,
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const handleItemClick = (item: NotificationItem) => {
    onMarkRead(item.id);
    if (item.link) {
      setOpen(false);
      navigate(item.link);
    }
  };

  return (
    <div className="notification-center" ref={containerRef}>
      <button
        type="button"
        className={`icon-btn notification-bell-btn ${unreadCount > 0 ? "has-unread" : ""}`}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="notification-badge" aria-hidden="true">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="notification-scrim"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            className="notification-panel"
            role="dialog"
            aria-label="Notifications list"
          >
            <div className="notification-header">
              <div className="notification-title-wrap">
                <span className="notification-header-icon">
                  <Bell size={16} />
                </span>
                <strong>Notifications</strong>
                {unreadCount > 0 && (
                  <span className="unread-pill">{unreadCount} new</span>
                )}
              </div>
              <div className="notification-header-actions">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="notif-action-btn"
                    onClick={() => onMarkRead()}
                    title="Mark all as read"
                  >
                    <CheckCheck size={14} />
                    <span>Read all</span>
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    className="notif-action-btn notif-clear-btn"
                    onClick={onClear}
                    title="Clear all notifications"
                  >
                    <Trash2 size={14} />
                    <span>Clear</span>
                  </button>
                )}
                <button
                  type="button"
                  className="notif-close-btn"
                  onClick={() => setOpen(false)}
                  aria-label="Close notifications"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="notification-list">
              {notifications.length === 0 ? (
                <div className="notification-empty">
                  <div className="notification-empty-icon">
                    <Check size={24} />
                  </div>
                  <strong>All caught up!</strong>
                  <p>
                    Challenge alerts, match results, and trophies will show up
                    here.
                  </p>
                </div>
              ) : (
                notifications.map((item) => (
                  <div
                    key={item.id}
                    className={`notification-item notif-type-${item.type} ${!item.read ? "is-unread" : ""}`}
                    onClick={() => handleItemClick(item)}
                    role={item.link ? "button" : "article"}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        handleItemClick(item);
                      }
                    }}
                  >
                    <span className={`notif-icon-badge notif-${item.type}`}>
                      {getTypeIcon(item.type)}
                    </span>
                    <div className="notif-body">
                      <div className="notif-title-row">
                        <span className="notif-title">{item.title}</span>
                        {!item.read && <span className="notif-unread-dot" />}
                      </div>
                      <p className="notif-message">{item.message}</p>
                      <div className="notif-footer">
                        <span className="notif-time">
                          {formatTime(item.timestamp)}
                        </span>
                        {item.link && (
                          <span className="notif-action-link">
                            {item.actionText || "View"}
                            <ArrowRight size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="notif-item-dismiss"
                      aria-label="Dismiss notification"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismiss(item.id);
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {notifications.length > 0 && (
              <div className="notification-bottom-bar">
                <Link
                  to="/app/daily"
                  onClick={() => setOpen(false)}
                  className="notif-bottom-link"
                >
                  Daily Challenge
                  <ArrowRight size={13} />
                </Link>
                <Link
                  to="/app/leaderboard"
                  onClick={() => setOpen(false)}
                  className="notif-bottom-link"
                >
                  Leaderboard
                  <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
