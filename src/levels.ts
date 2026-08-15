// 关卡配置：章节定义 + 60 关确定性程序化生成。
//
// 每关只存“竖屏基准配置”，横屏配置由 rotator.rotateConfig() 在运行时生成。
// 生成流程保证：起点→终点存在一条经过全部小鸭的简单路径（作为 solution 与可解性见证），
// 障碍只放在参考路径之外的格子，因此竖屏与横屏两个方向都必然可解。

import type { LevelConfig, LevelSpec, Vec2, ChapterInfo } from "./types";
import { mulberry32, randInt, shuffle, pick, type RNG } from "./rng";
import { rotateConfig, portraitRuntime } from "./rotator";

export const TOTAL_LEVELS = 60;

export const CHAPTERS: ChapterInfo[] = [
  { id: 1, name: "启蒙", range: [1, 5] },
  { id: 2, name: "收编", range: [6, 10] },
  { id: 3, name: "绕行", range: [11, 20] },
  { id: 4, name: "多鸭", range: [21, 30] },
  { id: 5, name: "长路", range: [31, 40] },
  { id: 6, name: "规划", range: [41, 50] },
  { id: 7, name: "综合", range: [51, 60] },
];

export function chapterOf(levelId: number): ChapterInfo {
  for (const c of CHAPTERS) {
    if (levelId >= c.range[0] && levelId <= c.range[1]) return c;
  }
  return CHAPTERS[CHAPTERS.length - 1] as ChapterInfo;
}

/** 线性插值（i 从 0 到 n-1） */
function ramp(a: number, b: number, i: number, n: number): number {
  if (n <= 1) return a;
  return Math.round(a + ((b - a) * i) / (n - 1));
}

/** 每关的网格 / 小鸭 / 障碍规模，严格对齐开发案 6.2、6.3 */
export function specForLevel(levelId: number): LevelSpec {
  if (levelId === 1) return { cols: 4, rows: 5, ducks: 0, obstacles: 0 };
  if (levelId === 2) return { cols: 4, rows: 5, ducks: 0, obstacles: 0 };
  if (levelId === 3) return { cols: 4, rows: 5, ducks: 0, obstacles: 1 };
  if (levelId === 4) return { cols: 5, rows: 5, ducks: 1, obstacles: 0 };
  if (levelId === 5) return { cols: 5, rows: 6, ducks: 1, obstacles: 1 };
  if (levelId >= 6 && levelId <= 10) {
    const i = levelId - 6;
    return { cols: 5, rows: 6, ducks: 1, obstacles: ramp(1, 2, i, 5) };
  }
  if (levelId >= 11 && levelId <= 20) {
    const i = levelId - 11;
    return { cols: 5, rows: 7, ducks: ramp(1, 2, i, 10), obstacles: ramp(2, 4, i, 10) };
  }
  if (levelId >= 21 && levelId <= 30) {
    const i = levelId - 21;
    return { cols: 6, rows: 7, ducks: ramp(2, 3, i, 10), obstacles: ramp(3, 6, i, 10) };
  }
  if (levelId >= 31 && levelId <= 40) {
    const i = levelId - 31;
    return { cols: 6, rows: 8, ducks: ramp(3, 4, i, 10), obstacles: ramp(5, 8, i, 10) };
  }
  if (levelId >= 41 && levelId <= 50) {
    const i = levelId - 41;
    return { cols: 6, rows: 9, ducks: ramp(4, 5, i, 10), obstacles: ramp(7, 10, i, 10) };
  }
  // 51-60 综合
  const i = levelId - 51;
  return { cols: 7, rows: 10, ducks: 5, obstacles: ramp(10, 12, i, 10) };
}

