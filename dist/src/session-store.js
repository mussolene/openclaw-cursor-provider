import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const STORE_DIR = join(homedir(), ".openclaw", "cursor-provider");
const STORE_PATH = join(STORE_DIR, "sessions.json");
let loading;
let writeChain = Promise.resolve();
async function loadStore() {
    if (loading)
        return loading;
    loading = (async () => {
        try {
            const raw = await readFile(STORE_PATH, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed?.version === 1 && parsed.sessions && typeof parsed.sessions === "object") {
                return { version: 1, sessions: Object.assign(Object.create(null), parsed.sessions) };
            }
        }
        catch {
            /* fresh store */
        }
        return { version: 1, sessions: Object.create(null) };
    })();
    return loading;
}
async function persistStore(store) {
    await mkdir(STORE_DIR, { recursive: true, mode: 0o700 });
    const temporaryPath = `${STORE_PATH}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
    });
    await rename(temporaryPath, STORE_PATH);
}
function queuePersist(store) {
    writeChain = writeChain.catch(() => undefined).then(() => persistStore(store));
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
