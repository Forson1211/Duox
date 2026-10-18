import mongoose, { Schema } from "mongoose";
const userSchema = new Schema(
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
      default: "system",
    },
    visibility: {
      type: String,
      enum: ["public", "private"],
      default: "public",
    },
    points: { type: Number, default: 0 },
    rating: { type: Number, default: 1000 },
    matches: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    quizCorrect: { type: Number, default: 0 },
    achievements: { type: [String], default: [] },
  },
  { timestamps: true },
);
userSchema.index({ points: -1, _id: 1 });
export const User = mongoose.model("User", userSchema);
export const Session = mongoose.model(
  "Session",
  new Schema(
    {
      tokenHash: { type: String, unique: true, required: true },
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
      },
      expiresAt: { type: Date, required: true, expires: 0 },
    },
    { timestamps: true },
  ),
);
export const ResetToken = mongoose.model(
  "ResetToken",
  new Schema({
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  }),
);
export const Match = mongoose.model(
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
      completedAt: Date,
    },
    { timestamps: true },
  ),
);
const resultSchema = new Schema({
  matchId: { type: String, required: true },
  userId: { type: String, required: true },
  score: Number,
  points: Number,
  placement: Number,
  won: Boolean,
  roundScores: [Number],
  ratingBefore: Number,
  ratingAfter: Number,
  completedAt: { type: Date, required: true },
});
resultSchema.index({ matchId: 1, userId: 1 }, { unique: true });
resultSchema.index({ userId: 1, completedAt: -1 });
resultSchema.index({ completedAt: -1, userId: 1 });
export const MatchResult = mongoose.model("MatchResult", resultSchema);
export const Question = mongoose.model(
  "Question",
  new Schema(
    {
      key: { type: String, unique: true },
      category: { type: String, required: true },
      prompt: { type: String, required: true },
      options: { type: [String], required: true },
      answer: { type: Number, required: true },
      explanation: String,
      active: { type: Boolean, default: true },
    },
    { timestamps: true },
  ),
);
export const Friendship = mongoose.model(
  "Friendship",
  new Schema(
    {
      key: { type: String, unique: true, required: true },
      requesterId: { type: String, required: true },
      recipientId: { type: String, required: true },
      status: {
        type: String,
        enum: ["pending", "accepted"],
        default: "pending",
      },
    },
    { timestamps: true },
  ),
);
const completionSchema = new Schema(
  { userId: String, day: String, matchId: String, reward: Number },
  { timestamps: true },
);
completionSchema.index({ userId: 1, day: 1 }, { unique: true });
export const ChallengeCompletion = mongoose.model(
  "ChallengeCompletion",
  completionSchema,
);
const blockSchema = new Schema({ userId: String, targetId: String });
blockSchema.index({ userId: 1, targetId: 1 }, { unique: true });
export const Block = mongoose.model("Block", blockSchema);
export const Report = mongoose.model(
  "Report",
  new Schema(
    {
      reporterId: String,
      targetId: String,
      category: String,
      description: String,
      status: { type: String, default: "open" },
      moderatorId: String,
    },
    { timestamps: true },
  ),
);
export const Audit = mongoose.model(
  "Audit",
  new Schema(
    { actorId: String, action: String, targetId: String },
    { timestamps: true },
  ),
);
export const allModels = [
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
  Audit,
];
