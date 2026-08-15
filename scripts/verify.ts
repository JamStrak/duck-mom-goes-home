// 开发期自检脚本：验证 60 关生成与双向可解性、关键约束、求解器正确性。
// 用法：npx esbuild scripts/verify.ts --bundle --platform=node --format=esm --outfile=scripts/_verify.mjs && node scripts/_verify.mjs

import { buildAllLevels, verifyAllLevels } from "../src/levels";
import { rotateConfig } from "../src/rotator";
import { solvePath } from "../src/solver";

const levels = buildAllLevels();
const problems: string[] = [];

for (const cfg of levels) {
  const [cols, rows] = cfg.gridSize;

  // 除第 4 关外，网格宽高比 ≠ 1:1
  if (cfg.levelId !== 4 && cols === rows) {
    problems.push(`L${cfg.levelId} 为方形网格 ${cols}x${rows}`);
  }

  // 小鸭不可放在起点/终点
  for (const d of cfg.ducks) {
    if (
      (d[0] === cfg.start[0] && d[1] === cfg.start[1]) ||
      (d[0] === cfg.end[0] && d[1] === cfg.end[1])
    ) {
      problems.push(`L${cfg.levelId} 小鸭位于起点/终点`);
    }
  }

  // 障碍不超过可通行格 35% 且 ≤ 12
  if (cfg.obstacles.length > 12 || cfg.obstacles.length > Math.floor(cols * rows * 0.35)) {
    problems.push(`L${cfg.levelId} 障碍数量越界 (${cfg.obstacles.length})`);
  }

  // solution 首尾与 start/end 一致
  const s0 = cfg.solution[0];
  const s1 = cfg.solution[cfg.solution.length - 1];
  if (!s0 || !s1 || s0[0] !== cfg.start[0] || s0[1] !== cfg.start[1]) {
    problems.push(`L${cfg.levelId} solution 起点不符`);
  }
  if (!s1 || s1[0] !== cfg.end[0] || s1[1] !== cfg.end[1]) {
    problems.push(`L${cfg.levelId} solution 终点不符`);
  }

  // 旋转后坐标在横屏范围内
  const r = rotateConfig(cfg);
  for (const o of r.obstacles) {
    if (o[0] < 0 || o[1] < 0 || o[0] >= r.cols || o[1] >= r.rows) {
      problems.push(`L${cfg.levelId} 旋转后障碍越界`);
    }
  }

  console.log(
    `L${String(cfg.levelId).padStart(2, " ")}  ${cols}x${rows}  鸭${cfg.ducks.length}  障${cfg.obstacles.length}  解长${cfg.solution.length}`,
  );
}

const v = verifyAllLevels();
console.log(`\n可解性（参考解见证）：${v.ok}/${v.total} 关双向可解` + (v.failed.length ? ` 失败：${v.failed.join(",")}` : " ✅"));

// 求解器完备性抽检（高预算）：确认求解器在困难关卡上是“预算耗尽”而非“误判无解”
let solverOk = 0;
const solverFail: string[] = [];
for (const cfg of levels) {
  const res = solvePath({
    cols: cfg.gridSize[0],
    rows: cfg.gridSize[1],
    start: cfg.start,
    end: cfg.end,
    ducks: cfg.ducks,
    blocked: new Set(cfg.obstacles.map((o) => o[1] * cfg.gridSize[0] + o[0])),
    budget: 4_000_000,
  });
  if (res.path) solverOk++;
  else solverFail.push(`L${cfg.levelId}${res.exhausted ? "(预算)" : "(无解?)"}`);
}
console.log(`求解器(预算4M)解出：${solverOk}/60` + (solverFail.length ? `，未解出：${solverFail.join(" ")}` : " ✅"));

// 不可解样例：鸭在死胡同且终点被锁
const unsolvable = solvePath({
  cols: 2,
  rows: 2,
  start: [0, 0],
  end: [1, 0],
  ducks: [[0, 1]],
  blocked: new Set([3]),
});
console.log(`不可解样例返回：${unsolvable.path === null ? "null ✅" : "有解 ❌"}`);

// 可解样例：简单直线
const solvable = solvePath({
  cols: 1,
  rows: 3,
  start: [0, 0],
  end: [0, 2],
  ducks: [[0, 1]],
  blocked: new Set(),
});
console.log(`可解样例返回：${solvable.path ? "有解 ✅" : "null ❌"}`);

console.log(problems.length ? "\n发现问题：\n" + problems.join("\n") : "\n无约束问题 ✅");
process.exit(problems.length ? 1 : 0);
