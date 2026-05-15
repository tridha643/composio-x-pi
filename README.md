# Composio x Pi Extension

Pi package that installs a Pi extension for Composio-backed runtime and trigger-authoring tools.

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

## Setup

No setup required. The agent provisions a Composio identity for you on first tool use via the `composio_signup` tool. When a Composio tool fails with a missing-credentials error, the model is instructed to call `composio_signup`, which talks to `https://agents.composio.dev/api/signup` and writes the returned credentials to `~/.composio/anonymous_user_data.json` (mode `0600`).

To later hand the auto-provisioned organization over to a human admin, either run `/composio-claim <email>` or ask the agent to call the `composio_claim` tool. Composio sends a 24-hour single-use invite to that email.

Environment override:

- `COMPOSIO_API_KEY` — if set, this takes precedence over the stored credentials (useful for CI and power users who already have a key).

Optional environment variables:

- `COMPOSIO_USER_ID` — defaults to `default` when omitted.

For one release, an existing `~/.pi/agent/extensions/composio-x-pi.json` (from the previous `/composio-init` command) is still honored as a fallback so existing users aren't broken.

## Commands

- `/composio-claim <email>` — hand the auto-provisioned Composio org to a human admin (sends a 24-hour invite to the email).

## Tools

All tools are registered by default:

- `composio_debug_info`
- `composio_signup`
- `composio_claim`
- `composio_search_tools`
- `composio_get_tool_schemas`
- `composio_execute_tool`
- `composio_manage_connections`
- `composio_list_trigger_types`
- `composio_get_trigger_type_schema`
- `composio_create_trigger`
- `composio_list_triggers`
- `composio_delete_trigger`
- `save_automation_definition`

### Automation JSON handoff

`save_automation_definition` writes automation metadata for the host application to read.

By default it writes to Pi's global Composio automation handoff file:

```text
~/.config/pi/composio-automations.json
```

Set `PI_COMPOSIO_AUTOMATIONS_JSON` to override the global handoff path. Passing `filePath` to the tool still writes a specific JSON file for that call.

The file contains a JSON array of automation definitions and the tool upserts by `triggerId`.

## Local scripts

- `bun test`
- `bun run typecheck`
- `bun run build`
- `bun run test:integration`
- `bun run dev:pi`

`bun run dev:pi` loads the extension from `src/index.ts` through Pi's embedding API.

## Verification

Automated checks before handoff or release:

```bash
bun run test
bun run typecheck
bun run build
```

Integration test with real Composio credentials/config:

```bash
COMPOSIO_API_KEY_TEST=...
COMPOSIO_TEST_TRIGGER_SLUG=...
COMPOSIO_TEST_TRIGGER_CONFIG_JSON='...'
bun run test:integration
```

Manual Pi smoke test:

1. Start Pi with the local extension:
   ```bash
   pi -e ./src/index.ts
   ```
2. Ask the agent to run any Composio tool; it will call `composio_signup` automatically on first use.
3. Run `composio_debug_info` and confirm runtime plus authoring tools are listed (and `apiKeySource` is `"signup"`).
4. Run `composio_list_trigger_types` and `composio_get_trigger_type_schema` for a known trigger.
5. Create a test trigger with `composio_create_trigger`.
6. Confirm it appears via `composio_list_triggers`.
7. Save the automation handoff with `save_automation_definition`.
8. Confirm `~/.config/pi/composio-automations.json` (or `PI_COMPOSIO_AUTOMATIONS_JSON`) contains the expected automation and the host app can read it.
9. Clean up with `composio_delete_trigger`.

Webhook/ngrok delivery verification belongs to the host app: start the app receiver, expose it through ngrok, create/configure the Composio trigger for that URL, cause a real event, and confirm the app receives it.
