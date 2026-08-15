// 规则引擎：维护当前路径、收集状态、终点锁定、撤销/重置、提示与星级。
// 无失败态；所有校验都只做“软拒绝”。

import type { RuntimeLevel, Vec2 } from "./types";
import { solvePath } from "./solver";

export type RejectReason =
  | "not-adjacent"
  | "obstacle"
  | "revisit"
  | "duck-missing"
  | "out-of-bounds";

export type ExtendResult =
  | { type: "extended"; cell: Vec2 }
  | { type: "won" }
  | { type: "rejected"; reason: RejectReason };

export class Game {
  readonly level: RuntimeLevel;
  readonly cols: number;
  readonly rows: number;

  /** 已铺路径，path[0] 恒为起点 */
  private _path: Vec2[] = [];
  private _pathSet = new Set<number>();

  /** 提示使用次数（只影响星级） */
  hintUsed = 0;

  /** 当前高亮提示格（下一格），无则为 null */
  hintCell: Vec2 | null = null;

  constructor(level: RuntimeLevel) {
    this.level = level;
    this.cols = level.cols;
    this.rows = level.rows;
    this.reset();
  }

  idxOf(c: number, r: number): number {
    return r * this.cols + c;
  }

  get path(): readonly Vec2[] {
    return this._path;
  }

  get pathLength(): number {
    return this._path.length;
  }

  get currentEnd(): Vec2 {
    return this._path[this._path.length - 1] as Vec2;
  }

  isObstacle(c: number, r: number): boolean {
    return this.level.obstacles.some((o) => o[0] === c && o[1] === r);
  }

  isDuck(c: number, r: number): boolean {
    return this.level.ducks.some((d) => d[0] === c && d[1] === r);
  }

  isPathCell(c: number, r: number): boolean {
    return this._pathSet.has(this.idxOf(c, r));
  }

  pathIndexOf(c: number, r: number): number {
    return this._path.findIndex((p) => p[0] === c && p[1] === r);
  }

  /** 已收集小鸭（按入队顺序，即它们在路径上的先后） */
  collectedDucks(): Vec2[] {
    const order: Vec2[] = [];
    for (const cell of this._path) {
      if (this.isDuck(cell[0], cell[1])) order.push(cell);
    }
    return order;
  }

  remainingDucks(): Vec2[] {
    return this.level.ducks.filter((d) => !this.isPathCell(d[0], d[1]));
  }

  allDucksCollected(): boolean {
    return this.remainingDucks().length === 0;
  }

  isEnd(c: number, r: number): boolean {
    return this.level.end[0] === c && this.level.end[1] === r;
  }

  isWon(): boolean {
    const end = this.currentEnd;
    return this.isEnd(end[0], end[1]) && this.allDucksCollected();
  }

  /** 某格是否可以成为当前末端的下一格 */
  canExtend(c: number, r: number): boolean {
    if (this.isWon()) return false;
    const [ec, er] = this.currentEnd;
    const dist = Math.abs(c - ec) + Math.abs(r - er);
    if (dist !== 1) return false;
    if (this._pathSet.has(this.idxOf(c, r))) return false;
    if (this.isObstacle(c, r)) return false;
    if (this.isEnd(c, r) && !this.allDucksCollected()) return false;
    return true;
  }

  /** 尝试延伸一格 */
  extendTo(cell: Vec2): ExtendResult {
    const [c, r] = cell;
    if (this.isWon()) return { type: "rejected", reason: "revisit" };

    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) {
      return { type: "rejected", reason: "out-of-bounds" };
    }
    if (this.isObstacle(c, r)) {
      return { type: "rejected", reason: "obstacle" };
    }
    const [ec, er] = this.currentEnd;
    if (Math.abs(c - ec) + Math.abs(r - er) !== 1) {
      return { type: "rejected", reason: "not-adjacent" };
    }
    if (this._pathSet.has(this.idxOf(c, r))) {
      return { type: "rejected", reason: "revisit" };
    }
    if (this.isEnd(c, r) && !this.allDucksCollected()) {
      return { type: "rejected", reason: "duck-missing" };
    }

    this._path.push([c, r] as Vec2);
    this._pathSet.add(this.idxOf(c, r));
    this.hintCell = null;

    if (this.isEnd(c, r) && this.allDucksCollected()) {
      return { type: "won" };
    }
    return { type: "extended", cell: [c, r] as Vec2 };
  }

  /** 点按已铺格：从该格截断（点击起点=整体重置） */
  truncateAt(cell: Vec2): boolean {
    const i = this.pathIndexOf(cell[0], cell[1]);
    if (i < 0) return false;
    this.truncateToIndex(i);
    return true;
  }

  truncateToIndex(i: number): void {
    if (i < 0 || i >= this._path.length - 1) return;
    const removed = this._path.splice(i + 1);
    for (const cell of removed) {
      this._pathSet.delete(this.idxOf(cell[0], cell[1]));
    }
    this.hintCell = null;
  }

  /** 整体重置：清空路径、恢复全部小鸭、终点回锁定 */
  reset(): void {
    this._path = [this.level.start.slice() as Vec2];
    this._pathSet = new Set([this.idxOf(this.level.start[0], this.level.start[1])]);
    this.hintCell = null;
  }

  /** 星级：只与提示次数相关（0 次=3星，1 次=2星，≥2 次=1星） */
  starCount(): 1 | 2 | 3 {
    if (this.hintUsed <= 0) return 3;
    if (this.hintUsed === 1) return 2;
    return 1;
  }

  /**
   * 提示：返回当前末端应走的下一格。
   * 优先在参考 solution 中找；玩家偏离参考路径时退回求解器实时计算完成路径。
   * 不修改当前路径，只返回引导格。
   */
  computeHint(): Vec2 | null {
    const [ec, er] = this.currentEnd;

    // 1) 若当前末端恰在参考解上，直接取下一格（与开发案一致）
    const sol = this.level.solution;
    const si = sol.findIndex((p) => p[0] === ec && p[1] === er);
    if (si >= 0 && si < sol.length - 1) {
      const next = sol[si + 1] as Vec2;
      if (this.canExtend(next[0], next[1])) return next;
    }

    // 2) 退回求解器：从当前状态找一条完成路径
    const remaining = this.remainingDucks();
    const blocked = new Set<number>();
    for (const o of this.level.obstacles) blocked.add(this.idxOf(o[0], o[1]));
    for (const p of this._path) blocked.add(this.idxOf(p[0], p[1]));

    const res = solvePath({
      cols: this.cols,
      rows: this.rows,
      start: [ec, er],
      end: this.level.end,
      ducks: remaining,
      blocked,
    });
    if (res.path && res.path.length >= 2) {
      return res.path[1] as Vec2;
    }
    return null;
  }

  /** 请求提示：成功则记录次数并返回引导格 */
  requestHint(): Vec2 | null {
    const next = this.computeHint();
    if (next) {
      this.hintUsed += 1;
      this.hintCell = next;
    }
    return next;
  }
}
