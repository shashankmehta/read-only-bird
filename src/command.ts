import { getClientForCommand, getSecondaryClient } from "./twitter.js";
import { extractTweetId } from "@steipete/bird/dist/lib/extract-tweet-id.js";
import type { ExploreTab } from "@steipete/bird";

// Shell-style tokenizer: splits on spaces, respects double/single quotes
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inDouble = false;
  let inSingle = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === " " && !inDouble && !inSingle) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

// Parse flags from tokens: returns { positional: string[], flags: Record<string, string|true> }
interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | true>;
}

function parseArgs(tokens: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith("--")) {
      const key = t.slice(2);
      // Check if next token is a value (not another flag)
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) {
        flags[key] = tokens[++i];
      } else {
        flags[key] = true;
      }
    } else if (t.startsWith("-") && t.length === 2) {
      const key = t.slice(1);
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) {
        flags[key] = tokens[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(t);
    }
  }

  return { positional, flags };
}

function getCount(flags: Record<string, string | true>): number | undefined {
  const n = flags["n"] ?? flags["count"];
  if (n && typeof n === "string") return parseInt(n, 10);
  return undefined;
}

function getCursor(flags: Record<string, string | true>): string | undefined {
  const c = flags["cursor"];
  return typeof c === "string" ? c : undefined;
}

function getMaxPages(flags: Record<string, string | true>): number | undefined {
  const mp = flags["max-pages"];
  if (mp && typeof mp === "string") return parseInt(mp, 10);
  return undefined;
}

function getDelay(flags: Record<string, string | true>): number | undefined {
  const d = flags["delay"];
  if (d && typeof d === "string") return parseInt(d, 10);
  return undefined;
}

function hasPagination(flags: Record<string, string | true>): boolean {
  return flags["all"] === true || !!flags["max-pages"] || !!flags["cursor"];
}

const BLOCKED_COMMANDS = new Set([
  "tweet",
  "reply",
  "follow",
  "unfollow",
  "unbookmark",
  "like",
  "unlike",
  "retweet",
  "unretweet",
  "bookmark",
  "query-ids",
  "help",
  "upload-media",
]);

const ALLOWED_COMMANDS = new Set([
  "read",
  "replies",
  "thread",
  "search",
  "mentions",
  "bookmarks",
  "likes",
  "following",
  "followers",
  "home",
  "lists",
  "list-memberships",
  "list-timeline",
  "user-tweets",
  "news",
  "whoami",
  "check",
  "user-id",
  "user-about",
  "bookmark-folder",
]);

export interface CommandResult {
  status: number;
  body: unknown;
}

export async function executeCommand(commandStr: string): Promise<CommandResult> {
  const tokens = tokenize(commandStr.trim());
  if (tokens.length === 0) {
    return { status: 400, body: { error: "Empty command" } };
  }

  const command = tokens[0];
  const { positional, flags } = parseArgs(tokens.slice(1));

  if (BLOCKED_COMMANDS.has(command)) {
    return {
      status: 403,
      body: { error: `Command "${command}" is blocked. Only read-only commands are allowed.` },
    };
  }

  if (!ALLOWED_COMMANDS.has(command)) {
    return {
      status: 400,
      body: { error: `Unknown command "${command}". Allowed: ${[...ALLOWED_COMMANDS].join(", ")}` },
    };
  }

  try {
    const client = getClientForCommand(command);
    const result = await dispatch(client, command, positional, flags);
    return { status: 200, body: result };
  } catch (err: any) {
    return {
      status: 500,
      body: { success: false, error: err.message ?? String(err) },
    };
  }
}

