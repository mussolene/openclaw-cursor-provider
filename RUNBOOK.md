# openclaw-cursor-provider - RUNBOOK

## Token optimization (`chatMode`)

Plugin path: managed by OpenClaw from the tagged GitHub repository.

### Config (`openclaw.json` -> `plugins.entries.openclaw-cursor-provider.config`)

| Key | Default | Meaning |
|-----|---------|---------|
| `chatMode` | `"auto"` | `auto` = slim Q&A without tools; `never` = legacy full prompt always |
| `slimSystemMaxChars` | `2000` | System prompt cap in chat-only turns |
| `maxHistoryMessages` | `6` | History cap in slim prompts |
| `includeThinkingInPrompt` | `false` | Omit `[assistant thinking]` from tool-mode prompts |
| `strictToolLoop` | `true` | Block Cursor builtin tools in tool mode |

### How turns are classified

`needsTools()` → **tool mode** (full prompt + `customTools`):

- Active tool loop (pending `toolResult` / unfinished `toolUse`)
- User text matches action verbs (read/show/find/exec/git status/…)
- User text longer than 280 chars

Otherwise → **chat-only** (slim prompt, `customTools: []`).

### Smoke results (2026-06-24)

| Test | promptChars | customTools | totalTokens |
|------|-------------|-------------|-------------|
| ping (chat-only) | 964 | 0 | ~12K |
| pong follow-up (chat-only, no resume) | 1036 | 0 | ~18K |
| «прочитай SOUL.md» (tool mode) | 36563 | 3 | toolUse ✅ |

Before optimization: pong ~22K tokens, prompt ~34KB + tools every turn.

If follow-up pong stays above 5K tokens, remaining cost is **Cursor Agent API floor** (~10–12K per `Agent.create` call), not OpenClaw prompt size. Plugin sends ~120–2K chars vs ~34KB before.

Chat-only turns use fresh `Agent.create` (no `Agent.resume`) to avoid cumulative Cursor transcript growth.

### Smoke tests (isolated sessions — NOT live Telegram)

```bash
# pong
openclaw agent --local --agent main \
  --session-key agent:main:test-slim-pong-1 \
  --model cursor/auto -m "ping" --json

openclaw agent --local --agent main \
  --session-key agent:main:test-slim-pong-1 \
  --model cursor/auto -m "pong" --json

# read → toolUse
openclaw agent --local --agent main \
  --session-key agent:main:test-slim-read-1 \
  --model cursor/auto -m "прочитай SOUL.md одной фразой" --json

# chat-only (no false positive on «git»)
openclaw agent --local --agent main \
  --session-key agent:main:test-slim-git-chat-1 \
  --model cursor/auto -m "расскажи что такое git" --json
```

Check `usage.totalTokens` and `usage.cost.total` in JSON output.

### Debug logs

Gateway log lines:

```
[cursor-provider] cursor-provider turn {"toolTurn":false,"sentFullPrompt":false,"promptChars":...}
```

## Cursor ACP routing

- Telegram direct chats and other channels without thread support must use
  `sessions_spawn` with `runtime: "acp"` and `mode: "run"`.
- Persistent `mode: "session"` requires both `thread: true` and a channel that
  exposes threads or topics.
- Treat `thread_required` as a routing error: retry once with `mode: "run"`
  instead of reporting the ACP backend as unavailable.
- Direct `acpx` global options precede the agent command:

```bash
acpx --cwd /path/to/workspace --format quiet cursor exec "prompt"
```

### Rollback

Set `chatMode: "never"` to restore legacy behavior (full bootstrap + tools every turn).
