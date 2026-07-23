# OpenClaw Cursor Provider

[![CI](https://github.com/mussolene/openclaw-cursor-provider/actions/workflows/ci.yml/badge.svg)](https://github.com/mussolene/openclaw-cursor-provider/actions/workflows/ci.yml)
[![CodeQL](https://github.com/mussolene/openclaw-cursor-provider/actions/workflows/codeql.yml/badge.svg)](https://github.com/mussolene/openclaw-cursor-provider/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Use Cursor models as a native OpenClaw model provider through the official
`@cursor/sdk` package. The plugin streams model output into OpenClaw, preserves
OpenClaw's tool loop, resumes tool-mode sessions, and keeps simple chat turns
small to reduce token usage.

This is a community plugin. It is not an official Cursor or OpenClaw project.

## Features

- Native `cursor/*` model provider for OpenClaw.
- Dynamic model discovery with a static fallback catalog.
- OpenClaw-owned tool execution: Cursor tool intents are mapped back to the
  tools exposed by the OpenClaw harness.
- Fail-closed handling for unexpected Cursor built-in or MCP tools.
- Persistent tool-mode sessions and fresh lightweight chat-only turns.
- Configurable prompt slimming, history limits, strict tool-loop enforcement,
  and cost estimates.
- Node.js 20 or newer; tested on Node.js 20, 22, and 24.

## Requirements

- OpenClaw `2026.7.1` or newer.
- A Cursor API key with access to the Cursor Agent SDK.
- Node.js 20 or newer.

The Cursor SDK is distributed under its own license and terms. Review those
terms before using this plugin.

## Install

Install a tagged release directly from GitHub:

```bash
openclaw plugins install \
  "git+https://github.com/mussolene/openclaw-cursor-provider.git#v0.1.1" \
  --force
```

Set `CURSOR_API_KEY` in the environment used by the OpenClaw gateway, then
enable the plugin:

```bash
openclaw plugins enable openclaw-cursor-provider
systemctl --user restart openclaw-gateway.service
```

Select a Cursor model in `openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "cursor/auto"
      }
    }
  }
}
```

Do not commit `CURSOR_API_KEY` to the repository or put it directly in a shared
configuration file. Use an OpenClaw SecretRef or a protected environment file.

## Configuration

Plugin settings live under
`plugins.entries.openclaw-cursor-provider.config`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-cursor-provider": {
        "enabled": true,
        "config": {
          "chatMode": "auto",
          "strictToolLoop": true,
          "slimSystemMaxChars": 2000,
          "maxHistoryMessages": 6,
          "includeThinkingInPrompt": false
        }
      }
    }
  }
}
```

| Setting | Default | Purpose |
| --- | ---: | --- |
| `chatMode` | `auto` | Use lightweight chat turns automatically. `never` always enables tool mode; `always` always uses lightweight mode. |
| `strictToolLoop` | `true` | Reject runs where Cursor executes built-in tools outside OpenClaw. |
| `slimSystemMaxChars` | `2000` | Maximum system-prompt characters in lightweight turns. |
| `maxHistoryMessages` | `6` | Maximum recent messages in lightweight turns. |
| `includeThinkingInPrompt` | `false` | Include saved thinking blocks in tool-mode follow-ups. |
| `pricing` | estimate | Override per-million-token input, output, cache-read, and cache-write rates. |

See [RUNBOOK.md](RUNBOOK.md) for operational details and smoke tests.

## Development

```bash
npm ci
npm run check
npm run pack:check
```

`npm run check` type-checks the plugin, builds `dist/`, and runs the Node.js
test suite. CI repeats this on Node.js 20, 22, and 24.

## Security Model

The plugin passes only the tools already registered for the current OpenClaw
turn. Cursor-native built-in tools are rejected when `strictToolLoop` is
enabled. Tool execution remains subject to the OpenClaw gateway's policy,
sandbox, approvals, and allowlists.

This boundary does not make an unsafe OpenClaw configuration safe. Keep
high-risk tools disabled for untrusted chats, use current models, and follow the
OpenClaw security audit recommendations.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

MIT. Cursor, Cursor Agent, and OpenClaw are trademarks of their respective
owners.
