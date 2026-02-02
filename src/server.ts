import { validateKey } from "./keys.js";
import { logRequest } from "./analytics.js";
import { executeCommand, getCommandName } from "./command.js";
import { handleDashboardRequest } from "./dashboard.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // Health check
    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json({ status: "ok" });
    }

    // Dashboard routes
    if (url.pathname.startsWith("/dashboard")) {
      return handleDashboardRequest(req);
    }

    // Command endpoint
    if (url.pathname === "/api/command" && req.method === "POST") {
      return handleCommand(req);
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`Read-Only Bird server running on http://localhost:${PORT}`);
console.log(`Dashboard: http://localhost:${PORT}/dashboard`);
console.log(`API: POST http://localhost:${PORT}/api/command`);

async function handleCommand(req: Request): Promise<Response> {
  const start = Date.now();

  // Auth
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json(
      { error: "Missing Authorization: Bearer <key> header" },
      { status: 401 }
    );
  }

  const bearer = authHeader.slice(7);
  const apiKey = validateKey(bearer);
  if (!apiKey) {
    return Response.json({ error: "Invalid API key" }, { status: 401 });
  }

  // Parse body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const commandStr = body?.command;
  if (!commandStr || typeof commandStr !== "string") {
    return Response.json(
      { error: 'Missing "command" field in request body' },
      { status: 400 }
    );
  }

  const commandName = getCommandName(commandStr);

  // Execute
  const result = await executeCommand(commandStr);
  const elapsed = Date.now() - start;

  // Log
  logRequest(apiKey.id, commandName, result.status, elapsed);

  return Response.json(result.body, { status: result.status });
}
