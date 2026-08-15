// BFS/DFS 求解器：验证可解性 + 为提示系统提供“下一步”。
//
// 游戏的核心约束是“路径连续、不可重复”，因此这里不能用简单的位置+小鸭掩码 BFS
// （那会允许“走进死胡同又折返”的假解）。本实现用带回溯的深度优先搜索，
// 显式维护“已占用的格子集合”，保证找到的必然是合法的简单路径。
//
// 状态规模：最大 7×10=70 格，小鸭 ≤5 只，且关卡本身被设计为有解，
// 配合“优先朝最近小鸭走”的启发式排序，实际搜索非常快。

import type { Vec2 } from "./types";

export interface SolveInput {
  cols: number;
  rows: number;
  start: Vec2;
  end: Vec2;
  /** 剩余待收集的小鸭 */
  ducks: Vec2[];
  /** 被禁止进入的格子（障碍 + 已铺路径等），以索引表示 */
  blocked: ReadonlySet<number>;
  /** 搜索节点预算，超出则判定为“未找到”（避免病态输入卡死） */
  budget?: number;
}

export interface SolveResult {
  /** 从 start 到 end 的完整路径（含首尾），未找到时为 null */
  path: Vec2[] | null;
  /** 是否因超出预算而中止 */
  exhausted: boolean;
}

function inBounds(c: number, r: number, cols: number, rows: number): boolean {
  return c >= 0 && r >= 0 && c < cols && r < rows;
}

const DIRS: Vec2[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** 从 (start) 出发，经过所有 ducks，最终到达 end 的简单路径 */
export function solvePath(input: SolveInput): SolveResult {
  const { cols, rows, start, end, ducks, blocked } = input;
  const budget = input.budget ?? 400_000;

  const idx = (c: number, r: number) => r * cols + c;
  const startIdx = idx(start[0], start[1]);
  const endIdx = idx(end[0], end[1]);
  const total = cols * rows;

  // 小鸭 -> 位掩码
  const duckBit = new Map<number, number>();
  let fullMask = 0;
  for (let i = 0; i < ducks.length; i++) {
    const d = ducks[i] as Vec2;
    const di = idx(d[0], d[1]);
    duckBit.set(di, 1 << i);
    fullMask |= 1 << i;
  }

  // 预计算“到最近未收集小鸭”的距离表，用于启发式排序（只算一次，取最近小鸭）
  // 简化：直接对每个候选邻居实时算曼哈顿距离即可（规模小）。
  const visited = new Uint8Array(total);
  const pathCells: number[] = [];
  let nodes = 0;
  let exhausted = false;

  // 端点 / 起点合法性
  if (blocked.has(startIdx)) return { path: null, exhausted: false };
  if (blocked.has(endIdx)) return { path: null, exhausted: false };

  const isDuckCell = (i: number) => duckBit.has(i);

  function manhattanToNearestDuck(i: number, mask: number): number {
    const c = i % cols;
    const r = (i - c) / cols;
    let best = Infinity;
    for (let k = 0; k < ducks.length; k++) {
      if (mask & (1 << k)) continue;
      const d = ducks[k] as Vec2;
      const dist = Math.abs(d[0] - c) + Math.abs(d[1] - r);
      if (dist < best) best = dist;
    }
    return best;
  }

  function manhattanToEnd(i: number): number {
    const c = i % cols;
    const r = (i - c) / cols;
    return Math.abs(end[0] - c) + Math.abs(end[1] - r);
  }

  function orderNeighbors(i: number, mask: number): number[] {
    const c = i % cols;
    const r = (i - c) / cols;
    const out: { i: number; score: number }[] = [];
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!inBounds(nc, nr, cols, rows)) continue;
      const ni = nr * cols + nc;
      if (visited[ni] || blocked.has(ni)) continue;
      // 若已收齐小鸭，终点就是唯一目标
      let score: number;
      if (mask === fullMask) {
        score = ni === endIdx ? 1e9 : -manhattanToEnd(ni);
      } else {
        if (ni === endIdx) {
          // 未收齐时终点不可进入
          continue;
        }
        score = (isDuckCell(ni) ? 1e6 : 0) - manhattanToNearestDuck(ni, mask);
      }
      out.push({ i: ni, score });
    }
    out.sort((a, b) => b.score - a.score);
    return out.map((o) => o.i);
  }

  function dfs(i: number, mask: number): boolean {
    nodes++;
    if (nodes > budget) {
      exhausted = true;
      return false;
    }
    // 到达终点且收齐全部小鸭
    if (i === endIdx && mask === fullMask) {
      return true;
    }

    for (const ni of orderNeighbors(i, mask)) {
      let nmask = mask;
      const bit = duckBit.get(ni);
      if (bit !== undefined) nmask |= bit;

      visited[ni] = 1;
      pathCells.push(ni);
      if (dfs(ni, nmask)) return true;
      pathCells.pop();
      visited[ni] = 0;
    }
    return false;
  }

  visited[startIdx] = 1;
  pathCells.push(startIdx);

  const found = dfs(startIdx, 0);

  if (!found) {
    return { path: null, exhausted };
  }

  const path: Vec2[] = pathCells.map((i) => {
    const c = i % cols;
    const r = (i - c) / cols;
    return [c, r] as Vec2;
  });

  return { path, exhausted: false };
}

/** 便捷封装：验证一个完整关卡是否可解 */
export function isSolvable(input: SolveInput): boolean {
  const res = solvePath(input);
  return res.path !== null;
}
