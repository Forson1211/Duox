import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { HydratedDocument, InferSchemaType } from "mongoose";
import type { Request, Response, NextFunction } from "express";
import type { Account, Player } from "@duo-clash/shared";
import { User, Session } from "./models.js";
const scrypt = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCallback(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export const production =
  process.env.NODE_ENV === "production" || !!process.env.VERCEL;
export const cookieName = "duo_session";
export const allowedOrigins = (
  process.env.FRONTEND_ORIGIN ?? "http://localhost:5173"
)
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

export const origin = allowedOrigins[0] ?? "http://localhost:5173";

export function isAllowedOrigin(reqOrigin?: string): boolean {
  if (!reqOrigin) return true;
  const clean = reqOrigin.trim().replace(/\/$/, "");
  if (allowedOrigins.includes(clean)) return true;
  if (production) return false;
  try {
    const parsed = new URL(clean);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      parsed.hostname,
    );
    const isPrivateIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(
      parsed.hostname,
    );
    return (
      (isLoopback || isPrivateIP) &&
      ["http:", "https:"].includes(parsed.protocol)
    );
  } catch {
    return false;
  }
}
export const hashToken = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  const actual = (await scrypt(password, salt)) as Buffer;
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function cookieToken(header?: string) {
  return header
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
}
export async function authenticate(header?: string) {
  const token = cookieToken(header);
  if (!token) return null;
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  });
  if (!session) return null;
  const user = await User.findOne({ _id: session.userId, status: "active" });
  return user ? { user, sessionId: session.id } : null;
}
export type UserDocument = HydratedDocument<
  InferSchemaType<typeof User.schema>
>;
export function publicPlayer(u: UserDocument): Player {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    points: u.points,
    rating: u.rating,
    matches: u.matches,
    wins: u.wins,
    level: Math.floor(u.points / 1000) + 1,
    achievements: [...u.achievements],
    role: u.role as Player["role"],
    visibility: u.visibility as Player["visibility"],
  };
}
export function account(u: UserDocument): Account {
  return {
    ...publicPlayer(u),
    email: u.email,
    theme: u.theme as Account["theme"],
  };
}
export async function createSession(userId: string, res: Response) {
  const token = randomBytes(32).toString("hex");
  await Session.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });
  setSessionCookie(res, token);
}
export function getCookieOptions() {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 7 * 86400000,
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(cookieName, token, getCookieOptions());
}

declare global {
  namespace Express {
    interface Request {
      user?: UserDocument;
      sessionId?: string;
    }
  }
}
export async function requireUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const auth = await authenticate(req.headers.cookie);
    if (!auth) throw new AppError("Please log in to continue.", 401);
    req.user = auth.user;
    req.sessionId = auth.sessionId;
    next();
  } catch (e) {
    next(e);
  }
}
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin")
    return next(new AppError("Administrator access required.", 403));
  next();
}
