# Constellagent Pi Extension

Pi extension for Constellagent that exposes Composio runtime tools in every worktree session and authoring tools when Pi is embedded for NL-to-trigger flows.

## Install

```bash
bun install
```

During development, point Pi at the source entrypoint:

```ts
additionalExtensionPaths: ["/absolute/path/to/constellagent-pi-extension/src/index.ts"];
```

For a built artifact:

```bash
bun run build
```

## Environment

Required:

- `COMPOSIO_API_KEY`
- `COMPOSIO_USER_ID`

Optional:

- `CONSTELLAGENT_MODE=authoring|worktree` and defaults to `worktree`
- `CONSTELLAGENT_IPC_SOCK` to override the local Unix socket path
- `CONSTELLAGENT_WEBHOOK_TEST_URL` for `test_webhook_delivery`
- `CONSTELLAGENT_EVENT_POLL_URL` for `test_webhook_delivery`

## Tools

Always registered:

- `composio_debug_info`
- `composio_search_tools`
- `composio_get_tool_schemas`
- `composio_execute_tool`
- `composio_manage_connections`

Authoring-only:

- `composio_list_trigger_types`
- `composio_get_trigger_type_schema`
- `composio_create_trigger`
- `composio_list_triggers`
- `composio_toggle_trigger`
- `composio_delete_trigger`
- `test_webhook_delivery`
- `save_automation_local`

## Local scripts

- `bun test`
- `bun run test:integration`
- `bun run dev:pi`
- `bun run dev:ipc-stub`

`bun run dev:pi` loads the extension from `src/index.ts` through Pi's embedding API. `bun run dev:ipc-stub` starts a JSON-line Unix socket server that accepts `saveAutomationLocal` requests for local testing.
