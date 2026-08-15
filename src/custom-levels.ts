// 自定义关卡存储：内置（随包发布，可 git 同步）+ 本地（localStorage，即时保存）。
// 本地优先覆盖内置；新增关卡使用 101+ 的 id。

import type { LevelConfig } from "./types";
import builtinLevels from "./custom-levels.json";

const KEY = "duck_mom_custom_levels_v1";

type LevelMap = Record<number, LevelConfig>;

function loadLocal(): LevelMap {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: LevelMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      const id = Number(k);
      if (Number.isInteger(id) && id >= 1 && v && typeof v === "object") {
        out[id] = v as LevelConfig;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function loadBuiltin(): LevelMap {
  const out: LevelMap = {};
  const arr = builtinLevels as unknown as LevelConfig[];
  for (const cfg of arr) {
    if (cfg && typeof cfg.levelId === "number" && Array.isArray(cfg.gridSize)) {
      out[cfg.levelId] = cfg;
    }
  }
  return out;
}

function merged(): LevelMap {
  return { ...loadBuiltin(), ...loadLocal() };
}

export function getCustomLevel(id: number): LevelConfig | null {
  const local = loadLocal();
  if (local[id]) return local[id];
  return loadBuiltin()[id] ?? null;
}

export function listCustomLevels(): LevelConfig[] {
  return Object.values(merged()).sort((a, b) => a.levelId - b.levelId);
}

export function putCustomLevel(config: LevelConfig): void {
  const store = loadLocal();
  store[config.levelId] = config;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // 存储不可用时静默失败
  }
}

export function removeCustomLevel(id: number): void {
  const store = loadLocal();
  delete store[id];
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function nextCustomLevelId(): number {
  const ids = Object.keys(merged()).map(Number);
  const max = ids.length ? Math.max(...ids) : 0;
  return Math.max(101, max + 1);
}

export function exportCustomLevels(): string {
  return JSON.stringify(listCustomLevels(), null, 2);
}

/** 导入一个或多个关卡配置 JSON，返回导入数量 */
export function importCustomLevels(json: string): number {
  const parsed = JSON.parse(json) as unknown;
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const store = loadLocal();
  let count = 0;
  for (const item of arr as LevelConfig[]) {
    if (
      item &&
      typeof item.levelId === "number" &&
      Array.isArray(item.gridSize) &&
      Array.isArray(item.start)
    ) {
      store[item.levelId] = item;
      count++;
    }
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
  return count;
}
