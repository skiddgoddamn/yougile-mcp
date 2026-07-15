# yougile-mcp

MCP server to watch and manage YouGile tasks.

An [MCP](https://modelcontextprotocol.io) server that exposes [YouGile](https://yougile.com) — projects, boards, columns, tasks, and task chat — as tools an agent can call: check on overdue work, create and move tasks, and comment on task chats, all without leaving the chat.

## Install

Global install:

```bash
npm i -g @skiddgoddamn/yougile-mcp
```

Register with Claude Code (or any MCP client that reads `mcpServers` JSON) — no separate install needed, `npx` fetches it on demand:

```json
{
  "mcpServers": {
    "yougile": { "command": "npx", "args": ["-y", "@skiddgoddamn/yougile-mcp"] }
  }
}
```

The CLI binary itself is still called `yougile-mcp` either way.

## Auth

There are two ways to get the server talking to your YouGile company:

1. **Bring your own key.** Create an API key in the YouGile UI (Profile → API keys), then call:
   ```
   yg_setup({ apiKey: "<key>" })
   ```
   Optionally pass `baseUrl` if you're on a non-default region/host.

2. **Login/password → key.** Two-step flow that never persists your credentials:
   ```
   yg_auth_companies({ login, password })       // lists companies you belong to
   yg_auth_create_key({ login, password, companyId })  // creates/reuses a key, stores it
   ```

Either path stores the resulting API key at `~/.yougile-mcp/config.json` (override the directory with `YOUGILE_MCP_CONFIG_DIR`). **Login and password are used once per call and are never written to disk.** Check current status any time with `yg_auth_status`.

## Tools

17 tools, all prefixed `yg_`.

### Auth

| Tool | Description |
|---|---|
| `yg_auth_status` | Show YouGile auth status: whether an API key is stored and which company (if known). |
| `yg_setup` | Store a YouGile API key (create one in the YouGile UI, or use `yg_auth_create_key`). Optionally set a custom base URL for self-hosted instances. |
| `yg_auth_companies` | List YouGile companies for a login/password so you can pick a `companyId`. Credentials are used once and NOT stored. |
| `yg_auth_create_key` | Create (or reuse) a YouGile API key for a company from login/password, and store it. Credentials are used once and NOT stored. |

### Structure (projects, boards, columns, people)

| Tool | Description |
|---|---|
| `yg_projects_list` | List projects. Filter by title; paginate with `limit`/`offset`. |
| `yg_project_create` | Create a project. |
| `yg_boards_list` | List boards. Filter by `projectId`/title. |
| `yg_board_create` | Create a board inside a project. |
| `yg_columns_list` | List columns. Filter by `boardId`/title. |
| `yg_column_create` | Create a column on a board. |
| `yg_employees_list` | List company employees/users. Filter by email or `projectId`. Use to resolve assignee ids. |

### Read (tasks & chat)

| Tool | Description |
|---|---|
| `yg_tasks_list` | List tasks (the workhorse for watching). Server filters: `columnId`, `title`, `includeDeleted`, `limit`, `offset`. Client filters applied to the page: `assignedTo` (user id), `completed`, `archived`, `deadlineBefore` (ms epoch or ISO), `changedAfter` (ms epoch or ISO, vs task timestamp). |
| `yg_task_get` | Get one task by id (full card). |
| `yg_task_chat_get` | Read the chat/comments of a task (`chatId` = task id). Useful for watching discussion. |

### Write (tasks & chat)

| Tool | Description |
|---|---|
| `yg_task_create` | Create a task in a column. |
| `yg_task_update` | Update a task: move (`columnId`), assign, deadline, complete, archive, edit title/description. Only provided fields change. Pass `deadline=null` to clear. |
| `yg_task_comment` | Post a comment to a task's chat. |

## Watching (on-demand)

This server has no push/webhook mechanism — YouGile is watched **on-demand**, by having an agent call the list tools on a schedule and reason about the results. Two patterns:

**1. Overdue-task sweep.** A routine (e.g. Claude Code's `/schedule` or `/loop`) that runs every 30 minutes:

```
now = <current time, ms epoch>

for each board you care about:
  columns = yg_columns_list({ boardId })
  for each column:
    overdue = yg_tasks_list({
      columnId: column.id,
      deadlineBefore: now,
      completed: false,
      archived: false,
    })
    if overdue.count > 0: report them (e.g. post a summary message)
```

**2. Change delta since last run.** The agent tracks the timestamp of its previous run (e.g. in its own scratch state) and only asks for what changed since then:

```
lastRunMs = <timestamp saved from previous run>

changed = yg_tasks_list({ columnId, changedAfter: lastRunMs })
// report `changed.content`, then persist `now` as the new lastRunMs for next time
```

Both patterns compose: run the delta sweep on every tick, and the full overdue sweep less often (e.g. once a day) as a safety net against missed deltas.

## Env vars

| Var | Meaning | Default |
|---|---|---|
| `YOUGILE_MCP_CONFIG_DIR` | Directory where `config.json` (stored API key/company/base URL) lives. | `~/.yougile-mcp` |
| `YOUGILE_BASE_URL` | YouGile API base URL (for self-hosted/regional instances). | `https://ru.yougile.com/api-v2` |
| `YOUGILE_API_KEY` | Fallback API key used if none is stored yet in `config.json`. | *(unset)* |
| `YG_READONLY` | `true` blocks all mutating tools (`_create`/`_update`/`_comment`) — watch-only mode. | `false` |
| `YG_CONFIRM` | `true` requires `confirm: true` on every mutating tool call. | `false` |
| `YG_LOG_LEVEL` | Log verbosity: `DEBUG`, `INFO`, `WARNING`, `ERROR`. | `INFO` |
| `YG_LOG_BODIES` | `true` logs raw request/response bodies. See **Safety** below before enabling. | `false` |
| `YG_LOG_FILE` | If set, also appends log lines to this file (in addition to stderr). | *(unset — stderr only)* |

## Safety

- **`YG_READONLY=true`** — watch-only mode. Every tool whose name contains `_create`, `_update`, or `_comment` (i.e. everything that mutates YouGile) is denied before it runs. Auth tools (`yg_setup`, `yg_auth_create_key`, etc.) are exempt, since configuring the server isn't a YouGile-data mutation. Use this when you want an agent to report on tasks but never touch them.
- **`YG_CONFIRM=true`** — confirmation mode. Mutating tools return a `confirm_required` payload describing the call instead of executing it; re-issue the same call with `confirm: true` to actually run it. Useful for human-in-the-loop review before an agent creates/updates/comments.
- Both can be combined with normal MCP client behavior (READONLY wins — a blocked call never reaches the CONFIRM check).

**Security note (important):** `YG_LOG_BODIES=true` logs raw request/response bodies to stderr and/or `YG_LOG_FILE`. This includes **login and password** on `yg_auth_companies`/`yg_auth_create_key` calls, and the **full API key** in `yg_auth_create_key`'s response. Leave it off (the default) except for local debugging on your own machine, and never enable it anywhere logs are shared, aggregated, or shipped off-box.

## Dev

```bash
npm install
npm test
npm run build
```

## Caveats

- Some YouGile GET query-param and task-field shapes are still being finalized against the live API. In particular, `color` is typed as an integer (1–16) on `yg_column_create` but as a free-form string on `yg_task_create` — this matches the current live API behavior observed during development but may need reconciling if YouGile's docs/behavior change.
- List tools (`yg_projects_list`, `yg_boards_list`, `yg_columns_list`, `yg_employees_list`, `yg_tasks_list`, `yg_task_chat_get`) take `limit`/`offset` for pagination — YouGile caps pages at roughly 50 items, so boards/projects with more items than that need multiple paged calls to see everything.
