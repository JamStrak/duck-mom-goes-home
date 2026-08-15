// 进度存储：localStorage 读写解锁数、每关最高星级。
// 键名与开发案 9.1 一致；损坏数据时回退初始状态、不崩溃。

import type { Progress } from "./types";

const KEY = "duck_mom_progress_v1";

export const TOTAL_LEVELS = 60;

export function defaultProgress(): Progress {
  return { unlocked: 1, stars: {} };
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (typeof parsed !== "object" || parsed === null) return defaultProgress();

    const unlocked =
      typeof parsed.unlocked === "number" && Number.isFinite(parsed.unlocked)
        ? Math.min(Math.max(1, Math.floor(parsed.unlocked)), TOTAL_LEVELS)
        : 1;

    const stars: Progress["stars"] = {};
    if (parsed.stars && typeof parsed.stars === "object") {
      const raw = parsed.stars as Record<string, unknown>;
      for (const k of Object.keys(raw)) {
        const lvl = Number(k);
        if (!Number.isInteger(lvl) || lvl < 1 || lvl > TOTAL_LEVELS) continue;
        const v = raw[k];
        if (v === 1 || v === 2 || v === 3) stars[lvl] = v;
      }
    }
    return { unlocked, stars };
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // 存储不可用（隐私模式/配额）时静默失败，不阻塞游戏
  }
}

/** 通关后更新进度，返回新的 Progress */
export function recordWin(prev: Progress, levelId: number, stars: 1 | 2 | 3): Progress {
  const next: Progress = {
    unlocked: Math.max(prev.unlocked, Math.min(levelId + 1, TOTAL_LEVELS)),
    stars: { ...prev.stars },
  };
  const old = next.stars[levelId];
  if (old === undefined || stars > old) next.stars[levelId] = stars;
  return next;
}
