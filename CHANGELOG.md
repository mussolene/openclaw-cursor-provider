# Changelog

## 0.2.3 - 2026-10-10

- Уточнено обнаружение инструментов через зарегистрированные OpenClaw tool_search, tool_describe и tool_call вместо инструментов Cursor IDE.
- Для одноразовых ACP-запусков используется автоматическая доставка результата без лишнего sessions_yield, опроса статуса или повторного запуска.
- Пропущенное ожидание с deniedReason=steering не трактуется как отказ ACP и не повторяется.

## 0.2.2 - 2026-10-10

- После передачи инструмента OpenClaw следующий шаг создаёт новый SDK-агент с полным каноническим контекстом. Это исключает повторные вызовы из прерванного SDK-диалога.
- Cursor SDK обновлен до 1.0.37, типы Node.js до 25.9.9.
- Обычные обновления npm и GitHub Actions собираются в месячные группы, максимум по одному открытому PR на экосистему.
- Исправления безопасности npm выделены в отдельную группу и не ждут месячного расписания.
- Исправлено удвоение ответа SDK без потоковых событий.
- Новый агент после неудачного восстановления сессии получает полный контекст.
- Устранена потеря сессий при одновременной первой записи; файл заменяется атомарно, ошибки записи передаются вызывающему коду.
- Числовые лимиты принимают только положительные безопасные целые числа.
- Cursor SDK 1.0.34 удаляет зависимость от ConnectRPC Node и undici; ненужный override удален.
- Обновлены Cursor SDK до 1.0.34, типы Node.js до 25.9.8 и CodeQL до 4.38.2.
- Обновления шагов CodeQL сгруппированы, проверка npm audit добавлена в CI.
All notable changes to this project are documented here.

## 0.2.1 - 2026-09-03

- Committed the compiled `dist/` entry point required by OpenClaw Git installs.
- Added CI verification that committed build output matches TypeScript sources.
- Corrected the documented Git install syntax and Node.js requirement.

## 0.2.0 - 2026-09-03

- Updated `@cursor/sdk` to 1.0.30 for in-process token refresh after long idle
  periods.
- Restricted Cursor built-in tools before each local agent starts: tool turns
  allow only the MCP family used for OpenClaw custom tools, while chat turns
  allow no built-in tools.
- Added configurable workspace scan caching with a five-minute default.
- Added a long-idle SDK smoke test and regression tests for tool restrictions.
- Overrode the vulnerable transitive `undici` release with 6.28.0.
- Raised the minimum Node.js version to 22.13 to match Cursor SDK 1.0.30.

## 0.1.3 - 2026-07-25

- Delayed the custom-tool safety response so OpenClaw can intercept and cancel
  Cursor runs before the model attempts duplicate fallback tool calls.

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
