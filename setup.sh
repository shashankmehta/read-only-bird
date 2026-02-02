#!/bin/bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_LABEL="com.moltbot.bird"
PLIST_NAME="${SERVICE_LABEL}.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "=== MoltBot Bird Setup ==="
echo ""

# 1. Check bun is installed
if ! command -v bun &>/dev/null; then
  echo "Error: bun is not installed. Install it from https://bun.sh"
  exit 1
fi

BUN_PATH="$(which bun)"
echo "Found bun at: $BUN_PATH"

# 2. Install dependencies
echo ""
echo "Installing dependencies..."
cd "$REPO_DIR"
bun install

# 3. Create logs directory
mkdir -p "$REPO_DIR/logs"

# 4. Prompt for env vars and write .env
echo ""
echo "--- Environment Configuration ---"
echo "Leave blank to keep existing value (if .env exists)."
echo ""

# Load existing values if .env exists
EXISTING_AUTH_TOKEN=""
EXISTING_CT0=""
EXISTING_DASHBOARD_PASSWORD=""
EXISTING_PORT="3000"

if [[ -f "$REPO_DIR/.env" ]]; then
  # Source existing .env to get defaults
  set +u
  source "$REPO_DIR/.env"
  EXISTING_AUTH_TOKEN="${TWITTER_AUTH_TOKEN:-}"
  EXISTING_CT0="${TWITTER_CT0:-}"
  EXISTING_DASHBOARD_PASSWORD="${DASHBOARD_PASSWORD:-}"
  EXISTING_PORT="${PORT:-3000}"
  set -u
  echo "(Found existing .env — press Enter to keep current values)"
  echo ""
fi

read -rp "TWITTER_AUTH_TOKEN [${EXISTING_AUTH_TOKEN:+****}]: " INPUT_AUTH_TOKEN
read -rp "TWITTER_CT0 [${EXISTING_CT0:+****}]: " INPUT_CT0
read -rp "DASHBOARD_PASSWORD [${EXISTING_DASHBOARD_PASSWORD:+****}]: " INPUT_DASHBOARD_PASSWORD
read -rp "PORT [${EXISTING_PORT}]: " INPUT_PORT

TWITTER_AUTH_TOKEN="${INPUT_AUTH_TOKEN:-$EXISTING_AUTH_TOKEN}"
TWITTER_CT0="${INPUT_CT0:-$EXISTING_CT0}"
DASHBOARD_PASSWORD="${INPUT_DASHBOARD_PASSWORD:-$EXISTING_DASHBOARD_PASSWORD}"
PORT="${INPUT_PORT:-$EXISTING_PORT}"

if [[ -z "$TWITTER_AUTH_TOKEN" || -z "$TWITTER_CT0" ]]; then
  echo "Error: TWITTER_AUTH_TOKEN and TWITTER_CT0 are required."
  exit 1
fi

cat > "$REPO_DIR/.env" <<EOF
TWITTER_AUTH_TOKEN=${TWITTER_AUTH_TOKEN}
TWITTER_CT0=${TWITTER_CT0}
DASHBOARD_PASSWORD=${DASHBOARD_PASSWORD}
PORT=${PORT}
EOF

echo ""
echo "Wrote .env"

# 5. Generate run.sh wrapper
cat > "$REPO_DIR/run.sh" <<EOF
#!/bin/bash
set -a
source ${REPO_DIR}/.env
set +a
exec ${BUN_PATH} run ${REPO_DIR}/src/server.ts
EOF

chmod +x "$REPO_DIR/run.sh"
echo "Generated run.sh"

# 6. Unload existing service if present
if launchctl list "$SERVICE_LABEL" &>/dev/null; then
  echo ""
  echo "Unloading existing service..."
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
fi

# 7. Generate and install launchd plist
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${REPO_DIR}/run.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${REPO_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${REPO_DIR}/logs/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${REPO_DIR}/logs/stderr.log</string>
</dict>
</plist>
EOF

echo "Installed plist to $PLIST_PATH"

# 8. Load the service
echo ""
echo "Loading service..."
launchctl load "$PLIST_PATH"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Service: $SERVICE_LABEL"
echo "Logs:    $REPO_DIR/logs/stdout.log"
echo "         $REPO_DIR/logs/stderr.log"
echo ""
echo "Useful commands:"
echo "  launchctl list | grep moltbot   # check service status"
echo "  launchctl unload $PLIST_PATH    # stop service"
echo "  launchctl load $PLIST_PATH      # start service"
echo "  tail -f $REPO_DIR/logs/stderr.log  # watch logs"
echo ""
echo "Test with: curl http://localhost:${PORT}/health"
