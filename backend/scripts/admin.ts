import "dotenv/config";
import mongoose from "mongoose";
import { User, Audit } from "../src/models.js";
const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
if (!email)
  throw new Error(
    "Set ADMIN_BOOTSTRAP_EMAIL to an existing registered account.",
  );
await mongoose.connect(
  process.env.MONGODB_URI ??
    "mongodb://127.0.0.1:27018/duo_clash?replicaSet=duo",
);
const user = await User.findOneAndUpdate(
  { email, status: "active" },
  { role: "admin" },
  { new: true },
);
if (!user) throw new Error("Register that account first.");
await Audit.create({
  actorId: user.id,
  action: "admin:bootstrap",
  targetId: user.id,
});
console.log(`Administrator role granted to @${user.username}.`);
await mongoose.disconnect();
