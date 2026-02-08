# Read-Only Bird

Read-only Twitter/X API wrapper built on [@steipete/bird](https://github.com/steipete/bird). Bun + TypeScript.

## Commands

```bash
bun install              # install dependencies
bun run start            # start server
bun run dev              # start with auto-reload
bunx tsc --noEmit        # typecheck
```

## Architecture

Single HTTP endpoint (`POST /api/command`) that accepts bird CLI-style command strings, parses them, validates against a read-only allowlist, and dispatches to the corresponding `TwitterClient` method.

- `src/server.ts` — Bun.serve entry point, routing, auth middleware
- `src/command.ts` — Command tokenizer, allowlist/blocklist, dispatch to TwitterClient methods
- `src/twitter.ts` — TwitterClient instances (main + secondary, initialized from env vars)
- `src/keys.ts` — API key management (load/save from `keys.json`)
- `src/analytics.ts` — Request logging via bun:sqlite (`analytics.db`)
- `src/dashboard.ts` — Server-rendered HTML analytics dashboard

## Key decisions

- Write commands (`tweet`, `reply`, `follow`, `unfollow`, `like`, `unlike`, `retweet`, `unretweet`, `bookmark`, `unbookmark`) are blocked at the gate returning 403. The allowlist is in `src/command.ts`.
- Command parsing uses a custom shell-style tokenizer (handles quoted args), not a CLI framework.
- Two TwitterClient instances: main account (`TWITTER_AUTH_TOKEN`/`TWITTER_CT0`) for account-specific commands (bookmarks, likes, home, mentions, lists), secondary account (`SECONDARY_AUTH_TOKEN`/`SECONDARY_CT0`) for generic reads (search, tweet/profile lookups). Both use cookie-based auth, not OAuth.
- API keys are static, stored in `keys.json` (gitignored). No database for key storage.
- Analytics uses bun:sqlite with auto-prune of rows older than 30 days.
- Dashboard is plain server-rendered HTML with inline CSS/JS. No build step or framework.

## Deployment

The server runs on Tailscale at `100.122.200.45:3000`. Agent-facing docs are in `AGENT-README.md`.

## Setup

Run `bash setup.sh` to install dependencies, configure env vars, and register as a macOS launchd service (`com.readonly.bird`). The script generates `run.sh` (a wrapper that sources `.env` then execs bun) and installs a plist to `~/Library/LaunchAgents/`.

## Gotchas

- `git` is aliased in this shell environment. Use `/usr/bin/git` for git commands.
- `following`, `followers`, and `user-tweets` commands require numeric Twitter user IDs, not usernames. Agents must call `user-id <username>` first.
- The bird package uses Twitter's internal GraphQL API which can break without notice. Query IDs are auto-refreshed by the library.
- `keys.json` and `analytics.db` are gitignored. They are created automatically on first use.
- `mentions` command routes conditionally: without `-u` uses main account, with `-u <handle>` uses secondary account.
