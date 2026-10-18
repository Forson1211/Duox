import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { createApplication } from "./app.js";
import { seedContent } from "./content.js";
import { allModels, Match } from "./models.js";

if (process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {
    // fallback to system default
  }
}

const instance = createApplication();
const app = instance.app;

let isReady = false;
let initPromise: Promise<void> | null = null;

async function ensureConnected() {
  if (isReady && mongoose.connection.readyState === 1) return;
  if (!initPromise) {
    initPromise = (async () => {
      const uri =
        process.env.MONGODB_URI ??
        "mongodb://127.0.0.1:27018/duo_clash?replicaSet=duo";
      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
        await Promise.all(allModels.map((model) => model.init()));
        await Match.updateMany(
          { status: { $nin: ["completed", "cancelled"] } },
          { status: "cancelled" },
        );
        await seedContent();
      }
      isReady = true;
    })();
  }
  await initPromise;
}

// Middleware to ensure DB is connected before processing requests
app.use(async (_req, _res, next) => {
  try {
    await ensureConnected();
    next();
  } catch (err) {
    next(err);
  }
});

// When running standalone (e.g. locally or on a persistent container):
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4000);
  ensureConnected()
    .then(() => {
      instance.server.listen(port, () => {
        console.log(`DUO CLASH is ready at http://localhost:${port}`);
      });
    })
    .catch((e) => {
      console.error(
        `Startup error: ${e instanceof Error ? e.message : "unknown error"}`,
      );
    });
}

export default app;
export { instance, ensureConnected };
