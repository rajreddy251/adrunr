import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnv } from "./env";

export type StoredTokens = {
  refreshToken: string;
  accessToken?: string;
  expiryDate?: number;
  email?: string;
  scope?: string;
  updatedAt: string;
  source: "oauth" | "env" | "mock";
};

const STORE_PATH = path.join(process.cwd(), ".data", "tokens.json");

async function readStore(): Promise<StoredTokens | null> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as StoredTokens;
    if (!parsed.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function loadTokens(): Promise<StoredTokens | null> {
  const stored = await readStore();
  if (stored) return stored;

  const env = getEnv();
  if (env.mockMode) return null;
  if (env.adsRefreshToken) {
    return {
      refreshToken: env.adsRefreshToken,
      email: undefined,
      updatedAt: new Date().toISOString(),
      source: "env",
    };
  }
  return null;
}

export async function saveTokens(tokens: StoredTokens): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(tokens, null, 2), "utf8");
}

export async function clearTokens(): Promise<void> {
  try {
    await unlink(STORE_PATH);
  } catch {
    // already gone
  }
}

export async function isConnected(): Promise<boolean> {
  return Boolean(await loadTokens());
}
