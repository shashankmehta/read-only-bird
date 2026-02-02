# Read-Only Bird - Agent Instructions

You have access to a read-only Twitter/X API via Read-Only Bird.

This document will give you all necessary details to setup a new skill to use this for any X/Twitter related activity which is read only.

## Endpoint

```
POST http://localhost:3000/api/command
```

Ask the human operator for the correct IP address.

## Authentication

Every request requires a Bearer token in the `Authorization` header. You should have been provided a key (starts with `sk-`). If you don't have one, ask the human operator.

## Request Format

Send a JSON body with a single `command` field containing a bird CLI-style command string:

```json
POST http://100.122.200.45:3000/api/command
Authorization: Bearer sk-your-key-here
Content-Type: application/json

{ "command": "<command string here>" }
```

The response is always JSON.

## Available Commands

### Identity

| Command | Description |
|---|---|
| `whoami` | Get the authenticated Twitter account's user info |
| `check` | Verify credentials are working |

### Reading Tweets

| Command | Description |
|---|---|
| `read <id-or-url>` | Get a single tweet by ID or URL |
| `replies <id-or-url>` | Get replies to a tweet |
| `thread <id-or-url>` | Get a conversation thread |

Tweet IDs and full URLs (e.g. `https://x.com/user/status/1234567890`) both work.

### Search

| Command | Description |
|---|---|
| `search "<query>" -n <count>` | Search tweets. Quote the query if it has spaces. |
| `mentions -n <count>` | Get mentions of the authenticated user |
| `mentions -u <handle> -n <count>` | Get mentions of a specific user |

### Timelines

| Command | Description |
|---|---|
| `home -n <count>` | Get "For You" home timeline |
| `home -n <count> --latest` | Get chronological "Following" timeline |
| `bookmarks -n <count>` | Get bookmarked tweets |
| `likes -n <count>` | Get liked tweets |

### Users

| Command | Description |
|---|---|
| `user-id <username>` | Get a user's numeric ID from their handle |
| `user-about <username>` | Get account origin/location info |
| `following <userId> -n <count>` | Get accounts a user follows (requires numeric user ID) |
| `followers <userId> -n <count>` | Get a user's followers (requires numeric user ID) |
| `user-tweets <userId> -n <count>` | Get a user's recent tweets (requires numeric user ID) |

Note: `following`, `followers`, and `user-tweets` require a numeric user ID, not a username. Use `user-id <username>` first to get the ID.

### Lists

| Command | Description |
|---|---|
| `lists` | Get lists owned by the authenticated user |
| `list-memberships` | Get lists the authenticated user is a member of |
| `list-timeline <listId> -n <count>` | Get tweets from a list |

### News & Explore

| Command | Description |
|---|---|
| `news -n <count>` | Get trending news/topics |
| `news -n <count> --with-tweets` | Include related tweets per news item |
| `news -n <count> --tabs trending,news,sports` | Filter to specific Explore tabs |
| `news -n <count> --ai-only` | AI-curated items only |

Available tabs: `forYou`, `trending`, `news`, `sports`, `entertainment`

### Bookmark Folders

| Command | Description |
|---|---|
| `bookmark-folder <folderId> -n <count>` | Get tweets from a bookmark folder |

## Pagination

Some commands support paginated fetching for larger result sets:

| Flag | Description |
|---|---|
| `--all` | Fetch all available pages |
| `--max-pages <N>` | Fetch up to N pages |
| `--cursor <value>` | Resume from a previous `nextCursor` |
| `--delay <ms>` | Wait between page fetches (be respectful of rate limits) |

Pagination works with: `search`, `replies`, `thread`, `bookmarks`, `likes`, `list-timeline`, `user-tweets`, `bookmark-folder`.

When a response includes a `nextCursor` field, you can pass it via `--cursor` to get the next page.

## Response Format

Successful responses return `200` with the Twitter data as JSON. The shape depends on the command:

**Single tweet** (`read`):
```json
{ "success": true, "tweet": { "id": "...", "text": "...", "author": { "username": "...", "name": "..." }, ... } }
```

**Multiple tweets** (`search`, `replies`, `home`, `bookmarks`, etc.):
```json
{ "success": true, "tweets": [ ... ], "nextCursor": "..." }
```

**User info** (`whoami`):
```json
{ "success": true, "user": { "id": "...", "username": "...", "name": "..." } }
```

**Following/Followers**:
```json
{ "success": true, "users": [ ... ], "nextCursor": "..." }
```

**Lists**:
```json
{ "success": true, "lists": [ ... ] }
```

**News**:
```json
{ "success": true, "items": [ { "headline": "...", "category": "...", ... } ] }
```

## Error Responses

| Status | Meaning |
|---|---|
| `401` | Missing or invalid API key |
| `403` | Command is a write operation and is blocked |
| `400` | Unknown command or malformed request |
| `500` | Twitter API error (details in `error` field) |

Error body: `{ "error": "..." }` or `{ "success": false, "error": "..." }`

## Blocked Operations

This service is **read-only**. The following commands will return `403`:

`tweet`, `reply`, `follow`, `unfollow`, `like`, `unlike`, `retweet`, `unretweet`, `bookmark`, `unbookmark`, `upload-media`

Do not attempt these commands.

## Common Patterns

**Look up a user and get their tweets:**
1. `user-id johndoe` → get the numeric ID
2. `user-tweets <id> -n 20` → get their recent tweets

**Get a tweet and its replies:**
1. `read 1234567890` → read the tweet
2. `replies 1234567890` → get replies

**Search with full pagination:**
1. `search "topic" -n 20` → first page
2. Use `nextCursor` from response: `search "topic" -n 20 --cursor <nextCursor>`

## Rate Limits

There are no rate limits enforced by this service, but the underlying Twitter API has its own limits. If you receive errors, back off and retry after a delay. When paginating, use `--delay 1000` or higher.