const DIRS: Vec2[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function inBounds(c: number, r: number, cols: number, rows: number): boolean {
  return c >= 0 && r >= 0 && c < cols && r < rows;
}

function idx(c: number, r: number, cols: number): number {
  return r * cols + c;
}

function cellOf(i: number, cols: number): Vec2 {
  const c = i % cols;
  const r = (i - c) / cols;
  return [c, r];
}

function manhattan(a: Vec2, b: Vec2): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

/** 随机生成一条从 start 到 end 的简单路径。
 *  自避行走：长度未达 minLen 前随机绕行（不进终点），达标后贪心走向终点。
 *  单次尝试 O(格数) 有界；遇到死胡同直接重试，保证整体快速且可控长度。 */
function randomSimplePath(
  cols: number,
  rows: number,
  start: Vec2,
  end: Vec2,
  rng: RNG,
  minLen: number,
): number[] {
  const total = cols * rows;
  const startIdx = idx(start[0], start[1], cols);
  const endIdx = idx(end[0], end[1], cols);

  for (let attempt = 0; attempt < 400; attempt++) {
    const visited = new Uint8Array(total);
    const path: number[] = [startIdx];
    visited[startIdx] = 1;
    let cur = startIdx;

    for (let step = 0; step < total * 3 && cur !== endIdx; step++) {
      const c = cur % cols;
      const r = (cur - c) / cols;
      const cands: number[] = [];
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!inBounds(nc, nr, cols, rows)) continue;
        const ni = idx(nc, nr, cols);
        if (visited[ni]) continue;
        cands.push(ni);
      }

      const canFinish = path.length >= minLen;
      const movable = canFinish ? cands : cands.filter((ni) => ni !== endIdx);
      if (movable.length === 0) break; // 死胡同，重试

      let next: number;
      if (!canFinish) {
        next = pick(rng, movable);
      } else if (rng() < 0.8) {
        // 贪心走向终点（开放网格上曼哈顿下降必然能到）
        const endC = endIdx % cols;
        const endR = (endIdx - endC) / cols;
        let best = movable[0] as number;
        let bestD = Infinity;
        for (const n of movable) {
          const nc = n % cols;
          const nr = (n - nc) / cols;
          const d = Math.abs(nc - endC) + Math.abs(nr - endR);
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
        next = best;
      } else {
        next = pick(rng, movable);
      }

      visited[next] = 1;
      path.push(next);
      cur = next;
    }

    if (cur === endIdx && path.length >= minLen) return path;
  }

  // 理论上不可达（开放网格必然连通）
  throw new Error(`randomSimplePath 未能在 ${cols}x${rows} 上找到路径`);
}

function placeDucks(path: number[], cols: number, duckCount: number, rng: RNG): Vec2[] {
  if (duckCount === 0) return [];
  // 候选：路径内部（去掉起点与终点）
  const interior = path.slice(1, -1);
  if (interior.length < duckCount) {
    // 理论上不会发生（生成时已保证足够长），兜底返回前几个
    return interior.slice(0, duckCount).map((i) => cellOf(i, cols));
  }
  const shuffled = shuffle(rng, interior.map((_, i) => i));
  // 尽量让小鸭在路径上分散开（至少间隔 1 个路径格），放不下则放宽
  for (let gap = 2; gap >= 1; gap--) {
    const chosen: number[] = [];
    for (const pi of shuffled) {
      if (chosen.length >= duckCount) break;
      const cellIdx = interior[pi] as number;
      if (chosen.every((c) => Math.abs(c - cellIdx) >= gap)) chosen.push(cellIdx);
    }
    if (chosen.length >= duckCount) {
      return chosen.slice(0, duckCount).map((i) => cellOf(i, cols));
    }
  }
  return interior.slice(0, duckCount).map((i) => cellOf(i, cols));
}

function placeObstacles(
  cols: number,
  rows: number,
  used: ReadonlySet<number>,
  count: number,
  rng: RNG,
): Vec2[] {
  const total = cols * rows;
  const free: number[] = [];
  for (let i = 0; i < total; i++) {
    if (!used.has(i)) free.push(i);
  }
  shuffle(rng, free);
  return free.slice(0, Math.min(count, free.length)).map((i) => cellOf(i, cols));
}

