# CLAUDE.md

Guidance for Claude Code and other AI coding agents working in this repository.

## Project overview

`composio-x-pi` is a Bun/TypeScript Pi extension that exposes Composio-backed tools to Pi. The package entrypoint is `src/index.ts`, with runtime tools under `src/tools/runtime/` and trigger-authoring tools under `src/tools/authoring/`.

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
```

Run `bun run test` and `bun run typecheck` before handing off changes. Run `bun run build` when changing exports, packaging, or the extension entrypoint.

## Configuration

The extension is API-key based. Use `/composio-init` inside Pi to store a Composio API key for the extension, or set `COMPOSIO_API_KEY` in the environment.

Optional variables:

- `COMPOSIO_USER_ID` — defaults to `default` when omitted.

## Code conventions

- This is an ESM TypeScript project (`"type": "module"`). Keep imports ESM-compatible.
- Prefer small, typed modules. Shared helpers belong in `src/lib/`.
- Tool implementations should live in the closest matching folder under `src/tools/`.
- Runtime and trigger-authoring tools are always registered.
- `save_automation_definition` writes JSON handoff files; keep webhook/ngrok delivery verification in host-app logic.
- Use `@sinclair/typebox` schemas consistently for tool input definitions.
- Preserve existing error-handling style and avoid leaking secrets in logs, errors, or tests.

## Testing guidance

- Add or update tests in `tests/` when changing behavior.
- Prefer unit tests for tool registration and schema behavior.
- Integration tests may require real Composio credentials; do not make normal unit tests depend on external services.

## Packaging notes

- `package.json` exposes `./src/index.ts` for Pi and builds to `dist/index.js`.
- Keep `files`, `exports`, and `pi.extensions` aligned if entrypoints move.
- Do not commit generated artifacts unless the project explicitly requires them for a release.
