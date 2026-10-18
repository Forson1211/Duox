import { chromium, expect } from "@playwright/test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import express from "express";
import { createServer } from "node:http";
import path from "node:path";

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
const { default: handler } = await import("../api/index.js");
const { instance } = await import("../backend/dist/index.js");
const { default: mongoose } = await import("mongoose");
// Match the Vercel config: preserve API paths, then static files, then SPA fallback.
web.use((req, res, next) =>
  req.path === "/api" || req.path.startsWith("/api/")
    ? handler(req, res, next)
    : next(),
);
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
  await instance.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mongoose.disconnect();
  await database.stop();
}
