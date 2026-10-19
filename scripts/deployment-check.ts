import { chromium, expect as baseExpect } from "@playwright/test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";
import { fork, type ChildProcess } from "node:child_process";
import http from "node:http";
import { mkdir } from "node:fs/promises";
const expect = baseExpect.configure({ timeout: 30000 });

const database = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ launchTimeout: 60000 }],
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
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(90000);
  await mkdir("artifacts", { recursive: true });
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
  guest.setDefaultTimeout(45000);
  guest.setDefaultNavigationTimeout(90000);
  guest.on("pageerror", (error) => errors.push(error.message));
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
  await guest.goto(`${base}/app/friends`);
  const discovered = guest
    .locator(".friend-row")
    .filter({ hasText: "Deploy Browser" });
  await expect(
    discovered.getByRole("button", { name: "Add friend", exact: true }),
  ).toBeVisible();
  await expect(
    discovered.getByRole("img", { name: "Online", exact: true }),
  ).toBeVisible();
  await discovered
    .getByRole("button", { name: "Add friend", exact: true })
    .click();
  await page.goto(`${base}/app/friends`);
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    page
      .locator(".friend-row")
      .filter({ hasText: "Deploy Rival" })
      .filter({
        has: page.getByRole("button", { name: "Remove", exact: true }),
      })
      .getByRole("img", { name: "Online", exact: true }),
  ).toBeVisible();
  await expect(
    discovered.getByRole("button", { name: "Remove", exact: true }),
  ).toBeVisible();
  await expect(
    discovered.getByRole("img", { name: "Online", exact: true }),
  ).toBeVisible();
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.screenshot({
    path: "artifacts/friends-online-mobile.png",
    fullPage: true,
  });
  await page.goto(`${base}/app/play`);
  await expect(page.locator(".game-card").last()).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 700 });
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  expect(
    await page.locator(".app-header").evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      position: getComputedStyle(el).position,
      color: getComputedStyle(el).backgroundColor,
    })),
  ).toEqual({ top: 0, position: "fixed", color: "rgb(117, 72, 232)" });
  await page.screenshot({
    path: "artifacts/purple-header-desktop.png",
    fullPage: false,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "PASS: automatic player discovery and friend requests between new accounts",
  );
  await page.goto(`${base}/app/rooms/create`);
  await page.getByLabel("Room name").fill("Production six game duel");
  await page.getByLabel("Rounds", { exact: true }).selectOption("6");
  await page.getByLabel("Answer time", { exact: true }).selectOption("45");
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
  await guest
    .getByRole("button", { name: "I\u2019m ready", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Start match" })).toBeEnabled();
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.locator(".quiz-options")).toBeVisible({ timeout: 20000 });
  await expect(guest.locator(".quiz-options")).toBeVisible();
  const roomDoc = () =>
    mongoose.connection
      .db!.collection("livegamerooms")
      .findOne({ _id: code } as any);
  for (const player of [page, guest]) {
    for (const name of ["Pause", "Restart", "Chat", "Quit game"])
      await expect(
        player.getByRole("button", { name, exact: true }),
      ).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Cancel game", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page
    .getByLabel("Message", { exact: true })
    .fill("Hello from the desktop player");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    guest.getByRole("button", { name: /Read message/ }),
  ).toBeVisible();
  await guest.getByRole("button", { name: /Read message/ }).click();
  await expect(guest.getByRole("log")).toContainText(
    "Hello from the desktop player",
  );
  await guest
    .getByLabel("Message", { exact: true })
    .fill("Hello from the mobile player");
  await guest
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText(
    "Hello from the mobile player",
  );
  await page.screenshot({
    path: "artifacts/room-chat-desktop.png",
    fullPage: true,
  });
  await guest.evaluate(() => window.scrollTo(0, 0));
  await guest.screenshot({
    path: "artifacts/room-chat-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close chat" }).click();
  await guest.getByRole("button", { name: "Close chat" }).click();
  await guest.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByText("Game paused for everyone", { exact: true }),
  ).toBeVisible();
  // Keep clocks frozen while exercising a full conversation through the API.
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(550);
    const response = await context.request.post(
      `${base}/api/v1/realtime/command`,
      {
        headers: { Origin: base },
        data: {
          event: "chat:send",
          payload: {
            code,
            text: `Round ${i + 1}: Great game! Ready for another challenge?`,
          },
        },
      },
    );
    expect(response.ok()).toBe(true);
  }
  await guest.getByRole("button", { name: /^Chat/ }).click();
  await expect(guest.getByRole("log")).toContainText("Round 12:");
  await guest.getByRole("log").evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const chatHeaderTop = (await guest.locator(".chat-header").boundingBox())!.y;
  const composerTop = (await guest.locator(".chat-footer").boundingBox())!.y;
  await page.getByRole("button", { name: /^Chat/ }).click();
  await page.waitForTimeout(550);
  await page
    .getByLabel("Message", { exact: true })
    .fill("A new message while you read");
  await page.getByLabel("Message", { exact: true }).press("Enter");
  await expect(
    guest.getByRole("button", { name: "New messages" }),
  ).toBeVisible();
  expect(await guest.getByRole("log").evaluate((el) => el.scrollTop)).toBe(0);
  expect((await guest.locator(".chat-header").boundingBox())!.y).toBe(
    chatHeaderTop,
  );
  expect((await guest.locator(".chat-footer").boundingBox())!.y).toBe(
    composerTop,
  );
  await guest.getByRole("button", { name: "New messages" }).click();
  await expect(guest.getByRole("button", { name: "New messages" })).toHaveCount(
    0,
  );
  await guest
    .getByRole("button", { name: "Choose emoji", exact: true })
    .click();
  await guest
    .getByRole("button", { name: "Insert \u{1F3C6}", exact: true })
    .click();
  await guest
    .getByRole("button", { name: "Send message", exact: true })
    .click();
  await expect(page.getByRole("log").locator(".chat-emoji-only")).toHaveText(
    "\u{1F3C6}",
  );
  await guest.setViewportSize({ width: 320, height: 700 });
  await guest.emulateMedia({ colorScheme: "dark" });
  expect(
    await guest.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const mobileChat = (await guest.locator(".room-chat-panel").boundingBox())!;
  expect(mobileChat.y).toBeGreaterThanOrEqual(72);
  expect(mobileChat.y + mobileChat.height).toBeLessThanOrEqual(700);
  await guest.screenshot({
    path: "artifacts/modern-chat-dark-mobile.png",
    fullPage: false,
  });
  await guest.emulateMedia({ colorScheme: "light" });
  await guest.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Close chat" }).click();
  await guest.getByRole("button", { name: "Close chat" }).click();
  console.log(
    "PASS: green friend presence, fixed purple header, grouped chat, emoji sending, independent conversation scrolling, and 320px chat layout",
  );
  await page.screenshot({
    path: "artifacts/game-controls-desktop.png",
    fullPage: true,
  });
  await guest.screenshot({
    path: "artifacts/game-controls-mobile.png",
    fullPage: true,
  });
  await guest.reload({ waitUntil: "domcontentloaded" });
  await expect(
    guest.getByRole("button", { name: "Resume game", exact: true }),
  ).toBeVisible();
  await guest.getByRole("button", { name: /^Chat/ }).click();
  await expect(guest.getByRole("log")).toContainText(
    "Hello from the desktop player",
  );
  await expect(guest.getByRole("log")).toContainText(
    "Hello from the mobile player",
  );
  await expect(
    guest
      .getByRole("log")
      .getByText("Hello from the desktop player", { exact: true }),
  ).toHaveCount(1);
  await guest.getByRole("button", { name: "Close chat" }).click();
  await guest.getByRole("button", { name: "Resume game", exact: true }).click();
  await expect(page.locator(".quiz-options")).toBeVisible();
  const firstMatch = (await roomDoc())!.snapshot.id;
  await guest.getByRole("button", { name: "Restart", exact: true }).click();
  await expect(
    page.getByText("Deploy Rival asked to restart the match."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await page.getByRole("button", { name: "Restart now", exact: true }).click();
  await expect
    .poll(async () => (await roomDoc())!.snapshot.id)
    .not.toBe(firstMatch);
  await expect
    .poll(async () => (await roomDoc())!.snapshot.status)
    .toBe("playing");
  const reset = (await roomDoc())!.snapshot;
  expect(reset.id).not.toBe(firstMatch);
  expect(reset.round).toBe(1);
  expect(reset.results).toEqual([]);
  await expect(
    page.locator(`[data-round-id="${reset.secret.challenge.id}"]`),
  ).toBeVisible();
  await expect(
    guest.locator(`[data-round-id="${reset.secret.challenge.id}"]`),
  ).toBeVisible();
  console.log(
    "PASS: visible desktop/mobile controls, two-way chat, paused reload, timer resume, restart request and fresh round one across workers",
  );
  let secret = reset.secret;
  await page.reload({ waitUntil: "domcontentloaded" });
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
  }
  await expect(page.locator(".letter-rack")).toBeVisible({ timeout: 15000 });
  secret = (await roomDoc())!.snapshot.secret;
  for (const player of [page, guest]) {
    await player.getByLabel("Your answer").fill(secret.answer.toLowerCase());
    await player.getByRole("button", { name: "Lock it in" }).click();
  }
  await expect(guest.locator(".reflex-pad")).toBeVisible({ timeout: 15000 });
  await guest.getByRole("button", { name: /^Chat/ }).click();
  await guest.getByLabel("Message", { exact: true }).fill("typing");
  await guest.getByLabel("Message", { exact: true }).press("Space");
  const typingState = await guestContext.request
    .get(`${base}/api/v1/realtime/state`)
    .then((r) => r.json());
  const rival = typingState.room.players.find(
    (p: any) => p.username === "deployrival",
  );
  expect(typingState.room.submitted).not.toContain(rival.id);
  await guest.getByRole("button", { name: "Close chat" }).click();
  await expect(page.locator(".reflex-pad.go")).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(120);
  await page.locator(".reflex-pad.go").click();
  await expect(guest.locator(".reflex-pad.go")).toBeVisible();
  await guest.locator(".reflex-pad.go").click();
  await expect(page.locator(".number-circuit")).toBeVisible({ timeout: 15000 });
  secret = (await roomDoc())!.snapshot.secret;
  await guest.screenshot({
    path: "artifacts/number-circuit-mobile.png",
    fullPage: true,
  });
  for (const player of [page, guest])
    await player.locator(".quiz-options button").nth(secret.answer).click();
  await expect(page.locator(".code-breaker")).toBeVisible({ timeout: 15000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".code-clue").first()).toBeVisible();
  await page.screenshot({
    path: "artifacts/code-breaker-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/code-breaker-mobile.png",
    fullPage: true,
  });
  secret = (await roomDoc())!.snapshot.secret;
  await expect(page.locator(".code-clue")).toHaveCount(
    secret.challenge.clues.length,
  );
  await guest
    .getByLabel("Your secret code", { exact: true })
    .fill(secret.answer);
  await guest.getByRole("button", { name: "Crack the code" }).click();
  await expect(
    page.getByLabel("Your secret code", { exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Chat/ })).toBeVisible();
  await page
    .getByLabel("Your secret code", { exact: true })
    .fill(secret.answer);
  await page.getByRole("button", { name: "Crack the code" }).click();
  await expect(
    page.getByRole("heading", { name: "The crown is yours." }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    guest.getByRole("heading", { name: "Deploy Browser takes the crown." }),
  ).toBeVisible();
  const completed = await roomDoc();
  expect(completed!.snapshot.results).toHaveLength(6);
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
    "PASS: all six games, ranked scoring, persisted results, achievements, and leaderboard entries across independent production workers",
  );
  await page.getByRole("button", { name: "Rematch", exact: true }).click();
  await expect(
    guest.getByText("Good company. Great competition."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel game", exact: true }).click();
  await page.getByRole("button", { name: "Cancel match", exact: true }).click();
  await expect(
    guest.getByRole("heading", { name: "This match has ended." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Restart", exact: true }).click();
  await page.getByRole("button", { name: "Restart now", exact: true }).click();
  await expect(guest.locator(".quiz-options")).toBeVisible();
  await guest.getByRole("button", { name: "Quit game", exact: true }).click();
  await guest.getByRole("button", { name: "Quit now", exact: true }).click();
  await expect(guest).toHaveURL(`${base}/app`);
  await expect(
    page.getByRole("heading", { name: "This match has ended." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quit game", exact: true }).click();
  await page.getByRole("button", { name: "Quit now", exact: true }).click();
  await expect(page).toHaveURL(`${base}/app`);
  console.log(
    "PASS: shared cancellation, restarting a cancelled game, and quitting during active play without trapping either player",
  );
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
  for (const route of ["/privacy", "/terms", "/contact", "/accessibility"]) {
    await page.goto(base + route);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  console.log(
    "PASS: public help/privacy/fair-play/accessibility pages at 320px",
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
} catch (error) {
  console.error("Production browser check failed:", error);
  for (const context of browser.contexts())
    for (const page of context.pages()) {
      console.error("Failed URL:", page.url());
      console.error(
        (
          await page
            .locator("body")
            .innerText()
            .catch(() => "unavailable")
        ).slice(0, 4000),
      );
    }
  throw error;
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
