import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { createApplication } from "../src/app.js";

let mongo: MongoMemoryReplSet;
let instance: ReturnType<typeof createApplication>;
let connect: ReturnType<typeof vi.spyOn>;
const webOrigin = "https://duoxgame.vercel.app";
const credentials = {
  email: "deploy@example.test",
  password: "deployment-test-password",
};
let cookie: string;

beforeAll(async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("FRONTEND_ORIGIN", webOrigin);
  vi.stubEnv("MONGODB_URI", "");
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  connect = vi.spyOn(mongoose, "connect");
  // Import the actual production entry point, without connecting first.
  instance = (await import("../src/index.js")).instance;
}, 120000);

afterAll(async () => {
  if (instance) await instance.close();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("production authentication entry point", () => {
  it("returns retryable JSON when the database configuration is missing", async () => {
    const result = await request(instance.app)
      .post("/api/v1/auth/login")
      .set("Origin", webOrigin)
      .set("Sec-Fetch-Site", "same-origin")
      .send(credentials);
    expect(result.status).toBe(503);
    expect(result.type).toBe("application/json");
    expect(result.body.error).toContain("temporarily unavailable");
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(connect).not.toHaveBeenCalled();
  });

  it("initializes the database before concurrent cold-start account requests", async () => {
    vi.stubEnv("MONGODB_URI", mongo.getUri("duo_deployment_test"));
    const [registration, health] = await Promise.all([
      request(instance.app)
        .post("/api/v1/auth/register")
        .set("Origin", webOrigin)
        .set("Sec-Fetch-Site", "same-origin")
        .send({
          ...credentials,
          username: "deployplayer",
          displayName: "Deploy Player",
        }),
      request(instance.app).get("/api/v1/health"),
    ]);
    expect(registration.status).toBe(201);
    expect(registration.body.user.email).toBe(credentials.email);
    expect(registration.body.user).not.toHaveProperty("passwordHash");
    expect(health.status).toBe(200);
    expect(health.body.database).toBe("connected");
    expect(connect).toHaveBeenCalledTimes(1);
    const header = registration.headers["set-cookie"][0];
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Lax");
    cookie = header.split(";")[0];
  });

  it("retains the registered session and reuses the warm database connection", async () => {
    connect.mockClear();
    const result = await request(instance.app)
      .get("/api/v1/auth/me")
      .set("Cookie", cookie);
    expect(result.status).toBe(200);
    expect(result.body.user.username).toBe("deployplayer");
    expect(connect).not.toHaveBeenCalled();
  });

  it("logs out, rejects invalid credentials, and logs in again", async () => {
    expect(
      (
        await request(instance.app)
          .post("/api/v1/auth/logout")
          .set("Origin", webOrigin)
          .set("Cookie", cookie)
      ).status,
    ).toBe(200);
    expect(
      (await request(instance.app).get("/api/v1/auth/me").set("Cookie", cookie))
        .status,
    ).toBe(401);
    const wrong = await request(instance.app)
      .post("/api/v1/auth/login")
      .set("Origin", webOrigin)
      .send({ ...credentials, password: "wrong-password" });
    expect(wrong.status).toBe(401);
    const login = await request(instance.app)
      .post("/api/v1/auth/login")
      .set("Origin", webOrigin)
      .send(credentials);
    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(credentials.email);
    const newCookie = login.headers["set-cookie"][0].split(";")[0];
    expect(newCookie).not.toBe(cookie);
    expect(
      (
        await request(instance.app)
          .get("/api/v1/auth/me")
          .set("Cookie", newCookie)
      ).status,
    ).toBe(200);
  });

  it("rejects requests from unrelated Vercel sites", async () => {
    const result = await request(instance.app)
      .post("/api/v1/auth/login")
      .set("Origin", "https://unrelated-project.vercel.app")
      .send(credentials);
    expect(result.status).toBe(403);
  });
});
