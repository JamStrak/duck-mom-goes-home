import "./style.css";
import type { Progress, Vec2 } from "./types";
import { loadProgress, saveProgress, recordWin, TOTAL_LEVELS } from "./progress";
import { getLevel, chapterOf, verifyAllLevels, CHAPTERS } from "./levels";
import { rotateConfig, portraitRuntime } from "./rotator";
import { Game } from "./game";
import { Renderer, type RenderState } from "./render";
import { InputController } from "./input";
import { computeGridLayout, type ViewLayout } from "./layout";

const app = document.getElementById("app") as HTMLElement;

let progress: Progress = loadProgress();
let screenKind: "menu" | "game" = "menu";

// 当前游戏会话状态
let currentLevelId = 0;
let orientation: "portrait" | "landscape" = "portrait";
let game: Game | null = null;
let renderer: Renderer | null = null;
let input: InputController | null = null;
let layout: ViewLayout | null = null;
let rafId = 0;
let rejectCell: Vec2 | null = null;
let rejectUntil = 0;
let lastBoardW = 0;
let lastBoardH = 0;

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

function iconBtn(emoji: string, label: string): HTMLButtonElement {
  const b = el("button", "icon-btn");
  b.append(el("span", undefined, emoji), document.createTextNode(label));
  return b;
}

function detectOrientation(): "portrait" | "landscape" {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return w > h * 1.1 ? "landscape" : "portrait";
}

function totalStars(): number {
  return Object.values(progress.stars).reduce((a, b) => a + b, 0);
}

// ===== 主菜单 / 选关 =====
function showMenu(): void {
  cleanupGame();
  screenKind = "menu";
  app.innerHTML = "";

  const screen = el("div", "screen menu");
  const hero = el("div", "menu-hero");
  hero.append(
    el("div", "logo", "🦆"),
    el("h1", undefined, "鸭妈妈回家"),
    el("p", "sub", "铺一条路，接上所有小鸭，一起回家吧"),
    el("div", "menu-stars-total", `⭐ ${totalStars()} / ${TOTAL_LEVELS * 3}`),
  );
  screen.append(hero);

  const chapters = el("div", "chapters");
  for (const ch of CHAPTERS) {
    const sec = el("div", "chapter");
    const head = el("div", "chapter-head");
    head.append(
      el("span", "cname", `第${ch.id}章 · ${ch.name}`),
      el("span", "crange", `第 ${ch.range[0]} - ${ch.range[1]} 关`),
    );
    sec.append(head);

    const grid = el("div", "level-grid");
    for (let l = ch.range[0]; l <= ch.range[1]; l++) {
      const btn = el("button", "level-btn");
      const num = el("span", undefined, String(l));
      btn.append(num);
      const locked = l > progress.unlocked;
      if (locked) {
        num.textContent = "🔒";
        btn.classList.add("locked");
        btn.disabled = true;
      } else {
        const s = progress.stars[l] ?? 0;
        if (s > 0) btn.append(el("span", "stars-mini", "⭐".repeat(s)));
        const lvl = l;
        btn.addEventListener("click", () => showGame(lvl));
        if (l === progress.unlocked) btn.classList.add("current");
      }
      grid.append(btn);
    }
    sec.append(grid);
    chapters.append(sec);
  }

  screen.append(chapters);
  app.append(screen);
}

// ===== 游戏界面 =====
interface HudRefs {
  starsTop: HTMLElement;
  ducksEl: HTMLElement;
  endEl: HTMLElement;
  endText: HTMLElement;
  toast: HTMLElement;
}

let hud: HudRefs | null = null;
let toastTimer = 0;

function cleanupGame(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  input?.detach();
  input = null;
  renderer = null;
  game = null;
  layout = null;
  hud = null;
  rejectCell = null;
  lastBoardW = 0;
  lastBoardH = 0;
}

function buildInfoBar(): HudRefs {
  const ducksEl = el("div", "ducks");
  const endEl = el("div", "end-status");
  const endText = el("span", "end-text");
  endEl.append(el("span", "house", "🏠"), endText);
  return { starsTop: el("span", "level-stars"), ducksEl, endEl, endText, toast: el("div", "toast") };
}

