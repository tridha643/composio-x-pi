# Account aliasing, account defaults, and automation TTL plan

## Summary

Add first-class connected-account selection to `composio-x-pi`, matching the Composio CLI mental model:

- Composio backend aliases are authoritative.
- Tool calls accept a single `account` selector that may be a backend alias, `word_id`, or connected account id.
- Local JSON stores only Pi/UI preferences such as defaults and a non-authoritative account snapshot.
- Runtime tools, meta-tool wrappers, remote workbench/bash, trigger creation, and automation handoff can bind the selected connected account(s).
- Automation TTL is persisted as handoff metadata only; the host app enforces expiry.

This plan intentionally avoids inventing a second local alias system.

## Evidence from Composio CLI

Observed CLI behavior:

- `composio link <toolkit> --alias <alias>` assigns a backend alias during account linking.
- `composio execute <slug> --account <selector> -d '{...}'` selects account by alias, `word_id`, or connected account id.
- `composio run` exposes the same account selector per execute call:
  ```js
  await execute("GITHUB_GET_THE_AUTHENTICATED_USER", {}, { account: "work" })
  ```
- `composio link github --list` returns account records containing `id`, `word_id`, `alias`, `status`, `user_id`, and `toolkit.slug`.
- CLI account listing had a schema failure on a backend status of `REVOKED`; our implementation should accept unknown statuses gracefully.
- `composio proxy` does not currently expose `--account`, so account-aware proxy/workbench behavior should be implemented at tool-router session level, not assumed from CLI proxy.

## Terms

- **app/toolkit**: Composio toolkit slug such as `github`, `gmail`, `slack`.
- **connected account id**: stable backend id such as `ca_...`.
- **word id**: Composio human-ish selector such as `github_hoyle-artery`.
- **backend alias**: user-defined Composio alias such as `work`, stored in Composio.
- **account selector**: a user/LLM-provided string that can be an alias, word id, or connected account id.
- **default account**: local Pi preference mapping an app to a connected account id.
- **account snapshot/cache**: non-authoritative local copy of backend account list for prompt/UI display.

## User-facing API

### Single-account tools

Use `account` plus optional `app`:

```json
{
  "app": "github",
  "account": "work"
}
```

`account` can be:

- backend alias: `work`
- word id: `github_hoyle-artery`
- connected account id: `ca_Feu7smHrvEJB`

If `app` is omitted, infer it when safe:

- From tool slug: `GITHUB_GET_THE_AUTHENTICATED_USER` → `github`
- From trigger slug when clear
- From exactly one backend match

If ambiguity remains, error or ask the user to provide `app`.

### Multi-account meta tools

Support either single selector:

```json
{
  "app": "github",
  "account": "work",
  "tools": []
}
```

or explicit map:

```json
{
  "accounts": {
    "github": "work",
    "slack": "prod"
  },
  "tools": []
}
```

Reserved account fields are stripped before sending raw input to Composio meta tools:

- `app`
- `account`
- `accounts`

### Defaults

If a tool call omits `account`, resolution order is:

1. Explicit `accounts` map.
2. Explicit `app + account`.
3. Saved automation account binding.
4. Local default for app.
5. Exactly one active backend account for app.
6. Ask/error if multiple accounts and no default.

Never silently switch accounts when multiple choices exist and no default or explicit selector exists.

## Local state JSON

Store machine-readable Pi/UI preferences separately from Composio backend aliases.

Default path:

```text
~/.pi/agent/extensions/composio-x-pi-state.json
```

Override:

```text
PI_COMPOSIO_STATE_JSON=/path/to/state.json
```

