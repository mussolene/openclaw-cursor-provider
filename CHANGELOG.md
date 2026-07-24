# Changelog

All notable changes to this project are documented here.

## 0.1.2 - 2026-07-24

- Added ACP direct-chat routing guidance: use one-shot `mode=run` when threads
  are unavailable and recover automatically from `thread_required`.
- Corrected direct `acpx` command ordering and unavailable-tool retry guidance.
- Added regression coverage for ACP routing rules in provider prompts.

## 0.1.1 - 2026-07-23

- Finished the naming migration to `openclaw-cursor-provider` in runtime logs.

## 0.1.0 - 2026-07-23

- Added a native Cursor model provider backed by `@cursor/sdk`.
- Added dynamic and static model catalogs.
- Added OpenClaw-owned tool execution with fail-closed tool mapping.
- Added persistent tool-mode sessions and lightweight chat-only turns.
- Added configurable prompt slimming, usage accounting, and pricing estimates.
- Added package, CI, security, and release documentation.
