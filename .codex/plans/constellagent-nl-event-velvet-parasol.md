---
constellagent:
  buildHarness: codex
  codingAgent: gpt-5.4
---
# Pi Extension for Constellagent — Scoped Plan

## Context

This plan scopes out **only the Pi extension**, the first buildable slice of the larger Constellagent NL-event-automations system. The full architecture (Supabase relay, event listener, automation runner) is orthogonal and can progress in parallel or after. The Pi extension is the first piece because:

- It is self-contained and testable in isolation — drop the extension into a Pi session, call tools, see Composio respond.
- It surfaces both the runtime toolset (used inside every automation-spawned worktree) and the authoring toolset (used when Constellagent embeds Pi as an LLM engine to translate NL → trigger). Getting both right unblocks everything downstream.
- If the extension is shaky, the rest of the system has nothing to orchestrate.

Runtime is **Bun**. Greenfield — the working directory is empty apart from `.git` and `.gitignore`.

## What Pi gives us (confirmed via pi-mono docs)

Source: `badlogic/pi-mono/packages/coding-agent/docs/{extensions.md,sdk.md}`.

- Extensions are `.ts` modules: `export default function (pi: ExtensionAPI) { ... }`. Loaded via jiti so no build step required for dev.
- Discovery paths: `~/.pi/agent/extensions/`, `<cwd>/.pi/extensions/`, or explicit entries in Pi's `settings.json` under `"extensions"`.
- `pi.registerTool({ name, label, description, parameters: TypeBox, execute })` — `parameters` uses `@sinclair/typebox`; `execute(toolCallId, params, onUpdate, ctx, signal)` returns `{ content, details }`.
- Events available: `session_start`, `tool_call`, `agent_start`, `agent_end`. Handlers can return `{ block: true, reason }` to veto a tool call.
- **Embedding (needed for authoring chat):** `createAgentSession({ extensions, additionalExtensionPaths, eventBus, sessionManager })` from `@mariozechner/pi-coding-agent`. Stream with `session.subscribe(evt => ...)` then call `session.prompt(text)`.
- **No first-class "mode" on ExtensionAPI.** Confirms the env-var approach (`CONSTELLAGENT_MODE`) is correct — Constellagent sets it when it spawns Pi; the extension reads it at load.

## What Composio gives us (confirmed via docs.composio.dev)

- TS SDK mirrors Python: `composio.triggers.get_type(slug)`, `composio.triggers.create({ slug, userId, triggerConfig })`, `composio.triggers.enable/disable/list/delete`.
- Meta-tools for runtime: `COMPOSIO_SEARCH_TOOLS`, `COMPOSIO_GET_TOOL_SCHEMAS`, `COMPOSIO_MANAGE_CONNECTIONS`, `COMPOSIO_MULTI_EXECUTE_TOOL` — delivered via a "tool-router session" (`composio.create({ userId })`).
- Webhook HMAC helper `verifyWebhook` exists but is cloud-side concern — out of scope for the extension.

## Package layout

Single npm package, one dist, mode-conditional at load time.

```
constellagent-pi-extension/
├─ package.json            # name: @constellagent/pi-extension
├─ tsconfig.json
├─ bunfig.toml
├─ src/
│  ├─ index.ts             # default export — the ExtensionFactory
│  ├─ mode.ts              # reads CONSTELLAGENT_MODE env, returns 'authoring' | 'worktree'
│  ├─ composio-client.ts   # singleton SDK client, reads COMPOSIO_API_KEY / COMPOSIO_USER_ID
│  ├─ tools/
│  │  ├─ runtime/
│  │  │  ├─ search-tools.ts
│  │  │  ├─ get-tool-schemas.ts
│  │  │  ├─ execute-tool.ts
│  │  │  └─ manage-connections.ts
│  │  ├─ authoring/
│  │  │  ├─ list-trigger-types.ts
│  │  │  ├─ get-trigger-type-schema.ts
│  │  │  ├─ create-trigger.ts
│  │  │  ├─ list-triggers.ts
│  │  │  ├─ toggle-trigger.ts       # enable + disable in one tool with a boolean
│  │  │  ├─ delete-trigger.ts
│  │  │  ├─ test-webhook-delivery.ts
│  │  │  └─ save-automation-local.ts # RPC to Constellagent main process
│  │  └─ debug/
│  │     └─ debug-info.ts            # always on — reports mode + registered tools
│  └─ lib/
│     ├─ ipc.ts             # local Unix socket RPC client used only by save-automation-local
│     └─ errors.ts          # shared typed-error class with user-surfaced messages
├─ tests/
│  └─ ... (bun test)
└─ README.md
```

