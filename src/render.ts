// Canvas 渲染器：纯矢量绘制（无图片资源，包体小、跨平台一致）。
// 逐格绘制草地、障碍、路径、鸭妈妈、小鸭、鸭屋、提示高亮与软拒绝反馈。

import type { Vec2 } from "./types";
import type { ViewLayout } from "./layout";

export interface RenderState {
  cols: number;
  rows: number;
  start: Vec2;
  end: Vec2;
  /** 当前已铺路径（含起点） */
  path: Vec2[];
  /** 尚未收集的小鸭 */
  uncollectedDucks: Vec2[];
  /** 已收集小鸭（按入队顺序） */
  collectedDucks: Vec2[];
  obstacles: Vec2[];
  endUnlocked: boolean;
  hintCell: Vec2 | null;
  /** 软拒绝闪烁：格 + 到期时间戳(ms) */
  rejectCell: Vec2 | null;
  rejectUntil: number;
  won: boolean;
}

const C = {
  sky: "#cdeffd",
  grassA: "#a9dc83",
  grassB: "#9ad274",
  grassLine: "#8ec768",
  stone: "#ead3a6",
  stoneEdge: "#d3b17c",
  stoneDark: "#cdab74",
  water: "#7cc4ee",
  waterDeep: "#59a9de",
  rock: "#b8bfc8",
  rockEdge: "#949da8",
  stump: "#b58252",
  stumpEdge: "#8f6038",
  stumpRing: "#d8ab76",
  houseRoof: "#e86f45",
  houseBody: "#ffe2a3",
  houseDoor: "#8a5a3b",
  lock: "#8d939c",
  lockHi: "#cfd5dc",
  yellow: "#ffd23f",
  yellowDark: "#f2b905",
  beak: "#ff9f1c",
  beakDark: "#ef8f0e",
  white: "#ffffff",
  ink: "#3a2e22",
  hint: "#ff7a3c",
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** 绘制一只朝右的鸭子（mom 为鸭妈妈，否则为小鸭） */
function drawDuck(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  opts: { mom?: boolean; breath?: number; facing?: "left" | "right" } = {},
): void {
  const mom = opts.mom ?? false;
  const breath = opts.breath ?? 0; // -1..1 呼吸相位
  const s = size * 0.92;

  const bodyFill = mom ? C.yellow : "#ffdf7a";
  const bodyShade = mom ? C.yellowDark : "#f2c94c";
  const outline = "#e0a11f";
  const outlineDark = "#cf8f14";

  ctx.save();
  ctx.translate(cx, cy);

  // 左右镜像（始终保持"站在地面"，不旋转）
  if (opts.facing === "left") ctx.scale(-1, 1);

  // 呼吸感：围绕脚部做缩放挤压（不做上下漂浮）
  const feetY = s * 0.28;
  const sx = 1 + breath * 0.03;
  const sy = 1 - breath * 0.03;
  ctx.translate(0, feetY);
  ctx.scale(sx, sy);
  ctx.translate(0, -feetY);

  const headR = mom ? s * 0.2 : s * 0.235;
  const headX = s * 0.24;
  const headY = -s * 0.24;

  // 脚
  ctx.fillStyle = C.beakDark;
  ctx.beginPath();
  ctx.ellipse(-s * 0.02, s * 0.28, s * 0.075, s * 0.05, 0, 0, Math.PI * 2);
  ctx.ellipse(s * 0.16, s * 0.28, s * 0.075, s * 0.05, 0, 0, Math.PI * 2);
  ctx.fill();

  // 尾巴（卷曲）
  ctx.fillStyle = bodyShade;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(-s * 0.34, -s * 0.06);
  ctx.quadraticCurveTo(-s * 0.56, -s * 0.16, -s * 0.46, -s * 0.02);
  ctx.quadraticCurveTo(-s * 0.52, s * 0.04, -s * 0.36, s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 身体（描边）
  ctx.fillStyle = bodyFill;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.4, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 翅膀（描边）
  ctx.fillStyle = bodyShade;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.beginPath();
  ctx.ellipse(-s * 0.07, s * 0.06, s * 0.16, s * 0.115, -0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 头（描边）
  ctx.fillStyle = bodyFill;
  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 小鸭呆毛
  if (!mom) {
    ctx.strokeStyle = outlineDark;
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(headX - headR * 0.15, headY - headR * 0.92);
    ctx.quadraticCurveTo(headX - headR * 0.4, headY - headR * 1.5, headX - headR * 0.05, headY - headR * 1.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(headX + headR * 0.3, headY - headR * 0.95);
    ctx.quadraticCurveTo(headX + headR * 0.1, headY - headR * 1.5, headX + headR * 0.5, headY - headR * 1.25);
    ctx.stroke();
    ctx.lineCap = "butt";
  }

  // 鸭嘴（扁平宽喙，非尖嘴）
  const billCx = headX + headR * 0.7;
  const billCy = headY + headR * 0.12;
  const billRx = headR * 0.8;
  const billRy = headR * 0.4;
  ctx.fillStyle = C.beak;
  ctx.strokeStyle = C.beakDark;
  ctx.lineWidth = Math.max(1, s * 0.03);
  ctx.beginPath();
  ctx.ellipse(billCx, billCy, billRx, billRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // 微笑线
  ctx.strokeStyle = C.beakDark;
  ctx.lineWidth = Math.max(1, s * 0.022);
  ctx.beginPath();
  ctx.moveTo(billCx - billRx * 0.2, billCy + billRy * 0.15);
  ctx.quadraticCurveTo(billCx + billRx * 0.25, billCy + billRy * 0.6, billCx + billRx * 0.6, billCy + billRy * 0.1);
  ctx.stroke();

  // 眼睛（大眼白 + 瞳孔 + 高光）
  const eyeX = headX + headR * 0.42;
  const eyeY = headY - headR * 0.22;
  const eyeR = mom ? headR * 0.36 : headR * 0.4;
  ctx.fillStyle = C.white;
  ctx.beginPath();
  ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.beginPath();
  ctx.arc(eyeX + eyeR * 0.18, eyeY + eyeR * 0.04, eyeR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.white;
  ctx.beginPath();
  ctx.arc(eyeX + eyeR * 0.32, eyeY - eyeR * 0.32, eyeR * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // 腮红（缩小，贴在脸颊内）
  ctx.fillStyle = "rgba(255, 138, 154, 0.5)";
  ctx.beginPath();
  ctx.ellipse(headX + headR * 0.3, headY + headR * 0.42, headR * 0.18, headR * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  // 鸭妈妈红围巾（细带贴合脖颈，无飘带）
  if (mom) {
    ctx.fillStyle = "#f0506e";
    ctx.strokeStyle = "#d13a58";
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.ellipse(headX - headR * 0.05, headY + headR * 1.0, headR * 0.6, headR * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/** 绘制鸭屋 */
function drawHouse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  unlocked: boolean,
  t: number,
): void {
  const s = size * 0.84;
  const x = cx - s / 2;
  const y = cy - s / 2;

  ctx.save();

  if (unlocked) {
    // 解锁：轻微呼吸光晕
    const glow = 0.18 + 0.1 * Math.sin(t / 260);
    ctx.fillStyle = `rgba(255, 214, 90, ${glow.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.72, 0, Math.PI * 2);
    ctx.fill();
  }

  // 墙体
  ctx.fillStyle = unlocked ? C.houseBody : "#e7dfd0";
  roundRect(ctx, x, y + s * 0.28, s, s * 0.6, s * 0.08);
  ctx.fill();
  ctx.strokeStyle = unlocked ? "#d9a552" : "#c8c2b4";
  ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.stroke();

  // 屋顶
  ctx.fillStyle = unlocked ? C.houseRoof : "#b9b4a8";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.1, y + s * 0.3);
  ctx.lineTo(cx, y - s * 0.12);
  ctx.lineTo(x + s * 1.1, y + s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = unlocked ? "#c4562f" : "#a49f94";
  ctx.stroke();

  // 门
  ctx.fillStyle = unlocked ? C.houseDoor : "#a29b8c";
  roundRect(ctx, cx - s * 0.13, y + s * 0.55, s * 0.26, s * 0.33, s * 0.05);
  ctx.fill();

  if (!unlocked) {
    // 锁
    ctx.fillStyle = C.lock;
    const lx = cx;
    const ly = y + s * 0.34;
    roundRect(ctx, lx - s * 0.13, ly, s * 0.26, s * 0.2, s * 0.05);
    ctx.fill();
    ctx.strokeStyle = C.lockHi;
    ctx.lineWidth = Math.max(1, s * 0.045);
    ctx.beginPath();
    ctx.arc(lx, ly, s * 0.11, Math.PI, 0);
    ctx.stroke();
  }

  ctx.restore();
}

/** 绘制障碍（按格子索引确定性选型） */
function drawObstacle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  kind: number,
  t: number,
): void {
  const s = size * 0.8;
  ctx.save();
  ctx.translate(cx, cy);

  if (kind === 0) {
    // 石头
    ctx.fillStyle = C.rock;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, s * 0.1);
    ctx.lineTo(-s * 0.3, -s * 0.3);
    ctx.lineTo(s * 0.1, -s * 0.42);
    ctx.lineTo(s * 0.42, -s * 0.1);
    ctx.lineTo(s * 0.3, s * 0.32);
    ctx.lineTo(-s * 0.15, s * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.rockEdge;
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.stroke();
  } else if (kind === 1) {
    // 水坑
    ctx.fillStyle = C.water;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.44, s * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.waterDeep;
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.stroke();
    // 波纹
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(1, s * 0.03);
    const rp = (t / 900) % 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * (0.12 + 0.2 * rp), s * (0.09 + 0.15 * rp), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // 树桩
    ctx.fillStyle = C.stump;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.08, s * 0.4, s * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.stumpEdge;
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.stroke();
    ctx.fillStyle = C.stumpRing;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.05, s * 0.26, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.stumpEdge;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.stroke();
  }

  ctx.restore();
}

/** 小装饰（花朵/草），纯装饰、无碰撞 */
function drawDecoration(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  seed: number,
): void {
  const s = size * 0.3;
  ctx.save();
  ctx.translate(cx + (seed % 7 - 3) * size * 0.06, cy + (seed % 5 - 2) * size * 0.06);
  if (seed % 3 === 0) {
    // 花
    const petals = ["#ffffff", "#ffe08a", "#ff9fb2"][seed % 3] as string;
    ctx.fillStyle = petals;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, s * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#f7b500";
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 草叶
    ctx.strokeStyle = "#7fbf57";
    ctx.lineWidth = Math.max(1, s * 0.12);
    ctx.lineCap = "round";
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(k * s * 0.2, s * 0.2);
      ctx.lineTo(k * s * 0.32, -s * 0.2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D 不可用");
    this.ctx = ctx;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  private cellRect(l: ViewLayout, c: number, r: number): [number, number, number] {
    const x = l.originX + c * l.cell;
    const y = l.originY + r * l.cell;
    return [x, y, l.cell];
  }

  draw(state: RenderState, layout: ViewLayout, t: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    // 背景（天空到草地的竖向渐变）
    const bg = ctx.createLinearGradient(0, 0, 0, this.cssH);
    bg.addColorStop(0, C.sky);
    bg.addColorStop(1, "#e8f7d6");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    // 地图底板
    ctx.save();
    roundRect(ctx, layout.originX - 8, layout.originY - 8, layout.w + 16, layout.h + 16, 14);
    ctx.fillStyle = "#8ec768";
    ctx.fill();

    // 草地格子
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        const [x, y, s] = this.cellRect(layout, c, r);
        ctx.fillStyle = (c + r) % 2 === 0 ? C.grassA : C.grassB;
        ctx.fillRect(x, y, s, s);
      }
    }
    ctx.restore();

    // 装饰（非路径、非障碍、非鸭、非终点、非起点的空草地）
    const blockedForDeco = new Set<number>();
    for (const p of state.path) blockedForDeco.add(p[1] * layout.cols + p[0]);
    for (const o of state.obstacles) blockedForDeco.add(o[1] * layout.cols + o[0]);
    for (const d of state.uncollectedDucks) blockedForDeco.add(d[1] * layout.cols + d[0]);
    blockedForDeco.add(state.end[1] * layout.cols + state.end[0]);
    blockedForDeco.add(state.start[1] * layout.cols + state.start[0]);
    for (let r = 0; r < layout.rows; r++) {
      for (let c = 0; c < layout.cols; c++) {
        const key = r * layout.cols + c;
        if (blockedForDeco.has(key)) continue;
        const seed = (r * 131 + c * 17) % 23;
        if (seed % 4 === 0) {
          const [x, y, s] = this.cellRect(layout, c, r);
          drawDecoration(ctx, x + s / 2, y + s / 2, s, seed);
        }
      }
    }

    // 障碍
    for (const [c, r] of state.obstacles) {
      const [x, y, s] = this.cellRect(layout, c, r);
      const kind = (c * 7 + r * 13) % 3;
      drawObstacle(ctx, x + s / 2, y + s / 2, s, kind, t);
    }

    // 终点鸭屋（锁定/解锁）
    {
      const [x, y, s] = this.cellRect(layout, state.end[0], state.end[1]);
      drawHouse(ctx, x + s / 2, y + s / 2, s, state.endUnlocked, t);
    }

    // 路径（鹅卵石）
    this.drawPath(state, layout);

    // 未收集的小鸭
    for (const [c, r] of state.uncollectedDucks) {
      const [x, y, s] = this.cellRect(layout, c, r);
      const breath = Math.sin(t / 350 + c * 1.7 + r * 2.3);
      drawDuck(ctx, x + s / 2, y + s / 2, s * 0.72, { breath, facing: "right" });
    }

    // 鸭妈妈（位于路径末端）与身后队列
    this.drawMomAndTrail(state, layout, t);

    // 可延伸邻格弱高亮
    this.drawReachableHighlight(state, layout, t);

    // 提示高亮
    if (state.hintCell) {
      const [c, r] = state.hintCell;
      const [x, y, s] = this.cellRect(layout, c, r);
      const pulse = 0.5 + 0.5 * Math.sin(t / 180);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 122, 60, ${(0.55 + 0.35 * pulse).toFixed(3)})`;
      ctx.lineWidth = Math.max(3, s * 0.09);
      ctx.setLineDash([s * 0.14, s * 0.08]);
      ctx.lineDashOffset = -((t / 40) % (s * 0.22));
      roundRect(ctx, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.16);
      ctx.stroke();
      ctx.restore();
    }

    // 软拒绝闪烁
    if (state.rejectCell && t < state.rejectUntil) {
      const [c, r] = state.rejectCell;
      const [x, y, s] = this.cellRect(layout, c, r);
      const fade = 1 - (state.rejectUntil - t) / 260;
      ctx.fillStyle = `rgba(244, 92, 82, ${(0.4 * (1 - fade)).toFixed(3)})`;
      roundRect(ctx, x, y, s, s, s * 0.12);
      ctx.fill();
    }
  }

  private drawPath(state: RenderState, layout: ViewLayout): void {
    const ctx = this.ctx;
    if (state.path.length < 1) return;

    // 底层粗连线（连接各格中心）
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = C.stoneDark;
    ctx.lineWidth = layout.cell * 0.56;
    ctx.beginPath();
    for (let i = 0; i < state.path.length; i++) {
      const [c, r] = state.path[i] as Vec2;
      const x = layout.originX + c * layout.cell + layout.cell / 2;
      const y = layout.originY + r * layout.cell + layout.cell / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 每格一块鹅卵石
    for (let i = 0; i < state.path.length; i++) {
      const [c, r] = state.path[i] as Vec2;
      const x = layout.originX + c * layout.cell + layout.cell / 2;
      const y = layout.originY + r * layout.cell + layout.cell / 2;
      ctx.fillStyle = i % 2 === 0 ? C.stone : "#e6cd9d";
      ctx.beginPath();
      ctx.ellipse(x, y, layout.cell * 0.26, layout.cell * 0.26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.stoneEdge;
      ctx.lineWidth = Math.max(1, layout.cell * 0.03);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMomAndTrail(state: RenderState, layout: ViewLayout, t: number): void {
    const ctx = this.ctx;
    const end = state.path[state.path.length - 1] as Vec2;
    const [ex, ey, s] = this.cellRect(layout, end[0], end[1]);

    // 朝向：仅左右镜像（上下移动保持原朝向，不旋转）
    let facing: "left" | "right" = "right";
    if (state.path.length >= 2) {
      const prev = state.path[state.path.length - 2] as Vec2;
      const dx = end[0] - prev[0];
      if (dx > 0) facing = "right";
      else if (dx < 0) facing = "left";
    }

    // 身后队列（已收集小鸭，贴紧鸭妈妈）
    const n = state.collectedDucks.length;
    for (let i = 0; i < n; i++) {
      let qi = state.path.length - 2 - i;
      if (qi < 0) qi = 0;
      const cell = state.path[qi] as Vec2;
      const [qx, qy, qs] = this.cellRect(layout, cell[0], cell[1]);
      const breath = Math.sin(t / 350 + i * 1.9);
      drawDuck(ctx, qx + qs / 2, qy + qs / 2, qs * 0.66, { breath, facing });
    }

    // 鸭妈妈
    const breath = Math.sin(t / 380);
    drawDuck(ctx, ex + s / 2, ey + s / 2, s * 0.96, { mom: true, breath, facing });
  }

  private drawReachableHighlight(state: RenderState, layout: ViewLayout, t: number): void {
    if (state.won) return;
    const ctx = this.ctx;
    const end = state.path[state.path.length - 1] as Vec2;
    const dirs: Vec2[] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const alpha = 0.10 + 0.05 * Math.sin(t / 260);
    for (const [dc, dr] of dirs) {
      const c = end[0] + dc;
      const r = end[1] + dr;
      if (c < 0 || r < 0 || c >= layout.cols || r >= layout.rows) continue;
      const isBlocked =
        state.obstacles.some((o) => o[0] === c && o[1] === r) ||
        state.path.some((p) => p[0] === c && p[1] === r);
      if (isBlocked) continue;
      const isEnd = state.end[0] === c && state.end[1] === r;
      if (isEnd && !state.endUnlocked) continue;
      const [x, y, s] = this.cellRect(layout, c, r);
      ctx.fillStyle = `rgba(255, 244, 170, ${alpha.toFixed(3)})`;
      roundRect(ctx, x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, s * 0.14);
      ctx.fill();
    }
  }
}
