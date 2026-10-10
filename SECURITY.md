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
Cursor SDK 1.0.37 no longer depends on ConnectRPC Node or undici, so the
previous transitive dependency override is no longer necessary.
CI and release checks must keep `npm audit` at zero known vulnerabilities.
Dependabot security updates are enabled. Routine npm and GitHub Actions
version updates are grouped monthly, with at most one open version-update PR
per ecosystem. Security updates are grouped separately and do not wait for
the monthly version-update schedule.
