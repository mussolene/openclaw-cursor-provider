import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// A child process isolates homedir and the module cache from real user sessions.
test("concurrent initial writes preserve every session and special keys", async () => {
  const home = await mkdtemp(join(tmpdir(), "cursor-store-"));
  try {
    const moduleUrl = new URL("../dist/src/session-store.js", import.meta.url).href;
    execFileSync(process.execPath, ["--input-type=module", "-e", `
      import assert from "node:assert/strict";
      const { upsertCursorSession, getCursorSession, deleteCursorSession } = await import(${JSON.stringify(moduleUrl)});
      const ids = ["a", "b", "__proto__"];
      await Promise.all(ids.map(sessionId => upsertCursorSession({ sessionId, agentId: sessionId, createdAt: 1, lastUsedAt: 1 })));
      for (const id of ids) assert.equal((await getCursorSession(id)).agentId, id);
      assert.equal(await getCursorSession("constructor"), undefined);
      await deleteCursorSession("b");
    `], { env: { ...process.env, HOME: home, USERPROFILE: home } });
    const path = join(home, ".openclaw/cursor-provider/sessions.json");
    const stored = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(Object.keys(stored.sessions).sort(), ["__proto__", "a"]);
    if (process.platform !== "win32") assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("persistence errors are observable and later writes recover", async () => {
  const home = await mkdtemp(join(tmpdir(), "cursor-store-error-"));
  try {
    const moduleUrl = new URL("../dist/src/session-store.js", import.meta.url).href;
    execFileSync(process.execPath, ["--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
      import { join } from "node:path";
      const dir = join(process.env.HOME, ".openclaw", "cursor-provider");
      await mkdir(join(process.env.HOME, ".openclaw"));
      await writeFile(dir, "blocked");
      const { upsertCursorSession } = await import(${JSON.stringify(moduleUrl)});
      const record = { sessionId: "a", agentId: "a", createdAt: 1, lastUsedAt: 1 };
      await assert.rejects(upsertCursorSession(record));
      await rm(dir);
      await upsertCursorSession(record);
      assert.equal(JSON.parse(await readFile(join(dir, "sessions.json"), "utf8")).sessions.a.agentId, "a");
    `], { env: { ...process.env, HOME: home, USERPROFILE: home } });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
