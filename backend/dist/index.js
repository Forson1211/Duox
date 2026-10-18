import { createRequire as __createRequire } from "node:module";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { dirname as __dirnameFunction } from "node:path";
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirnameFunction(__filename);


// src/index.ts
import "dotenv/config";
import mongoose5 from "mongoose";

// src/app.ts
import http from "node:http";
import path from "node:path";
import { randomBytes as randomBytes2 } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose3 from "mongoose";
import nodemailer from "nodemailer";
import { z as z2 } from "zod";
import { Server } from "socket.io";
import {
  registerSchema,
  loginSchema,
  games,
  achievements,
  roomSchema as roomSchema2,
  weekStart
} from "@duo-clash/shared";

// src/models.ts
import mongoose, { Schema } from "mongoose";
var userSchema = new Schema(
  {
    username: { type: String, required: true },
    normalizedUsername: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    avatar: { type: String, default: "sparkles" },
    role: { type: String, enum: ["player", "admin"], default: "player" },
    status: { type: String, enum: ["active", "suspended"], default: "active" },
    theme: {
      type: String,
      enum: ["system", "light", "dark"],
      default: "system"
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public"
    },
    points: { type: Number, default: 0 },
    rating: { type: Number, default: 1e3 },
    matches: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    quizCorrect: { type: Number, default: 0 },
    achievements: { type: [String], default: [] }
  },
  { timestamps: true }
);
userSchema.index({ points: -1, _id: 1 });
var User = mongoose.model("User", userSchema);
var Session = mongoose.model(
  "Session",
  new Schema(
    {
      tokenHash: { type: String, unique: true, required: true },
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true
      },
      expiresAt: { type: Date, required: true, expires: 0 }
    },
    { timestamps: true }
  )
);
var ResetToken = mongoose.model(
  "ResetToken",
  new Schema({
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true, expires: 0 }
  })
);
var Match = mongoose.model(
  "Match",
  new Schema(
    {
      _id: String,
      roomCode: { type: String, unique: true, sparse: true },
      hostId: String,
      participantIds: [String],
      settings: Schema.Types.Mixed,
      status: { type: String, default: "waiting" },
      rounds: [Schema.Types.Mixed],
      ratingChanges: Schema.Types.Mixed,
      expiresAt: Date,
      completedAt: Date
    },
    { timestamps: true }
  )
);
var resultSchema = new Schema({
  matchId: { type: String, required: true },
  userId: { type: String, required: true },
  score: Number,
  points: Number,
  placement: Number,
  won: Boolean,
  roundScores: [Number],
  ratingBefore: Number,
  ratingAfter: Number,
  completedAt: { type: Date, required: true }
});
resultSchema.index({ matchId: 1, userId: 1 }, { unique: true });
resultSchema.index({ userId: 1, completedAt: -1 });
resultSchema.index({ completedAt: -1, userId: 1 });
var MatchResult = mongoose.model("MatchResult", resultSchema);
var Question = mongoose.model(
  "Question",
  new Schema(
    {
      key: { type: String, unique: true },
      category: { type: String, required: true },
      prompt: { type: String, required: true },
      options: { type: [String], required: true },
      answer: { type: Number, required: true },
      explanation: String,
      active: { type: Boolean, default: true }
    },
    { timestamps: true }
  )
);
var Friendship = mongoose.model(
  "Friendship",
  new Schema(
    {
      key: { type: String, unique: true, required: true },
      requesterId: { type: String, required: true },
      recipientId: { type: String, required: true },
      status: {
        type: String,
        enum: ["pending", "accepted"],
        default: "pending"
      }
    },
    { timestamps: true }
  )
);
var completionSchema = new Schema(
  { userId: String, day: String, matchId: String, reward: Number },
  { timestamps: true }
);
completionSchema.index({ userId: 1, day: 1 }, { unique: true });
var ChallengeCompletion = mongoose.model(
  "ChallengeCompletion",
  completionSchema
);
var blockSchema = new Schema({ userId: String, targetId: String });
blockSchema.index({ userId: 1, targetId: 1 }, { unique: true });
var Block = mongoose.model("Block", blockSchema);
var Report = mongoose.model(
  "Report",
  new Schema(
    {
      reporterId: String,
      targetId: String,
      category: String,
      description: String,
      status: { type: String, default: "open" },
      moderatorId: String
    },
    { timestamps: true }
  )
);
var Audit = mongoose.model(
  "Audit",
  new Schema(
    { actorId: String, action: String, targetId: String },
    { timestamps: true }
  )
);
var allModels = [
  User,
  Session,
  ResetToken,
  Match,
  MatchResult,
  Question,
  Friendship,
  ChallengeCompletion,
  Block,
  Report,
  Audit
];