function showGame(levelId: number): void {
  cleanupGame();
  screenKind = "game";
  currentLevelId = levelId;

  const config = getLevel(levelId);
  orientation = detectOrientation();
  const runtime = orientation === "landscape" ? rotateConfig(config) : portraitRuntime(config);
  game = new Game(runtime);

  app.innerHTML = "";
  const screen = el("div", "screen game");
  screen.classList.add(orientation);

  // 顶部状态区
  const topbar = el("div", "topbar");
  const left = el("div", "left");
  const backBtn = iconBtn("←", "选关");
  backBtn.addEventListener("click", () => showMenu());
  const title = el("span", "title", `第${levelId}关 · ${chapterOf(levelId).name}`);
  left.append(backBtn, title);
  const actions = el("div", "actions");
  const hintBtn = iconBtn("💡", "提示");
  const resetBtn = iconBtn("🔄", "清空");
  hintBtn.addEventListener("click", () => onHint());
  resetBtn.addEventListener("click", () => onReset());
  actions.append(hintBtn, resetBtn);
  topbar.append(left, actions);

  // 信息区
  const info = buildInfoBar();

  // 画布区
  const boardWrap = el("div", "board-wrap");
  const canvas = document.createElement("canvas");
  boardWrap.append(canvas, info.toast);

  screen.append(topbar);

  if (orientation === "landscape") {
    const mid = el("div", "mid");
    const side = el("div", "sideinfo");
    side.append(info.starsTop, info.ducksEl, info.endEl);
    mid.append(boardWrap, side);
    screen.append(mid);
  } else {
    left.append(info.starsTop);
    const bottombar = el("div", "bottombar");
    bottombar.append(info.ducksEl, info.endEl);
    screen.append(boardWrap, bottombar);
  }

  app.append(screen);
  hud = info;

  renderer = new Renderer(canvas);
  input = new InputController(canvas, {
    layout: () => layout,
    onCell: handleCell,
  });
  input.attach();

  updateHud();
  startLoop(boardWrap);
}

function startLoop(boardWrap: HTMLElement): void {
  const frame = (t: number): void => {
    rafId = requestAnimationFrame(frame);
    if (!game || !renderer) return;
    const bw = boardWrap.clientWidth;
    const bh = boardWrap.clientHeight;
    if (bw < 4 || bh < 4) return;
    if (bw !== lastBoardW || bh !== lastBoardH) {
      lastBoardW = bw;
      lastBoardH = bh;
      renderer.resize(bw, bh, window.devicePixelRatio || 1);
    }
    const l = computeGridLayout(game.cols, game.rows, bw, bh);
    layout = l;
    renderer.draw(buildRenderState(), l, t);
  };
  rafId = requestAnimationFrame(frame);
}

function buildRenderState(): RenderState {
  const g = game as Game;
  return {
    cols: g.cols,
    rows: g.rows,
    start: g.level.start,
    end: g.level.end,
    path: g.path.slice() as Vec2[],
    uncollectedDucks: g.remainingDucks(),
    collectedDucks: g.collectedDucks(),
    obstacles: g.level.obstacles,
    endUnlocked: g.allDucksCollected(),
    hintCell: g.hintCell,
    rejectCell,
    rejectUntil,
    won: g.isWon(),
  };
}

function handleCell(cell: Vec2): void {
  const g = game;
  if (!g || g.isWon()) return;

  // 点击已铺格 → 截断（撤销）；点击起点格等效整体重置
  if (g.isPathCell(cell[0], cell[1])) {
    g.truncateAt(cell);
    clearToast();
    updateHud();
    return;
  }

  const res = g.extendTo(cell);
  if (res.type === "rejected") {
    if (res.reason === "duck-missing") showToast("还有小鸭没接上 🐤");
    else if (res.reason === "obstacle") showToast("这里过不去哦 🚧");
    rejectCell = cell;
    rejectUntil = performance.now() + 260;
    updateHud();
  } else if (res.type === "extended") {
    clearToast();
    updateHud();
  } else if (res.type === "won") {
    updateHud();
    onWin();
  }
}

function onHint(): void {
  const g = game;
  if (!g || g.isWon()) return;
  const next = g.requestHint();
  if (next) {
    clearToast();
    showToast("往这边走 💡");
    updateHud();
  } else {
    showToast("试试撤销几步，换个方向 🔄");
  }
}

function onReset(): void {
  const g = game;
  if (!g) return;
  g.reset();
  clearToast();
  updateHud();
}

