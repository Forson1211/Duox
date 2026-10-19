import http from "node:http";
import path from "node:path";
import { randomBytes } from "node:crypto";
import express, {
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose, { type PipelineStage } from "mongoose";
import nodemailer from "nodemailer";
import { z } from "zod";
import { Server } from "socket.io";
import {
  registerSchema,
  GAME_PROTOCOL_VERSION,
  loginSchema,
  games,
  achievements,
  roomSchema,
  weekStart,
  type ClientEvents,
  type ServerEvents,
} from "@duo-clash/shared";
import {
  User,
  Session,
  ResetToken,
  Match,
  MatchResult,
  Friendship,
  ChallengeCompletion,
  Block,
  Report,
  Question,
  Audit,
} from "./models.js";
import {
  AppError,
  requireUser,
  requireAdmin,
  publicPlayer,
  account,
  hashPassword,
  verifyPassword,
  createSession,
  hashToken,
  authenticate,
  cookieName,
  cookieToken,
  setSessionCookie,
  getCookieOptions,
  production,
  origin,
  isAllowedOrigin,
} from "./auth.js";
import { RoomManager, dailyInfo } from "./rooms.js";
import { DurableRooms } from "./durable.js";
import { LiveGameRoom, PlayerPresence } from "./models.js";
const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    void fn(req, res).catch(next);
  };
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
const questionSchema = z.object({
  category: z.string().trim().min(1).max(40),
  prompt: z.string().trim().min(5).max(300),
  options: z.array(z.string().trim().min(1).max(120)).length(4),
  answer: z.number().int().min(0).max(3),
  explanation: z.string().max(500).default(""),
  active: z.boolean().default(true),
});
export function createApplication(
  options: {
    timing?: { starting: number; results: number };
    staticDirectory?: string;
    ensureDatabase?: () => Promise<void>;
    durableRooms?: boolean;
  } = {},
) {
  const durableMode = options.durableRooms ?? !!process.env.VERCEL;
  const app = express();
  const server = http.createServer(app);
  app.disable("x-powered-by");
  if (production) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          connectSrc: ["'self'", origin],
          imgSrc: ["'self'", "data:"],
          upgradeInsecureRequests: production ? [] : null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (reqOrigin, cb) => cb(null, isAllowedOrigin(reqOrigin)),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "16kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 200,
      skip: (req) => req.path.startsWith("/v1/realtime"),
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many requests. Please try again shortly." },
    }),
  );
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin &&
      !isAllowedOrigin(req.headers.origin)
    )
      return res.status(403).json({ error: "Request origin is not allowed." });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return res
        .status(403)
        .json({ error: "Cross-site requests are not allowed." });
    next();
  });
  const io = new Server<ClientEvents, ServerEvents>(server, {
    cors: {
      origin: (reqOrigin, cb) => cb(null, isAllowedOrigin(reqOrigin)),
      credentials: true,
    },
    maxHttpBufferSize: 16384,
    allowRequest: (req, cb) =>
      cb(null, !req.headers.origin || isAllowedOrigin(req.headers.origin)),
  });
  const rooms = new RoomManager(io, options.timing, { manual: durableMode });
  const durable = new DurableRooms(io, options.timing);
  rooms.attach();
  app.use("/api", async (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await options.ensureDatabase?.();
      next();
    } catch (error) {
      // Return JSON without exposing connection strings or platform HTML errors.
      console.error(
        "Database initialization failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      next(
        new AppError(
          "The game service is temporarily unavailable. Please try again shortly.",
          503,
        ),
      );
    }
  });
  const api = express.Router();
  app.use("/api/v1", api);
  api.get("/health", (_req, res) =>
    res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
      gameProtocol: GAME_PROTOCOL_VERSION,
      status: mongoose.connection.readyState === 1 ? "ok" : "unavailable",
      database:
        mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      service: "duo-clash-api",
      transport: durableMode ? "http" : "socket",
    }),
  );
  api.get("/games", (_req, res) => res.json({ games }));
  api.get(
    "/categories",
    wrap(async (_req, res) =>
      res.json({
        categories: await Question.distinct("category", { active: true }),
      }),
    ),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: process.env.NODE_ENV === "test" ? 1000 : 25,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again in 15 minutes." },
  });
  api.post(
    "/auth/register",
    authLimit,
    wrap(async (req, res) => {
      const data = registerSchema.parse(req.body);
      if (
        await User.exists({
          $or: [
            { email: data.email },
            { normalizedUsername: data.username.toLowerCase() },
          ],
        })
      )
        throw new AppError(
          "That email or username is already registered.",
          409,
        );
      const user = await User.create({
        ...data,
        normalizedUsername: data.username.toLowerCase(),
        password: undefined,
        passwordHash: await hashPassword(data.password),
      });
      await createSession(user.id, res);
      res.status(201).json({ user: account(user) });
    }),
  );
  api.post(
    "/auth/login",
    authLimit,
    wrap(async (req, res) => {
      const data = loginSchema.parse(req.body);
      const user = await User.findOne({ email: data.email }).select(
        "+passwordHash",
      );
      const valid = await verifyPassword(
        data.password,
        user?.passwordHash ??
          "00000000000000000000000000000000:" + "00".repeat(64),
      );
      if (!user || !valid || user.status !== "active")
        throw new AppError("Invalid email or password.", 401);
      await createSession(user.id, res);
      res.json({ user: account(user) });
    }),
  );
  api.post(
    "/auth/logout",
    requireUser,
    wrap(async (req, res) => {
      await Session.deleteOne({ _id: req.sessionId });
      res.clearCookie(cookieName, { ...getCookieOptions(), maxAge: undefined });
      io.in(`user:${req.user!.id}`).disconnectSockets();
      res.json({ ok: true });
    }),
  );
  api.get(
    "/auth/me",
    requireUser,
    wrap(async (req, res) => {
      await Session.updateOne(
        { _id: req.sessionId },
        { expiresAt: new Date(Date.now() + 7 * 86400000) },
      );
      const token = cookieToken(req.headers.cookie);
      if (token) setSessionCookie(res, token);
      res.json({ user: account(req.user!) });
    }),
  );
  api.post(
    "/auth/forgot-password",
    authLimit,
    wrap(async (req, res) => {
      const { email } = z
        .object({
          email: z
            .string()
            .trim()
            .email()
            .transform((v) => v.toLowerCase()),
        })
        .parse(req.body);
      const user = await User.findOne({ email });
      if (production && !process.env.EMAIL_HOST)
        throw new AppError(
          "Password reset email is not configured. Contact the administrator.",
          503,
        );
      let developmentResetUrl: string | undefined;
      if (user) {
        const token = randomBytes(32).toString("hex");
        await ResetToken.deleteMany({ userId: user.id });
        await ResetToken.create({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 60000),
        });
        const url = `${origin}/reset-password?token=${token}`;
        if (process.env.EMAIL_HOST) {
          const transport = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: Number(process.env.EMAIL_PORT ?? 587),
            secure: process.env.EMAIL_PORT === "465",
            auth: process.env.EMAIL_USER
              ? {
                  user: process.env.EMAIL_USER,
                  pass: process.env.EMAIL_PASSWORD,
                }
              : undefined,
          });
          await transport.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Reset your DUO CLASH password",
            text: `Reset your password within 30 minutes: ${url}\nIf you did not request this, ignore this email.`,
          });
        } else if (!production) developmentResetUrl = url;
      }
      res.json({
        message: "If an account exists, a reset link has been sent.",
        ...(!production ? { developmentResetUrl } : {}),
      });
    }),
  );
  api.post(
    "/auth/reset-password",
    authLimit,
    wrap(async (req, res) => {
      const data = z
        .object({
          token: z.string().length(64),
          password: registerSchema.shape.password,
        })
        .parse(req.body);
      const hash = await hashPassword(data.password);
      let revokedUserId = "";
      await mongoose.connection.transaction(async (session) => {
        const token = await ResetToken.findOneAndDelete(
          { tokenHash: hashToken(data.token), expiresAt: { $gt: new Date() } },
          { session },
        );
        if (!token)
          throw new AppError("This reset link is invalid or expired.");
        revokedUserId = String(token.userId);
        await User.updateOne(
          { _id: token.userId },
          { passwordHash: hash },
          { session },
        );
        await Session.deleteMany({ userId: token.userId }, { session });
      });
      io.in(`user:${revokedUserId}`).disconnectSockets();
      res.json({ message: "Password updated. Please log in." });
    }),
  );
  api.get(
    "/leaderboards/:scope",
    wrap(async (req, res) => {
      const scope = z
        .enum(["global", "weekly", "friends", "seasonal"])
        .parse(req.params.scope);
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(1)
        .parse(req.query.page);
      const search = z.string().trim().max(32).default("").parse(req.query.q);
      const auth = await authenticate(req.headers.cookie);
      let eligible: string[] | undefined;
      if (scope === "friends") {
        if (!auth) throw new AppError("Log in to view friends rankings.", 401);
        const friendships = await Friendship.find({
          status: "accepted",
          $or: [{ requesterId: auth.user.id }, { recipientId: auth.user.id }],
        });
        eligible = [
          auth.user.id,
          ...friendships.map((f) =>
            f.requesterId === auth.user.id ? f.recipientId : f.requesterId,
          ),
        ];
      }
      const weekly = scope === "weekly" || scope === "seasonal";
      const since =
        scope === "weekly"
          ? weekStart()
          : new Date(
              Date.UTC(
                new Date().getUTCFullYear(),
                Math.floor(new Date().getUTCMonth() / 3) * 3,
                1,
              ),
            );
      const source: PipelineStage[] = weekly
        ? [
            {
              $match: {
                completedAt: { $gte: since },
                ...(eligible ? { userId: { $in: eligible } } : {}),
              },
            },
            { $group: { _id: "$userId", points: { $sum: "$points" } } },
            { $set: { userObjectId: { $toObjectId: "$_id" } } },
            {
              $lookup: {
                from: User.collection.name,
                localField: "userObjectId",
                foreignField: "_id",
                as: "user",
              },
            },
            { $unwind: "$user" },
            {
              $match: { "user.status": "active", "user.visibility": "public" },
            },
          ]
        : [
            {
              $match: {
                status: "active",
                visibility: "public",
                ...(eligible
                  ? {
                      _id: {
                        $in: eligible.map(
                          (id) => new mongoose.Types.ObjectId(id),
                        ),
                      },
                    }
                  : {}),
              },
            },
            {
              $project: {
                _id: { $toString: "$_id" },
                points: "$points",
                user: "$$ROOT",
              },
            },
          ];
      const escapedSearch = [...search]
        .map((char) =>
          ".*+?^${}()|[]".includes(char) || char.charCodeAt(0) === 92
            ? String.fromCharCode(92) + char
            : char,
        )
        .join("");
      const pattern = search ? new RegExp(escapedSearch, "i") : undefined;
      const searchStages: PipelineStage.FacetPipelineStage[] = pattern
        ? [
            {
              $match: {
                $or: [
                  { "user.displayName": pattern },
                  { "user.username": pattern },
                ],
              },
            },
          ]
        : [];
      type RankedRow = {
        _id: string;
        points: number;
        rank: number;
        user: Record<string, unknown>;
      };
      const pipeline: PipelineStage[] = [
        ...source,
        { $set: { rankingKey: { points: "$points", id: "$_id" } } },
        {
          $setWindowFields: {
            sortBy: { rankingKey: -1 },
            output: { rank: { $documentNumber: {} } },
          },
        },
        {
          $facet: {
            leaders: [
              ...searchStages,
              { $sort: { rank: 1 } },
              { $skip: (page - 1) * 20 },
              { $limit: 20 },
            ],
            total: [...searchStages, { $count: "count" }],
            current: [
              { $match: { _id: auth?.user.id ?? null } },
              { $limit: 1 },
            ],
          },
        },
      ];
      const [result] = weekly
        ? await MatchResult.aggregate<{
            leaders: RankedRow[];
            total: { count: number }[];
            current: RankedRow[];
          }>(pipeline)
        : await User.aggregate<{
            leaders: RankedRow[];
            total: { count: number }[];
            current: RankedRow[];
          }>(pipeline);
      const serialize = (row: RankedRow) => ({
        ...publicPlayer(User.hydrate(row.user)),
        periodPoints: row.points,
        rank: row.rank,
      });
      res.json({
        page,
        total: result?.total[0]?.count ?? 0,
        leaders: (result?.leaders ?? []).map(serialize),
        currentPlayer: result?.current[0] ? serialize(result.current[0]) : null,
      });
    }),
  );
  api.get("/achievements", (_req, res) => res.json({ achievements }));
  api.use(requireUser);
  api.use(
    "/realtime",
    rateLimit({
      windowMs: 60000,
      limit: 600,
      keyGenerator: (req) => req.user!.id,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many game actions. Please slow down." },
    }),
  );
  api.get(
    "/realtime/state",
    wrap(async (req, res) => {
      res.json({ room: await durable.sync(req.user!.id) });
    }),
  );
  api.post(
    "/realtime/command",
    wrap(async (req, res) => {
      const { event, payload } = z
        .object({
          event: z.enum([
            "room:create",
            "room:join",
            "room:sync",
            "room:leave",
            "room:ready",
            "match:start",
            "match:rematch",
            "answer:submit",
            "chat:send",
            "room:pause",
            "room:resume",
            "match:restart",
            "match:restart-request",
            "match:cancel",
          ]),
          payload: z.unknown(),
        })
        .strict()
        .parse(req.body);
      res.json(await durable.execute(req.user!.id, event, payload));
    }),
  );
  api.get("/users/me", (req, res) => res.json({ user: account(req.user!) }));
  api.get(
    "/rooms/:code/preview",
    wrap(async (req, res) => {
      const code = z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^DUO-[A-Z2-9]{6}$/)
        .parse(req.params.code);
      res.json(
        await (durableMode ? durable : rooms).preview(req.user!.id, code),
      );
    }),
  );
  api.get(
    "/users/me/stats",
    wrap(async (req, res) => {
      const user = req.user!;
      const [result] = await MatchResult.aggregate<{ bestScore: number }>([
        { $match: { userId: user.id } },
        { $group: { _id: null, bestScore: { $max: "$score" } } },
      ]);
      const rank =
        user.visibility === "public"
          ? 1 +
            (await User.countDocuments({
              status: "active",
              visibility: "public",
              $or: [
                { points: { $gt: user.points } },
                { points: user.points, _id: { $gt: user._id } },
              ],
            }))
          : null;
      res.json({
        bestScore: result?.bestScore ?? 0,
        rank,
        winRate: user.matches
          ? Math.round((user.wins / user.matches) * 100)
          : 0,
      });
    }),
  );
  api.patch(
    "/users/me",
    wrap(async (req, res) => {
      const data = z
        .object({
          displayName: z.string().trim().min(2).max(32).optional(),
          avatar: z
            .enum(["sparkles", "heart", "bolt", "brain", "crown", "moon"])
            .optional(),
          theme: z.enum(["system", "light", "dark"]).optional(),
          visibility: z.enum(["public", "private"]).optional(),
        })
        .strict()
        .parse(req.body);
      const user = await User.findByIdAndUpdate(req.user!.id, data, {
        new: true,
      });
      res.json({ user: account(user!) });
    }),
  );
  api.delete(
    "/users/me",
    wrap(async (req, res) => {
      const { password } = z
        .object({ password: z.string().min(1).max(128) })
        .parse(req.body);
      const user = await User.findById(req.user!.id).select("+passwordHash");
      if (!user || !(await verifyPassword(password, user.passwordHash)))
        throw new AppError("Incorrect password.", 403);
      if (rooms.membership.has(user.id) || (await durable.hasRoom(user.id)))
        throw new AppError("Leave your room before deleting your account.");
      await mongoose.connection.transaction(async (session) => {
        await User.deleteOne({ _id: user.id }, { session });
        await Session.deleteMany({ userId: user.id }, { session });
        await PlayerPresence.deleteOne({ _id: user.id }, { session });
        await ResetToken.deleteMany({ userId: user.id }, { session });
        await Friendship.deleteMany(
          { $or: [{ requesterId: user.id }, { recipientId: user.id }] },
          { session },
        );
        await Block.deleteMany(
          { $or: [{ userId: user.id }, { targetId: user.id }] },
          { session },
        );
        await ChallengeCompletion.deleteMany({ userId: user.id }, { session });
        await MatchResult.deleteMany({ userId: user.id }, { session });
      });
      res.clearCookie(cookieName, { ...getCookieOptions(), maxAge: undefined });
      res.json({ ok: true });
    }),
  );
  api.get("/users/me/achievements", (req, res) =>
    res.json({ achievements: req.user!.achievements }),
  );
  api.get(
    "/users/me/history",
    wrap(async (req, res) => {
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(10000)
        .default(1)
        .parse(req.query.page);
      const results = await MatchResult.find({ userId: req.user!.id })
        .sort({ completedAt: -1 })
        .skip((page - 1) * 20)
        .limit(20);
      res.json({ results, page });
    }),
  );
  api.get(
    "/users/:username",
    wrap(async (req, res) => {
      const u = await User.findOne({
        normalizedUsername: z.string().parse(req.params.username).toLowerCase(),
        status: "active",
      });
      if (!u || (u.visibility === "private" && u.id !== req.user!.id))
        throw new AppError("Profile not found.", 404);
      res.json({ user: publicPlayer(u) });
    }),
  );
  api.get(
    "/users/discover/all",
    wrap(async (req, res) => {
      const id = req.user!.id;
      const search = z.string().max(40).default("").parse(req.query.q);
      const page = z.coerce
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(1)
        .parse(req.query.page);
      // Get existing friendship/block IDs to exclude
      const [friendships, blocks] = await Promise.all([
        Friendship.find({ $or: [{ requesterId: id }, { recipientId: id }] }),
        Block.find({ $or: [{ userId: id }, { targetId: id }] }),
      ]);
      const excludeIds = new Set<string>([id]);
      for (const f of friendships) {
        excludeIds.add(f.requesterId === id ? f.recipientId : f.requesterId);
      }
      for (const b of blocks) {
        const blockedId = b.userId === id ? b.targetId : b.userId;
        if (blockedId) excludeIds.add(blockedId);
      }
      const query: Record<string, unknown> = {
        status: "active",
        _id: {
          $nin: [...excludeIds].map((eid) => new mongoose.Types.ObjectId(eid)),
        },
      };
      if (search) {
        const escaped = [...search]
          .map((c) =>
            ".*+?^${}()|[]".includes(c) || c.charCodeAt(0) === 92
              ? "\\" + c
              : c,
          )
          .join("");
        query.$or = [
          { displayName: new RegExp(escaped, "i") },
          { username: new RegExp(escaped, "i") },
        ];
      }
      const [users, total] = await Promise.all([
        User.find(query)
          .select("username displayName avatar visibility createdAt")
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * 20)
          .limit(20),
        User.countDocuments(query),
      ]);
      const onlineIds = new Set(
        [...io.sockets.sockets.values()].map((s) => s.data.userId as string),
      );
      const presence = await PlayerPresence.find({
        _id: { $in: users.map((u) => u.id) },
        expiresAt: { $gt: new Date() },
      }).select("_id");
      for (const row of presence) onlineIds.add(row.id);
      res.json({
        users: users.map((u) => ({
          id: u.id,
          username: u.username,
          displayName: u.displayName,
          avatar: u.avatar,
          visibility: u.visibility,
          online: onlineIds.has(u.id),
        })),
        total,
        page,
      });
    }),
  );
  api.post(
    "/matches",
    wrap(async (req, res) =>
      res.status(201).json({
        room: durableMode
          ? (
              await durable.execute(
                req.user!.id,
                "room:create",
                roomSchema.parse(req.body),
              )
            ).room
          : await rooms.create(req.user!.id, roomSchema.parse(req.body)),
      }),
    ),
  );
  api.post(
    "/matches/join",
    wrap(async (req, res) => {
      const { code } = z
        .object({ code: z.string().trim().toUpperCase().max(12) })
        .parse(req.body);
      res.json({
        room: durableMode
          ? (await durable.execute(req.user!.id, "room:join", { code })).room
          : await rooms.join(req.user!.id, code),
      });
    }),
  );
  api.get(
    "/matches/:matchId",
    wrap(async (req, res) => {
      const m = await Match.findOne({
        _id: req.params.matchId,
        participantIds: req.user!.id,
      });
      if (!m) throw new AppError("Match not found.", 404);
      res.json({ match: m });
    }),
  );
  api.get(
    "/matches/:matchId/results",
    wrap(async (req, res) => {
      const m = await Match.findOne({
        _id: req.params.matchId,
        participantIds: req.user!.id,
        status: "completed",
      });
      if (!m) throw new AppError("Completed match not found.", 404);
      res.json({
        match: m,
        results: await MatchResult.find({ matchId: m.id }).sort({
          placement: 1,
        }),
      });
    }),
  );
  api.get(
    "/challenges/daily",
    wrap(async (req, res) => {
      const daily = dailyInfo();
      res.json({
        ...daily,
        completed: !!(await ChallengeCompletion.exists({
          userId: req.user!.id,
          day: daily.day,
        })),
      });
    }),
  );
  api.post(
    "/challenges/:challengeId/complete",
    wrap(async (req, res) => {
      const completion = await ChallengeCompletion.findOne({
        userId: req.user!.id,
        day: req.params.challengeId,
      });
      if (!completion)
        throw new AppError("Finish an eligible match to earn this reward.");
      res.json({ completion });
    }),
  );
  api.get(
    "/friends",
    wrap(async (req, res) => {
      const id = req.user!.id;
      const rows = await Friendship.find({
        $or: [{ requesterId: id }, { recipientId: id }],
      });
      const ids = rows.map((f) =>
        f.requesterId === id ? f.recipientId : f.requesterId,
      );
      const users = await User.find({ _id: { $in: ids }, status: "active" });
      const blocks = await Block.find({ userId: id });
      const present = new Set(
        (
          await PlayerPresence.find({
            _id: { $in: ids },
            expiresAt: { $gt: new Date() },
          }).select("_id")
        ).map((row) => row.id),
      );
      res.json({
        friends: rows.flatMap((f) => {
          const u = users.find(
            (u) =>
              u.id === (f.requesterId === id ? f.recipientId : f.requesterId),
          );
          return u
            ? [
                {
                  id: f.id,
                  status: f.status,
                  incoming: f.recipientId === id,
                  user: publicPlayer(u),
                  online:
                    present.has(u.id) ||
                    [...io.sockets.sockets.values()].some(
                      (s) => s.data.userId === u.id,
                    ),
                },
              ]
            : [];
        }),
        blocked: await User.find({
          _id: { $in: blocks.map((b) => b.targetId) },
        }).then((us) => us.map(publicPlayer)),
      });
    }),
  );
  api.post(
    "/friends/requests",
    wrap(async (req, res) => {
      const { username } = z
        .object({ username: z.string().trim().min(3).max(24) })
        .parse(req.body);
      const target = await User.findOne({
        normalizedUsername: username.toLowerCase(),
        status: "active",
      });
      if (!target || target.id === req.user!.id)
        throw new AppError("Player not found.");
      const id = req.user!.id;
      if (
        await Block.exists({
          $or: [
            { userId: id, targetId: target.id },
            { userId: target.id, targetId: id },
          ],
        })
      )
        throw new AppError("This player cannot receive your request.", 403);
      const key = [id, target.id].sort().join(":");
      if (await Friendship.exists({ key }))
        throw new AppError("A friendship or request already exists.", 409);
      const f = await Friendship.create({
        key,
        requesterId: id,
        recipientId: target.id,
      });
      res.status(201).json({ request: f });
    }),
  );
  api.post(
    "/friends/requests/:requestId/:action",
    wrap(async (req, res) => {
      const action = z.enum(["accept", "decline"]).parse(req.params.action);
      const f = await Friendship.findOne({
        _id: objectId.parse(req.params.requestId),
        recipientId: req.user!.id,
        status: "pending",
      });
      if (!f) throw new AppError("Request not found.", 404);
      if (action === "accept") {
        f.status = "accepted";
        await f.save();
      } else await f.deleteOne();
      res.json({ ok: true });
    }),
  );
  api.delete(
    "/friends/:userId",
    wrap(async (req, res) => {
      const id = objectId.parse(req.params.userId);
      await Friendship.deleteOne({ key: [id, req.user!.id].sort().join(":") });
      res.json({ ok: true });
    }),
  );
  api.post(
    "/blocks",
    wrap(async (req, res) => {
      const { userId } = z.object({ userId: objectId }).parse(req.body);
      if (userId === req.user!.id || !(await User.exists({ _id: userId })))
        throw new AppError("Player not found.");
      await Block.updateOne(
        { userId: req.user!.id, targetId: userId },
        { $set: { userId: req.user!.id, targetId: userId } },
        { upsert: true },
      );
      await Friendship.deleteOne({
        key: [userId, req.user!.id].sort().join(":"),
      });
      res.json({ ok: true });
    }),
  );
  api.delete(
    "/blocks/:userId",
    wrap(async (req, res) => {
      await Block.deleteOne({
        userId: req.user!.id,
        targetId: objectId.parse(req.params.userId),
      });
      res.json({ ok: true });
    }),
  );
  api.post(
    "/reports",
    wrap(async (req, res) => {
      const data = z
        .object({
          targetId: objectId,
          category: z.enum(["abuse", "cheating", "impersonation", "other"]),
          description: z.string().trim().min(5).max(1000),
        })
        .parse(req.body);
      if (!(await User.exists({ _id: data.targetId })))
        throw new AppError("Player not found.", 404);
      await Report.create({ ...data, reporterId: req.user!.id });
      res.status(201).json({ ok: true });
    }),
  );
  api.use("/admin", requireAdmin);
  api.get(
    "/admin/stats",
    wrap(async (_req, res) =>
      res.json({
        users: await User.countDocuments(),
        matches: await Match.countDocuments({ status: "completed" }),
        openReports: await Report.countDocuments({ status: "open" }),
        activeRooms: durableMode
          ? await LiveGameRoom.countDocuments({
              expiresAt: { $gt: new Date() },
            })
          : rooms.rooms.size,
      }),
    ),
  );
  api.get(
    "/admin/questions",
    wrap(async (_req, res) =>
      res.json({ questions: await Question.find().sort({ createdAt: -1 }) }),
    ),
  );
  api.post(
    "/admin/questions",
    wrap(async (req, res) => {
      const question = await Question.create({
        ...questionSchema.parse(req.body),
        key: randomBytes(16).toString("hex"),
      });
      await Audit.create({
        actorId: req.user!.id,
        action: "question:create",
        targetId: question.id,
      });
      res.status(201).json({ question });
    }),
  );
  api.patch(
    "/admin/questions/:id",
    wrap(async (req, res) => {
      const question = await Question.findByIdAndUpdate(
        objectId.parse(req.params.id),
        questionSchema.partial().parse(req.body),
        { new: true, runValidators: true },
      );
      if (!question) throw new AppError("Question not found.", 404);
      await Audit.create({
        actorId: req.user!.id,
        action: "question:update",
        targetId: question.id,
      });
      res.json({ question });
    }),
  );
  api.get(
    "/admin/reports",
    wrap(async (_req, res) =>
      res.json({
        reports: await Report.find().sort({ createdAt: -1 }).limit(100),
      }),
    ),
  );
  api.patch(
    "/admin/reports/:id",
    wrap(async (req, res) => {
      const { status } = z
        .object({ status: z.enum(["open", "resolved", "dismissed"]) })
        .parse(req.body);
      await Report.updateOne(
        { _id: objectId.parse(req.params.id) },
        { status, moderatorId: req.user!.id },
      );
      await Audit.create({
        actorId: req.user!.id,
        action: `report:${status}`,
        targetId: req.params.id,
      });
      res.json({ ok: true });
    }),
  );
  api.get(
    "/admin/users",
    wrap(async (_req, res) =>
      res.json({
        users: (await User.find().sort({ createdAt: -1 }).limit(100)).map(
          (u) => ({ ...publicPlayer(u), status: u.status }),
        ),
      }),
    ),
  );
  api.patch(
    "/admin/users/:id",
    wrap(async (req, res) => {
      const { status } = z
        .object({ status: z.enum(["active", "suspended"]) })
        .parse(req.body);
      const id = objectId.parse(req.params.id);
      if (id === req.user!.id)
        throw new AppError("You cannot suspend your own account.");
      await User.updateOne({ _id: id }, { status });
      if (status === "suspended") {
        await Session.deleteMany({ userId: id });
        for (const s of io.sockets.sockets.values())
          if (s.data.userId === id) s.disconnect();
      }
      await Audit.create({
        actorId: req.user!.id,
        action: `user:${status}`,
        targetId: id,
      });
      res.json({ ok: true });
    }),
  );
  api.get(
    "/admin/audit",
    wrap(async (_req, res) =>
      res.json({
        audit: await Audit.find().sort({ createdAt: -1 }).limit(100),
      }),
    ),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  const staticDirectory =
    options.staticDirectory ?? path.resolve(process.cwd(), "../frontend/dist");
  app.use(express.static(staticDirectory));
  app.get("*", (_req, res, next) =>
    res.sendFile(path.join(staticDirectory, "index.html"), (e) => e && next(e)),
  );
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (error instanceof z.ZodError)
        return res.status(400).json({
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join(" "),
        });
      if (error instanceof AppError)
        return res.status(error.status).json({ error: error.message });
      if ((error as { code?: number }).code === 11000)
        return res.status(409).json({ error: "This record already exists." });
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: "Invalid JSON." });
      console.error(
        "Request failed:",
        error instanceof Error ? error.name : "unknown",
      );
      res
        .status(500)
        .json({ error: "The server could not complete this request." });
    },
  );
  return {
    app,
    server,
    io,
    rooms,
    durable,
    close: async () => {
      rooms.close();
      await new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
