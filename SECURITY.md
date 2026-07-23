# Security Policy

## Supported Versions

Security fixes are provided for the latest tagged release.

## Reporting a Vulnerability

Do not open a public issue for a suspected vulnerability or leaked credential.
Use GitHub's private vulnerability reporting for this repository:

`Security` -> `Advisories` -> `Report a vulnerability`

Include the affected version, OpenClaw version, a minimal reproduction, and the
impact. Never include a real Cursor API key, OpenClaw token, chat transcript, or
private workspace content.

## Credential Handling

The plugin reads `CURSOR_API_KEY` from the OpenClaw provider context or process
environment. It does not write the key to its session store. Session metadata
is stored under `~/.openclaw/cursor-provider` with owner-only permissions.

## Upstream Dependencies

The plugin pins the official Cursor SDK and uses its transport dependencies.
As of `@cursor/sdk@1.0.24`, `npm audit` reports advisories in the SDK's
transitive `undici@5.29.0` dependency. There is no compatible upstream fix in
the current Cursor SDK release. Dependabot is enabled, and the pin should be
updated as soon as Cursor publishes a compatible transport update.
