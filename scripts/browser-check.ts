import { io as connectSocket } from "socket.io-client";
import { chromium, expect } from "@playwright/test";
import { createServer } from "vite";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createApplication } from "../backend/src/app.js";
import { seedContent } from "../backend/src/content.js";
import { allModels, User, MatchResult } from "../backend/src/models.js";
process.env.NODE_ENV = "test";
const database = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
await mongoose.connect(database.getUri("duo_clash_browser_test"));
await Promise.all(allModels.map((m) => m.init()));
await seedContent();
const backend = createApplication({ timing: { starting: 100, results: 600 } });
await new Promise<void>((r) => backend.server.listen(0, "127.0.0.1", r));
const address = backend.server.address() as { port: number };
const vite = await createServer({
  root: path.resolve("frontend"),
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${address.port}`,
        changeOrigin: false,
      },
      "/socket.io": {
        target: `http://127.0.0.1:${address.port}`,
        ws: true,
        changeOrigin: false,
      },
    },
  },
});
await vite.listen();
const browser = await chromium.launch({ headless: true });
const errors: string[] = [];
expect.configure({ timeout: 15000 });
try {
  const a = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
  });
  const b = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1280, height: 900 },
  });
  const page = await a.newPage();
  const rival = await b.newPage();
  for (const p of [page, rival]) {
    p.setDefaultNavigationTimeout(60000);
    p.on("pageerror", (e) => errors.push(e.message));
  }
  const register = async (p: typeof page, username: string) => {
    await p.goto("http://localhost:5173/register", {
      waitUntil: "domcontentloaded",
    });
    await p.getByLabel("Display name").fill(username);
    await p.getByLabel("Username", { exact: true }).fill(username);
    await p
      .getByLabel("Email", { exact: true })
      .fill(username + "@example.test");
    await p
      .getByLabel("Password", { exact: true })
      .fill("browser-test-password");
    await p.getByRole("button", { name: "Create account" }).click();
    await expect(
      p.getByRole("heading", { name: `Hey, ${username}.` }),
    ).toBeVisible({ timeout: 20000 });
    await expect(p.getByText("Connected", { exact: true })).toBeVisible();
  };
  await register(page, "BrowserHost");
  await register(rival, "BrowserRival");
  expect(
    await page.evaluate(async () => {
      const faces = await document.fonts.load(
        '400 16px "Bricolage Grotesque Variable"',
      );
      return (
        faces.length > 0 &&
        getComputedStyle(document.body).fontFamily.includes(
          "Bricolage Grotesque",
        )
      );
    }),
  ).toBe(true);
  console.log("PASS: locally served Bricolage Grotesque font loaded");
  console.log(
    "PASS: registration and authenticated dashboards in two independent browsers",
  );
  await page
    .getByRole("link", { name: "Create a challenge", exact: true })
    .click();
  await page.getByLabel("Room name").fill("Browser duel");
  for (const title of ["Memory Rush", "Word Blitz", "Reflex Race"])
    await page.getByLabel(title, { exact: true }).uncheck();
  await page.getByLabel("Rounds", { exact: true }).selectOption("1");
  await page.getByLabel(/Ranked head-to-head/).check();
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  await expect(
    page.getByText("Good company. Great competition."),
  ).toBeVisible();
  const code = (await page.locator(".room-code").innerText()).trim();
  await rival.goto("http://localhost:5173/app/rooms/join");
  await rival.getByLabel("Invite code", { exact: true }).fill(code);
  await rival.getByRole("button", { name: "Join room", exact: true }).click();
  await expect(
    rival.getByText("Good company. Great competition."),
  ).toBeVisible();
  await rival.setViewportSize({ width: 390, height: 844 });
  await rival.screenshot({
    path: "artifacts/mobile-lobby.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await rival.getByRole("button", { name: "I’m ready", exact: true }).click();
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.locator(".quiz-options")).toBeVisible({ timeout: 20000 });
  const live = backend.rooms.rooms.get(code)!;
  const correct = live.secret!.answer as number;
  await rival.screenshot({ path: "artifacts/mobile-quiz.png", fullPage: true });
  await page.locator(".quiz-options button").nth(correct).click();
  await rival
    .locator(".quiz-options button")
    .nth((correct + 1) % 4)
    .click();
  await expect(
    page.getByRole("heading", { name: "The crown is yours." }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    rival.getByRole("heading", { name: "BrowserHost takes the crown." }),
  ).toBeVisible();
  expect(await MatchResult.countDocuments()).toBe(2);
  console.log(
    "PASS: two-browser room, ready states, synchronized quiz, ranked result, and database persistence",
  );
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/multiplayer-results.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Rematch", exact: true }).click();
  await expect(
    page.getByText("Good company. Great competition."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leave room", exact: true }).click();
  await rival.getByRole("button", { name: "Leave room", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Hey, BrowserHost." }),
  ).toBeVisible();
  await expect(page.locator(".resume-banner")).toHaveCount(0);
  await expect(rival.locator(".resume-banner")).toHaveCount(0);
  await expect(
    rival.getByRole("heading", { name: "Hey, BrowserRival." }),
  ).toBeVisible();
  await expect.poll(() => backend.rooms.membership.size).toBe(0);
  console.log("PASS: rematch resets the lobby and players can leave");
  await page.goto("http://localhost:5173/app/rooms/create");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Room name").fill("Three ways to play");
  await page.getByLabel("Quick Quiz", { exact: true }).uncheck();
  await page.getByLabel("Rounds", { exact: true }).selectOption("3");
  await page.getByLabel("Player limit").selectOption("1");
  await page.getByRole("button", { name: "Create room", exact: true }).click();
  const soloCode = (await page.locator(".room-code").innerText()).trim();
  await page.getByRole("button", { name: "I’m ready", exact: true }).click();
  await page.getByRole("button", { name: "Start match" }).click();
  await expect(page.locator(".memory-grid")).toBeVisible({ timeout: 20000 });
  const solo = backend.rooms.rooms.get(soloCode)!;
  const sequence = solo.secret!.answer as number[];
  await page.screenshot({
    path: "artifacts/mobile-memory.png",
    fullPage: true,
  });
  await expect(page.getByText("Your turn. Repeat the sequence.")).toBeVisible({
    timeout: 10000,
  });
  for (const n of sequence)
    await page
      .getByRole("button", { name: "Tile " + (n + 1), exact: true })
      .click();
  await page.getByRole("button", { name: "Submit sequence" }).click();
  await expect(page.locator(".letter-rack")).toBeVisible({ timeout: 10000 });
  const word = solo.secret!.answer as string;
  await page.screenshot({ path: "artifacts/mobile-word.png", fullPage: true });
  await page.getByLabel("Your answer").fill(word.toLowerCase());
  await page.getByRole("button", { name: "Lock it in" }).click();
  await expect(page.locator(".reflex-pad.go")).toBeVisible({ timeout: 10000 });
  await page.screenshot({
    path: "artifacts/mobile-reflex.png",
    fullPage: true,
  });
  await page.waitForTimeout(120);
  await page.locator(".reflex-pad.go").click();
  await expect(
    page.getByRole("heading", { name: "Nice practice!" }),
  ).toBeVisible({ timeout: 10000 });
  expect(solo.results.every((r) => r.scores[0].correct)).toBe(true);
  await page.getByRole("button", { name: "Return home", exact: true }).click();
  console.log(
    "PASS: Memory Rush, Word Blitz, and Reflex Race playable through the UI",
  );
  await page.goto("http://localhost:5173/app/friends");
  await page.getByLabel("Find a friend by username").fill("BrowserRival");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Request sent/)).toBeVisible();
  await rival.goto("http://localhost:5173/app/friends");
  await rival.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(
    rival.getByText("BrowserHost", { exact: true }).first(),
  ).toBeVisible();
  console.log("PASS: friend request and acceptance");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://localhost:5173/app/settings");
  await page.getByRole("button", { name: "Choose Sunny", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("William Jones");
  await page.getByLabel("Theme", { exact: true }).selectOption("dark");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Profile saved." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of [
      "/app",
      "/app/play",
      "/app/leaderboard",
      "/app/friends",
      "/app/profile",
      "/app/achievements",
      "/app/settings",
      "/app/rooms/create",
      "/app/rooms/join",
      "/app/daily",
    ]) {
      await page.goto("http://localhost:5173" + route);
      await page.locator(".app-content").waitFor();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://localhost:5173/app");
  await page.screenshot({
    path: "artifacts/mobile-dashboard-dark.png",
    fullPage: true,
  });
  console.log(
    "PASS: persistent dark theme and ten pages at 320, 390, and 768 pixels without horizontal overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Toggle theme", exact: true }).click();
  await page.screenshot({
    path: "artifacts/dashboard-light.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/mobile-dashboard-light.png",
    fullPage: true,
  });
  await page.goto("http://localhost:5173/app/profile");
  await page.screenshot({
    path: "artifacts/mobile-profile.png",
    fullPage: true,
  });
  await page.goto("http://localhost:5173/app/play");
  await page
    .getByRole("searchbox", { name: "Search games", exact: true })
    .fill("memory");
  await expect(page.locator(".game-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Memory Rush", exact: true }),
  ).toBeVisible();
  console.log("PASS: game search and saved character customization");
  for (const [index, name] of [
    "Nova",
    "Oliver",
    "Amara",
    "Leo",
    "Skye",
    "Jules",
  ].entries()) {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          username: "qa_" + name.toLowerCase(),
          email: name.toLowerCase() + "@qa.example.test",
          password: "preview-test-password",
        }),
      },
    );
    expect(response.status).toBe(201);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const connection = connectSocket(`http://127.0.0.1:${address.port}`, {
      extraHeaders: { Cookie: cookie },
      transports: ["websocket"],
      forceNew: true,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        connection.once("connect", resolve);
        connection.once("connect_error", reject);
      });
      const send = (event: string, payload: unknown): Promise<any> =>
        new Promise((resolve, reject) => {
          connection
            .timeout(10000)
            .emit(
              event,
              payload,
              (
                error: Error | null,
                reply: { ok: boolean; data: any; error: string },
              ) =>
                error
                  ? reject(error)
                  : reply.ok
                    ? resolve(reply.data)
                    : reject(new Error(reply.error)),
            );
        });
      const state = await send("room:create", {
        name: "QA word match",
        gameIds: ["word-blitz"],
        rounds: 1,
        maxPlayers: 1,
        duration: 15,
        ranked: false,
        category: "All",
      });
      await send("room:ready", { ready: true });
      await send("match:start", {});
      const active = backend.rooms.rooms.get(state.code)!;
      await expect.poll(() => active.status).toBe("playing");
      await send("answer:submit", {
        code: state.code,
        roundId: active.secret!.challenge.id,
        value: active.secret!.answer,
      });
      await expect.poll(() => active.status).toBe("completed");
      await send("room:leave", {});
      await User.updateOne(
        { normalizedUsername: "qa_" + name.toLowerCase() },
        {
          avatar: ["crown", "bolt", "brain", "moon", "heart", "sparkles"][
            index
          ],
        },
      );
    } finally {
      connection.disconnect();
    }
  }
  await page.goto("http://localhost:5173/app/leaderboard");
  await expect(page.locator(".podium-player")).toHaveCount(3);
  await expect(page.locator(".ranking-row")).toHaveCount(5);
  await page.screenshot({
    path: "artifacts/mobile-leaderboard.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Search players", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Find a player", exact: true })
    .fill("qa_nova");
  await expect(page.locator(".ranking-row")).toHaveCount(1);
  await expect(page.locator(".ranking-row")).toContainText("Nova");
  console.log(
    "PASS: podium, real player search, and personal ranking from completed matches",
  );
  await page
    .getByRole("button", { name: "Search players", exact: true })
    .click();
  await expect(page.locator(".podium-player")).toHaveCount(3);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "artifacts/desktop-leaderboard.png",
    fullPage: true,
  });
  await page.goto("http://localhost:5173/");
  await expect(page.locator(".welcome-art img")).toBeVisible();
  await page.screenshot({
    path: "artifacts/landing-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/landing-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://localhost:5173/app");
  await User.updateOne(
    { normalizedUsername: "browserhost" },
    { role: "admin" },
  );
  await page.reload();
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Keep the games good." }),
  ).toBeVisible();
  await page.getByLabel("Category", { exact: true }).fill("General Knowledge");
  await page
    .getByLabel("Question", { exact: true })
    .fill("How many days are in a standard week?");
  for (let i = 1; i <= 4; i++)
    await page.getByLabel("Option " + i, { exact: true }).fill(String(i + 4));
  await page.getByLabel("Correct option").selectOption("2");
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await expect(
    page.getByText("How many days are in a standard week?", { exact: true }),
  ).toBeVisible();
  console.log("PASS: authorized admin question creation");
  expect(errors).toEqual([]);
  console.log("PASS: no uncaught browser errors");
  console.log("Screenshots saved in artifacts/.");
} catch (error) {
  await mkdir("artifacts", { recursive: true });
  for (const context of browser.contexts())
    for (const p of context.pages()) {
      console.error("Failed browser URL:", p.url());
      console.error(
        (
          await p
            .locator("body")
            .innerText()
            .catch(() => "unavailable")
        ).slice(0, 5000),
      );
      await p
        .screenshot({ path: "artifacts/browser-failure.png", fullPage: true })
        .catch(() => undefined);
    }
  throw error;
} finally {
  await browser.close();
  await vite.close();
  await backend.close();
  await mongoose.disconnect();
  await database.stop();
}
