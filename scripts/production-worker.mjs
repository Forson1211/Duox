import http from "node:http";
import handler from "../api/index.js";
import { instance } from "../backend/dist/index.js";
import mongoose from "mongoose";
const server = http.createServer(handler);
server.listen(0, "127.0.0.1", () =>
  process.send?.({ port: server.address().port }),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await instance.close();
  await mongoose.disconnect();
  process.exit(0);
}
process.on("message", (message) => {
  if (message === "stop") void stop();
});
process.once("SIGTERM", () => void stop());
