# 鸭妈妈回家（小鸭快跑）

> 儿童向 H5 路径规划解谜游戏。由「超级设计师工作站」的项目开发案同步并实现。
> 开发基准见 `docs/game-design/00-项目开发案.md`。

## 这是什么

玩家从鸭妈妈起点出发，在矩形网格上**一笔画路径**，依次接走所有小鸭，最后到达鸭屋终点。
路径必须连续、不可重复、不可穿障、不可斜穿、不可越界；**无失败态**，可随时撤销/重置。

- 60 关、7 章，竖屏网格从 4×5 到 7×10，小鸭 0-5 只，障碍 0-12 个。
- 竖屏用纵向矩形地图；横屏通过坐标系旋转自动生成横向地图（不存两套关卡）。
- 星级只与提示次数相关（0 次 3 星 / 1 次 2 星 / ≥2 次 1 星）。
- 进度存 `localStorage`（键 `duck_mom_progress_v1`），刷新不丢、损坏回退初始态。

## 技术栈

纯前端 **Canvas + TypeScript + Vite**，无重引擎、无图片资源（全部矢量绘制），首屏 JS 约 26KB（gzip 10KB）。

## 运行

**普通用户：双击根目录的 `一键启动.cmd`** —— 它会：清理旧进程 → 自动构建 → 起服务 → 打开浏览器。
无需命令行。（首次运行会自动 `npm install`，需要联网；之后秒开。）

```bash
npm run dev          # 开发者：热更新开发模式（Vite）
npm run build        # 类型检查 + 构建产物到 dist/
npm run preview      # 本地预览 dist/（备选）
```

- **端口**：本项目专属基准端口 **5175**（区别于「超级设计师工作站」的 4397）。
  若 5175 被占用，`一键启动.cmd` / `scripts/start.ps1` 会自动退避到 5176、5177…（复用 `scripts/lib/ports.ps1` 的 `Find-FreePort`），绝不报错退出。
- **局域网分享**：`一键启动.cmd` 默认只监听本机；若要在同一 Wi-Fi 下用手机/平板玩，
  双击 `局域网分享.cmd`（等价于 `powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -ShareLan`）。
- 入口由 `server.mjs`（纯 Node 内置模块，无第三方依赖）服务 `dist/`。

## 在手机 / iPad 上玩

1. 电脑和手机/iPad 连到**同一个 Wi-Fi**。
2. 电脑上双击 `局域网分享.cmd`。
3. 窗口里会打印一个地址（形如 `http://192.168.x.x:5175`），
   在手机/iPad 的浏览器里打开它即可。
4. 若打不开：确认电脑 Wi-Fi 网络在 Windows 里是「专用(Private)网络」，
   并在弹出的防火墙提示里点「允许」；脚本也会自动尝试放行 5175 端口。

> 游戏是响应式 H5：竖屏/横屏自适应，触控用 Pointer Events，iPhone/iPad 的 Safari 与安卓浏览器都能玩。
> 也可以「添加到主屏幕」当 App 用。

## 单文件打包版（离线分享，任何手机都能玩）

游戏是纯前端、无外部资源，可以打成**一个自包含的 `.html` 文件**——不依赖你的电脑、无需服务器，
把这个文件发给任何手机/iPad，直接用浏览器打开就能玩。

```bash
npm run package:single
```

产出：`release/鸭妈妈回家-单文件版.html`（约 32KB）。

分享方式（任选）：

- **微信/QQ 传文件**：对方点文件 →「用其他应用打开」→ 选浏览器（Safari / Chrome）。
- **邮件 / AirDrop**：iPhone/iPad 之间 AirDrop 最方便，收到直接点开。
- **网盘 / U 盘 / 蓝牙**：拷过去用浏览器打开即可。

> 小提示：微信内置浏览器不能直接渲染聊天里收到的 `.html` 文件，需要「用其他应用打开」。
> 若想要一个**微信里点开即玩的网址**（而非传文件），可以把它部署到免费静态托管（Vercel/Netlify/GitHub Pages），
> 需要你的账号配合，随时可以让我帮你做。

## 目录结构

```
src/
  main.ts        入口、屏幕路由（选关/游戏）、RAF 循环、方向切换
  game.ts        规则引擎（路径/收集/撤销/重置/提示/星级）
  levels.ts      章节定义 + 60 关确定性程序化生成 + 参考解校验
  solver.ts      简单路径求解器（提示系统用，正确但高难关有预算上限）
  rotator.ts     竖屏→横屏旋转映射
  layout.ts      网格适配（正方形格子、居中）
  render.ts      Canvas 矢量渲染（草地/路径/鸭妈妈/小鸭/鸭屋/障碍/提示）
  input.ts       点选/拖拽/撤销命中检测（Pointer Events）
  progress.ts    localStorage 进度
  types.ts       类型与关卡契约
scripts/
  verify.ts      开发期自检（60 关双向可解 + 求解器完备性抽检）
```

## 自检

```bash
npx esbuild scripts/verify.ts --bundle --platform=node --format=esm --outfile=scripts/_verify.mjs
node scripts/_verify.mjs
```

应输出：`可解性（参考解见证）：60/60 关双向可解 ✅`。

## 关键设计裁决（对应开发案）

- 每关只存竖屏基准配置，横屏由 `rotateConfig()` 生成并验证。
- 关卡**确定性生成**（固定种子），参考解路径本身即“可解性见证”；障碍只放在参考解之外。
- 提示优先沿参考解给下一步；玩家偏离参考解时退回求解器实时计算，极端情况下提示“先撤销几步”。
- 第 4 关为 5×5 方形过渡关（教学特例）。
