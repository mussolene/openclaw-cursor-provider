import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CursorSessionRecord {
  agentId: string;
  sessionId: string;
  createdAt: number;
  lastUsedAt: number;
  modelId?: string;
  /** First full OpenClaw system prompt already sent to this Cursor agent. */
  bootstrapped?: boolean;
}

type SessionStoreFile = {
  version: 1;
  sessions: Record<string, CursorSessionRecord>;
};

const STORE_DIR = join(homedir(), ".openclaw", "cursor-provider");
const STORE_PATH = join(STORE_DIR, "sessions.json");

let cache: SessionStoreFile | undefined;
let writeChain: Promise<void> = Promise.resolve();

async function loadStore(): Promise<SessionStoreFile> {
  if (cache) return cache;
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as SessionStoreFile;
    if (parsed?.version === 1 && parsed.sessions && typeof parsed.sessions === "object") {
      cache = parsed;
      return cache;
    }
  } catch {
    /* fresh store */
  }
  cache = { version: 1, sessions: {} };
  return cache;
}

async function persistStore(store: SessionStoreFile): Promise<void> {
  await mkdir(STORE_DIR, { recursive: true, mode: 0o700 });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function queuePersist(store: SessionStoreFile): Promise<void> {
  writeChain = writeChain
    .then(() => persistStore(store))
    .catch(() => undefined);
  return writeChain;
}

export async function getCursorSession(sessionId: string): Promise<CursorSessionRecord | undefined> {
  const store = await loadStore();
  return store.sessions[sessionId];
}

export async function upsertCursorSession(record: CursorSessionRecord): Promise<void> {
  const store = await loadStore();
  store.sessions[record.sessionId] = record;
  await queuePersist(store);
}

export async function deleteCursorSession(sessionId: string): Promise<void> {
  const store = await loadStore();
  if (!store.sessions[sessionId]) return;
  delete store.sessions[sessionId];
  await queuePersist(store);
}

export async function listCursorSessions(): Promise<CursorSessionRecord[]> {
  const store = await loadStore();
  return Object.values(store.sessions);
}
