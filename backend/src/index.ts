import "dotenv/config";
import mongoose from "mongoose";
import { createApplication } from "./app.js";
import { ensureConnected } from "./database.js";
import { seedContent } from "./content.js";

const instance = createApplication({ ensureDatabase: ensureConnected });
const app = instance.app;

// Serverless hosts invoke the exported app; persistent hosts own Socket.IO too.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 4000);
  const start = async () => {
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("PORT must be between 1 and 65535.");
    if (
      process.env.NODE_ENV === "production" &&
      !process.env.FRONTEND_ORIGIN?.startsWith("https://")
    )
      throw new Error("Production requires an HTTPS FRONTEND_ORIGIN.");
    await ensureConnected();
    await seedContent();
    instance.server.listen(port, () =>
      console.log(`DUO CLASH is ready at http://localhost:${port}`),
    );
    const stop = async () => {
      await instance.close();
      await mongoose.disconnect();
      process.exit(0);
    };
    process.once("SIGINT", () => void stop());
    process.once("SIGTERM", () => void stop());
  };
  void start().catch(async (error: unknown) => {
    console.error(
      "Startup failed:",
      error instanceof Error ? error.name : "unknown error",
    );
    await instance.close();
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}

export default app;
export { instance, ensureConnected };