Key shape of the entrypoint:

```ts
// src/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getMode } from "./mode.js";
import { runtimeTools } from "./tools/runtime/index.js";
import { authoringTools } from "./tools/authoring/index.js";
import { debugInfoTool } from "./tools/debug/debug-info.js";

export default function (pi: ExtensionAPI) {
  const mode = getMode();
  pi.registerTool(debugInfoTool(mode));
  for (const t of runtimeTools) pi.registerTool(t);
  if (mode === "authoring") {
    for (const t of authoringTools(pi)) pi.registerTool(t);
  }
}
```

## Tool-by-tool spec

Each tool wraps a Composio SDK call, validates params with TypeBox, and returns `{ content: [{ type: "text", text }], details: {...} }`. `onUpdate` is used for "Calling Composio…" progress when the call is slow (> ~500ms — judgement, not hard rule).

### Runtime tools (always registered)

| Tool | Underlying SDK call | Purpose |
|---|---|---|
| `composio_search_tools` | tool-router meta: `COMPOSIO_SEARCH_TOOLS` via `session.execute(...)` on a session bound to the current `userId` | NL query → ranked tool slugs |
| `composio_get_tool_schemas` | `COMPOSIO_GET_TOOL_SCHEMAS` | fetch one or more tool schemas |
| `composio_execute_tool` | `composio.tools.execute({ slug, userId, arguments })` | execute a specific tool |
| `composio_manage_connections` | `COMPOSIO_MANAGE_CONNECTIONS` | returns OAuth link when missing |

### Authoring tools (only in `authoring` mode)

| Tool | Underlying SDK call | Purpose |
|---|---|---|
| `composio_list_trigger_types` | `GET /api/v3/triggers_types` via SDK | catalog of trigger types |
| `composio_get_trigger_type_schema` | `composio.triggers.getType(slug)` | required config fields |
| `composio_create_trigger` | `composio.triggers.create({ slug, userId, triggerConfig })` | returns `triggerId` |
| `composio_list_triggers` | `composio.triggers.list({ userId })` | show active triggers |
| `composio_toggle_trigger` | `composio.triggers.enable/disable(triggerId)` | one tool, `{ triggerId, enabled }` |
| `composio_delete_trigger` | `composio.triggers.delete(triggerId)` | remove |
| `test_webhook_delivery` | Composio dashboard "fire test" endpoint; poll Supabase events table via configurable HTTP endpoint Constellagent exposes | end-to-end smoke test |
| `save_automation_local` | RPC to Constellagent main process over local Unix socket (`$XDG_RUNTIME_DIR/constellagent.sock`, fallback `/tmp/constellagent-$UID.sock`) | persists the rule row in Constellagent's SQLite |

### Debug (always registered)

| Tool | Purpose |
|---|---|
| `composio_debug_info` | Returns `{ mode, registeredTools, composioUserId, apiKeyPresent }`. Makes silent-mode-misconfiguration loud. |

## Configuration surface

Environment variables read at extension load:

| Var | Required | Purpose |
|---|---|---|
| `CONSTELLAGENT_MODE` | yes — one of `authoring` \| `worktree` | gates authoring tools |
| `COMPOSIO_API_KEY` | yes | Composio SDK auth |
| `COMPOSIO_USER_ID` | yes | per-install identity used for trigger creation + tool-router sessions |
| `CONSTELLAGENT_IPC_SOCK` | no, authoring only | override for the Unix socket path |

If `CONSTELLAGENT_MODE` is unset the extension defaults to `worktree` (safer — authoring tools stay hidden). `composio_debug_info` surfaces this so it's not silent.

If `COMPOSIO_API_KEY` is missing, tools fail with a clear error message rather than throwing at load. This keeps `composio_debug_info` usable for triage even when creds are broken.

## Distribution + install

**During dev (Phase 4-5):** the extension lives in its own git repo cloned adjacent to Constellagent. Install into a test Pi session via `additionalExtensionPaths: ["<abs path>/src/index.ts"]` when embedding, or by symlinking into `~/.pi/agent/extensions/` for CLI testing.

**For release:** publish to npm as `@constellagent/pi-extension`, install via Constellagent's onboarding flow which writes the path into Pi's `settings.json`. Build step: `bun build src/index.ts --target bun --format esm --outdir dist` (jiti handles TS at dev time, but a built artifact is friendlier for installs).

## Testing strategy

