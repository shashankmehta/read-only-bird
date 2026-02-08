# Dual Account Routing for Read-Only Bird

**Date:** 2026-02-08
**Status:** Ready for planning

## What We're Building

Split Twitter API calls across two accounts: the main account handles only commands that access account-specific data (bookmarks, likes, home timeline), while a secondary account handles all generic public reads (tweet lookups, profile lookups, search). This reduces the main account's API footprint to lower the risk of suspension or flagging.

## Why This Approach

- **Account safety** is the primary motivation — fewer API calls on the main account means less visibility to Twitter's abuse detection systems.
- **Static routing** (command-to-account mapping hardcoded) is the simplest approach. No per-request overrides, no optional fallbacks.
- **Secondary account required at startup** — fail fast if not configured, rather than silently routing everything through main.
- **Single secondary account** for now, but the abstraction (`getClientForCommand`) makes it straightforward to expand to a pool later without changing callers.

## Key Decisions

1. **No fallback to main** — if the secondary account fails, the request fails. This enforces the safety boundary.
2. **Secondary is required** — server won't start without `SECONDARY_AUTH_TOKEN` and `SECONDARY_CT0` env vars.
3. **Static command routing** — no per-request account selection or `--account` flag.
4. **Credentials via env vars** — `SECONDARY_AUTH_TOKEN` and `SECONDARY_CT0` added to `.env`.

## Command Routing

### Main account only (account-specific data)
- `whoami` — identifies the authenticated account
- `check` — verifies main account credentials
- `bookmarks` — main account's bookmarks
- `bookmark-folder` — main account's bookmark folders
- `likes` — main account's liked tweets
- `home` — main account's home timeline
- `mentions` (without `-u` flag) — main account's mentions
- `lists` — main account's lists
- `list-memberships` — main account's list memberships

### Secondary account (generic reads)
- `read` — read any tweet by ID
- `replies` — replies to any tweet
- `thread` — thread of any tweet
- `search` — search public tweets
- `user-id` — username to ID lookup
- `user-about` — any user's profile info
- `following` — any user's following list
- `followers` — any user's followers list
- `user-tweets` — any user's tweets
- `news` — trending/news
- `list-timeline` — any list's timeline
- `mentions -u <handle>` — other user's mentions

### Note on `mentions`
This is the one command with conditional routing: without `-u` it reads the main account's mentions (main client), with `-u <handle>` it reads a specified user's mentions (secondary client). The routing logic in dispatch needs to inspect the parsed flags for this command.

## Open Questions

- Should analytics/dashboard track which account handled each request? (Nice-to-have, not blocking.)

## Implementation Scope

Files to modify:
- `src/twitter.ts` — add secondary client initialization, export `getClientForCommand()`
- `src/command.ts` — update `dispatch()` to use `getClientForCommand()` instead of `getTwitterClient()`
- `.env.example` — add secondary credential vars
- `setup.sh` — prompt for secondary credentials during setup