// src/auth.ts
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash
} from "node:crypto";
var scrypt = (password, salt) => new Promise(
  (resolve, reject) => scryptCallback(
    password,
    salt,
    64,
    { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
    (error, key) => error ? reject(error) : resolve(key)
  )
);
var production = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
var cookieName = "duo_session";
var allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:5173").split(",").map((value) => value.trim().replace(/\/$/, "")).filter(Boolean);
var origin = allowedOrigins[0] ?? "http://localhost:5173";
function isAllowedOrigin(reqOrigin) {
  if (!reqOrigin) return true;
  const clean = reqOrigin.trim().replace(/\/$/, "");
  if (allowedOrigins.includes(clean)) return true;
  if (production) return false;
  try {
    const parsed = new URL(clean);
    const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      parsed.hostname
    );
    const isPrivateIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(
      parsed.hostname
    );
    return (isLoopback || isPrivateIP) && ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
var hashToken = (s) => createHash("sha256").update(s).digest("hex");
var AppError = class extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
  status;
};
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt);
  return `${salt}:${key.toString("hex")}`;
}
async function verifyPassword(password, hash) {
  const [salt, key] = hash.split(":");
  const actual = await scrypt(password, salt);
  const expected = Buffer.from(key, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function cookieToken(header) {
  return header?.split(";").map((s) => s.trim()).find((s) => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
}
async function authenticate(header) {
  const token = cookieToken(header);
  if (!token) return null;
  const session = await Session.findOne({
    tokenHash: hashToken(token),
    expiresAt: { $gt: /* @__PURE__ */ new Date() }
  });
  if (!session) return null;
  const user = await User.findOne({ _id: session.userId, status: "active" });
  return user ? { user, sessionId: session.id } : null;
}
function publicPlayer(u) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatar: u.avatar,
    points: u.points,
    rating: u.rating,
    matches: u.matches,
    wins: u.wins,
    level: Math.floor(u.points / 1e3) + 1,
    achievements: [...u.achievements],
    role: u.role,
    visibility: u.visibility
  };
}
function account(u) {
  return {
    ...publicPlayer(u),
    email: u.email,
    theme: u.theme
  };
}
async function createSession(userId, res) {
  const token = randomBytes(32).toString("hex");
  await Session.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 7 * 864e5)
  });
  setSessionCookie(res, token);
}
function getCookieOptions() {
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 864e5
  };
}
function setSessionCookie(res, token) {
  res.cookie(cookieName, token, getCookieOptions());
}
async function requireUser(req, res, next) {
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
function requireAdmin(req, _res, next) {
  if (req.user?.role !== "admin")
    return next(new AppError("Administrator access required.", 403));
  next();
}

// src/rooms.ts
import { randomInt as randomInt2, randomUUID as randomUUID2 } from "node:crypto";
import mongoose2 from "mongoose";
import { z } from "zod";
import {
  answerSchema,
  roomSchema,
  eloDelta,
  gameIds
} from "@duo-clash/shared";

// src/games.ts
import { randomInt, randomUUID } from "node:crypto";
import {
  speedScore
} from "@duo-clash/shared";

// src/content.ts
var questions = [
  [
    "Science",
    "Which planet has the most prominent ring system?",
    ["Mars", "Venus", "Saturn", "Mercury"],
    2,
    "Saturn has bright rings made largely of ice."
  ],
  [
    "Geography",
    "Which ocean lies between Africa and Australia?",
    ["Atlantic", "Indian", "Arctic", "Southern"],
    1,
    "The Indian Ocean extends between eastern Africa and western Australia."
  ],
  [
    "Technology",
    "In computing, what does CPU stand for?",
    [
      "Central Processing Unit",
      "Computer Power Utility",
      "Core Program User",
      "Central Pixel Unit"
    ],
    0,
    "The CPU executes program instructions."
  ],
  [
    "General Knowledge",
    "How many sides does a hexagon have?",
    ["Five", "Seven", "Eight", "Six"],
    3,
    "Hexa means six."
  ],
  [
    "Science",
    "Which gas do plants take in during photosynthesis?",
    ["Oxygen", "Carbon dioxide", "Helium", "Hydrogen"],
    1,
    "Plants use carbon dioxide and water to produce sugars."
  ],
  [
    "Sports",
    "How many players from one team start on the field in association football?",
    ["Nine", "Ten", "Eleven", "Twelve"],
    2,
    "A football team starts with eleven players, including its goalkeeper."
  ],
  [
    "Word Knowledge",
    "Which word is a palindrome?",
    ["River", "Level", "Cloud", "Bright"],
    1,
    "Level reads the same in both directions."
  ],
  [
    "Family-Friendly Trivia",
    "What do bees collect from flowers to make honey?",
    ["Nectar", "Seeds", "Leaves", "Dew"],
    0,
    "Bees process nectar into honey."
  ],
  [
    "Entertainment",
    "Which instrument usually has 88 keys?",
    ["Flute", "Violin", "Trumpet", "Piano"],
    3,
    "A standard modern piano has 88 keys."
  ],
  [
    "Geography",
    "Accra is the capital of which country?",
    ["Kenya", "Ghana", "Senegal", "Uganda"],
    1,
    "Accra is Ghana's capital, on the Gulf of Guinea."
  ],
  [
    "Science",
    "At sea level, pure water freezes at which temperature?",
    ["0\xB0C", "10\xB0C", "50\xB0C", "100\xB0C"],
    0,
    "At standard pressure the freezing point is zero degrees Celsius."
  ],
  [
    "Technology",
    "Which number system uses only 0 and 1?",
    ["Decimal", "Hexadecimal", "Binary", "Roman"],
    2,
    "Binary is a base-two number system."
  ],
  [
    "General Knowledge",
    "Which shape has no corners?",
    ["Triangle", "Square", "Circle", "Rectangle"],
    2,
    "A circle is a continuous curve."
  ],
  [
    "Sports",
    "In tennis, what comes after deuce when one player wins the next point?",
    ["Match", "Advantage", "Love", "Set"],
    1,
    "The player has advantage."
  ],
  [
    "Word Knowledge",
    "Which word means the opposite of ancient?",
    ["Old", "Historic", "Modern", "Early"],
    2,
    "Modern refers to the present or recent times."
  ],
  [
    "Family-Friendly Trivia",
    "Which animal is a mammal?",
    ["Shark", "Dolphin", "Trout", "Octopus"],
    1,
    "Dolphins breathe air and feed milk to their young."
  ],
  [
    "Entertainment",
    "Which kind of story is traditionally performed by actors on a stage?",
    ["Play", "Atlas", "Dictionary", "Recipe"],
    0,
    "A play is written for performance."
  ],
  [
    "Couple Questions",
    "Which is a constructive way to resolve a disagreement?",
    [
      "Interrupt continuously",
      "Listen and explain calmly",
      "Guess what the other person thinks",
      "Keep score of past mistakes"
    ],
    1,
    "Listening and respectful communication help resolve disagreements."
  ],
  [
    "Science",
    "What force keeps planets in orbit around the Sun?",
    ["Magnetism", "Friction", "Gravity", "Buoyancy"],
    2,
    "Gravity attracts objects with mass."
  ],
  [
    "Geography",
    "Which continent is home to the Sahara?",
    ["Asia", "Africa", "Europe", "Australia"],
    1,
    "The Sahara stretches across North Africa."
  ],
  [
    "General Knowledge",
    "What is the hardest natural substance on Earth?",
    ["Gold", "Diamond", "Iron", "Platinum"],
    1,
    "Diamond is formed under extreme heat and pressure."
  ],
  [
    "Technology",
    "What does 'HTTP' stand for in web addresses?",
    [
      "Hypertext Transfer Protocol",
      "High Tech Transmission Path",
      "Hyper Text Terminal Process",
      "Home Tool Transfer Package"
    ],
    0,
    "HTTP is the foundational protocol used by the World Wide Web."
  ],
  [
    "Geography",
    "What is the longest river in the world?",
    ["Amazon", "Nile", "Yangtze", "Mississippi"],
    1,
    "The Nile River in Africa is traditionally recognized as the longest."
  ],
  [
    "Science",
    "Which organ cleans and filters human blood?",
    ["Lungs", "Kidneys", "Stomach", "Pancreas"],
    1,
    "Kidneys remove waste and excess fluid from blood."
  ],
  [
    "Sports",
    "In basketball, how many points is a standard free throw worth?",
    ["1", "2", "3", "0.5"],
    0,
    "Each successful free throw awards one point."
  ],
  [
    "Entertainment",
    "Which superhero is known as the 'Caped Crusader'?",
    ["Superman", "Spider-Man", "Batman", "Iron Man"],
    2,
    "Batman protects Gotham City as the Caped Crusader."
  ],
  [
    "Word Knowledge",
    "What is a synonym for 'meticulous'?",
    ["Careless", "Thorough", "Hurried", "Loud"],
    1,
    "Meticulous means showing great attention to detail."
  ],
  [
    "Family-Friendly Trivia",
    "How many legs does a spider have?",
    ["6", "8", "10", "12"],
    1,
    "Spiders are arachnids and have eight legs."
  ],
  [
    "Couple Questions",
    "Which of the following is commonly known as one of the 5 Love Languages?",
    ["Quality Time", "Social Media", "Silent Treatment", "Winning Arguments"],
    0,
    "Quality Time is one of Gary Chapman's 5 Love Languages."
  ],
  [
    "Couple Questions",
    "What is generally considered best practice when planning a date night?",
    ["Cancel last minute without telling", "Try something new together", "Check emails during dinner", "Never ask the other person"],
    1,
    "Trying new shared experiences creates bonding and lasting memories."
  ],
  [
    "Science",
    "What is the chemical symbol for gold?",
    ["Ag", "Au", "Fe", "Gd"],
    1,
    "Au comes from the Latin word for gold, 'aurum'."
  ],
  [
    "Technology",
    "Who is widely known as the co-founder of Apple alongside Steve Wozniak?",
    ["Bill Gates", "Steve Jobs", "Linus Torvalds", "Ada Lovelace"],
    1,
    "Steve Jobs co-founded Apple Computers in 1976."
  ],
  [
    "Geography",
    "Which country has the city of Tokyo as its capital?",
    ["South Korea", "Japan", "Thailand", "China"],
    1,
    "Tokyo is the bustling capital of Japan."
  ],
  [
    "Sports",
    "How long is a standard marathon race in miles (approximately)?",
    ["13.1 miles", "26.2 miles", "50 miles", "10 miles"],
    1,
    "A standard marathon is 26 miles and 385 yards (26.2 miles / 42.195 km)."
  ],
  [
    "Entertainment",
    "In animation, what kind of creature is SpongeBob?",
    ["Starfish", "Sea sponge", "Squid", "Crab"],
    1,
    "SpongeBob is a yellow sea sponge living in a pineapple."
  ],
  [
    "Word Knowledge",
    "Which of these words is an antonym of 'generous'?",
    ["Selfish", "Kind", "Courteous", "Open-hearted"],
    0,
    "Selfish is the direct antonym of generous."
  ],
  [
    "General Knowledge",
    "How many continents are there on Earth?",
    ["5", "6", "7", "8"],
    2,
    "There are 7 recognized continents: Asia, Africa, North America, South America, Antarctica, Europe, and Australia."
  ],
  [
    "Family-Friendly Trivia",
    "What is the fastest land animal in the world?",
    ["Lion", "Cheetah", "Gazelle", "Horse"],
    1,
    "The cheetah can reach speeds up to 70 mph (112 km/h)."
  ]
];
var words = [
  ["PLANET", "A world orbiting a star"],
  ["PURPLE", "Our favourite colour"],
  ["BRIDGE", "A way across a river"],
  ["GARDEN", "A place to grow flowers"],
  ["ROCKET", "A vehicle that can reach space"],
  ["FRIEND", "Someone you enjoy spending time with"],
  ["PUZZLE", "A problem made for solving"],
  ["SILVER", "A shiny precious metal"],
  ["JUNGLE", "A dense tropical forest"],
  ["CASTLE", "A fortified home for royalty"],
  ["ORANGE", "A citrus fruit and a colour"],
  ["MELODY", "A sequence of musical notes"],
  ["ISLAND", "Land surrounded by water"],
  ["PENCIL", "A tool for writing and sketching"],
  ["WINTER", "The coldest season"],
  ["CANDLE", "A wax source of light"],
  ["STREAM", "A small flowing waterway"],
  ["CROWN", "Headwear for a monarch"],
  ["SPARK", "A tiny flash of fire"],
  ["DREAM", "A story you experience while sleeping"],
  ["CHAMPION", "A winner of a contest or tournament"],
  ["THUNDER", "A booming sound during a lightning storm"],
  ["PIRATE", "A swashbuckler sailing the seven seas"],
  ["FOREST", "A large area covered chiefly with trees"],
  ["SHIELD", "Defensive armor held to block attacks"],
  ["CRYSTAL", "A clear mineral with geometric facets"],
  ["RHYTHM", "A strong, regular repeated pattern of sound"],
  ["VOLCANO", "A mountain with a crater that spews lava"],
  ["SUNSHINE", "Warm and direct light from the sun"],
  ["COMPASS", "An instrument showing magnetic directions"]
];
async function seedContent() {
  await Question.bulkWrite(
    questions.map((q, i) => ({
      updateOne: {
        filter: { key: `starter-${i + 1}` },
        update: {
          $set: {
            key: `starter-${i + 1}`,
            category: q[0],
            prompt: q[1],
            options: [...q[2]],
            answer: q[3],
            explanation: q[4],
            active: true
          }
        },
        upsert: true
      }
    }))
  );
}

// src/games.ts
async function newRound(gameId, round, duration, category, now = Date.now(), usedPrompts = []) {
  const c = {
    id: randomUUID(),
    gameId,
    prompt: "",
    startedAt: now,
    deadline: now + duration * 1e3
  };
  if (gameId === "quick-quiz") {
    const list = await Question.find({
      active: true,
      ...category !== "All" ? { category } : {}
    });
    if (!list.length)
      throw new AppError(
        "No active questions in this category. Choose another category."
      );
    const unused = list.filter((q2) => !usedPrompts.includes(q2.prompt));
    const pool = unused.length ? unused : list;
    const q = pool[randomInt(pool.length)];
    c.prompt = q.prompt;
    c.options = [...q.options];
    return { challenge: c, answer: q.answer, explanation: q.explanation ?? "" };
  }
  if (gameId === "memory-rush") {
    const sequence = Array.from(
      { length: Math.min(3 + Math.floor((round - 1) / 2), 9) },
      () => randomInt(4)
    );
    c.prompt = "Remember the tile sequence";
    c.sequence = sequence;
    c.sequenceLength = sequence.length;
    c.showUntil = now + sequence.length * 650 + 700;
    c.deadline += c.showUntil - now;
    return {
      challenge: c,
      answer: sequence,
      explanation: "Tiles are numbered 1 to 4."
    };
  }
  if (gameId === "word-blitz") {
    const [word, clue] = words[randomInt(words.length)];
    let letters = [...word];
    for (let i = letters.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    if (letters.join("") === word) letters = [...word.slice(1), word[0]];
    c.prompt = clue;
    c.letters = letters.join("");
    return { challenge: c, answer: word, explanation: "" };
  }
  c.prompt = "Wait for GO. Do not press early.";
  const signalAt = now + randomInt(2e3, 5001);
  c.deadline = signalAt + 5e3;
  return {
    challenge: c,
    answer: "GO",
    explanation: "Reaction time includes network latency.",
    signalAt
  };
}
function safeChallenge(secret, now = Date.now()) {
  const c = { ...secret.challenge };
  if (c.showUntil && now >= c.showUntil) delete c.sequence;
  if (secret.signalAt && now >= secret.signalAt) c.signalAt = secret.signalAt;
  return c;
}
function scoreAnswer(secret, value, now = Date.now()) {
  const c = secret.challenge;
  if (now < c.startedAt || now > c.deadline)
    throw new AppError("The answer window is closed.");
  let correct = false;
  let elapsed = now - c.startedAt;
  let duration = c.deadline - c.startedAt;
  let detail = "";
  if (c.gameId === "quick-quiz") {
    if (typeof value !== "number") throw new AppError("Choose an answer.");
    correct = value === secret.answer;
  }
  if (c.gameId === "word-blitz") {
    if (typeof value !== "string") throw new AppError("Enter a word.");
    correct = value.normalize("NFKC").trim().toUpperCase() === secret.answer;
  }
  if (c.gameId === "memory-rush") {
    if (now < c.showUntil)
      throw new AppError("Wait until the sequence is hidden.");
    if (!Array.isArray(value)) throw new AppError("Submit a sequence.");
    correct = JSON.stringify(value) === JSON.stringify(secret.answer);
    elapsed = now - c.showUntil;
    duration = c.deadline - c.showUntil;
  }
  if (c.gameId === "reflex-race") {
    if (value !== "tap") throw new AppError("Invalid reaction.");
    elapsed = now - secret.signalAt;
    duration = 5e3;
    if (elapsed < 80)
      return {
        correct: false,
        points: 0,
        detail: elapsed < 0 ? "False start" : "Below the 80 ms minimum; no points"
      };
    correct = true;
    detail = `${elapsed} ms (includes network latency)`;
  }
  return {
    correct,
    points: correct ? speedScore(elapsed, duration) : 0,
    detail: detail || (correct ? "Correct" : "Incorrect")
  };
}
function answerText(secret) {
  const a = secret.answer;
  return Array.isArray(a) ? a.map((x) => x + 1).join(" \u2192 ") : typeof a === "number" ? secret.challenge.options[a] : a;
}

// src/rooms.ts
function dailyInfo(now = /* @__PURE__ */ new Date()) {
  const day = now.toISOString().slice(0, 10);
  return {
    id: day,
    day,
    gameId: gameIds[Math.floor(Date.parse(day) / 864e5) % 4],
    reward: 200,
    description: "Complete a match and score at least 100 points in today\u2019s game. Reward is granted automatically once per UTC day."
  };
}
var RoomManager = class {
  constructor(io, timing = { starting: 2500, results: 3500 }) {
    this.io = io;
    this.timing = timing;
    this.timer = setInterval(() => {
      void this.tick();
    }, 100);
    this.timer.unref();
  }
  io;
  timing;
  rooms = /* @__PURE__ */ new Map();
  membership = /* @__PURE__ */ new Map();
  busy = /* @__PURE__ */ new Set();
  actions = /* @__PURE__ */ new Map();
  async exclusive(key, action) {
    const previous = this.actions.get(key) ?? Promise.resolve();
    const current = previous.catch(() => void 0).then(action);
    this.actions.set(key, current);
    try {
      return await current;
    } finally {
      if (this.actions.get(key) === current) this.actions.delete(key);
    }
  }
  timer;
  close() {
    clearInterval(this.timer);
  }
  state(room) {
    const activePlayers = [...room.members.values()].map((m) => ({
      ...m.player,
      ready: m.ready,
      connected: m.sockets.size > 0,
      score: m.score
    }));
    const players = room.status === "completed" && room.completedPlayers ? room.completedPlayers.map((p) => ({
      ...p,
      connected: (room.members.get(p.id)?.sockets.size ?? 0) > 0
    })) : activePlayers;
    const top = Math.max(...players.map((p) => p.score));
    return {
      id: room.id,
      code: room.code,
      hostId: room.hostId,
      settings: room.settings,
      status: room.status,
      players,
      round: room.round,
      challenge: room.secret && room.status === "playing" ? safeChallenge(room.secret) : null,
      submitted: [...room.answers.keys()],
      results: room.results,
      serverNow: Date.now(),
      nextAt: room.nextAt,
      winnerIds: room.status === "completed" ? players.filter((p) => p.score === top).map((p) => p.id) : [],
      persisted: room.persisted,
      ratingChanges: room.ratingChanges
    };
  }
  broadcast(room) {
    this.io.to(room.code).emit("room:state", this.state(room));
  }
  get(userId) {
    const r = this.rooms.get(this.membership.get(userId) ?? "");
    if (!r || !r.members.has(userId))
      throw new AppError("You are not in a room.", 404);
    return r;
  }
  async create(userId, settings, socket) {
    return this.exclusive(
      userId,
      () => this.createRoom(userId, settings, socket)
    );
  }
  async createRoom(userId, settings, socket) {
    if (this.membership.has(userId))
      throw new AppError("Leave your current room before creating another.");
    const user = await User.findById(userId);
    if (!user) throw new AppError("Account not found.", 401);
    let code = "";
    let id = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      code = "DUO-" + Array.from(
        { length: 6 },
        () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[randomInt2(32)]
      ).join("");
      id = randomUUID2();
      try {
        await Match.create({
          _id: id,
          roomCode: code,
          hostId: userId,
          participantIds: [userId],
          settings,
          expiresAt: new Date(Date.now() + 2 * 36e5)
        });
        break;
      } catch (e) {
        if (e.code !== 11e3 || attempt === 7) throw e;
      }
    }
    const room = {
      id,
      code,
      hostId: userId,
      settings,
      status: "waiting",
      members: /* @__PURE__ */ new Map([
        [
          userId,
          {
            player: publicPlayer(user),
            ready: true,
            sockets: new Set(socket ? [socket.id] : []),
            score: 0
          }
        ]
      ]),
      round: 0,
      secret: null,
      answers: /* @__PURE__ */ new Map(),
      results: [],
      expiresAt: Date.now() + 2 * 36e5,
      persisted: false,
      saving: false,
      ratingChanges: {},
      signalSent: false,
      memoryHidden: false
    };
    this.rooms.set(code, room);
    this.membership.set(userId, code);
    if (socket) await socket.join(code);
    this.broadcast(room);
    return this.state(room);
  }
  async join(userId, code, socket) {
    return this.exclusive(userId, () => this.joinRoom(userId, code, socket));
  }
  async joinRoom(userId, code, socket) {
    const room = this.rooms.get(code);
    if (!room || room.expiresAt < Date.now())
      throw new AppError("Room not found or expired.", 404);
    const current = this.membership.get(userId);
    if (current && current !== code)
      throw new AppError("Leave your current room first.");
    let member = room.members.get(userId);
    if (!member) {
      if (room.status !== "waiting")
        throw new AppError("This match has already started.");
      if (room.members.size >= room.settings.maxPlayers)
        throw new AppError("This room is full.");
      const ids = [...room.members.keys()];
      if (await Block.exists({
        $or: [
          { userId, targetId: { $in: ids } },
          { userId: { $in: ids }, targetId: userId }
        ]
      }))
        throw new AppError("You cannot join this room.", 403);
      const user = await User.findOne({ _id: userId, status: "active" });
      if (!user) throw new AppError("Account unavailable.", 401);
      if (room.status !== "waiting" || room.members.size >= room.settings.maxPlayers)
        throw new AppError("This room is no longer accepting players.");
      if (this.membership.has(userId) && this.membership.get(userId) !== code)
        throw new AppError("Leave your current room first.");
      member = {
        player: publicPlayer(user),
        ready: false,
        sockets: /* @__PURE__ */ new Set(),
        score: 0
      };
      room.members.set(userId, member);
      this.membership.set(userId, code);
      await Match.updateOne(
        { _id: room.id },
        { $addToSet: { participantIds: userId } }
      );
    }
    if (socket) {
      member.sockets.add(socket.id);
      delete member.disconnectedAt;
      await socket.join(code);
    }
    this.broadcast(room);
    return this.state(room);
  }
  async leave(userId) {
    const room = this.get(userId);
    const active = !["waiting", "completed", "cancelled"].includes(room.status);
    if (active)
      throw new AppError(
        "A match is in progress. You can reconnect until it finishes."
      );
    const m = room.members.get(userId);
    for (const id of m.sockets)
      await this.io.sockets.sockets.get(id)?.leave(room.code);
    room.members.delete(userId);
    this.membership.delete(userId);
    if (!room.members.size) {
      this.rooms.delete(room.code);
      await Match.updateOne(
        { _id: room.id, status: { $ne: "completed" } },
        { status: "cancelled" }
      );
    } else {
      if (room.hostId === userId)
        room.hostId = room.members.keys().next().value;
      this.broadcast(room);
    }
  }
  ready(userId, ready) {
    const r = this.get(userId);
    if (r.status !== "waiting") throw new AppError("The lobby is closed.");
    r.members.get(userId).ready = ready;
    this.broadcast(r);
  }
  async start(userId) {
    return this.exclusive(userId, () => this.startMatch(userId));
  }
  async startMatch(userId) {
    const r = this.get(userId);
    if (r.hostId !== userId)
      throw new AppError("Only the host can start the match.", 403);
    if (r.status !== "waiting")
      throw new AppError("This match has already started.");
    if (r.settings.ranked && r.members.size !== 2)
      throw new AppError("Ranked matches need two players.");
    const hostMember = r.members.get(userId);
    if (hostMember) hostMember.ready = true;
    if ([...r.members.values()].some((m) => !m.ready || !m.sockets.size))
      throw new AppError("Every player must be connected and ready.");
    const first = await newRound(
      r.settings.gameIds[0],
      1,
      r.settings.duration,
      r.settings.category
    );
    r.secret = first;
    if (r.status !== "waiting" || r.hostId !== userId || [...r.members.values()].some((m) => !m.ready || !m.sockets.size))
      throw new AppError("The lobby changed. Check readiness and try again.");
    r.status = "starting";
    r.nextAt = Date.now() + this.timing.starting;
    await Match.updateOne(
      { _id: r.id },
      { status: "starting", participantIds: [...r.members.keys()] }
    );
    this.broadcast(r);
  }
  submit(userId, a) {
    const r = this.get(userId);
    if (r.code !== a.code || r.status !== "playing" || !r.secret || r.secret.challenge.id !== a.roundId)
      throw new AppError("This round is no longer accepting answers.");
    if (r.answers.has(userId))
      throw new AppError("Your answer was already submitted.");
    const score = scoreAnswer(r.secret, a.value);
    r.answers.set(userId, score);
    r.members.get(userId).score += score.points;
    this.broadcast(r);
    if (r.answers.size === r.members.size) void this.endRound(r);
  }
  async beginRound(r) {
    const nextRound = r.round + 1;
    const game = r.settings.gameIds[(nextRound - 1) % r.settings.gameIds.length];
    const secret = await newRound(
      game,
      nextRound,
      r.settings.duration,
      r.settings.category,
      Date.now(),
      r.usedQuizPrompts ?? []
    );
    const shift = Date.now() - secret.challenge.startedAt;
    secret.challenge.startedAt += shift;
    secret.challenge.deadline += shift;
    if (secret.challenge.showUntil) secret.challenge.showUntil += shift;
    if (secret.signalAt) secret.signalAt += shift;
    r.round = nextRound;
    r.secret = secret;
    if (game === "quick-quiz") {
      r.usedQuizPrompts ??= [];
      r.usedQuizPrompts.push(secret.challenge.prompt);
    }
    r.answers.clear();
    r.status = "playing";
    r.nextAt = void 0;
    r.signalSent = false;
    r.memoryHidden = false;
    this.broadcast(r);
  }
  async endRound(r) {
    if (r.status !== "playing" || !r.secret) return;
    r.status = "round-results";
    r.results.push({
      round: r.round,
      gameId: r.secret.challenge.gameId,
      answer: `${answerText(r.secret)}${r.secret.explanation ? " \xB7 " + r.secret.explanation : ""}`,
      scores: [...r.members].map(([userId]) => ({
        userId,
        ...r.answers.get(userId) ?? {
          points: 0,
          correct: false,
          detail: "No answer"
        }
      }))
    });
    r.nextAt = Date.now() + this.timing.results;
    this.broadcast(r);
  }
  async persist(r) {
    if (r.persisted || r.saving) return;
    r.saving = true;
    try {
      await mongoose2.connection.transaction(async (session) => {
        const claimed = await Match.findOneAndUpdate(
          { _id: r.id, status: { $ne: "completed" } },
          {
            $set: {
              status: "completed",
              rounds: r.results,
              completedAt: /* @__PURE__ */ new Date()
            }
          },
          { session, new: true }
        );
        if (!claimed) return;
        const members = [...r.members];
        const high = Math.max(...members.map(([, m]) => m.score));
        const tie = members.filter(([, m]) => m.score === high).length > 1;
        const users = await User.find({
          _id: { $in: members.map(([id]) => id) }
        }).session(session);
        const initialRatings = new Map(users.map((u) => [u.id, u.rating]));
        const daily = dailyInfo();
        const ratingChanges = {};
        for (const [userId, member] of members) {
          const user = users.find((u) => u.id === userId);
          if (!user) continue;
          const won = members.length > 1 && member.score === high && !tie;
          let delta = 0;
          if (r.settings.ranked && members.length === 2) {
            const other = users.find((u) => u.id !== userId);
            delta = eloDelta(
              initialRatings.get(userId),
              initialRatings.get(other.id),
              tie ? 0.5 : won ? 1 : 0
            );
          }
          ratingChanges[userId] = delta;
          let points = member.score;
          const correctQuiz = r.results.filter(
            (x) => x.gameId === "quick-quiz" && x.scores.some((s) => s.userId === userId && s.correct)
          ).length;
          const dailyScore = r.results.filter((x) => x.gameId === daily.gameId).reduce(
            (n, x) => n + (x.scores.find((s) => s.userId === userId)?.points ?? 0),
            0
          );
          if (dailyScore >= 100 && !await ChallengeCompletion.exists({
            userId,
            day: daily.day
          }).session(session)) {
            await ChallengeCompletion.create(
              [{ userId, day: daily.day, matchId: r.id, reward: daily.reward }],
              { session }
            );
            points += daily.reward;
            if (!user.achievements.includes("daily"))
              user.achievements.push("daily");
          }
          const before = user.rating;
          user.rating += delta;
          user.points += points;
          user.matches++;
          if (won) user.wins++;
          user.streak = won ? user.streak + 1 : 0;
          user.quizCorrect += correctQuiz;
          const earned = [
            "first-match",
            ...won ? ["first-victory"] : [],
            ...user.matches >= 5 ? ["five-matches"] : [],
            ...user.streak >= 3 ? ["three-wins"] : [],
            ...user.quizCorrect >= 10 ? ["quiz-master"] : []
          ];
          for (const id of earned)
            if (!user.achievements.includes(id)) user.achievements.push(id);
          await user.save({ session });
          await MatchResult.create(
            [
              {
                matchId: r.id,
                userId,
                score: member.score,
                points,
                placement: 1 + members.filter(([, m]) => m.score > member.score).length,
                won,
                roundScores: r.results.map(
                  (x) => x.scores.find((s) => s.userId === userId)?.points ?? 0
                ),
                ratingBefore: before,
                ratingAfter: user.rating,
                completedAt: /* @__PURE__ */ new Date()
              }
            ],
            { session }
          );
        }
        await Match.updateOne({ _id: r.id }, { ratingChanges }, { session });
      });
      const saved = await Match.findById(r.id);
      r.ratingChanges = saved?.ratingChanges ?? {};
      r.persisted = true;
      const fresh = await User.find({ _id: { $in: [...r.members.keys()] } });
      for (const u of fresh) r.members.get(u.id).player = publicPlayer(u);
      r.completedPlayers = this.state(r).players;
    } finally {
      r.saving = false;
    }
  }
  async rematch(userId) {
    return this.exclusive(userId, () => this.rematchRoom(userId));
  }
  async rematchRoom(userId) {
    const r = this.get(userId);
    if (r.hostId !== userId)
      throw new AppError("Only the host can set up a rematch.", 403);
    if (r.status !== "completed" || !r.persisted)
      throw new AppError("Wait for the results to save.");
    const nextId = randomUUID2();
    await mongoose2.connection.transaction(async (session) => {
      await Match.updateOne(
        { _id: r.id },
        { $unset: { roomCode: 1 } },
        { session }
      );
      await Match.create(
        [
          {
            _id: nextId,
            roomCode: r.code,
            hostId: r.hostId,
            settings: r.settings,
            participantIds: [...r.members.keys()]
          }
        ],
        { session }
      );
    });
    r.id = nextId;
    r.completedPlayers = void 0;
    r.usedQuizPrompts = [];
    r.round = 0;
    r.status = "waiting";
    r.results = [];
    r.answers.clear();
    r.secret = null;
    r.nextAt = void 0;
    r.persisted = false;
    r.ratingChanges = {};
    r.expiresAt = Date.now() + 2 * 36e5;
    for (const m of r.members.values()) {
      m.score = 0;
      m.ready = m.player.id === r.hostId;
    }
    this.broadcast(r);
  }
  disconnect(userId, socketId) {
    const r = this.rooms.get(this.membership.get(userId) ?? "");
    const m = r?.members.get(userId);
    if (!m || !r) return;
    m.sockets.delete(socketId);
    if (!m.sockets.size) m.disconnectedAt = Date.now();
    this.broadcast(r);
  }
  async tick() {
    for (const r of this.rooms.values()) {
      if (this.busy.has(r.code)) continue;
      this.busy.add(r.code);
      try {
        const now = Date.now();
        if (now > r.expiresAt) {
          r.status = "cancelled";
          this.broadcast(r);
          await Match.updateOne(
            { _id: r.id, status: { $ne: "completed" } },
            { status: "cancelled" }
          );
          for (const [id] of r.members) this.membership.delete(id);
          this.rooms.delete(r.code);
          this.io.to(r.code).emit("room:error", "This room has expired.");
          continue;
        }
        if (r.status === "waiting") {
          for (const [id, m] of r.members)
            if (!m.sockets.size && m.disconnectedAt && now - m.disconnectedAt > 3e4)
              await this.leave(id);
        }
        if (r.status === "starting" && now >= r.nextAt)
          await this.beginRound(r);
        if (r.status === "playing" && r.secret) {
          if (!r.signalSent && r.secret.signalAt && now >= r.secret.signalAt) {
            r.signalSent = true;
            this.broadcast(r);
          }
          if (!r.memoryHidden && r.secret.challenge.showUntil && now >= r.secret.challenge.showUntil) {
            r.memoryHidden = true;
            this.broadcast(r);
          }
          if (now >= r.secret.challenge.deadline) await this.endRound(r);
        }
        if (r.status === "round-results" && now >= r.nextAt) {
          if (r.round < r.settings.rounds) await this.beginRound(r);
          else {
            await this.persist(r);
            r.status = "completed";
            r.nextAt = void 0;
            this.broadcast(r);
          }
        }
      } catch (e) {
        console.error(
          "Room update failed:",
          e instanceof Error ? e.message : "unknown"
        );
        this.io.to(r.code).emit(
          "room:error",
          "The server could not update this match. It will retry."
        );
        r.nextAt = Date.now() + 5e3;
      } finally {
        this.busy.delete(r.code);
      }
    }
  }
  attach() {
    this.io.use(async (socket, next) => {
      try {
        const auth = await authenticate(socket.request.headers.cookie);
        if (!auth) return next(new Error("Please log in."));
        socket.data.userId = auth.user.id;
        next();
      } catch {
        next(new Error("Authentication unavailable."));
      }
    });
    this.io.on("connection", (socket) => {
      const userId = socket.data.userId;
      void socket.join(`user:${userId}`);
      let count = 0;
      let windowAt = Date.now();
      let chain = Promise.resolve();
      const on = (name, schema, handler) => {
        socket.on(name, (payload, ack) => {
          chain = chain.then(async () => {
            try {
              if (Date.now() - windowAt > 1e4) {
                count = 0;
                windowAt = Date.now();
              }
              if (++count > 60)
                throw new AppError("Too many actions. Please slow down.");
              const auth = await authenticate(socket.request.headers.cookie);
              if (!auth || auth.user.id !== userId) {
                socket.disconnect();
                throw new AppError("Session expired. Please log in.");
              }
              const data = schema.parse(payload);
              const result = await handler(data);
              if (typeof ack === "function") ack({ ok: true, data: result });
            } catch (e) {
              const error = e instanceof z.ZodError ? e.issues[0].message : e instanceof AppError ? e.message : "The action could not be completed.";
              if (typeof ack === "function") ack({ ok: false, error });
              else socket.emit("room:error", error);
            }
          });
        });
      };
      const empty = z.object({}).strict();
      on("room:create", roomSchema, (d) => this.create(userId, d, socket));
      on(
        "room:join",
        z.object({
          code: z.string().trim().toUpperCase().regex(/^DUO-[A-Z2-9]{6}$/)
        }),
        (d) => this.join(userId, d.code, socket)
      );
      on("room:sync", z.object({ code: z.string().optional() }), async (d) => {
        const code = this.membership.get(userId);
        if (!code || d.code && d.code !== code) return null;
        return this.join(userId, code, socket);
      });
      on("room:leave", empty, () => this.leave(userId));
      on(
        "room:ready",
        z.object({ ready: z.boolean() }),
        (d) => this.ready(userId, d.ready)
      );
      on("match:start", empty, () => this.start(userId));
      on("match:rematch", empty, () => this.rematch(userId));
      on("answer:submit", answerSchema, (d) => this.submit(userId, d));
      socket.on("disconnect", () => this.disconnect(userId, socket.id));
    });
  }
};

// src/app.ts
var wrap = (fn) => (req, res, next) => {
  void fn(req, res).catch(next);
};
var objectId = z2.string().regex(/^[a-f\d]{24}$/i, "Invalid identifier.");
var questionSchema = z2.object({
  category: z2.string().trim().min(1).max(40),
  prompt: z2.string().trim().min(5).max(300),
  options: z2.array(z2.string().trim().min(1).max(120)).length(4),
  answer: z2.number().int().min(0).max(3),
  explanation: z2.string().max(500).default(""),
  active: z2.boolean().default(true)
});
function createApplication(options = {}) {
  const app2 = express();
  const server = http.createServer(app2);
  app2.disable("x-powered-by");
  if (production) app2.set("trust proxy", 1);
  app2.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com"
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          connectSrc: ["'self'", origin],
          imgSrc: ["'self'", "data:"],
          upgradeInsecureRequests: production ? [] : null
        }
      }
    })
  );
  app2.use(
    cors({
      origin: (reqOrigin, cb) => cb(null, isAllowedOrigin(reqOrigin)),
      credentials: true
    })
  );
  app2.use(express.json({ limit: "16kb" }));
  app2.use(
    "/api",
    rateLimit({
      windowMs: 6e4,
      limit: 200,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { error: "Too many requests. Please try again shortly." }
    })
  );
  app2.use("/api", (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin && !isAllowedOrigin(req.headers.origin))
      return res.status(403).json({ error: "Request origin is not allowed." });
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({ error: "Cross-site requests are not allowed." });
    next();
  });
  const io = new Server(server, {
    cors: {
      origin: (reqOrigin, cb) => cb(null, isAllowedOrigin(reqOrigin)),
      credentials: true
    },
    maxHttpBufferSize: 16384,
    allowRequest: (req, cb) => cb(null, !req.headers.origin || isAllowedOrigin(req.headers.origin))
  });
  const rooms = new RoomManager(io, options.timing);
  rooms.attach();
  app2.use("/api", async (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      await options.ensureDatabase?.();
      next();
    } catch (error) {
      console.error(
        "Database initialization failed:",
        error instanceof Error ? error.name : "unknown error"
      );
      next(
        new AppError(
          "The game service is temporarily unavailable. Please try again shortly.",
          503
        )
      );
    }
  });
  const api = express.Router();
  app2.use("/api/v1", api);
  api.get(
    "/health",
    (_req, res) => res.status(mongoose3.connection.readyState === 1 ? 200 : 503).json({
      status: mongoose3.connection.readyState === 1 ? "ok" : "unavailable",
      database: mongoose3.connection.readyState === 1 ? "connected" : "disconnected",
      service: "duo-clash-api"
    })
  );
  api.get("/games", (_req, res) => res.json({ games }));
  api.get(
    "/categories",
    wrap(
      async (_req, res) => res.json({
        categories: await Question.distinct("category", { active: true })
      })
    )
  );
  const authLimit = rateLimit({
    windowMs: 15 * 6e4,
    limit: process.env.NODE_ENV === "test" ? 1e3 : 25,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again in 15 minutes." }
  });
  api.post(
    "/auth/register",
    authLimit,
    wrap(async (req, res) => {
      const data = registerSchema.parse(req.body);
      if (await User.exists({
        $or: [
          { email: data.email },
          { normalizedUsername: data.username.toLowerCase() }
        ]
      }))
        throw new AppError(
          "That email or username is already registered.",
          409
        );
      const user = await User.create({
        ...data,
        normalizedUsername: data.username.toLowerCase(),
        password: void 0,
        passwordHash: await hashPassword(data.password)
      });
      await createSession(user.id, res);
      res.status(201).json({ user: account(user) });
    })
  );
  api.post(
    "/auth/login",
    authLimit,
    wrap(async (req, res) => {
      const data = loginSchema.parse(req.body);
      const user = await User.findOne({ email: data.email }).select(
        "+passwordHash"
      );
      const valid = await verifyPassword(
        data.password,
        user?.passwordHash ?? "00000000000000000000000000000000:" + "00".repeat(64)
      );
      if (!user || !valid || user.status !== "active")
        throw new AppError("Invalid email or password.", 401);
      await createSession(user.id, res);
      res.json({ user: account(user) });
    })
  );
  api.post(
    "/auth/logout",
    requireUser,
    wrap(async (req, res) => {
      await Session.deleteOne({ _id: req.sessionId });
      res.clearCookie(cookieName, { ...getCookieOptions(), maxAge: void 0 });
      io.in(`user:${req.user.id}`).disconnectSockets();
      res.json({ ok: true });
    })
  );
  api.get(
    "/auth/me",
    requireUser,
    wrap(async (req, res) => {
      await Session.updateOne(
        { _id: req.sessionId },
        { expiresAt: new Date(Date.now() + 7 * 864e5) }
      );
      const token = cookieToken(req.headers.cookie);
      if (token) setSessionCookie(res, token);
      res.json({ user: account(req.user) });
    })
  );
  api.post(
    "/auth/forgot-password",
    authLimit,
    wrap(async (req, res) => {
      const { email } = z2.object({
        email: z2.string().trim().email().transform((v) => v.toLowerCase())
      }).parse(req.body);
      const user = await User.findOne({ email });
      if (production && !process.env.EMAIL_HOST)
        throw new AppError(
          "Password reset email is not configured. Contact the administrator.",
          503
        );
      let developmentResetUrl;
      if (user) {
        const token = randomBytes2(32).toString("hex");
        await ResetToken.deleteMany({ userId: user.id });
        await ResetToken.create({
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 6e4)
        });
        const url = `${origin}/reset-password?token=${token}`;
        if (process.env.EMAIL_HOST) {
          const transport = nodemailer.createTransport({
            host: process.env.EMAIL_HOST,
            port: Number(process.env.EMAIL_PORT ?? 587),
            secure: process.env.EMAIL_PORT === "465",
            auth: process.env.EMAIL_USER ? {
              user: process.env.EMAIL_USER,
              pass: process.env.EMAIL_PASSWORD
            } : void 0
          });
          await transport.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: "Reset your DUO CLASH password",
            text: `Reset your password within 30 minutes: ${url}
If you did not request this, ignore this email.`
          });
        } else if (!production) developmentResetUrl = url;
      }
      res.json({
        message: "If an account exists, a reset link has been sent.",
        ...!production ? { developmentResetUrl } : {}
      });
    })
  );
  api.post(
    "/auth/reset-password",
    authLimit,
    wrap(async (req, res) => {
      const data = z2.object({
        token: z2.string().length(64),
        password: registerSchema.shape.password
      }).parse(req.body);
      const hash = await hashPassword(data.password);
      let revokedUserId = "";
      await mongoose3.connection.transaction(async (session) => {
        const token = await ResetToken.findOneAndDelete(
          { tokenHash: hashToken(data.token), expiresAt: { $gt: /* @__PURE__ */ new Date() } },
          { session }
        );
        if (!token)
          throw new AppError("This reset link is invalid or expired.");
        revokedUserId = String(token.userId);
        await User.updateOne(
          { _id: token.userId },
          { passwordHash: hash },
          { session }
        );
        await Session.deleteMany({ userId: token.userId }, { session });
      });
      io.in(`user:${revokedUserId}`).disconnectSockets();
      res.json({ message: "Password updated. Please log in." });
    })
  );
  api.get(
    "/leaderboards/:scope",
    wrap(async (req, res) => {
      const scope = z2.enum(["global", "weekly", "friends", "seasonal"]).parse(req.params.scope);
      const page = z2.coerce.number().int().min(1).max(1e4).default(1).parse(req.query.page);
      const search = z2.string().trim().max(32).default("").parse(req.query.q);
      const auth = await authenticate(req.headers.cookie);
      let eligible;
      if (scope === "friends") {
        if (!auth) throw new AppError("Log in to view friends rankings.", 401);
        const friendships = await Friendship.find({
          status: "accepted",
          $or: [{ requesterId: auth.user.id }, { recipientId: auth.user.id }]
        });
        eligible = [
          auth.user.id,
          ...friendships.map(
            (f) => f.requesterId === auth.user.id ? f.recipientId : f.requesterId
          )
        ];
      }
      const weekly = scope === "weekly" || scope === "seasonal";
      const since = scope === "weekly" ? weekStart() : new Date(
        Date.UTC(
          (/* @__PURE__ */ new Date()).getUTCFullYear(),
          Math.floor((/* @__PURE__ */ new Date()).getUTCMonth() / 3) * 3,
          1
        )
      );
      const source = weekly ? [
        {
          $match: {
            completedAt: { $gte: since },
            ...eligible ? { userId: { $in: eligible } } : {}
          }
        },
        { $group: { _id: "$userId", points: { $sum: "$points" } } },
        { $set: { userObjectId: { $toObjectId: "$_id" } } },
        {
          $lookup: {
            from: User.collection.name,
            localField: "userObjectId",
            foreignField: "_id",
            as: "user"
          }
        },
        { $unwind: "$user" },
        {
          $match: { "user.status": "active", "user.visibility": "public" }
        }
      ] : [
        {
          $match: {
            status: "active",
            visibility: "public",
            ...eligible ? {
              _id: {
                $in: eligible.map(
                  (id) => new mongoose3.Types.ObjectId(id)
                )
              }
            } : {}
          }
        },
        {
          $project: {
            _id: { $toString: "$_id" },
            points: "$points",
            user: "$$ROOT"
          }
        }
      ];
      const escapedSearch = [...search].map(
        (char) => ".*+?^${}()|[]".includes(char) || char.charCodeAt(0) === 92 ? String.fromCharCode(92) + char : char
      ).join("");
      const pattern = search ? new RegExp(escapedSearch, "i") : void 0;
      const searchStages = pattern ? [
        {
          $match: {
            $or: [
              { "user.displayName": pattern },
              { "user.username": pattern }
            ]
          }
        }
      ] : [];
      const pipeline = [
        ...source,
        { $set: { rankingKey: { points: "$points", id: "$_id" } } },
        {
          $setWindowFields: {
            sortBy: { rankingKey: -1 },
            output: { rank: { $documentNumber: {} } }
          }
        },
        {
          $facet: {
            leaders: [
              ...searchStages,
              { $sort: { rank: 1 } },
              { $skip: (page - 1) * 20 },
              { $limit: 20 }
            ],
            total: [...searchStages, { $count: "count" }],
            current: [
              { $match: { _id: auth?.user.id ?? null } },
              { $limit: 1 }
            ]
          }
        }
      ];
      const [result] = weekly ? await MatchResult.aggregate(pipeline) : await User.aggregate(pipeline);
      const serialize = (row) => ({
        ...publicPlayer(User.hydrate(row.user)),
        periodPoints: row.points,
        rank: row.rank
      });
      res.json({
        page,
        total: result?.total[0]?.count ?? 0,
        leaders: (result?.leaders ?? []).map(serialize),
        currentPlayer: result?.current[0] ? serialize(result.current[0]) : null
      });
    })
  );
  api.get("/achievements", (_req, res) => res.json({ achievements }));
  api.use(requireUser);
  api.get("/users/me", (req, res) => res.json({ user: account(req.user) }));
  api.patch(
    "/users/me",
    wrap(async (req, res) => {
      const data = z2.object({
        displayName: z2.string().trim().min(2).max(32).optional(),
        avatar: z2.enum(["sparkles", "heart", "bolt", "brain", "crown", "moon"]).optional(),
        theme: z2.enum(["system", "light", "dark"]).optional(),
        visibility: z2.enum(["public", "private"]).optional()
      }).strict().parse(req.body);
      const user = await User.findByIdAndUpdate(req.user.id, data, {
        new: true
      });
      res.json({ user: account(user) });
    })
  );
  api.delete(
    "/users/me",
    wrap(async (req, res) => {
      const { password } = z2.object({ password: z2.string().min(1).max(128) }).parse(req.body);
      const user = await User.findById(req.user.id).select("+passwordHash");
      if (!user || !await verifyPassword(password, user.passwordHash))
        throw new AppError("Incorrect password.", 403);
      if (rooms.membership.has(user.id))
        throw new AppError("Leave your room before deleting your account.");
      await mongoose3.connection.transaction(async (session) => {
        await User.deleteOne({ _id: user.id }, { session });
        await Session.deleteMany({ userId: user.id }, { session });
        await ResetToken.deleteMany({ userId: user.id }, { session });
        await Friendship.deleteMany(
          { $or: [{ requesterId: user.id }, { recipientId: user.id }] },
          { session }
        );
        await Block.deleteMany(
          { $or: [{ userId: user.id }, { targetId: user.id }] },
          { session }
        );
        await ChallengeCompletion.deleteMany({ userId: user.id }, { session });
        await MatchResult.deleteMany({ userId: user.id }, { session });
      });
      res.clearCookie(cookieName, { ...getCookieOptions(), maxAge: void 0 });
      res.json({ ok: true });
    })
  );
  api.get(
    "/users/me/achievements",
    (req, res) => res.json({ achievements: req.user.achievements })
  );
  api.get(
    "/users/me/history",
    wrap(async (req, res) => {
      const page = z2.coerce.number().int().min(1).max(1e4).default(1).parse(req.query.page);
      const results = await MatchResult.find({ userId: req.user.id }).sort({ completedAt: -1 }).skip((page - 1) * 20).limit(20);
      res.json({ results, page });
    })
  );
  api.get(
    "/users/:username",
    wrap(async (req, res) => {
      const u = await User.findOne({
        normalizedUsername: z2.string().parse(req.params.username).toLowerCase(),
        status: "active"
      });
      if (!u || u.visibility === "private" && u.id !== req.user.id)
        throw new AppError("Profile not found.", 404);
      res.json({ user: publicPlayer(u) });
    })
  );
  api.post(
    "/matches",
    wrap(
      async (req, res) => res.status(201).json({
        room: await rooms.create(req.user.id, roomSchema2.parse(req.body))
      })
    )
  );
  api.post(
    "/matches/join",
    wrap(async (req, res) => {
      const { code } = z2.object({ code: z2.string().trim().toUpperCase().max(12) }).parse(req.body);
      res.json({ room: await rooms.join(req.user.id, code) });
    })
  );
  api.get(
    "/matches/:matchId",
    wrap(async (req, res) => {
      const m = await Match.findOne({
        _id: req.params.matchId,
        participantIds: req.user.id
      });
      if (!m) throw new AppError("Match not found.", 404);
      res.json({ match: m });
    })
  );
  api.get(
    "/matches/:matchId/results",
    wrap(async (req, res) => {
      const m = await Match.findOne({
        _id: req.params.matchId,
        participantIds: req.user.id,
        status: "completed"
      });
      if (!m) throw new AppError("Completed match not found.", 404);
      res.json({
        match: m,
        results: await MatchResult.find({ matchId: m.id }).sort({
          placement: 1
        })
      });
    })
  );
  api.get(
    "/challenges/daily",
    wrap(async (req, res) => {
      const daily = dailyInfo();
      res.json({
        ...daily,
        completed: !!await ChallengeCompletion.exists({
          userId: req.user.id,
          day: daily.day
        })
      });
    })
  );
  api.post(
    "/challenges/:challengeId/complete",
    wrap(async (req, res) => {
      const completion = await ChallengeCompletion.findOne({
        userId: req.user.id,
        day: req.params.challengeId
      });
      if (!completion)
        throw new AppError("Finish an eligible match to earn this reward.");
      res.json({ completion });
    })
  );
  api.get(
    "/friends",
    wrap(async (req, res) => {
      const id = req.user.id;
      const rows = await Friendship.find({
        $or: [{ requesterId: id }, { recipientId: id }]
      });
      const ids = rows.map(
        (f) => f.requesterId === id ? f.recipientId : f.requesterId
      );
      const users = await User.find({ _id: { $in: ids }, status: "active" });
      const blocks = await Block.find({ userId: id });
      res.json({
        friends: rows.flatMap((f) => {
          const u = users.find(
            (u2) => u2.id === (f.requesterId === id ? f.recipientId : f.requesterId)
          );
          return u ? [
            {
              id: f.id,
              status: f.status,
              incoming: f.recipientId === id,
              user: publicPlayer(u),
              online: [...io.sockets.sockets.values()].some(
                (s) => s.data.userId === u.id
              )
            }
          ] : [];
        }),
        blocked: await User.find({
          _id: { $in: blocks.map((b) => b.targetId) }
        }).then((us) => us.map(publicPlayer))
      });
    })
  );
  api.post(
    "/friends/requests",
    wrap(async (req, res) => {
      const { username } = z2.object({ username: z2.string().trim().min(3).max(24) }).parse(req.body);
      const target = await User.findOne({
        normalizedUsername: username.toLowerCase(),
        status: "active"
      });
      if (!target || target.id === req.user.id)
        throw new AppError("Player not found.");
      const id = req.user.id;
      if (await Block.exists({
        $or: [
          { userId: id, targetId: target.id },
          { userId: target.id, targetId: id }
        ]
      }))
        throw new AppError("This player cannot receive your request.", 403);
      const key = [id, target.id].sort().join(":");
      if (await Friendship.exists({ key }))
        throw new AppError("A friendship or request already exists.", 409);
      const f = await Friendship.create({
        key,
        requesterId: id,
        recipientId: target.id
      });
      res.status(201).json({ request: f });
    })
  );
  api.post(
    "/friends/requests/:requestId/:action",
    wrap(async (req, res) => {
      const action = z2.enum(["accept", "decline"]).parse(req.params.action);
      const f = await Friendship.findOne({
        _id: objectId.parse(req.params.requestId),
        recipientId: req.user.id,
        status: "pending"
      });
      if (!f) throw new AppError("Request not found.", 404);
      if (action === "accept") {
        f.status = "accepted";
        await f.save();
      } else await f.deleteOne();
      res.json({ ok: true });
    })
  );
  api.delete(
    "/friends/:userId",
    wrap(async (req, res) => {
      const id = objectId.parse(req.params.userId);
      await Friendship.deleteOne({ key: [id, req.user.id].sort().join(":") });
      res.json({ ok: true });
    })
  );
  api.post(
    "/blocks",
    wrap(async (req, res) => {
      const { userId } = z2.object({ userId: objectId }).parse(req.body);
      if (userId === req.user.id || !await User.exists({ _id: userId }))
        throw new AppError("Player not found.");
      await Block.updateOne(
        { userId: req.user.id, targetId: userId },
        { $set: { userId: req.user.id, targetId: userId } },
        { upsert: true }
      );
      await Friendship.deleteOne({
        key: [userId, req.user.id].sort().join(":")
      });
      res.json({ ok: true });
    })
  );
  api.delete(
    "/blocks/:userId",
    wrap(async (req, res) => {
      await Block.deleteOne({
        userId: req.user.id,
        targetId: objectId.parse(req.params.userId)
      });
      res.json({ ok: true });
    })
  );
  api.post(
    "/reports",
    wrap(async (req, res) => {
      const data = z2.object({
        targetId: objectId,
        category: z2.enum(["abuse", "cheating", "impersonation", "other"]),
        description: z2.string().trim().min(5).max(1e3)
      }).parse(req.body);
      if (!await User.exists({ _id: data.targetId }))
        throw new AppError("Player not found.", 404);
      await Report.create({ ...data, reporterId: req.user.id });
      res.status(201).json({ ok: true });
    })
  );
  api.use("/admin", requireAdmin);
  api.get(
    "/admin/stats",
    wrap(
      async (_req, res) => res.json({
        users: await User.countDocuments(),
        matches: await Match.countDocuments({ status: "completed" }),
        openReports: await Report.countDocuments({ status: "open" }),
        activeRooms: rooms.rooms.size
      })
    )
  );
  api.get(
    "/admin/questions",
    wrap(
      async (_req, res) => res.json({ questions: await Question.find().sort({ createdAt: -1 }) })
    )
  );
  api.post(
    "/admin/questions",
    wrap(async (req, res) => {
      const question = await Question.create({
        ...questionSchema.parse(req.body),
        key: randomBytes2(16).toString("hex")
      });
      await Audit.create({
        actorId: req.user.id,
        action: "question:create",
        targetId: question.id
      });
      res.status(201).json({ question });
    })
  );
  api.patch(
    "/admin/questions/:id",
    wrap(async (req, res) => {
      const question = await Question.findByIdAndUpdate(
        objectId.parse(req.params.id),
        questionSchema.partial().parse(req.body),
        { new: true, runValidators: true }
      );
      if (!question) throw new AppError("Question not found.", 404);
      await Audit.create({
        actorId: req.user.id,
        action: "question:update",
        targetId: question.id
      });
      res.json({ question });
    })
  );
  api.get(
    "/admin/reports",
    wrap(
      async (_req, res) => res.json({
        reports: await Report.find().sort({ createdAt: -1 }).limit(100)
      })
    )
  );
  api.patch(
    "/admin/reports/:id",
    wrap(async (req, res) => {
      const { status } = z2.object({ status: z2.enum(["open", "resolved", "dismissed"]) }).parse(req.body);
      await Report.updateOne(
        { _id: objectId.parse(req.params.id) },
        { status, moderatorId: req.user.id }
      );
      await Audit.create({
        actorId: req.user.id,
        action: `report:${status}`,
        targetId: req.params.id
      });
      res.json({ ok: true });
    })
  );
  api.get(
    "/admin/users",
    wrap(
      async (_req, res) => res.json({
        users: (await User.find().sort({ createdAt: -1 }).limit(100)).map(
          (u) => ({ ...publicPlayer(u), status: u.status })
        )
      })
    )
  );
  api.patch(
    "/admin/users/:id",
    wrap(async (req, res) => {
      const { status } = z2.object({ status: z2.enum(["active", "suspended"]) }).parse(req.body);
      const id = objectId.parse(req.params.id);
      if (id === req.user.id)
        throw new AppError("You cannot suspend your own account.");
      await User.updateOne({ _id: id }, { status });
      if (status === "suspended") {
        await Session.deleteMany({ userId: id });
        for (const s of io.sockets.sockets.values())
          if (s.data.userId === id) s.disconnect();
      }
      await Audit.create({
        actorId: req.user.id,
        action: `user:${status}`,
        targetId: id
      });
      res.json({ ok: true });
    })
  );
  api.get(
    "/admin/audit",
    wrap(
      async (_req, res) => res.json({
        audit: await Audit.find().sort({ createdAt: -1 }).limit(100)
      })
    )
  );
  app2.use(
    "/api",
    (_req, res) => res.status(404).json({ error: "Endpoint not found." })
  );
  const staticDirectory = options.staticDirectory ?? path.resolve(process.cwd(), "../frontend/dist");
  app2.use(express.static(staticDirectory));
  app2.get(
    "*",
    (_req, res, next) => res.sendFile(path.join(staticDirectory, "index.html"), (e) => e && next(e))
  );
  app2.use(
    (error, _req, res, _next) => {
      if (error instanceof z2.ZodError)
        return res.status(400).json({
          error: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ")
        });
      if (error instanceof AppError)
        return res.status(error.status).json({ error: error.message });
      if (error.code === 11e3)
        return res.status(409).json({ error: "This record already exists." });
      if (error instanceof SyntaxError)
        return res.status(400).json({ error: "Invalid JSON." });
      console.error(
        "Request failed:",
        error instanceof Error ? error.name : "unknown"
      );
      res.status(500).json({ error: "The server could not complete this request." });
    }
  );
  return {
    app: app2,
    server,
    io,
    rooms,
    close: async () => {
      rooms.close();
      await new Promise((resolve) => io.close(() => resolve()));
    }
  };
}

