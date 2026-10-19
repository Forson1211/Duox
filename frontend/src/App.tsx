import { Avatar } from "./components/Avatar";
import { Logo } from "./components/Logo";
import { useEffect, useState, useCallback } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  Link,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createGameConnection } from "./lib/connection";
import { NotificationCenter } from "./components/Notifications";
import {
  Swords,
  Home,
  Gamepad2,
  Plus,
  Trophy,
  Users,
  Award,
  UserRound,
  Settings,
  Moon,
  Sun,
  LogOut,
  Shield,
  CalendarDays,
  Search,
  Menu,
  X,
  ArrowRight,
} from "lucide-react";
import type { Account, RoomState } from "@duo-clash/shared";
import Landing from "./Landing";
import { AuthPage } from "./components/Auth";
import {
  Dashboard,
  PlayPage,
  CreateRoom,
  JoinRoom,
  Leaderboard,
  Profile,
  Friends,
  Achievements,
  SettingsPage,
  DailyChallenge,
  Admin,
} from "./components/Pages";
import { RoomPage } from "./components/Room";
import { api, post, ApiError } from "./lib/api";
import {
  AppContext,
  type GameSocket,
  command,
  type NotificationItem,
  type NotifyOptions,
} from "./lib/context";
const links = [
  ["/app", "Home", Home],
  ["/app/play", "Play", Gamepad2],
  ["/app/rooms/create", "Create room", Plus],
  ["/app/daily", "Daily challenge", CalendarDays],
  ["/app/leaderboard", "Leaderboard", Trophy],
  ["/app/friends", "Friends", Users],
  ["/app/achievements", "Achievements", Award],
  ["/app/profile", "Profile", UserRound],
  ["/app/settings", "Settings", Settings],
] as const;
export default function App() {
  const query = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = (e: MediaQueryListEvent | MediaQueryList) => {
      const isDark = e.matches;
      setDark(isDark);
      document.documentElement.dataset.theme = isDark ? "dark" : "light";
    };
    syncTheme(media);
    media.addEventListener("change", syncTheme);
    return () => media.removeEventListener("change", syncTheme);
  }, []);
  const [socket, setSocket] = useState<GameSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [toast, setToast] = useState("");
  const [menu, setMenu] = useState(false);

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem("duo_notifications");
      if (stored) return JSON.parse(stored);
    } catch (_) {}
    return [
      {
        id: "daily_welcome",
        type: "match",
        title: "Daily Blitz Challenge",
        message:
          "Today's speed challenge is open! Play today to keep your streak alive.",
        timestamp: Date.now() - 1000 * 60 * 12,
        read: false,
        link: "/app/daily",
        actionText: "Play Now",
      },
      {
        id: "welcome_guide",
        type: "system",
        title: "Welcome to DUO CLASH",
        message:
          "Challenge friends, play solo practice runs, and climb the weekly leaderboard.",
        timestamp: Date.now() - 1000 * 60 * 45,
        read: false,
        link: "/app/play",
        actionText: "Explore Games",
      },
      {
        id: "rank_progression",
        type: "achievement",
        title: "Arena Progression",
        message:
          "Win matches in Trivia, Word Blitz, Memory Rush, and Reflex Race to level up.",
        timestamp: Date.now() - 1000 * 60 * 180,
        read: true,
        link: "/app/achievements",
        actionText: "Trophies",
      },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem("duo_notifications", JSON.stringify(notifications));
    } catch (_) {}
  }, [notifications]);

  const addNotification = useCallback(
    (item: Omit<NotificationItem, "id" | "timestamp" | "read">) => {
      const newItem: NotificationItem = {
        ...item,
        id:
          "notif_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
        timestamp: Date.now(),
        read: false,
      };
      setNotifications((prev) => [newItem, ...prev.slice(0, 24)]);
    },
    [],
  );

  const markAsRead = useCallback((id?: string) => {
    setNotifications((prev) =>
      prev.map((n) => (!id || n.id === id ? { ...n, read: true } : n)),
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, options?: NotifyOptions) => {
      setToast(message);
      addNotification({
        type: options?.type || "system",
        title: options?.title || "Game Alert",
        message,
        link: options?.link,
        actionText: options?.actionText,
      });
    },
    [addNotification],
  );

  const auth = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return (await api<{ user: Account }>("/auth/me")).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60000,
  });
  const user = auth.data;
  const refresh = async () => {
    await Promise.all([
      query.invalidateQueries({ queryKey: ["me"] }),
      query.invalidateQueries({ queryKey: ["history"] }),
      query.invalidateQueries({ queryKey: ["leaders"] }),
      query.invalidateQueries({ queryKey: ["daily"] }),
    ]);
  };

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    setMenu(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!user) return;
    const s = createGameConnection();
    let completedId: string | undefined;
    setSocket(s);
    s.on("connect", () => {
      setConnected(true);
      void command<RoomState | null>(s, "room:sync", {})
        .then(setRoom)
        .catch((e) => setToast(e.message));
    });
    s.on("disconnect", (reason) => {
      setConnected(false);
      if (reason === "io server disconnect" || reason === "unauthorized")
        void query.invalidateQueries({ queryKey: ["me"] });
    });
    s.on("connect_error", () => setConnected(false));
    s.on("room:state", (r) => {
      setRoom(r);
      if (r?.status === "completed" && completedId !== r.id) {
        completedId = r.id;
        void refresh();
        const winner = r.winnerIds.includes(user.id);
        addNotification({
          type: "match",
          title: winner ? "Victory! 🏆" : "Match Finished",
          message: winner
            ? `You won match ${r.code}! Rating updated.`
            : `Match ${r.code} concluded. Ready for another clash?`,
          link: "/app/rooms/" + r.code,
          actionText: "View Results",
        });
      }
    });
    s.on("room:error", (err) => {
      notify(err, { type: "system", title: "Room Notice" });
    });
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
      setRoom(null);
    };
  }, [user?.id, addNotification, notify]);
  const action = (
    kind: "create" | "join" | "login" | "register",
    game?: number,
  ) => {
    const path =
      kind === "create"
        ? `/app/rooms/create${game !== undefined ? "?game=" + game : ""}`
        : kind === "join"
          ? "/app/rooms/join"
          : "/" + kind;
    navigate(
      user && (kind === "login" || kind === "register")
        ? "/app"
        : user || kind === "login" || kind === "register"
          ? path
          : "/register?next=" + encodeURIComponent(path),
    );
  };
  const matchFocus =
    !!room &&
    ["starting", "playing", "round-results"].includes(room.status) &&
    location.pathname === "/app/rooms/" + room.code;
  const logout = async () => {
    try {
      await post("/auth/logout");
      query.setQueryData(["me"], null);
      query.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
      navigate("/");
    } catch (e) {
      setToast((e as Error).message);
    }
  };
  if (location.pathname === "/")
    return (
      <>
        <Landing dark={dark} action={action} />
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </>
    );
  if (
    ["/login", "/register", "/forgot-password", "/reset-password"].includes(
      location.pathname,
    )
  )
    return (
      <div className={dark ? "app theme-dark" : "app"}>
        <AuthPage
          key={location.pathname}
          mode={
            location.pathname.slice(1) as
              "login" | "register" | "forgot-password" | "reset-password"
          }
          onAuth={(u) => {
            query.setQueryData(["me"], u);
            query.invalidateQueries({ queryKey: ["me"] });
          }}
        />
      </div>
    );
  if (auth.isLoading)
    return (
      <div className="full-state" role="status">
        Loading your player profile…
      </div>
    );
  if (auth.error)
    return (
      <div className="full-state">
        <h1>We couldn’t reach the game server</h1>
        <p>{auth.error.message}</p>
        <button className="btn btn-primary" onClick={() => void auth.refetch()}>
          Try again
        </button>
        <Link to="/">Return home</Link>
      </div>
    );
  if (!user)
    return (
      <Navigate
        to={
          "/login?next=" +
          encodeURIComponent(location.pathname + location.search)
        }
        replace
      />
    );
  return (
    <AppContext.Provider
      value={{
        user,
        refresh,
        socket,
        connected,
        room,
        setRoom,
        notify,
        dark,
        setDark,
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
        markAsRead,
        clearNotifications,
        dismissNotification,
      }}
    >
      <div
        className={`app game-app ${dark ? "theme-dark" : ""} ${matchFocus ? "match-focus" : ""}`}
      >
        <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
          <Link to="/app" className="brand" aria-label="DUO CLASH">
            <Logo height={34} />
          </Link>
          <span className="sidebar-label">YOUR PLAYGROUND</span>
          <nav>
            {links.map(([path, label, Icon]) => (
              <NavLink key={path} to={path} end={path === "/app"}>
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
            {user.role === "admin" && (
              <NavLink to="/admin">
                <Shield size={18} />
                Admin
              </NavLink>
            )}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-callout">
              <Swords size={24} />
              <strong>
                Good games.
                <br />
                Great people.
              </strong>
              <p>
                Challenge your people.
                <br />
                Claim your crown.
              </p>
            </div>
            <button onClick={() => void logout()}>
              <LogOut size={17} />
              Log out
            </button>
          </div>
        </aside>
        {menu && (
          <button
            className="sidebar-scrim"
            aria-label="Close navigation"
            onClick={() => setMenu(false)}
          />
        )}
        <div className="app-body">
          <header className="app-header">
            <button
              className="icon-btn mobile-menu"
              aria-label="Toggle navigation"
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={19} /> : <Menu size={19} />}
            </button>
            <Link to="/app/profile" className="header-person">
              <Avatar player={user} />
              <span>
                <small>Hello, welcome back</small>
                <strong>
                  {user.displayName}
                  <span className="greeting-wave" aria-hidden="true">
                    &#10022;
                  </span>
                </strong>
              </span>
            </Link>
            <div className="header-tools">
              <span
                className={`connection ${connected ? "online" : ""}`}
                role="status"
              >
                <i />
                {connected ? "Connected" : "Reconnecting..."}
              </span>
              <NotificationCenter
                notifications={notifications}
                unreadCount={notifications.filter((n) => !n.read).length}
                onMarkRead={markAsRead}
                onClear={clearNotifications}
                onDismiss={dismissNotification}
              />
              <Link
                className="icon-btn"
                to="/app/play"
                aria-label="Search games"
              >
                <Search size={20} />
              </Link>

              <Link to="/app/profile" className="header-level">
                Level {user.level}
              </Link>
            </div>
          </header>
          {room && !location.pathname.startsWith("/app/rooms/" + room.code) && (
            <Link className="resume-banner" to={"/app/rooms/" + room.code}>
              Your room {room.code} is {room.status}.{" "}
              <strong>
                Return to room <ArrowRight size={14} />
              </strong>
            </Link>
          )}
          <main className="app-content">
            <Routes>
              <Route path="/app" element={<Dashboard />} />
              <Route path="/app/play" element={<PlayPage />} />
              <Route path="/app/rooms/create" element={<CreateRoom />} />
              <Route path="/app/rooms/join" element={<JoinRoom />} />
              <Route path="/app/rooms/:code" element={<RoomPage />} />
              <Route path="/app/leaderboard/*" element={<Leaderboard />} />
              <Route path="/app/daily" element={<DailyChallenge />} />
              <Route path="/app/friends" element={<Friends />} />
              <Route path="/app/achievements" element={<Achievements />} />
              <Route path="/app/profile" element={<Profile />} />
              <Route path="/app/players/:username" element={<Profile />} />
              <Route path="/app/settings" element={<SettingsPage />} />
              <Route
                path="/admin"
                element={
                  user.role === "admin" ? <Admin /> : <Navigate to="/app" />
                }
              />
              <Route
                path="*"
                element={
                  <div className="full-state">
                    <h1>That page wandered off.</h1>
                    <Link to="/app">Back to your dashboard</Link>
                  </div>
                }
              />
            </Routes>
          </main>
          <nav className="bottom-nav">
            {[links[0], links[4], links[1], links[5], links[7]].map(
              ([path, label, Icon]) => (
                <NavLink to={path} key={path} end={path === "/app"}>
                  <Icon size={20} />
                  <span>{label}</span>
                </NavLink>
              ),
            )}
          </nav>
        </div>
        {toast && (
          <div className="toast" role="status">
            <span>{toast}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setToast("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
