import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { seedContent } from "../src/content.js";

if (process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {}
}

await mongoose.connect(
  process.env.MONGODB_URI ??
    "mongodb://127.0.0.1:27018/duo_clash?replicaSet=duo",
);
await seedContent();
console.log("Starter questions seeded without overwriting existing content.");
await mongoose.disconnect();
