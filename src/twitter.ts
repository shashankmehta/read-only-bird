import { TwitterClient } from "@steipete/bird";

let client: TwitterClient | null = null;

export function getTwitterClient(): TwitterClient {
  if (client) return client;

  const authToken = process.env.TWITTER_AUTH_TOKEN;
  const ct0 = process.env.TWITTER_CT0;

  if (!authToken || !ct0) {
    throw new Error(
      "Missing TWITTER_AUTH_TOKEN or TWITTER_CT0 environment variables"
    );
  }

  client = new TwitterClient({
    cookies: {
      authToken,
      ct0,
      cookieHeader: `auth_token=${authToken}; ct0=${ct0}`,
      source: "env",
    },
  });

  return client;
}
