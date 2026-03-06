import {
  getRequestsPerKey,
  getRequestsPerCommand,
  getRequestsPerAccount,
  getRecentLogs,
} from "./analytics.js";
import { getKeys, addKey, revokeKey, type ApiKey } from "./keys.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function checkDashboardAuth(req: Request): Response | null {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return null; // no password set = no auth required

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = atob(encoded);
      const [, pwd] = decoded.split(":");
      if (pwd === password) return null;
    }
  }

  return new Response("Unauthorized", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Dashboard"' },
  });
}

export async function handleDashboardRequest(req: Request): Promise<Response> {
  const authResponse = checkDashboardAuth(req);
  if (authResponse) return authResponse;

  const url = new URL(req.url);

  if (url.pathname === "/dashboard/api/keys" && req.method === "POST") {
    return handleAddKey(req);
  }
  if (url.pathname.startsWith("/dashboard/api/keys/revoke/") && req.method === "POST") {
    const keyId = url.pathname.split("/").pop()!;
    return handleRevokeKey(keyId);
  }

  return renderDashboard(url);
}

async function handleAddKey(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    const name = body.name;
    if (!name || typeof name !== "string") {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }
    const key = addKey(name);
    return Response.json(key, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
}

function handleRevokeKey(keyId: string): Response {
  const ok = revokeKey(keyId);
  if (!ok) return Response.json({ error: "Key not found" }, { status: 404 });
  return Response.json({ success: true });
}

function renderDashboard(url: URL): Response {
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const perKeyStats = getRequestsPerKey();
  const perCommandStats = getRequestsPerCommand();
  const perAccountStats = getRequestsPerAccount();
  const { logs, total } = getRecentLogs(page, 100);
  const keys = getKeys();
  const totalPages = Math.max(1, Math.ceil(total / 100));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Read-Only Bird - Dashboard</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 20px; max-width: 1200px; margin: 0 auto; }
  h1 { margin-bottom: 8px; }
  .subtitle { color: #666; margin-bottom: 24px; }
  h2 { margin: 24px 0 12px; border-bottom: 2px solid #ddd; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
  th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f9f9f9; font-weight: 600; }
  tr:hover { background: #f5f8ff; }
  .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
  .pagination { margin: 16px 0; display: flex; gap: 8px; }
  .pagination a { padding: 6px 12px; background: #fff; border: 1px solid #ddd; border-radius: 4px; text-decoration: none; color: #333; }
  .pagination a.active { background: #333; color: #fff; }
  form.inline { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
  input[type="text"] { padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; }
  button { padding: 8px 16px; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  button:hover { background: #555; }
  button.danger { background: #c00; }
  button.danger:hover { background: #e00; }
  .key-value { font-family: monospace; font-size: 0.85em; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
  .status-2 { color: #080; } .status-4 { color: #c80; } .status-5 { color: #c00; }
  .account-main { color: #080; font-weight: 600; } .account-secondary { color: #36c; font-weight: 600; }
  @media (max-width: 768px) { .stats-grid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>Read-Only Bird</h1>
<p class="subtitle">Analytics Dashboard</p>

<div class="stats-grid">
<div>
<h2>Requests per Key (30d)</h2>
<table>
<tr><th>Key ID</th><th>Name</th><th>Count</th></tr>
${perKeyStats
  .map((s) => {
    const keyObj = keys.find((k) => k.id === s.key_id);
    return `<tr><td>${escapeHtml(s.key_id)}</td><td>${escapeHtml(keyObj?.name ?? "unknown")}</td><td>${s.count}</td></tr>`;
  })
  .join("\n")}
${perKeyStats.length === 0 ? '<tr><td colspan="3">No data</td></tr>' : ""}
</table>
</div>

<div>
<h2>Requests per Command (30d)</h2>
<table>
<tr><th>Command</th><th>Count</th></tr>
${perCommandStats.map((s) => `<tr><td>${escapeHtml(s.command)}</td><td>${s.count}</td></tr>`).join("\n")}
${perCommandStats.length === 0 ? '<tr><td colspan="2">No data</td></tr>' : ""}
</table>
</div>

<div>
<h2>Requests per Account (30d)</h2>
<table>
<tr><th>Account</th><th>Count</th></tr>
${perAccountStats.map((s) => `<tr><td class="account-${s.account}">${escapeHtml(s.account)}</td><td>${s.count}</td></tr>`).join("\n")}
${perAccountStats.length === 0 ? '<tr><td colspan="2">No data</td></tr>' : ""}
</table>
</div>
</div>

<h2>API Keys</h2>
<form class="inline" method="POST" action="/dashboard/api/keys" id="addKeyForm">
  <input type="text" name="name" placeholder="Key name (e.g. Research Agent)" required id="keyName">
  <button type="submit">Add Key</button>
</form>
<table>
<tr><th>ID</th><th>Name</th><th>Key</th><th>Action</th></tr>
${keys
  .map(
    (k) =>
      `<tr><td>${escapeHtml(k.id)}</td><td>${escapeHtml(k.name)}</td><td class="key-value" title="${escapeHtml(k.key)}">${escapeHtml(k.key)}</td><td><button class="danger" onclick="revokeKey('${escapeHtml(k.id)}')">Revoke</button></td></tr>`
  )
  .join("\n")}
${keys.length === 0 ? '<tr><td colspan="4">No keys configured</td></tr>' : ""}
</table>

<h2>Recent Requests</h2>
<table>
<tr><th>ID</th><th>Timestamp</th><th>Key ID</th><th>Command</th><th>Account</th><th>Status</th><th>Time (ms)</th></tr>
${logs
  .map(
    (l) =>
      `<tr><td>${l.id}</td><td class="ts" data-utc="${escapeHtml(l.timestamp)}">${escapeHtml(l.timestamp)}</td><td>${escapeHtml(l.key_id)}</td><td>${escapeHtml(l.command)}</td><td class="account-${l.account}">${escapeHtml(l.account)}</td><td class="status-${String(l.status_code)[0]}">${l.status_code}</td><td>${l.response_time_ms}</td></tr>`
  )
  .join("\n")}
${logs.length === 0 ? '<tr><td colspan="7">No requests yet</td></tr>' : ""}
</table>

<div class="pagination">
${Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1)
  .map(
    (p) =>
      `<a href="/dashboard?page=${p}" class="${p === page ? "active" : ""}">${p}</a>`
  )
  .join("\n")}
${totalPages > 10 ? `<span>... ${totalPages} pages</span>` : ""}
</div>

<script>
document.getElementById('addKeyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('keyName').value;
  const res = await fetch('/dashboard/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (res.ok) {
    const key = await res.json();
    alert('Key created: ' + key.key + '\\n\\nSave this key - it will be shown in the table but cannot be retrieved later via the dashboard.');
    location.reload();
  } else {
    alert('Failed to create key');
  }
});

document.querySelectorAll('.ts[data-utc]').forEach(el => {
  const d = new Date(el.dataset.utc);
  el.textContent = d.toLocaleString();
});

async function revokeKey(id) {
  if (!confirm('Are you sure you want to revoke this key?')) return;
  const res = await fetch('/dashboard/api/keys/revoke/' + id, { method: 'POST' });
  if (res.ok) location.reload();
  else alert('Failed to revoke key');
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