async function dispatch(
  client: any,
  command: string,
  positional: string[],
  flags: Record<string, string | true>
): Promise<unknown> {
  const count = getCount(flags);
  const cursor = getCursor(flags);
  const maxPages = getMaxPages(flags);
  const delay = getDelay(flags);
  const paged = hasPagination(flags);

  switch (command) {
    case "read": {
      if (positional.length === 0)
        throw new Error("Usage: read <tweet-id-or-url>");
      const id = extractTweetId(positional[0]);
      return client.getTweet(id);
    }

    case "replies": {
      if (positional.length === 0)
        throw new Error("Usage: replies <tweet-id-or-url>");
      const id = extractTweetId(positional[0]);
      if (paged) {
        return client.getRepliesPaged(id, { maxPages, cursor, pageDelayMs: delay });
      }
      return client.getReplies(id);
    }

    case "thread": {
      if (positional.length === 0)
        throw new Error("Usage: thread <tweet-id-or-url>");
      const id = extractTweetId(positional[0]);
      if (paged) {
        return client.getThreadPaged(id, { maxPages, cursor, pageDelayMs: delay });
      }
      return client.getThread(id);
    }

    case "search": {
      if (positional.length === 0)
        throw new Error("Usage: search <query> [-n count]");
      const query = positional.join(" ");
      if (paged) {
        return client.getAllSearchResults(query, { maxPages, cursor });
      }
      return client.search(query, count);
    }

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

    case "bookmarks": {
      if (paged) {
        return client.getAllBookmarks({ maxPages, cursor });
      }
      return client.getBookmarks(count);
    }

    case "likes": {
      if (paged) {
        return client.getAllLikes({ maxPages, cursor });
      }
      return client.getLikes(count);
    }

    case "following": {
      if (positional.length === 0)
        throw new Error("Usage: following <userId> [-n count]");
      return client.getFollowing(positional[0], count, cursor);
    }

    case "followers": {
      if (positional.length === 0)
        throw new Error("Usage: followers <userId> [-n count]");
      return client.getFollowers(positional[0], count, cursor);
    }

    case "home": {
      const latest = flags["latest"] === true;
      if (latest) {
        return client.getHomeLatestTimeline(count);
      }
      return client.getHomeTimeline(count);
    }

    case "lists": {
      return client.getOwnedLists(count);
    }

    case "list-memberships": {
      return client.getListMemberships(count);
    }

    case "list-timeline": {
      if (positional.length === 0)
        throw new Error("Usage: list-timeline <listId> [-n count]");
      if (paged) {
        return client.getAllListTimeline(positional[0], { maxPages, cursor });
      }
      return client.getListTimeline(positional[0], count);
    }

    case "user-tweets": {
      if (positional.length === 0)
        throw new Error("Usage: user-tweets <userId> [-n count]");
      if (paged) {
        return client.getUserTweetsPaged(positional[0], count ?? 20, {
          maxPages,
          cursor,
          pageDelayMs: delay,
        });
      }
      return client.getUserTweets(positional[0], count);
    }

    case "news": {
      const opts: Record<string, any> = {};
      if (flags["with-tweets"] === true) opts.withTweets = true;
      if (flags["ai-only"] === true) opts.aiOnly = true;
      if (typeof flags["tabs"] === "string") {
        opts.tabs = (flags["tabs"] as string).split(",") as ExploreTab[];
      }
      if (typeof flags["tweets-per-item"] === "string") {
        opts.tweetsPerItem = parseInt(flags["tweets-per-item"], 10);
      }
      return client.getNews(count, Object.keys(opts).length > 0 ? opts : undefined);
    }

    case "whoami": {
      return client.getCurrentUser();
    }

    case "check": {
      const me = await client.getCurrentUser();
      return {
        success: me.success,
        message: me.success
          ? `Authenticated as @${me.user?.username}`
          : `Authentication failed: ${me.error}`,
      };
    }

    case "user-id": {
      if (positional.length === 0)
        throw new Error("Usage: user-id <username>");
      return client.getUserIdByUsername(positional[0].replace(/^@/, ""));
    }

    case "user-about": {
      if (positional.length === 0)
        throw new Error("Usage: user-about <username>");
      return client.getUserAboutAccount(positional[0].replace(/^@/, ""));
    }

    case "bookmark-folder": {
      if (positional.length === 0)
        throw new Error("Usage: bookmark-folder <folderId> [-n count]");
      if (paged) {
        return client.getAllBookmarkFolderTimeline(positional[0], { maxPages, cursor });
      }
      return client.getBookmarkFolderTimeline(positional[0], count);
    }

    default:
      throw new Error(`Unhandled command: ${command}`);
  }
}

export function getCommandName(commandStr: string): string {
  const tokens = tokenize(commandStr.trim());
  return tokens[0] ?? "unknown";
}
