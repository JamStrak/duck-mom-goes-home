// 核心类型定义 —— 与开发案《7.1 关卡配置格式》保持一致

/** 坐标 [列, 行] */
export type Vec2 = [number, number];

export type Orientation = "portrait" | "landscape";

/** 竖屏基准关卡配置（每关只存一份，横屏由旋转生成） */
export interface LevelConfig {
  schemaVersion: 2;
  baseOrientation: "portrait";
  levelId: number;
  /** [列数, 行数] */
  gridSize: Vec2;
  start: Vec2;
  end: Vec2;
  ducks: Vec2[];
  obstacles: Vec2[];
  /** 参考解路径（也是提示系统的参考源），从 start 到 end 的完整一步路径 */
  solution: Vec2[];
}

/** 某一关的实际运行配置（可能已按屏幕方向旋转） */
export interface RuntimeLevel {
  /** 旋转后的 [列数, 行数] */
  cols: number;
  rows: number;
  start: Vec2;
  end: Vec2;
  ducks: Vec2[];
  obstacles: Vec2[];
  /** 参考解路径（当前方向坐标） */
  solution: Vec2[];
}

export interface LevelSpec {
  cols: number;
  rows: number;
  ducks: number;
  obstacles: number;
}

export interface ChapterInfo {
  id: number;
  name: string;
  range: [number, number];
}

/** 进度存储结构 */
export interface Progress {
  unlocked: number;
  stars: Record<number, 1 | 2 | 3>;
}

export const CELL_BIT_GRASS = 0;
export const CELL_BIT_OBSTACLE = 1;
export const CELL_BIT_DUCK = 2;
export const CELL_BIT_START = 3;
export const CELL_BIT_END = 4;
