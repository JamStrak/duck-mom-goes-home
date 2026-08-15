// 关卡编辑器：可视化摆放起点/终点/小鸭/障碍，验证可解、试玩、保存/导出/导入。
// 入口：#editor 或菜单里的「关卡编辑器」按钮。

import type { LevelConfig, Vec2 } from "./types";
import { computeGridLayout, type ViewLayout } from "./layout";
import { solvePath } from "./solver";
import { rotateConfig } from "./rotator";
import { getLevel, TOTAL_LEVELS } from "./levels";
import {
  getCustomLevel,
  putCustomLevel,
  nextCustomLevelId,
  listCustomLevels,
  importCustomLevels,
} from "./custom-levels";

type Tool = "start" | "end" | "duck" | "obstacle" | "erase";

interface EditorState {
  cols: number;
  rows: number;
  start: Vec2 | null;
  end: Vec2 | null;
  ducks: Vec2[];
  obstacles: Vec2[];
  tool: Tool;
  levelId: number;
  isNew: boolean;
}

export interface EditorOpts {
  onExit: () => void;
  onTestPlay: (config: LevelConfig) => void;
}

// 试玩返回后恢复的草稿（页面生命周期内保留）
let draft: LevelConfig | null = null;

function stateFromConfig(cfg: LevelConfig): EditorState {
  return {
    cols: cfg.gridSize[0],
    rows: cfg.gridSize[1],
    start: cfg.start.slice() as Vec2,
    end: cfg.end.slice() as Vec2,
    ducks: cfg.ducks.map((d) => d.slice() as Vec2),
    obstacles: cfg.obstacles.map((o) => o.slice() as Vec2),
    tool: "obstacle",
    levelId: cfg.levelId,
    isNew: false,
  };
}

