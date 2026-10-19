import { chromium, expect } from "@playwright/test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fork, type ChildProcess } from "node:child_process";
import http from "node:http";

const database = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
process.env.VERCEL = "1";
process.env.NODE_ENV = "production";
process.env.MONGODB_URI = database.getUri("duo_deployment_browser_test");
// Let the test bind first so the production origin check uses the exact browser URL.
const web = express();
const server = createServer(web);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
const base = `http://localhost:${port}`;
process.env.FRONTEND_ORIGIN = base;
const workers: { process: ChildProcess; port: number; requests: number }[] = [];
for (let i = 0; i < 3; i++) {
  const child = fork(path.resolve("scripts/production-worker.mjs"), [], {
    execArgv: [],
    env: process.env,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  const port = await new Promise<number>((resolve, reject) => {
    child.once("message", (message) =>
      resolve((message as { port: number }).port),
    );
    child.once("error", reject);
    child.once("exit", (code) =>
      reject(new Error("Production worker exited during startup: " + code)),
    );
  });
  workers.push({ process: child, port, requests: 0 });
}
const { default: mongoose } = await import("mongoose");
await mongoose.connect(process.env.MONGODB_URI!);
let nextWorker = 0;
// Distribute every API request over three fresh production worker processes.
web.use((req, res, next) => {
  if (req.path !== "/api" && !req.path.startsWith("/api/")) return next();
  const worker = workers[nextWorker++ % workers.length];
  worker.requests++;
  const proxy = http.request(
    {
      hostname: "127.0.0.1",
      port: worker.port,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (upstream) => {
      res.writeHead(upstream.statusCode ?? 502, upstream.headers);
      upstream.pipe(res);
    },
  );
  proxy.on("error", () =>
    res.status(502).json({ error: "Production worker unavailable" }),
  );
  req.pipe(proxy);
});
web.use(express.static(path.resolve("frontend/dist")));
web.get("*", (_req, res) =>
  res.sendFile(path.resolve("frontend/dist/index.html")),
);
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const email = "deploy-browser@example.test";
  const password = "production-browser-test-password";
  await page.goto(`${base}/register`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Display name").fill("Deploy Browser");
  await page.getByLabel("Username", { exact: true }).fill("deploybrowser");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const registration = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/auth/register"),
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  expect((await registration).status()).toBe(201);
  await expect(page).toHaveURL(`${base}/app`);
  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === "duo_session");
  expect(session).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Hey, Deploy Browser.")).toBeVisible();
  console.log(
    "PASS: built production handler, cold-start registration, Secure cookie, and reload persistence",
  );

  const logout = await context.request.post(`${base}/api/v1/auth/logout`, {
    headers: { Origin: base },
  });
  expect(logout.status()).toBe(200);
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Invalid email or password.",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(`${base}/app`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Hey, Deploy Browser.")).toBeVisible();
  console.log(
    "PASS: logout, incorrect password rejection, login, and refreshed authenticated page",
  );

  const guestContext = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const guest = await guestContext.newPage();
  await guest.goto(`${base}/register`);
  await guest.getByLabel("Display name").fill("Deploy Rival");
  await guest.getByLabel("Username", { exact: true }).fill("deployrival");
  await guest
    .getByLabel("Email", { exact: true })
    .fill("deploy-rival@example.test");
  await guest
    .getByLabel("Password", { exact: true })
    .fill("production-rival-test-password");
  await guest
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(guest).toHaveURL(`${base}/app`);
  await page.goto(`${base}/app/rooms/create`);
  await page.getByLabel("Room name").fill("Production four game duel");
  await page.getByLabel("Rounds", { exact: true }).selectOption("4");
  await page.getByLabel(/Ranked head-to-head/).check();
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(page.locator(".room-code")).toBeVisible();
  const code = (await page.locator(".room-code").innerText()).trim();
  await guest.goto(`${base}/app/rooms/${code}`);
  await expect(
    guest.getByText("Good company. Great competition."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start match" }),
  ).toBeDisabled();
  await guest.getByRole("button", { name: "I?m ready", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start match" })).toBeEnabled();
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.locator(".quiz-options")).toBeVisible({ timeout: 20000 });
  await expect(guest.locator(".quiz-options")).toBeVisible();
  const roomDoc = () =>
    mongoose.connection
      .db!.collection("livegamerooms")
      .findOne({ _id: code } as any);
  let secret = (await roomDoc())!.snapshot.secret;
  await page.reload();
  await expect(page.locator(".quiz-options")).toBeVisible();
  await page.locator(".quiz-options button").nth(secret.answer).click();
  await guest
    .locator(".quiz-options button")
    .nth((secret.answer + 1) % 4)
    .click();
  console.log(
    "PASS: invite URL, two independent browsers, host permissions, synchronized quiz, and reload reconnection across three workers",
  );
  await expect(page.locator(".memory-grid")).toBeVisible({ timeout: 20000 });
  secret = (await roomDoc())!.snapshot.secret;
  for (const player of [page, guest]) {
    await expect(
      player.getByText("Your turn. Repeat the sequence."),
    ).toBeVisible({ timeout: 12000 });
    for (const tile of secret.answer)
      await player
        .getByRole("button", { name: "Tile " + (tile + 1), exact: true })
        .click();
    await player.getByRole("button", { name: "Submit sequence" }).click();
  }
  await expect(page.locator(".letter-rack")).toBeVisible({ timeout: 15000 });
  secret = (await roomDoc())!.snapshot.secret;
  for (const player of [page, guest]) {
    await player.getByLabel("Your answer").fill(secret.answer.toLowerCase());
    await player.getByRole("button", { name: "Lock it in" }).click();
  }
  await expect(page.locator(".reflex-pad.go")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(120);
  await page.locator(".reflex-pad.go").click();
  await expect(guest.locator(".reflex-pad.go")).toBeVisible();
  await guest.locator(".reflex-pad.go").click();
  await expect(
    page.getByRole("heading", { name: "The crown is yours." }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    guest.getByRole("heading", { name: "Deploy Browser takes the crown." }),
  ).toBeVisible();
  const completed = await roomDoc();
  expect(completed!.snapshot.results).toHaveLength(4);
  expect(
    completed!.snapshot.results.every((round: any) =>
      round.scores.some((score: any) => score.correct),
    ),
  ).toBe(true);
  expect(
    await mongoose.connection
      .db!.collection("matchresults")
      .countDocuments({ matchId: completed!.snapshot.id }),
  ).toBe(2);
  const rankings = await context.request.get(
    `${base}/api/v1/leaderboards/weekly`,
  );
  expect((await rankings.json()).leaders).toHaveLength(2);
  console.log(
    "PASS: all four games, ranked scoring, persisted results, achievements, and leaderboard entries across independent production workers",
  );
  await page.getByRole("button", { name: "Rematch", exact: true }).click();
  await expect(
    guest.getByText("Good company. Great competition."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leave room", exact: true }).click();
  await guest.getByRole("button", { name: "Leave room", exact: true }).click();
  await expect(page.locator(".resume-banner")).toHaveCount(0);
  await expect(guest.locator(".resume-banner")).toHaveCount(0);
  expect(
    (
      await context.request
        .get(`${base}/api/v1/realtime/state`)
        .then((r) => r.json())
    ).room,
  ).toBeNull();
  expect(
    (
      await guestContext.request
        .get(`${base}/api/v1/realtime/state`)
        .then((r) => r.json())
    ).room,
  ).toBeNull();
  expect(workers.every((worker) => worker.requests > 5)).toBe(true);
  console.log(
    "PASS: rematch, leaving, and requests shared by all three production workers",
  );
  await guestContext.close();

  const health = await context.request.get(`${base}/api/v1/health`);
  expect(health.status()).toBe(200);
  expect(await health.json()).toMatchObject({ database: "connected" });
  const missing = await context.request.get(`${base}/api/v1/does-not-exist`);
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).toContain("application/json");
  expect(errors).toEqual([]);
  console.log(
    "PASS: health JSON, API 404 JSON, mobile auth routes, and no browser exceptions",
  );
} finally {
  await browser.close();
  await Promise.all(
    workers.map(
      (worker) =>
        new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            worker.process.kill();
            resolve();
          }, 5000);
          worker.process.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
          worker.process.send("stop");
        }),
    ),
  );
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await database.stop();
}
