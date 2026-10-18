import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdir } from "node:fs/promises";
import path from "node:path";
const dbPath = path.resolve(".data/mongo");
await mkdir(dbPath, { recursive: true });
const replica = await MongoMemoryReplSet.create({
  instanceOpts: [{ port: 27018, dbPath }],
  replSet: {
    name: "duo",
    count: 1,
    storageEngine: "wiredTiger",
    dbName: "duo_clash",
    ip: "127.0.0.1",
  },
});
console.log(
  "Persistent development MongoDB ready: mongodb://127.0.0.1:27018/duo_clash?replicaSet=duo",
);
const stop = async () => {
  await replica.stop({ doCleanup: false, force: false });
  process.exit(0);
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