function defaultState(): EditorState {
  return {
    cols: 5,
    rows: 7,
    start: [0, 1],
    end: [4, 6],
    ducks: [],
    obstacles: [],
    tool: "obstacle",
    levelId: nextCustomLevelId(),
    isNew: true,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const TOOL_META: { key: Tool; label: string; icon: string }[] = [
  { key: "start", label: "起点", icon: "🦆" },
  { key: "end", label: "终点", icon: "🏠" },
  { key: "duck", label: "小鸭", icon: "🐤" },
  { key: "obstacle", label: "障碍", icon: "🧱" },
  { key: "erase", label: "擦除", icon: "🧽" },
];

export function mountEditor(opts: EditorOpts): void {
  const app = document.getElementById("app") as HTMLElement;
  app.innerHTML = "";

  const state: EditorState = draft ? stateFromConfig(draft) : defaultState();

  const screen = el("div", "screen editor");
  app.append(screen);

  // —— 顶栏 ——
  const topbar = el("div", "editor-topbar");
  const backBtn = el("button", "icon-btn small", "← 返回");
  backBtn.addEventListener("click", () => opts.onExit());
  const title = el("span", "editor-title", "关卡编辑器");

  const loadSel = document.createElement("select");
  loadSel.className = "editor-select";
  const optNew = document.createElement("option");
  optNew.value = "__new";
  optNew.textContent = "＋ 新建关卡";
  loadSel.append(optNew);
  for (let id = 1; id <= TOTAL_LEVELS; id++) {
    const o = document.createElement("option");
    o.value = String(id);
    o.textContent = `内置第 ${id} 关`;
    loadSel.append(o);
  }
  for (const c of listCustomLevels()) {
    const o = document.createElement("option");
    o.value = String(c.levelId);
    o.textContent = `我的关卡 ${c.levelId}${c.levelId <= TOTAL_LEVELS ? " (覆盖)" : ""}`;
    loadSel.append(o);
  }
  loadSel.addEventListener("change", () => onLoad(loadSel.value));

  topbar.append(backBtn, title, loadSel);
  screen.append(topbar);

  // —— 工具栏 ——
  const toolbar = el("div", "editor-toolbar");
  // 网格尺寸
  const sizeBox = el("div", "editor-size");
  sizeBox.append(el("span", undefined, "列"));
  const colsMinus = el("button", "icon-btn small", "−");
  const colsLabel = el("span", "editor-size-num", String(state.cols));
  const colsPlus = el("button", "icon-btn small", "＋");
  const rowsMinus = el("button", "icon-btn small", "−");
  const rowsLabel = el("span", "editor-size-num", String(state.rows));
  const rowsPlus = el("button", "icon-btn small", "＋");
  sizeBox.append(
    colsMinus,
    colsLabel,
    colsPlus,
    el("span", "editor-size-x", "×"),
    rowsMinus,
    rowsLabel,
    rowsPlus,
    el("span", undefined, "行"),
  );
  colsMinus.addEventListener("click", () => resizeGrid(state.cols - 1, state.rows));
  colsPlus.addEventListener("click", () => resizeGrid(state.cols + 1, state.rows));
  rowsMinus.addEventListener("click", () => resizeGrid(state.cols, state.rows - 1));
  rowsPlus.addEventListener("click", () => resizeGrid(state.cols, state.rows + 1));

  // 工具
  const toolsBox = el("div", "editor-tools");
  for (const t of TOOL_META) {
    const b = el("button", "editor-tool", `${t.icon} ${t.label}`);
    b.dataset.tool = t.key;
    b.addEventListener("click", () => {
      state.tool = t.key;
      refreshToolActive();
    });
    toolsBox.append(b);
  }
  toolbar.append(sizeBox, toolsBox);
  screen.append(toolbar);

  // —— 画布 ——
  const boardWrap = el("div", "editor-board");
  const canvas = document.createElement("canvas");
  boardWrap.append(canvas);
  screen.append(boardWrap);

  // —— 底部操作 ——
  const footer = el("div", "editor-footer");
  const btnValidate = el("button", "editor-action", "✅ 验证可解");
  const btnTest = el("button", "editor-action", "▶ 试玩");
  const btnSave = el("button", "editor-action", "💾 保存");
  const btnExport = el("button", "editor-action", "📤 导出JSON");
  const btnImport = el("button", "editor-action", "📥 导入JSON");
  const btnClear = el("button", "editor-action secondary", "🧹 清空");
  const status = el("span", "editor-status", "");
  footer.append(btnValidate, btnTest, btnSave, btnExport, btnImport, btnClear);
  screen.append(footer, status);

  // —— 交互逻辑 ——
  let layout: ViewLayout | null = null;
  let lastW = 0;
  let lastH = 0;

  function refreshToolActive(): void {
    toolsBox.querySelectorAll(".editor-tool").forEach((n) => {
      n.classList.toggle("active", (n as HTMLElement).dataset.tool === state.tool);
    });
  }

  function resizeGrid(cols: number, rows: number): void {
    state.cols = Math.max(3, Math.min(10, cols));
    state.rows = Math.max(3, Math.min(12, rows));
    // 移除越界元素
    state.start = clampVec(state.start);
    state.end = clampVec(state.end);
    state.ducks = state.ducks.filter((d) => d[0] < state.cols && d[1] < state.rows);
    state.obstacles = state.obstacles.filter((o) => o[0] < state.cols && o[1] < state.rows);
    colsLabel.textContent = String(state.cols);
    rowsLabel.textContent = String(state.rows);
    draw();
  }

  function clampVec(v: Vec2 | null): Vec2 | null {
    if (!v) return null;
    if (v[0] >= state.cols || v[1] >= state.rows) return null;
    return v;
  }

  function onLoad(value: string): void {
    if (value === "__new") {
      draft = null;
      state.isNew = true;
      state.levelId = nextCustomLevelId();
      state.cols = 5;
      state.rows = 7;
      state.start = [0, 1];
      state.end = [4, 6];
      state.ducks = [];
      state.obstacles = [];
      colsLabel.textContent = String(state.cols);
      rowsLabel.textContent = String(state.rows);
      draw();
      return;
    }
    const id = Number(value);
    const cfg = getLevel(id) ?? getCustomLevel(id);
    if (!cfg) return;
    draft = cfg;
    state.isNew = false;
    state.levelId = id;
    state.cols = cfg.gridSize[0];
    state.rows = cfg.gridSize[1];
    state.start = cfg.start.slice() as Vec2;
    state.end = cfg.end.slice() as Vec2;
    state.ducks = cfg.ducks.map((d) => d.slice() as Vec2);
    state.obstacles = cfg.obstacles.map((o) => o.slice() as Vec2);
    colsLabel.textContent = String(state.cols);
    rowsLabel.textContent = String(state.rows);
    draw();
  }

  function buildConfig(): LevelConfig | null {
    if (!state.start || !state.end) return null;
    return {
      schemaVersion: 2,
      baseOrientation: "portrait",
      levelId: state.levelId,
      gridSize: [state.cols, state.rows],
      start: state.start.slice() as Vec2,
      end: state.end.slice() as Vec2,
      ducks: state.ducks.map((d) => d.slice() as Vec2),
      obstacles: state.obstacles.map((o) => o.slice() as Vec2),
      solution: [],
    };
  }

  function computeSolution(cfg: LevelConfig): Vec2[] | null {
    const blocked = new Set(cfg.obstacles.map((o) => o[1] * cfg.gridSize[0] + o[0]));
    const res = solvePath({
      cols: cfg.gridSize[0],
      rows: cfg.gridSize[1],
      start: cfg.start,
      end: cfg.end,
      ducks: cfg.ducks,
      blocked,
    });
    return res.path;
  }

  function validate(): void {
    const cfg = buildConfig();
    if (!cfg) {
      status.textContent = "⚠️ 请先放置起点和终点";
      return;
    }
    if (cfg.ducks.some((d) => d[0] === cfg.start[0] && d[1] === cfg.start[1])) {
      status.textContent = "⚠️ 小鸭不能放在起点";
      return;
    }
    if (cfg.ducks.some((d) => d[0] === cfg.end[0] && d[1] === cfg.end[1])) {
      status.textContent = "⚠️ 小鸭不能放在终点";
      return;
    }
    const sol = computeSolution(cfg);
    const landscape = rotateConfig(cfg);
    const lblocked = new Set(landscape.obstacles.map((o) => o[1] * landscape.cols + o[0]));
    const lres = solvePath({
      cols: landscape.cols,
      rows: landscape.rows,
      start: landscape.start,
      end: landscape.end,
      ducks: landscape.ducks,
      blocked: lblocked,
    });
    if (sol && lres.path) {
      status.textContent = "✅ 可解（竖屏 + 横屏均验证通过）";
    } else {
      status.textContent = "❌ 不可解：起点无法接走全部小鸭到达终点，请调整";
    }
  }

  function save(): void {
    const cfg = buildConfig();
    if (!cfg) {
      status.textContent = "⚠️ 请先放置起点和终点";
      return;
    }
    const sol = computeSolution(cfg);
    if (!sol) {
      status.textContent = "❌ 不可解，无法保存（请调整障碍或小鸭）";
      return;
    }
    cfg.solution = sol;
    putCustomLevel(cfg);
    draft = cfg;
    state.isNew = false;
    status.textContent = `💾 已保存「我的关卡 ${cfg.levelId}」（在菜单里可见）`;
    // 刷新加载下拉
    refreshLoadOptions();
  }

  function refreshLoadOptions(): void {
    // 简单做法：去掉自定义项后重建
    while (loadSel.options.length > 1 + TOTAL_LEVELS) loadSel.remove(loadSel.options.length - 1);
    for (const c of listCustomLevels()) {
      const o = document.createElement("option");
      o.value = String(c.levelId);
      o.textContent = `我的关卡 ${c.levelId}${c.levelId <= TOTAL_LEVELS ? " (覆盖)" : ""}`;
      loadSel.append(o);
    }
  }

  function exportJson(): void {
    const cfg = buildConfig();
    if (!cfg) {
      status.textContent = "⚠️ 请先放置起点和终点";
      return;
    }
    const sol = computeSolution(cfg);
    cfg.solution = sol ?? [];
    const json = JSON.stringify([cfg], null, 2);
    try {
      void navigator.clipboard?.writeText(json);
    } catch {
      // ignore
    }
    download(json, `level-${cfg.levelId}.json`);
    status.textContent = "📤 已导出 JSON（并复制到剪贴板）";
  }

  function importJson(): void {
    const raw = window.prompt("粘贴关卡 JSON（单个或数组）：");
    if (!raw) return;
    try {
      const n = importCustomLevels(raw);
      status.textContent = `📥 已导入 ${n} 个关卡`;
      refreshLoadOptions();
    } catch {
      status.textContent = "❌ JSON 解析失败";
    }
  }

  function clearAll(): void {
    state.start = null;
    state.end = null;
    state.ducks = [];
    state.obstacles = [];
    draw();
  }

  function download(text: string, filename: string): void {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  btnValidate.addEventListener("click", validate);
  btnSave.addEventListener("click", save);
  btnExport.addEventListener("click", exportJson);
  btnImport.addEventListener("click", importJson);
  btnClear.addEventListener("click", clearAll);
  btnTest.addEventListener("click", () => {
    const cfg = buildConfig();
    if (!cfg) {
      status.textContent = "⚠️ 请先放置起点和终点";
      return;
    }
    const sol = computeSolution(cfg);
    if (!sol) {
      status.textContent = "❌ 不可解，无法试玩";
      return;
    }
    cfg.solution = sol;
    draft = cfg;
    opts.onTestPlay(cfg);
  });

  // —— 画布命中 ——
  function cellAt(x: number, y: number): Vec2 | null {
    if (!layout) return null;
    const c = Math.floor((x - layout.originX) / layout.cell);
    const r = Math.floor((y - layout.originY) / layout.cell);
    if (c < 0 || r < 0 || c >= state.cols || r >= state.rows) return null;
    return [c, r];
  }

  function applyTool(cell: Vec2): void {
    const [c, r] = cell;
    const key = (v: Vec2) => v[0] === c && v[1] === r;
    switch (state.tool) {
      case "start":
        if (state.end && state.end[0] === c && state.end[1] === r) break;
        state.start = [c, r];
        state.ducks = state.ducks.filter((d) => !key(d));
        state.obstacles = state.obstacles.filter((o) => !key(o));
        break;
      case "end":
        if (state.start && state.start[0] === c && state.start[1] === r) break;
        state.end = [c, r];
        state.ducks = state.ducks.filter((d) => !key(d));
        state.obstacles = state.obstacles.filter((o) => !key(o));
        break;
      case "duck":
        if ((state.start && key(state.start)) || (state.end && key(state.end))) break;
        if (state.ducks.some(key)) state.ducks = state.ducks.filter((d) => !key(d));
        else state.ducks.push([c, r]);
        state.obstacles = state.obstacles.filter((o) => !key(o));
        break;
      case "obstacle":
        if ((state.start && key(state.start)) || (state.end && key(state.end))) break;
        if (state.obstacles.some(key)) state.obstacles = state.obstacles.filter((o) => !key(o));
        else state.obstacles.push([c, r]);
        state.ducks = state.ducks.filter((d) => !key(d));
        break;
      case "erase":
        if (state.start && key(state.start)) state.start = null;
        if (state.end && key(state.end)) state.end = null;
        state.ducks = state.ducks.filter((d) => !key(d));
        state.obstacles = state.obstacles.filter((o) => !key(o));
        break;
    }
    draw();
  }

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const cell = cellAt(e.clientX - rect.left, e.clientY - rect.top);
    if (cell) applyTool(cell);
  });

  // —— 绘制 ——
  function draw(): void {
    const bw = boardWrap.clientWidth;
    const bh = boardWrap.clientHeight;
    if (bw < 4 || bh < 4) return;
    if (bw !== lastW || bh !== lastH) {
      lastW = bw;
      lastH = bh;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(bw * dpr);
      canvas.height = Math.round(bh * dpr);
      canvas.style.width = `${bw}px`;
      canvas.style.height = `${bh}px`;
    }
    layout = computeGridLayout(state.cols, state.rows, bw, bh);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);

    // 背景
    ctx.fillStyle = "#e8f3dd";
    ctx.fillRect(0, 0, bw, bh);

    // 网格
    const { cell, originX, originY } = layout;
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const x = originX + c * cell;
        const y = originY + r * cell;
        ctx.fillStyle = (c + r) % 2 === 0 ? "#f2f7e9" : "#e2eed4";
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = "#c7d9b3";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      }
    }

    const emoji = (ch: string, x: number, y: number, size: number) => {
      ctx.font = `${size}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(ch, x, y);
    };

    // 障碍
    for (const [c, r] of state.obstacles) {
      const x = originX + c * cell + cell / 2;
      const y = originY + r * cell + cell / 2;
      ctx.fillStyle = "#9aa7b5";
      ctx.fillRect(originX + c * cell + 4, originY + r * cell + 4, cell - 8, cell - 8);
      emoji("🧱", x, y, cell * 0.5);
    }
    // 小鸭
    for (const [c, r] of state.ducks) {
      emoji("🐤", originX + c * cell + cell / 2, originY + r * cell + cell / 2, cell * 0.6);
    }
    // 起点
    if (state.start) {
      emoji("🦆", originX + state.start[0] * cell + cell / 2, originY + state.start[1] * cell + cell / 2, cell * 0.65);
    }
    // 终点
    if (state.end) {
      emoji("🏠", originX + state.end[0] * cell + cell / 2, originY + state.end[1] * cell + cell / 2, cell * 0.65);
    }
  }

  // 初始绘制 + 尺寸变化
  refreshToolActive();
  const ro = new ResizeObserver(() => draw());
  ro.observe(boardWrap);
  requestAnimationFrame(() => draw());
}
