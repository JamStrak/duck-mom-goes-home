// 输入控制器：点选 / 拖拽 / 撤销命中检测，统一处理鼠标与触摸（Pointer Events）。
// 拖拽经过中间格时线性插值，避免快速滑动跳过格子。

import type { Vec2 } from "./types";
import type { ViewLayout } from "./layout";

interface InputOptions {
  layout: () => ViewLayout | null;
  onCell: (cell: Vec2) => void;
}

function lineCells(a: Vec2, b: Vec2): Vec2[] {
  const out: Vec2[] = [];
  const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  if (steps === 0) return [b.slice() as Vec2];
  for (let k = 1; k <= steps; k++) {
    const c = Math.round(a[0] + ((b[0] - a[0]) * k) / steps);
    const r = Math.round(a[1] + ((b[1] - a[1]) * k) / steps);
    const last = out[out.length - 1];
    if (!last || last[0] !== c || last[1] !== r) out.push([c, r] as Vec2);
  }
  return out;
}

export class InputController {
  private canvas: HTMLCanvasElement;
  private opts: InputOptions;
  private pointerId: number | null = null;
  private lastCell: Vec2 | null = null;

  constructor(canvas: HTMLCanvasElement, opts: InputOptions) {
    this.canvas = canvas;
    this.opts = opts;
  }

  private pos(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private cellAt(x: number, y: number): Vec2 | null {
    const l = this.opts.layout();
    if (!l) return null;
    const c = Math.floor((x - l.originX) / l.cell);
    const r = Math.floor((y - l.originY) / l.cell);
    if (c < 0 || r < 0 || c >= l.cols || r >= l.rows) return null;
    return [c, r];
  }

  private onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // 忽略捕获失败
    }
    const { x, y } = this.pos(e);
    const cell = this.cellAt(x, y);
    if (cell) {
      this.lastCell = cell;
      this.opts.onCell(cell);
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    e.preventDefault();
    const { x, y } = this.pos(e);
    const cell = this.cellAt(x, y);
    if (!cell || !this.lastCell) return;
    const cells = lineCells(this.lastCell, cell);
    for (const cc of cells) {
      if (this.lastCell && cc[0] === this.lastCell[0] && cc[1] === this.lastCell[1]) continue;
      this.lastCell = cc;
      this.opts.onCell(cc);
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (this.pointerId !== e.pointerId) return;
    this.pointerId = null;
    this.lastCell = null;
  };

  attach(): void {
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
  }

  detach(): void {
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
  }
}
