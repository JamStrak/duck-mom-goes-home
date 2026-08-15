// 旋转映射：把竖屏基准配置旋转成横屏配置。
//
// 公式（开发案 7.3）：竖屏 C 列 R 行 → 横屏 R 列 C 行；
// 原坐标 (c, r) → new_c = R - 1 - r, new_r = c。

import type { LevelConfig, RuntimeLevel, Vec2 } from "./types";

export function rotateVec(c: number, r: number, portraitRows: number): Vec2 {
  return [portraitRows - 1 - r, c];
}

export function rotateConfig(config: LevelConfig): RuntimeLevel {
  const [cols, rows] = config.gridSize;
  // 横屏：行数变列数
  const landscapeCols = rows;
  const landscapeRows = cols;

  const map = (v: Vec2): Vec2 => rotateVec(v[0], v[1], rows);

  return {
    cols: landscapeCols,
    rows: landscapeRows,
    start: map(config.start),
    end: map(config.end),
    ducks: config.ducks.map(map),
    obstacles: config.obstacles.map(map),
    solution: config.solution.map(map),
  };
}

export function portraitRuntime(config: LevelConfig): RuntimeLevel {
  const [cols, rows] = config.gridSize;
  return {
    cols,
    rows,
    start: config.start,
    end: config.end,
    ducks: config.ducks.map((d) => d.slice() as Vec2),
    obstacles: config.obstacles.map((o) => o.slice() as Vec2),
    solution: config.solution.map((s) => s.slice() as Vec2),
  };
}
