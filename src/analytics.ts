import { Database } from "bun:sqlite";
import { join } from "node:path";

const DB_PATH = join(import.meta.dir, "..", "analytics.db");

const db = new Database(DB_PATH);

db.run(`
  CREATE TABLE IF NOT EXISTS request_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    key_id TEXT NOT NULL,
    command TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER NOT NULL
  )
`);

db.run(`
  CREATE INDEX IF NOT EXISTS idx_request_log_timestamp ON request_log(timestamp)
`);
db.run(`
  CREATE INDEX IF NOT EXISTS idx_request_log_key_id ON request_log(key_id)
`);

const insertStmt = db.prepare(`
  INSERT INTO request_log (timestamp, key_id, command, status_code, response_time_ms)
  VALUES (?, ?, ?, ?, ?)
`);

const pruneStmt = db.prepare(`
  DELETE FROM request_log WHERE timestamp < datetime('now', '-30 days')
`);

export function logRequest(
  keyId: string,
  command: string,
  statusCode: number,
  responseTimeMs: number
): void {
  pruneStmt.run();
  insertStmt.run(new Date().toISOString(), keyId, command, statusCode, responseTimeMs);
}

export interface KeyStats {
  key_id: string;
  count: number;
}

export function getRequestsPerKey(): KeyStats[] {
  return db
    .prepare(
      `SELECT key_id, COUNT(*) as count FROM request_log
       WHERE timestamp > datetime('now', '-30 days')
       GROUP BY key_id ORDER BY count DESC`
    )
    .all() as KeyStats[];
}

export interface CommandStats {
  command: string;
  count: number;
}

export function getRequestsPerCommand(): CommandStats[] {
  return db
    .prepare(
      `SELECT command, COUNT(*) as count FROM request_log
       WHERE timestamp > datetime('now', '-30 days')
       GROUP BY command ORDER BY count DESC`
    )
    .all() as CommandStats[];
}

export interface LogEntry {
  id: number;
  timestamp: string;
  key_id: string;
  command: string;
  status_code: number;
  response_time_ms: number;
}

export function getRecentLogs(page: number = 1, pageSize: number = 100): { logs: LogEntry[]; total: number } {
  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM request_log`).get() as { count: number }
  ).count;
  const offset = (page - 1) * pageSize;
  const logs = db
    .prepare(
      `SELECT * FROM request_log ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(pageSize, offset) as LogEntry[];
  return { logs, total };
}