1. **Unit — bun test.** Each tool's `execute` is pure given a mocked Composio client. Snapshot the `{ content, details }` shape.
2. **Integration — live Composio sandbox account.** A `bun run test:integration` script creates a throwaway trigger, lists, toggles, deletes. Gated behind `COMPOSIO_API_KEY_TEST` env var so CI can skip.
3. **End-to-end in Pi — manual for v1.** Script `bun run dev:pi` spawns a real Pi CLI session with the extension wired via `additionalExtensionPaths`, runs a canned transcript, asserts tool names called. Not automated; a checklist in the README.
4. **Authoring-mode smoke test.** Tiny host script `examples/embed-authoring.ts` that uses `createAgentSession` with `CONSTELLAGENT_MODE=authoring`, sends `"create a trigger on GITHUB_COMMIT_EVENT for owner=foo repo=bar"`, asserts `composio_create_trigger` was called. Proves the embed path works before Constellagent touches it.

## Build order (extension-only)

Maps to phases 4 + 5 of the parent plan, but with sharper increments:

1. **Scaffold (half-day).** Bun init, TS config, minimal `index.ts` that registers only `composio_debug_info`. Wire into a local Pi session, confirm the tool shows up. Proves the load path before writing any real code.
2. **Composio client + one runtime tool (half-day).** `composio-client.ts` singleton; implement `composio_search_tools`. Manual test: ask Pi "find me a Linear tool". Surface real Composio results. Ends Phase 4 momentum-check.
3. **Remaining runtime tools (1 day).** `get_tool_schemas`, `execute_tool`, `manage_connections`. Snapshot tests for each.
4. **Authoring tools — read side (half-day).** `list_trigger_types`, `get_trigger_type_schema`, `list_triggers`. No mutation yet — safe to poke at a live Composio account.
5. **Authoring tools — write side (1 day).** `create_trigger`, `toggle_trigger`, `delete_trigger`. Integration test creates + deletes in one run.
6. **IPC tool (half-day).** `save_automation_local` + tiny Unix-socket stub server in the repo for testing. Real Constellagent process comes later; the stub validates the contract.
7. **Webhook test tool + polish (half-day).** `test_webhook_delivery`, README, example embed script, publish to npm as `0.0.1` (private scope initially).

Total ~4–5 working days for a solo build.

## Critical files / references

- Pi extension API: `badlogic/pi-mono/packages/coding-agent/docs/extensions.md`, `docs/sdk.md`, `examples/sdk/06-extensions.ts`.
- Pi embed entrypoint: `@mariozechner/pi-coding-agent` → `createAgentSession`.
- TypeBox for param schemas: `@sinclair/typebox`.
- Composio TS SDK: `@composio/core` — `composio.triggers.*`, `composio.tools.execute`, `composio.create` for tool-router sessions.
- Composio trigger endpoint map: `docs.composio.dev/docs/migration-guide/new-sdk` under "Triggers".

## Verification (end-to-end demo)

```bash
# 1. install deps
bun install

# 2. run unit + snapshot tests
bun test

# 3. run the live integration suite against a sandbox Composio account
COMPOSIO_API_KEY_TEST=... COMPOSIO_USER_ID=pi-ext-smoke bun run test:integration

# 4. manual end-to-end: spawn a Pi session with authoring mode on
CONSTELLAGENT_MODE=authoring COMPOSIO_API_KEY=... COMPOSIO_USER_ID=me \
  bun run examples/embed-authoring.ts

# In the spawned session, type:
#   "create a trigger for when a new issue is created in linear team <id>"
# Expect: Pi calls composio_get_trigger_type_schema → composio_create_trigger,
# prints the returned triggerId, then calls save_automation_local against
# the stub IPC socket.
```

Pass criteria: `composio_debug_info` reports `mode=authoring` and all 13 tools registered; the canned authoring transcript creates and then deletes a real Composio trigger; runtime-mode smoke (`CONSTELLAGENT_MODE=worktree`) hides the authoring tools and only exposes the 4 runtime + 1 debug tool.

## Assumptions I made (flag if wrong)

1. **Single Composio user per extension instance.** `COMPOSIO_USER_ID` is read once at load. Multi-user is out of scope for v1.
2. **Extension owns the Composio SDK client**, not Constellagent. Constellagent passes the key in via env when spawning Pi. Avoids shipping a second auth path.
3. **`save_automation_local` uses a Unix socket, not HTTP.** Cheaper, no port conflicts, local-only by construction. Constellagent will expose a minimal JSON-line RPC server on that socket.
4. **Published to npm under a private/scoped name for v1**, not made public. Distribution ergonomics, not marketing.
5. **No UI polish tools inside the extension.** `renderCall` / `renderResult` hooks are left at Pi's defaults for v1 — nice to have, not critical path.
