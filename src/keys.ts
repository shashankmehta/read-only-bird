import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

export interface ApiKey {
  id: string;
  key: string;
  name: string;
}

interface KeysFile {
  keys: ApiKey[];
}

const KEYS_PATH = join(import.meta.dir, "..", "keys.json");

let cachedKeys: ApiKey[] | null = null;

function loadKeys(): ApiKey[] {
  if (!existsSync(KEYS_PATH)) {
    writeFileSync(KEYS_PATH, JSON.stringify({ keys: [] }, null, 2));
    cachedKeys = [];
    return [];
  }
  const data: KeysFile = JSON.parse(readFileSync(KEYS_PATH, "utf-8"));
  cachedKeys = data.keys;
  return data.keys;
}

function saveKeys(keys: ApiKey[]): void {
  writeFileSync(KEYS_PATH, JSON.stringify({ keys }, null, 2));
  cachedKeys = keys;
}

export function getKeys(): ApiKey[] {
  if (cachedKeys) return cachedKeys;
  return loadKeys();
}

export function validateKey(bearer: string): ApiKey | null {
  const keys = getKeys();
  return keys.find((k) => k.key === bearer) ?? null;
}

export function addKey(name: string): ApiKey {
  const keys = getKeys();
  const newKey: ApiKey = {
    id: `key-${Date.now()}`,
    key: `sk-${randomBytes(24).toString("hex")}`,
    name,
  };
  keys.push(newKey);
  saveKeys(keys);
  return newKey;
}

export function revokeKey(id: string): boolean {
  const keys = getKeys();
  const idx = keys.findIndex((k) => k.id === id);
  if (idx === -1) return false;
  keys.splice(idx, 1);
  saveKeys(keys);
  return true;
}

export function reloadKeys(): void {
  cachedKeys = null;
  loadKeys();
}
