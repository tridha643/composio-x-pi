# Composio x Pi Extension

Pi package that installs a Pi extension for Composio-backed runtime and authoring tools.

## Install

Install the published npm package with Pi:

```bash
pi install npm:composio-x-pi
```

For a pinned version:

```bash
pi install npm:composio-x-pi@0.0.1
```

During development, install from a local checkout:

```bash
cd /path/to/composio-x-pi
bun install
pi install /path/to/composio-x-pi
```

Try the extension for one Pi run without adding it to settings:

```bash
pi -e /path/to/composio-x-pi/src/index.ts
```

After editing an installed local checkout, use `/reload` inside Pi.

## Publishing

This package is intended to be installed through Pi's npm package source, so releases should be published to npm under the `composio-x-pi` package name:

```bash
bun run test
bun run typecheck
bun run build
npm publish
```

## Configuration

This extension is explicitly API-key based. Running `composio login` in a shell is not used by the Pi extension; the extension only reads a Composio API key that you provide directly.

Recommended setup inside Pi:

```text
/composio-api-key
```

The command prompts for your key and stores it in `~/.pi/agent/extensions/composio-x-pi.json` with file mode `0600`. You can also pass the key as an argument (`/composio-api-key <key>`), but the interactive prompt avoids leaving the key in chat history.

Environment override:

- `COMPOSIO_API_KEY` — if set, this takes precedence over the stored key.
- `COMPOSIO_USER_ID` — optional; defaults to `default` when omitted.

Optional environment variables:

- `COMPOSIO_PI_MODE=authoring|worktree` — defaults to `worktree`; `authoring` enables trigger-authoring tools.
- `COMPOSIO_PI_IPC_SOCK` — override the local Unix socket path used by `save_automation_local`.
- `COMPOSIO_PI_WEBHOOK_TEST_URL` — endpoint used by `test_webhook_delivery` to fire a local test webhook.
- `COMPOSIO_PI_EVENT_POLL_URL` — endpoint used by `test_webhook_delivery` to poll for received events.

## Commands

- `/composio-api-key` — securely prompt for and store the Composio API key used by this extension.

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
- `bun run typecheck`
- `bun run build`
- `bun run test:integration`
- `bun run dev:pi`
- `bun run dev:ipc-stub`

`bun run dev:pi` loads the extension from `src/index.ts` through Pi's embedding API. `bun run dev:ipc-stub` starts a JSON-line Unix socket server that accepts `saveAutomationLocal` requests for local testing.
