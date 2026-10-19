import mongoose from "mongoose";
import { allModels } from "./models.js";
import { seedContent } from "./content.js";

let connectionPromise: Promise<void> | undefined;
let initialized = false;

// Share cold-start work across concurrent invocations; failed attempts can retry.
export async function ensureConnected(): Promise<void> {
  if (initialized && mongoose.connection.readyState === 1) return;
  if (!connectionPromise) {
    connectionPromise = (async () => {
      const uri = process.env.MONGODB_URI?.trim();
      if (!uri && (process.env.NODE_ENV === "production" || process.env.VERCEL))
        throw new Error("MONGODB_URI must be configured on the backend host.");
      await mongoose.connect(
        uri || "mongodb://127.0.0.1:27018/duo_clash?replicaSet=duo",
        {
          serverSelectionTimeoutMS: 8000,
          connectTimeoutMS: 8000,
          maxPoolSize: 10,
        },
      );
      await Promise.all(allModels.map((model) => model.init()));
      await seedContent();
      initialized = true;
    })().finally(() => {
      connectionPromise = undefined;
    });
  }
  await connectionPromise;
}
