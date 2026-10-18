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
    // fallback to default resolver
  }
}

const port = Number(process.env.PORT ?? 4000);
async function start() {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.MONGODB_URI ||
      !process.env.FRONTEND_ORIGIN?.startsWith("https://"))
  )
    throw new Error(
      "Production requires MONGODB_URI and an HTTPS FRONTEND_ORIGIN.",
    );
  await mongoose.connect(
    process.env.MONGODB_URI ??
      "mongodb://127.0.0.1:27018/duo_clash?replicaSet=duo",
    { serverSelectionTimeoutMS: 15000 },
  );
  const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
  if (!hello.setName && !hello.msg?.includes("isdbgrid"))
    throw new Error(
      "MongoDB must be a replica set to save results transactionally. Use npm run db or MongoDB Atlas.",
    );
  await Promise.all(allModels.map((model) => model.init()));
  await Match.updateMany(
    { status: { $nin: ["completed", "cancelled"] } },
    { status: "cancelled" },
  );
  await seedContent();
  const instance = createApplication();
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
}
start().catch((e) => {
  console.error(
    `Startup failed: ${e instanceof Error ? e.message : "unknown error"}\nStart MongoDB with npm run db, or configure backend/.env with your Atlas URI.`,
  );
  void mongoose.disconnect().finally(() => process.exit(1));
});
