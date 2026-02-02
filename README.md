# Read-Only Bird

Read-only Twitter/X API wrapper. Exposes a single authenticated HTTP endpoint that accepts [bird](https://github.com/steipete/bird) CLI-style commands and returns JSON. Write operations are blocked.

This wrapper was created to give a read only access to OpenClaw to a user's X account. Primarily for security reasons.

NOTE: This service needs to be run on a system that OpenClaw DOES NOT have access to. Otherwise the security mechanism is practically useless. I run OpenClaw on a VM and this service on a separate VM. 

## Prerequisites

- [Bun](https://bun.sh) runtime installed
- Twitter/X cookie values (`auth_token` and `ct0`) — open https://x.com in your browser, go to DevTools > Application > Cookies > `https://x.com`, and copy them

## Installation

The quickest way to get running is the setup script, which installs dependencies, configures env vars, and registers a macOS launchd service so the server starts automatically on login:

```bash
bash setup.sh
```

The script will prompt for:

| Variable | Description |
|---|---|
| `TWITTER_AUTH_TOKEN` | `auth_token` cookie from x.com |
| `TWITTER_CT0` | `ct0` cookie from x.com |
| `DASHBOARD_PASSWORD` | Password for the analytics dashboard |
| `PORT` | Server port (default `3000`) |

Values are written to `.env`. Re-running the script preserves existing values (press Enter to keep them).

### What the setup script does

1. Checks that `bun` is installed
2. Runs `bun install`
3. Creates `logs/` directory for service output
4. Prompts for env vars and writes `.env`
5. Generates `run.sh` — a wrapper that sources `.env` and execs bun (keeps secrets out of the plist)
6. Installs a launchd plist to `~/Library/LaunchAgents/com.readonly.bird.plist`
7. Loads the service via `launchctl`

### Managing the service

```bash
launchctl list | grep readonly.bird                                          # check status
launchctl unload ~/Library/LaunchAgents/com.readonly.bird.plist         # stop
launchctl load ~/Library/LaunchAgents/com.readonly.bird.plist           # start
tail -f logs/stderr.log                                                # watch logs
```

### Manual setup (without launchd)

If you prefer to run the server manually:

```bash
bun install
cp .env.example .env   # fill in values (see table above)
bun run start
# or with auto-reload:
bun run dev
```

## Creating API Keys

Visit `http://localhost:3000/dashboard` or use the API:

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"My Agent"}' \
  http://localhost:3000/dashboard/api/keys
```

Save the returned `key` value — agents use it as `Authorization: Bearer <key>`.

## API

All commands go through a single endpoint:

```
POST /api/command
Authorization: Bearer <key>
Content-Type: application/json

{ "command": "<command string>" }
```

## Sample Commands

All examples below assume:

```bash
API=http://localhost:3000/api/command
KEY=sk-your-key-here
```

### Check credentials

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"whoami"}' $API
```

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"check"}' $API
```

### Read a tweet

By ID or URL:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"read 1234567890"}' $API
```

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"read https://x.com/user/status/1234567890"}' $API
```

### Search

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"search \"AI news\" -n 10"}' $API
```

With pagination:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"search \"AI news\" --all --max-pages 3"}' $API
```

### Replies to a tweet

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"replies 1234567890"}' $API
```

With pagination:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"replies 1234567890 --max-pages 5 --delay 2000"}' $API
```

### Thread

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"thread 1234567890"}' $API
```

### Mentions

Your own mentions:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"mentions -n 20"}' $API
```

Another user's mentions:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"mentions -u elonmusk -n 10"}' $API
```

### Home timeline

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"home -n 20"}' $API
```

Chronological (Following) timeline:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"home -n 20 --latest"}' $API
```

### Bookmarks

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"bookmarks -n 10"}' $API
```

All bookmarks (paginated):

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"bookmarks --all --max-pages 5"}' $API
```

Bookmark folder:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"bookmark-folder 1234567890 -n 10"}' $API
```

### Likes

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"likes -n 10"}' $API
```

### Following & Followers

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"following 123456 -n 50"}' $API
```

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"followers 123456 -n 50"}' $API
```

With cursor for next page:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"following 123456 -n 50 --cursor abc123"}' $API
```

### User tweets

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"user-tweets 123456 -n 20"}' $API
```

### User lookup

Get user ID from username:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"user-id elonmusk"}' $API
```

Get account info:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"user-about elonmusk"}' $API
```

### Lists

Your owned lists:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"lists"}' $API
```

Lists you're a member of:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"list-memberships"}' $API
```

Tweets from a list:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"list-timeline 1234567890 -n 20"}' $API
```

### News / Explore

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"news -n 10"}' $API
```

With related tweets:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"news -n 10 --with-tweets --tweets-per-item 3"}' $API
```

Specific tabs (`trending`, `news`, `sports`, `entertainment`, `forYou`):

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"news -n 5 --tabs trending,sports"}' $API
```

AI-curated only:

```bash
curl -X POST -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"command":"news -n 10 --ai-only"}' $API
```

## Blocked Commands

The following commands return `403 Forbidden`:

`tweet`, `reply`, `follow`, `unfollow`, `unbookmark`, `like`, `unlike`, `retweet`, `unretweet`, `bookmark`, `upload-media`

## Pagination Flags

These flags work on commands that support pagination:

| Flag | Description |
|---|---|
| `--all` | Fetch all pages |
| `--max-pages N` | Limit to N pages |
| `--cursor <value>` | Resume from a cursor (returned as `nextCursor` in responses) |
| `--delay N` | Delay in ms between page fetches |

Supported by: `search`, `replies`, `thread`, `bookmarks`, `likes`, `list-timeline`, `user-tweets`, `bookmark-folder`

## Other Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Health check (`{"status":"ok"}`) |
| `GET /dashboard` | Analytics dashboard (basic auth) |
| `POST /dashboard/api/keys` | Create a new API key |
| `POST /dashboard/api/keys/revoke/:id` | Revoke an API key |

## Dashboard

The dashboard at `/dashboard` shows:

- Requests per API key (last 30 days)
- Requests per command (last 30 days)
- Recent request log (paginated)
- Key management (add/revoke keys)

Protected by `DASHBOARD_PASSWORD` via HTTP Basic Auth (username can be anything).

## Agent Instructions

[`AGENT-README.md`](AGENT-README.md) contains standalone API documentation designed for AI agents. Share it with an OpenClaw instance to set up a skill that can query Twitter/X through this service.
