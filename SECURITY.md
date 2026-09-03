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
Cursor SDK 1.0.30 still resolves `undici@5.29.0` through ConnectRPC, so this
package overrides that transitive dependency with audited `undici@6.28.0`.
CI and release checks must keep `npm audit` at zero known vulnerabilities.
Dependabot remains enabled for both direct and transitive updates.
