import { TwitterClient } from "@steipete/bird";

let mainClient: TwitterClient | null = null;
let secondaryClient: TwitterClient | null = null;

const MAIN_ACCOUNT_COMMANDS = new Set([
  "whoami",
  "check",
  "bookmarks",
  "bookmark-folder",
  "likes",
  "home",
  "mentions", // default to main; dispatch overrides for -u
  "lists",
  "list-memberships",
]);

function getMainClient(): TwitterClient {
  if (mainClient) return mainClient;

  const authToken = process.env.TWITTER_AUTH_TOKEN;
  const ct0 = process.env.TWITTER_CT0;

  if (!authToken || !ct0) {
    throw new Error(
      "Missing TWITTER_AUTH_TOKEN or TWITTER_CT0 environment variables"
    );
  }

  mainClient = new TwitterClient({
    cookies: {
      authToken,
      ct0,
      cookieHeader: `auth_token=${authToken}; ct0=${ct0}`,
      source: "env",
    },
  });

  return mainClient;
}

export function getSecondaryClient(): TwitterClient {
  if (secondaryClient) return secondaryClient;

  const authToken = process.env.SECONDARY_AUTH_TOKEN;
  const ct0 = process.env.SECONDARY_CT0;

  if (!authToken || !ct0) {
    throw new Error(
      "Missing SECONDARY_AUTH_TOKEN or SECONDARY_CT0 environment variables"
    );
  }

  secondaryClient = new TwitterClient({
    cookies: {
      authToken,
      ct0,
      cookieHeader: `auth_token=${authToken}; ct0=${ct0}`,
      source: "env",
    },
  });

  return secondaryClient;
}

export function getAccountForCommand(command: string): string {
  return MAIN_ACCOUNT_COMMANDS.has(command) ? "main" : "secondary";
}

export function getClientForCommand(command: string): TwitterClient {
  if (MAIN_ACCOUNT_COMMANDS.has(command)) {
    return getMainClient();
  }
  return getSecondaryClient();
}

// Keep for backwards compatibility
export function getTwitterClient(): TwitterClient {
  return getMainClient();
}