function updateHud(): void {
  if (!hud || !game) return;

  // 顶部：本关最佳星级
  const best = progress.stars[currentLevelId] ?? 0;
  hud.starsTop.textContent = "⭐".repeat(best) + "☆".repeat(3 - best);

  // 小鸭头像：已收集在前，未收集在后
  const collected = game.collectedDucks();
  const remaining = game.remainingDucks();
  hud.ducksEl.innerHTML = "";
  for (let i = 0; i < collected.length; i++) {
    hud.ducksEl.append(el("span", "duck-avatar", "🐤"));
  }
  for (let i = 0; i < remaining.length; i++) {
    const d = el("span", "duck-avatar missing", "🐤");
    hud.ducksEl.append(d);
  }
  if (collected.length + remaining.length === 0) {
    hud.ducksEl.append(el("span", "duck-avatar", "🐤"));
    (hud.ducksEl.lastElementChild as HTMLElement).classList.add("missing");
  }

  // 终点状态
  if (game.allDucksCollected()) {
    hud.endEl.classList.add("unlocked");
    hud.endText.textContent = "可以回家啦！";
  } else {
    hud.endEl.classList.remove("unlocked");
    hud.endText.textContent = "还有小鸭没接上";
  }
}

function showToast(text: string): void {
  if (!hud) return;
  hud.toast.textContent = text;
  hud.toast.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (hud) hud.toast.classList.remove("show");
  }, 1400);
}

function clearToast(): void {
  if (!hud) return;
  hud.toast.classList.remove("show");
  if (toastTimer) clearTimeout(toastTimer);
}

function onWin(): void {
  const g = game;
  if (!g) return;
  const stars = g.starCount();
  progress = recordWin(progress, currentLevelId, stars);
  saveProgress(progress);
  showWinOverlay(stars, currentLevelId, g.hintUsed);
}

function showWinOverlay(stars: number, levelId: number, hintUsed: number): void {
  const overlay = el("div", "win-overlay");
  const card = el("div", "win-card");
  card.append(el("div", "big", "🏠"));

  const h2 = el("h2", undefined, "通关啦！");
  card.append(h2);

  const starsEl = el("div", "stars");
  starsEl.innerHTML =
    "⭐".repeat(stars) + `<span class="dim">${"⭐".repeat(3 - stars)}</span>`;
  card.append(starsEl);

  const note =
    hintUsed === 0
      ? "没用提示，真棒！"
      : hintUsed === 1
        ? "用了 1 次提示"
        : `用了 ${hintUsed} 次提示`;
  card.append(el("div", "hint-note", note));

  const actions = el("div", "win-actions");
  const replay = el("button", undefined, "再玩一次");
  replay.addEventListener("click", () => showGame(levelId));
  const menuBtn = el("button", "secondary", "选关");
  menuBtn.addEventListener("click", () => showMenu());
  actions.append(menuBtn, replay);

  if (levelId < TOTAL_LEVELS) {
    const next = el("button", undefined, "下一关");
    next.addEventListener("click", () => showGame(levelId + 1));
    actions.append(next);
  }
  card.append(actions);
  overlay.append(card);
  app.append(overlay);
}

// ===== 方向 / 尺寸变化 =====
let resizeTimer = 0;
window.addEventListener("resize", () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    if (screenKind !== "game") return;
    const o = detectOrientation();
    if (o !== orientation) {
      // 方向改变：重建关卡（路径清空），进度保留
      showGame(currentLevelId);
    }
    // 尺寸改变但方向不变：无需动作，RAF 会重新测量画布
  }, 300);
});

// ===== 启动 =====
if (import.meta.env.DEV) {
  // 开发期自检：60 关双向可解性验证
  const v = verifyAllLevels();
  console.info(
    `[鸭妈妈回家] 关卡自检：${v.ok}/${v.total} 关双向可解` +
      (v.failed.length ? `，失败：${v.failed.join(",")}` : " ✅"),
  );
}

showMenu();

// 深链支持：#level=N 直接进入指定关卡（便于测试与分享）
const hashLevel = /^#level=(\d+)$/.exec(window.location.hash);
if (hashLevel) {
  const n = Number(hashLevel[1]);
  if (Number.isInteger(n) && n >= 1 && n <= TOTAL_LEVELS) showGame(n);
}