Schema v1:

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-06-02T00:00:00.000Z",
  "policy": {
    "askBeforeSwitchingAccounts": true
  },
  "defaults": {
    "github": "ca_Feu7smHrvEJB",
    "slack": "ca_..."
  },
  "lastAccountSnapshot": [
    {
      "app": "github",
      "connectedAccountId": "ca_Feu7smHrvEJB",
      "wordId": "github_hoyle-artery",
      "alias": "work",
      "status": "ACTIVE",
      "isDefault": true,
      "userId": "default",
      "lastSeenAt": "2026-06-02T00:00:00.000Z"
    }
  ]
}
```

Rules:

- No secrets.
- Defaults point to connected account ids, not aliases.
- `lastAccountSnapshot` is cache only. Backend remains authoritative for aliases/status.
- Boring Notch or another UI may read/write defaults directly.
- Alias changes should go through Composio API, then refresh the snapshot.

## Prompt memory injection

Generate a compact prompt snippet from state + snapshot and inject it through Pi `before_agent_start`.

Example injected snippet:

```text
Composio account context:
- github default: work (ca_Feu7smHrvEJB)
- github accounts: work, github_hoyle-artery
- slack default: prod
Rules:
- Use explicit account selectors when the user names an account.
- If multiple accounts exist and no default/selector applies, ask before using one.
- Backend Composio aliases are authoritative; local JSON stores defaults/cache only.
```

Do not inject secrets.

## New modules

### `src/lib/account-state.ts`

Responsibilities:

- Resolve state file path.
- Read/write state JSON with validation and defaults.
- Update defaults.
- Update account snapshot.
- Render prompt-memory snippet.
- Tolerate unknown backend statuses such as `REVOKED`.

Exports:

```ts
getAccountStatePath(): string
readAccountState(): AccountState
writeAccountState(state: AccountState): Promise<void>
setDefaultAccount(app: string, connectedAccountId: string): Promise<AccountState>
updateAccountSnapshot(accounts: AccountSnapshotItem[]): Promise<AccountState>
renderAccountMemorySnippet(state: AccountState): string
```

### `src/lib/account-resolution.ts`

Responsibilities:

- Infer toolkit from tool/trigger slug.
- List backend connected accounts.
- Resolve selector by connected account id, word id, or alias.
- Apply default fallback.
- Produce clear errors with available accounts.

Exports:

```ts
getComposioUserId(): string
inferToolkitFromSlug(slug: string): string | undefined
listConnectedAccounts(filters?: { app?: string; userId?: string; activeOnly?: boolean }): Promise<AccountRecord[]>
resolveConnectedAccount(input: {
  app?: string;
  account?: string;
  allowDefault?: boolean;
}): Promise<ResolvedAccount | undefined>
resolveConnectedAccountsMap(accounts: Record<string, string>): Promise<Record<string, ResolvedAccount>>
```

Resolution should accept:

- `id` / `connectedAccountId`
- `word_id` / `wordId`
- `alias`

Use active accounts by default, but include non-active matches in error messages when helpful.

## Composio client changes

Update `src/composio-client.ts`.

### User id

Use:

```ts
COMPOSIO_USER_ID || "default"
```

### Account-aware sessions

Add a cache for account-bound tool-router sessions:

```ts
getToolRouterSession(options?: {
  connectedAccounts?: Record<string, string>;
}): Promise<unknown>
```

Default no-account session remains singleton.

Account-bound sessions are cached by stable JSON key.

Create sessions with:

```ts
client.create(userId, {
  connectedAccounts: { github: "ca_..." },
  workbench: { enable: true },
  multiAccount: {
    enable: true,
    requireExplicitSelection: false
  }
})
```

Update:

```ts
executeMetaTool(slug, input, options?: { connectedAccounts?: Record<string, string> })
```

## Runtime tool changes

### `composio_manage_connections`

File: `src/tools/runtime/manage-connections.ts`

Add parameters:

```ts
alias?: string
setDefault?: boolean
refreshState?: boolean
```

Behavior:

1. Existing account rename:
   ```json
   { "app": "github", "connectionId": "ca_...", "alias": "work" }
   ```
   - Patch backend alias: `connectedAccounts.update/patch(id, { alias })`.
   - Refresh local snapshot.

2. New connection with alias:
   ```json
   { "app": "github", "alias": "work" }
   ```
   - Initiate/link account with backend alias when SDK supports it.
   - Show auth URL and recheck as today.
   - Refresh snapshot after approval.

3. Set default:
   ```json
   { "app": "github", "connectionId": "ca_...", "setDefault": true }
   ```
   - Write default app → connected account id to local state.

4. No alias/default fields:
   - Preserve current `COMPOSIO_MANAGE_CONNECTIONS` meta-tool behavior.

### `composio_execute_tool`

File: `src/tools/runtime/execute-tool.ts`

Add parameters:

```ts
app?: string
account?: string
```

Behavior:

- Infer app from slug when absent.
- Resolve account/default when possible.
- If resolved, execute via account-bound session.
- If no account/default, preserve current behavior.
- Return `resolvedAccount` in details.

Example:

```json
{
  "slug": "GITHUB_GET_THE_AUTHENTICATED_USER",
  "account": "work",
  "arguments": {}
}
```

### Meta passthrough wrappers

Files:

- `src/tools/runtime/meta-passthrough.ts`
- `src/tools/runtime/multi-execute-tool.ts`
- `src/tools/runtime/remote-bash-tool.ts`
- `src/tools/runtime/remote-workbench.ts`

Add account-binding support to the shared passthrough layer.

Reserved inputs:

```ts
app?: string
account?: string
accounts?: Record<string, string>
```

Behavior:

- Resolve `accounts` map if present.
- Else resolve `app/account` or default where app is known.
- Strip reserved fields from raw meta input.
- Execute meta tool with account-bound session.
- Include `resolvedAccounts` in result details.

Remote bash example input:

```json
{
  "app": "github",
  "account": "work",
  "command": "python sync_repos.py"
}
```

Actual Composio meta input after stripping:

```json
{
  "command": "python sync_repos.py"
}
```

### Search/schema tools

`composio_search_tools` and `composio_get_tool_schemas` do not need account selection.

## Trigger authoring changes

### `composio_create_trigger`

File: `src/tools/authoring/create-trigger.ts`

Add parameters:

```ts
app?: string
account?: string
```

Behavior:

- If `account` or default is available, resolve to connected account id.
- Use `COMPOSIO_USER_ID || "default"` instead of hardcoded user when SDK path supports it.
- Pass resolved connected account id to trigger creation body.
- Return `resolvedAccount`.

Desired SDK-level body:

```ts
{
  triggerConfig,
  connectedAccountId: "ca_..."
}
```

Need to verify whether current SDK method expects camelCase (`triggerConfig`, `connectedAccountId`) or snake_case (`trigger_config`, `connected_account_id`) for the installed `@composio/core`; tests should pin behavior through dependency injection.

### `composio_list_triggers`

Optional enhancement:

```ts
app?: string
account?: string
```

If provided, resolve account and filter by connected account id.

### `save_automation_definition`

File: `src/tools/authoring/save-automation-definition.ts`

Add parameters:

```ts
app?: string
account?: string
ttlSeconds?: number
expiresAt?: string
```

Rules:

- Reject when both `ttlSeconds` and `expiresAt` are provided.
- `ttlSeconds` computes absolute `expiresAt` at save time.
- If `account` or default applies, persist resolved account metadata.
- Host app enforces expiry; extension only writes metadata.

Persisted automation shape addition:

```json
{
  "app": "github",
  "account": "work",
  "resolvedAccount": {
    "app": "github",
    "connectedAccountId": "ca_...",
    "wordId": "github_hoyle-artery",
    "alias": "work"
  },
  "ttlSeconds": 86400,
  "expiresAt": "2026-06-03T00:00:00.000Z"
}
```

## New tools/commands

### Tool: `composio_get_account_state`

Safe tool for LLM/UI to inspect current backend account state and local defaults.

Parameters:

```ts
app?: string
refresh?: boolean
```

Behavior:

- Lists backend accounts for app or all apps when feasible.
- Reads local defaults.
- Updates snapshot when `refresh` is true.
- Returns accounts + defaults.

### Tool or command: `composio_set_account_default`

Optional but useful for LLM-driven setup.

Parameters:

```ts
app: string
account: string
```

Behavior:

- Resolve selector against backend.
- Write default app → connected account id.
- Refresh snapshot.

### Slash commands

Add interactive commands:

- `/composio-accounts` — list backend accounts/defaults; optionally refresh snapshot.
- `/composio-defaults` — pick app/account and save default.
- `/composio-refresh-accounts` — refresh local snapshot from backend.

These are especially useful for Boring Notch integration and manual setup.

## Extension prompt hook

In `src/index.ts`, register a `before_agent_start` handler that:

1. Reads local account state.
2. Renders compact snippet.
3. Appends it to system prompt if non-empty.

Keep this small to avoid context bloat.

## Boring Notch integration

Boring Notch should treat local JSON as UI state:

- Read accounts/defaults from `composio-x-pi-state.json`.
- Write defaults directly if desired.
- Trigger `/composio-refresh-accounts` or equivalent after external changes.
- Do not edit aliases in JSON as source of truth.
- Alias rename should call Pi/extension/Composio API so backend alias is changed.

If Boring Notch needs to rename aliases without Pi, it should call Composio backend directly and then refresh the local snapshot.

## Error behavior

Account resolution errors should be clear and actionable.

No match:

```text
No connected account matched "work" for app "github".
Available accounts:
- github_hoyle-artery (ca_Feu7smHrvEJB), alias: none, status: ACTIVE
```

Ambiguous:

```text
Multiple connected accounts matched "work". Provide app or connected account id.
Available matches:
- github/work (ca_...)
- slack/work (ca_...)
```

Multiple accounts, no default:

```text
Multiple github accounts are connected and no default is configured. Choose one: work, personal, github_hoyle-artery.
```

Unknown statuses should not crash parsing.

## Tests

### New unit tests

`tests/account-state.test.ts`:

- reads missing state as defaults
- writes defaults
- renders prompt snippet
- tolerates unknown status strings
- uses `PI_COMPOSIO_STATE_JSON` override

`tests/account-resolution.test.ts`:

- resolve by connected account id
- resolve by word id
- resolve by alias + app
- infer app from tool slug
- use local default when no explicit account
- error on ambiguous selector
- error lists available accounts

### Runtime tool tests

Update `tests/runtime-tools.test.ts`:

- `composio_execute_tool` preserves existing behavior without account
- `composio_execute_tool` binds resolved account session
- `composio_multi_execute_tool` strips `account/accounts` fields and passes account-bound session
- `composio_remote_bash_tool` strips reserved fields and binds session
- `composio_remote_workbench` same
- `composio_manage_connections` patches alias for `connectionId + alias`
- `composio_manage_connections` writes default when requested
- `composio_get_account_state` returns accounts/defaults

### Authoring tests

Update `tests/authoring-tools.test.ts`:

- `composio_create_trigger` passes resolved connected account id
- no-account trigger behavior remains compatible
- `save_automation_definition` persists `expiresAt` from `ttlSeconds`
- rejects both `ttlSeconds` and `expiresAt`
- persists resolved account metadata
- upsert preserves old optional fields correctly unless overwritten

### Entrypoint tests

Update `tests/index.test.ts` expected tool/command lists for any newly registered tools/commands.

## Docs

Update `README.md` with:

- Backend alias model.
- `account` selector examples.
- How to link/alias accounts.
- How defaults work.
- Local state JSON path and Boring Notch guidance.
- Automation TTL fields.

Example docs snippets:

```json
{
  "slug": "GITHUB_GET_THE_AUTHENTICATED_USER",
  "account": "work",
  "arguments": {}
}
```

```json
{
  "accounts": {
    "github": "work",
    "slack": "prod"
  },
  "tools": []
}
```

```json
{
  "name": "Temporary GitHub automation",
  "triggerId": "trg_123",
  "triggerSlug": "GITHUB_COMMIT_EVENT",
  "instructions": "Summarize new commits.",
  "app": "github",
  "account": "work",
  "ttlSeconds": 86400
}
```

## Implementation sequence

1. Add `account-state` module and tests.
2. Add `account-resolution` module and tests.
3. Add account-aware session support in `composio-client.ts`.
4. Update `meta-passthrough` and meta wrappers.
5. Update `composio_execute_tool`.
6. Update `composio_manage_connections` alias/default behavior.
7. Add `composio_get_account_state` and optionally `composio_set_account_default`.
8. Update trigger creation.
9. Update automation TTL/account handoff.
10. Add extension prompt-memory injection.
11. Add slash commands for accounts/defaults/refresh.
12. Update README.
13. Run checks:
    ```bash
    bun run test
    bun run typecheck
    bun run build
    ```

## Open decisions

1. Should `composio_set_account_default` be a public LLM tool, or only a slash command?
   - Recommendation: expose it as a safe tool; it writes non-secret local preference only.

2. Should `composio_manage_connections` set default automatically when linking the first account for an app?
   - Recommendation: yes for first account only; otherwise ask/explicit `setDefault`.

3. Should account snapshots refresh automatically every session start?
   - Recommendation: no network call on startup. Refresh via tools/commands or after connection operations. Prompt memory uses last snapshot.

4. Should remote bash/workbench use app defaults automatically?
   - Recommendation: only when `app` is provided or `accounts` map is provided. Do not infer app from arbitrary shell code.

5. Should `account` without `app` be allowed globally?
   - Recommendation: yes only if exactly one backend account matches selector across id/wordId/alias.