// src/database.ts
import mongoose4 from "mongoose";
var connectionPromise;
var initialized = false;
async function ensureConnected() {
  if (initialized && mongoose4.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const uri = process.env.MONGODB_URI?.trim();
      if (!uri && (process.env.NODE_ENV === "production" || process.env.VERCEL))
        throw new Error("MONGODB_URI must be configured on the backend host.");
      await mongoose4.connect(
        uri || "mongodb://127.0.0.1:27018/duo_clash?replicaSet=duo",
        {
          serverSelectionTimeoutMS: 8e3,
          connectTimeoutMS: 8e3,
          maxPoolSize: 10
        }
      );
      await Promise.all(allModels.map((model) => model.init()));
      initialized = true;
    })().finally(() => {
      connectionPromise = void 0;
    });
  }
  await connectionPromise;
}

// src/index.ts
var instance = createApplication({ ensureDatabase: ensureConnected });
var app = instance.app;
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4e3);
  const start = async () => {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("PORT must be between 1 and 65535.");
    if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_ORIGIN?.startsWith("https://"))
      throw new Error("Production requires an HTTPS FRONTEND_ORIGIN.");
    await ensureConnected();
    await seedContent();
    instance.server.listen(
      port,
      () => console.log(`DUO CLASH is ready at http://localhost:${port}`)
    );
    const stop = async () => {
      await instance.close();
      await mongoose5.disconnect();
      process.exit(0);
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  };
  void start().catch(async (error) => {
    console.error(
      "Startup failed:",
      error instanceof Error ? error.name : "unknown error"
    );
    await instance.close();
    await mongoose5.disconnect();
    process.exitCode = 1;
  });
}
var index_default = app;
export {
  index_default as default,
  ensureConnected,
  instance
};