/** 生成单关（含可解性验证） */
export function generateLevel(levelId: number): LevelConfig {
  const spec = specForLevel(levelId);
  const { cols, rows } = spec;
  const cells = cols * rows;

  // 障碍上限：不得超过可通行格数的 35%（开发案 6.2）
  const maxObstacles = Math.min(12, Math.floor(cells * 0.35));
  const obstacleCount = Math.min(spec.obstacles, maxObstacles);

  const seed = 0x5eed0000 ^ (levelId * 2654435761);
  const rng = mulberry32(seed);

  const minDist = Math.max(4, Math.round((cols + rows) * 0.55));
  const minLen = spec.ducks * 2 + 3;

  for (let attempt = 0; attempt < 800; attempt++) {
    // 1) 选择相距足够远的起点与终点
    let start: Vec2 = [randInt(rng, cols), randInt(rng, rows)];
    let end: Vec2 = [randInt(rng, cols), randInt(rng, rows)];
    for (let t = 0; t < 40; t++) {
      if (start[0] !== end[0] || start[1] !== end[1]) {
        if (manhattan(start, end) >= minDist) break;
      }
      start = [randInt(rng, cols), randInt(rng, rows)];
      end = [randInt(rng, cols), randInt(rng, rows)];
    }
    if (manhattan(start, end) < minDist) continue;

    // 2) 生成参考路径（简单路径，保证可解）
    const pathIdx = randomSimplePath(cols, rows, start, end, rng, minLen);
    if (pathIdx.length < minLen) continue;

    // 3) 放置小鸭（路径内部、分散）
    const duckCells = placeDucks(pathIdx, cols, spec.ducks, rng);

    // 4) 放置障碍（只在路径之外）
    const used = new Set<number>(pathIdx);
    const obstacles = placeObstacles(cols, rows, used, obstacleCount, rng);

    // 5) 组装配置。参考路径自身即为可解性见证（障碍都在路径之外、小鸭都在路径上），
    //    因此无需在此再跑求解器；独立的双向求解验证由 verifyAllLevels 完成。
    const solution: Vec2[] = pathIdx.map((i) => cellOf(i, cols));
    return {
      schemaVersion: 2,
      baseOrientation: "portrait",
      levelId,
      gridSize: [cols, rows],
      start,
      end,
      ducks: duckCells,
      obstacles,
      solution,
    };
  }

  // 理论上不可达；抛出以便尽早暴露问题
  throw new Error(`无法生成第 ${levelId} 关（800 次尝试内未产出可解关卡）`);
}

let cache: LevelConfig[] | null = null;

/** 生成全部 60 关（首次调用后缓存） */
export function buildAllLevels(): LevelConfig[] {
  if (cache) return cache;
  const levels: LevelConfig[] = [];
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    levels.push(generateLevel(id));
  }
  cache = levels;
  return levels;
}

export function getLevel(levelId: number): LevelConfig {
  const levels = buildAllLevels();
  const cfg = levels[levelId - 1];
  if (!cfg) throw new Error(`关卡不存在：${levelId}`);
  return cfg;
}

/** 校验一条参考解是否为“合法简单路径且覆盖全部小鸭”（可解性的确定性见证）。 */
export function verifySolution(rl: {
  cols: number;
  rows: number;
  start: Vec2;
  end: Vec2;
  ducks: Vec2[];
  obstacles: Vec2[];
  solution: Vec2[];
}): boolean {
  const key = (v: Vec2) => v[0] + "," + v[1];
  if (rl.solution.length < 2) return false;
  const s0 = rl.solution[0] as Vec2;
  const s1 = rl.solution[rl.solution.length - 1] as Vec2;
  if (s0[0] !== rl.start[0] || s0[1] !== rl.start[1]) return false;
  if (s1[0] !== rl.end[0] || s1[1] !== rl.end[1]) return false;

  const seen = new Set<string>();
  const obs = new Set<string>(rl.obstacles.map(key));
  for (let i = 0; i < rl.solution.length; i++) {
    const v = rl.solution[i] as Vec2;
    if (v[0] < 0 || v[1] < 0 || v[0] >= rl.cols || v[1] >= rl.rows) return false;
    const k = key(v);
    if (seen.has(k)) return false;
    seen.add(k);
    if (obs.has(k)) return false;
    if (i > 0) {
      const p = rl.solution[i - 1] as Vec2;
      if (Math.abs(v[0] - p[0]) + Math.abs(v[1] - p[1]) !== 1) return false;
    }
  }
  for (const d of rl.ducks) {
    if (!seen.has(key(d))) return false;
  }
  return true;
}

/** 开发期自检：验证全部 60 关在两种方向下参考解均合法（即关卡可解）。 */
export function verifyAllLevels(): { total: number; ok: number; failed: number[] } {
  const levels = buildAllLevels();
  let ok = 0;
  const failed: number[] = [];
  for (const cfg of levels) {
    const p = verifySolution(portraitRuntime(cfg));
    const r = verifySolution(rotateConfig(cfg));
    if (p && r) ok++;
    else failed.push(cfg.levelId);
  }
  return { total: levels.length, ok, failed };
}
