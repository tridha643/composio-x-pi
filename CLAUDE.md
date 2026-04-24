# CLAUDE.md

Guidance for Claude Code and other AI coding agents working in this repository.

## Project overview

`composio-x-pi` is a Bun/TypeScript Pi extension that exposes Composio-backed tools to Pi. The package entrypoint is `src/index.ts`, with runtime tools under `src/tools/runtime/` and authoring-only tools under `src/tools/authoring/`.

## Commands

Use Bun for local development:

```bash
bun install
bun run test
bun run typecheck
bun run build
```

Additional scripts:

```bash
bun run test:integration
bun run dev:pi
bun run dev:ipc-stub
```

Run `bun run test` and `bun run typecheck` before handing off changes. Run `bun run build` when changing exports, packaging, or the extension entrypoint.

## Configuration

The extension is API-key based. Use `/composio-api-key` inside Pi to store a Composio API key for the extension, or set `COMPOSIO_API_KEY` in the environment.

Optional variables:

- `COMPOSIO_USER_ID` — defaults to `default` when omitted.
- `COMPOSIO_PI_MODE=authoring|worktree` — defaults to `worktree`; `authoring` enables trigger-authoring tools.
- `COMPOSIO_PI_IPC_SOCK` — override the Unix socket used by `save_automation_local`.
- `COMPOSIO_PI_WEBHOOK_TEST_URL` — endpoint used by `test_webhook_delivery`.
- `COMPOSIO_PI_EVENT_POLL_URL` — endpoint used by `test_webhook_delivery` to poll received events.

## Code conventions

- This is an ESM TypeScript project (`"type": "module"`). Keep imports ESM-compatible.
- Prefer small, typed modules. Shared helpers belong in `src/lib/`.
- Tool implementations should live in the closest matching folder under `src/tools/`.
- Keep runtime tools available in all modes; keep trigger-authoring functionality behind authoring mode.
- Use `@sinclair/typebox` schemas consistently for tool input definitions.
- Preserve existing error-handling style and avoid leaking secrets in logs, errors, or tests.

## Testing guidance

- Add or update tests in `tests/` when changing behavior.
- Prefer unit tests for mode/tool registration and schema behavior.
- Integration tests may require real Composio credentials; do not make normal unit tests depend on external services.
- If behavior differs by `COMPOSIO_PI_MODE`, test both authoring and worktree/default paths.

## Packaging notes

- `package.json` exposes `./src/index.ts` for Pi and builds to `dist/index.js`.
- Keep `files`, `exports`, and `pi.extensions` aligned if entrypoints move.
- Do not commit generated artifacts unless the project explicitly requires them for a release.
