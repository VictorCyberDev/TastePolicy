// @vitest-environment node
// The client identity headers are believed only on a platform that sets them.
process.env.VERCEL = "1";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { platformDatabase } from "./platform-fixtures";

let d: Awaited<ReturnType<typeof platformDatabase>>;
beforeAll(async () => {
  d = await platformDatabase();
}, 30000);
afterAll(async () => d?.db.close());

const req = (ip: string) =>
  new Request("https://tastepolicy.test/api/attest/verify", {
    headers: { "x-real-ip": ip },
  });
// A fresh module instance has its own per-process state: it plays the part of
// another serverless instance that shares only the database.
async function instance() {
  vi.resetModules();
  return import("@/server/platform/public-limit");
}
async function wave(
  lim: Awaited<ReturnType<typeof instance>>,
  ip: string,
  n: number,
  pool: "verify" | "status" = "verify",
) {
  let ok = 0;
  const calls = Array.from({ length: n }, async () => {
    const r = await lim.admitPublicShared(req(ip), pool, d.store);
    if (r) {
      ok++;
      r();
    }
  });
  await Promise.all(calls);
  return ok;
}

it("the shared per-client budget holds across instances: two instances together let exactly the budget through", async () => {
  const a = await instance(),
    b = await instance();
  let admitted = 0;
  for (let i = 0; i < 10; i++)
    admitted += await wave(i % 2 ? a : b, "198.51.100.7", 8);
  // 80 attempts at 60 per minute, however they are split between instances
  expect(admitted).toBe(60);
}, 60000);
it("the pool total bounds all clients together", async () => {
  const lim = await instance();
  let admitted = 0;
  // many distinct clients, each far below its own budget
  for (let i = 0; i < 1300; i++) {
    const r = await lim.admitPublicShared(
      req(`203.0.113.${i % 250}-${Math.floor(i / 250)}`),
      "verify",
      d.store,
    );
    if (r) {
      admitted++;
      r();
    }
  }
  // this test file already used 60 of the pool's 1200 in the minute above
  expect(admitted).toBe(1200 - 60);
}, 120000);
it("pools are separate: exhausting verify does not touch status", async () => {
  const lim = await instance();
  expect(await wave(lim, "192.0.2.50", 5, "status")).toBe(5);
});
it("old minutes are deleted as new ones are written, so storage stays bounded", async () => {
  await d.db.query(
    `INSERT INTO tastepolicy.public_rate(key_hash,bucket,used) VALUES('${"a".repeat(64)}','2020-01-01T00:00',5),('${"b".repeat(64)}','2020-01-01T00:01',5)`,
  );
  const spy = vi.spyOn(Math, "random").mockReturnValue(0);
  const lim = await instance();
  await lim.admitPublicShared(req("192.0.2.77"), "status", d.store);
  spy.mockRestore();
  const left = await d.db.query(
    "SELECT count(*)::int AS n FROM tastepolicy.public_rate WHERE bucket < '2021'",
  );
  expect((left.rows[0] as { n: number }).n).toBe(0);
});
it("a failing shared tier never opens the endpoint: the per-instance tier still limits", async () => {
  const lim = await instance();
  const broken = {
    transaction: () => Promise.reject(new Error("db down")),
  } as unknown as typeof d.store;
  let ok = 0;
  for (let i = 0; i < 70; i++) {
    const r = await lim.admitPublicShared(req("192.0.2.99"), "verify", broken);
    if (r) {
      ok++;
      r();
    }
  }
  expect(ok).toBe(60);
});
it("the concurrency cap releases: a held slot is returned exactly once", async () => {
  const lim = await instance();
  const held: (() => void)[] = [];
  for (let i = 0; i < 16; i++) {
    const r = await lim.admitPublicShared(
      req(`192.0.3.${100 + i}`),
      "status",
      d.store,
    );
    expect(r).not.toBeNull();
    held.push(r!);
  }
  expect(
    await lim.admitPublicShared(req("192.0.2.120"), "status", d.store),
  ).toBeNull();
  held[0]();
  held[0](); // idempotent
  const again = await lim.admitPublicShared(
    req("192.0.2.121"),
    "status",
    d.store,
  );
  expect(again).not.toBeNull();
  expect(
    await lim.admitPublicShared(req("192.0.2.122"), "status", d.store),
  ).toBeNull();
});
