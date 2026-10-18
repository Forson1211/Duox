import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { createApplication } from "./app.js";
import { seedContent } from "./content.js";
import { allModels, Match, Question } from "./models.js";

// Only override DNS servers for local development where ISP SRV resolution might fail.
// Do NOT override in Vercel/AWS Lambda as outbound UDP:53 to public IPs is blocked.
if (!process.env.VERCEL && process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
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
      const mongoUri =
        process.env.MONGODB_URI ||
        "mongodb://duox:370563forson@ac-pxpbn3e-shard-00-00.wscgt4y.mongodb.net:27017,ac-pxpbn3e-shard-00-01.wscgt4y.mongodb.net:27017,ac-pxpbn3e-shard-00-02.wscgt4y.mongodb.net:27017/duo_clash?ssl=true&authSource=admin&retryWrites=true&w=majority";

      if (mongoose.connection.readyState !== 1) {
        await mongoose.connect(mongoUri, {
          serverSelectionTimeoutMS: process.env.VERCEL ? 5000 : 15000,
        });
        await Promise.all(
          allModels.map((model) => model.init().catch(() => {})),
        );

        if (!process.env.VERCEL) {
          await Match.updateMany(
            { status: { $nin: ["completed", "cancelled"] } },
            { status: "cancelled" },
          );
          await seedContent();
        } else {
          try {
            const count = await Question.estimatedDocumentCount();
            if (count === 0) {
              await seedContent();
            }
          } catch {
            // non-fatal in serverless cold start
          }
        }
      }
      isReady = true;
    })().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  await initPromise;
}

// Middleware to ensure DB is connected before processing data requests
app.use(async (req, _res, next) => {
  // Allow health endpoint to respond immediately with current DB status
  if (req.path === "/health" || req.path === "/api/v1/health") {
    void ensureConnected().catch(() => {});
    return next();
  }

  try {
    await ensureConnected();
    next();
  } catch (err) {
    next(err);
  }
});

// When running standalone (e.g. locally or in a container):
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

