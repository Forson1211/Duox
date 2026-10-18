import "dotenv/config";
import dns from "node:dns";
import mongoose from "mongoose";
import { createApplication } from "../backend/dist/app.js";
import { seedContent } from "../backend/dist/content.js";
import { allModels } from "../backend/dist/models.js";

if (process.env.MONGODB_URI?.startsWith("mongodb+srv://")) {
  try {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  } catch {
    // fallback to system default
  }
}

let cachedApp = null;
let isConnected = false;

async function getApp() {
  if (!isConnected) {
    const uri = process.env.MONGODB_URI;
    if (uri && mongoose.connection.readyState !== 1) {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
      await Promise.all(allModels.map((m) => m.init()));
      await seedContent();
    }
    isConnected = true;
  }
  if (!cachedApp) {
    cachedApp = createApplication().app;
  }
  return cachedApp;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
