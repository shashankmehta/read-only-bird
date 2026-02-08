---
title: Dual Account Routing
type: feat
date: 2026-02-08
---

# Dual Account Routing

## Overview

Route Twitter API calls across two accounts: main account for account-specific data (bookmarks, likes, home timeline), secondary account for generic public reads (tweet/profile lookups, search). This reduces the main account's API footprint to lower suspension risk.

Brainstorm: `docs/brainstorms/2026-02-08-dual-account-routing-brainstorm.md`

## Proposed Solution

Add a second `TwitterClient` instance initialized from `SECONDARY_AUTH_TOKEN` + `SECONDARY_CT0` env vars. A new `getClientForCommand()` function in `src/twitter.ts` returns the appropriate client based on a static command-to-account mapping. The `dispatch()` function in `src/command.ts` uses this instead of `getTwitterClient()`.

## Implementation

### Phase 1: Dual client initialization (`src/twitter.ts`)

**Current state:** Single singleton `client` variable, `getTwitterClient()` function.

**Changes:**

1. Rename the existing `client` variable to `mainClient` and add `secondaryClient`
2. Add `getSecondaryClient()` that reads `SECONDARY_AUTH_TOKEN` + `SECONDARY_CT0` from env and creates a second `TwitterClient` with the same cookie format
3. Fail at initialization if secondary env vars are missing (same pattern as main)
4. Add a `MAIN_ACCOUNT_COMMANDS` set containing: `whoami`, `check`, `bookmarks`, `bookmark-folder`, `likes`, `home`, `lists`, `list-memberships`
5. Export `getClientForCommand(command: string): TwitterClient` that returns `mainClient` if command is in `MAIN_ACCOUNT_COMMANDS`, otherwise `secondaryClient`
6. Keep `getTwitterClient()` exported (renamed semantics to return main client) for any direct callers, but the primary interface becomes `getClientForCommand()`

**Note on `mentions`:** The `mentions` command has conditional routing — main account without `-u`, secondary with `-u`. Since the routing decision depends on parsed flags (not just the command name), `mentions` should default to main account in `getClientForCommand()`. The secondary routing for `mentions -u` will be handled in `dispatch()` by explicitly calling `getSecondaryClient()` when the `-u` flag is present.

```typescript
// src/twitter.ts

const MAIN_ACCOUNT_COMMANDS = new Set([
  "whoami",
  "check",
  "bookmarks",
  "bookmark-folder",
  "likes",
  "home",
  "mentions",  // default to main; dispatch overrides for -u
  "lists",
  "list-memberships",
]);

export function getClientForCommand(command: string): TwitterClient {
  if (MAIN_ACCOUNT_COMMANDS.has(command)) {
    return getMainClient();
  }
  return getSecondaryClient();
}
```

### Phase 2: Update command dispatch (`src/command.ts`)

**Current state:** `executeCommand()` calls `getTwitterClient()` once, passes client to `dispatch()`.

**Changes:**

1. In `executeCommand()` (line ~163): replace `getTwitterClient()` with `getClientForCommand(command)`
2. In the `mentions` case of `dispatch()` (lines ~227-239): when `-u` flag is present, call `getSecondaryClient()` to get the secondary client and use it instead of the passed-in client

```typescript
// src/command.ts — executeCommand
const client = getClientForCommand(command);
const body = await dispatch(client, command, positional, flags);

// src/command.ts — mentions case in dispatch
case "mentions": {
  const handle = flags["u"] ?? flags["user"];
  let query: string;
  if (typeof handle === "string") {
    // Use secondary client for other users' mentions
    const mentionsClient = getSecondaryClient();
    query = `@${handle.replace(/^@/, "")}`;
    return mentionsClient.search(query, count);
  } else {
    const me = await client.getCurrentUser();
    if (!me.success || !me.user)
      throw new Error("Could not resolve current user for mentions");
    query = `@${me.user.username}`;
    return client.search(query, count);
  }
}
```

### Phase 3: Update configuration files

**`.env.example`** — Add two new vars:

```
SECONDARY_AUTH_TOKEN=     # Secondary account auth_token cookie (for generic reads)
SECONDARY_CT0=            # Secondary account ct0 cookie (for generic reads)
```

**`setup.sh`** — Add prompts for secondary credentials:

1. After the existing `TWITTER_CT0` prompt (~line 50), add prompts for `SECONDARY_AUTH_TOKEN` and `SECONDARY_CT0`
2. Add validation that secondary credentials are present (~line 65)
3. Include secondary vars in the `.env` write block (~line 70)

### Phase 4: Update AGENT-README.md and CLAUDE.md

- Document the dual-account architecture in both files
- Note which commands use which account
- Document the new env vars

## Acceptance Criteria

- [x] Server requires `SECONDARY_AUTH_TOKEN` and `SECONDARY_CT0` at startup
- [x] `whoami`, `check`, `bookmarks`, `bookmark-folder`, `likes`, `home`, `mentions` (no -u), `lists`, `list-memberships` use main account client
- [x] `read`, `replies`, `thread`, `search`, `user-id`, `user-about`, `following`, `followers`, `user-tweets`, `news`, `list-timeline` use secondary account client
- [x] `mentions -u <handle>` uses secondary account client
- [x] `.env.example` documents the new vars
- [x] `setup.sh` prompts for secondary credentials
- [x] AGENT-README.md and CLAUDE.md updated

## Files to Modify

| File | Change |
|---|---|
| `src/twitter.ts` | Add secondary client, `getClientForCommand()`, `getSecondaryClient()` |
| `src/command.ts` | Use `getClientForCommand()` in `executeCommand()`, handle `mentions -u` override in `dispatch()` |
| `.env.example` | Add `SECONDARY_AUTH_TOKEN`, `SECONDARY_CT0` |
| `setup.sh` | Prompt for + validate secondary credentials |
| `AGENT-README.md` | Document dual-account architecture |
| `CLAUDE.md` | Document dual-account architecture |

## Dependencies & Risks

- **Cookie expiration:** Secondary account cookies expire just like main account cookies. No mitigation needed — same operational burden as today, just for two accounts instead of one.
- **No fallback:** If secondary account fails, requests fail. This is intentional per the brainstorm decision.
- **`mentions` conditional routing** is the one non-trivial piece — needs careful testing that the flag detection works correctly.
