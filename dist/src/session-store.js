import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const STORE_DIR = join(homedir(), ".openclaw", "cursor-provider");
const STORE_PATH = join(STORE_DIR, "sessions.json");
let cache;
let writeChain = Promise.resolve();
async function loadStore() {
    if (cache)
        return cache;
    try {
        const raw = await readFile(STORE_PATH, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed?.version === 1 && parsed.sessions && typeof parsed.sessions === "object") {
            cache = parsed;
            return cache;
        }
    }
    catch {
        /* fresh store */
    }
    cache = { version: 1, sessions: {} };
    return cache;
}
async function persistStore(store) {
    await mkdir(STORE_DIR, { recursive: true, mode: 0o700 });
    await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
}
function queuePersist(store) {
    writeChain = writeChain
        .then(() => persistStore(store))
        .catch(() => undefined);
    return writeChain;
}
export async function getCursorSession(sessionId) {
    const store = await loadStore();
    return store.sessions[sessionId];
}
export async function upsertCursorSession(record) {
    const store = await loadStore();
    store.sessions[record.sessionId] = record;
    await queuePersist(store);
}
export async function deleteCursorSession(sessionId) {
    const store = await loadStore();
    if (!store.sessions[sessionId])
        return;
    delete store.sessions[sessionId];
    await queuePersist(store);
}
export async function listCursorSessions() {
    const store = await loadStore();
    return Object.values(store.sessions);
}
