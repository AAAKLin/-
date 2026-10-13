# Chat Handoff — Personal Fitness Management System

Use this file to restore context in a new conversation. Update it after meaningful milestones.

## Goal
Build a useful personal fitness web app while learning AI-assisted full-stack development. Start implementation early; do not prolong pre-development discussion.

## Relevant user context
- Beginner in programming and AI-assisted development.
- Wants a low-cost workflow and minimal daily record-keeping.
- Fitness goal: reduce body fat while preserving/building muscle and improving cardio.
- Planning context supplied by user: around 183 cm, 86 kg, little regular exercise, at-home training, limited budget. Editable user-provided context, not verified medical data.
- Prefers mobile-first responsive design and a clean modern dashboard.

## Confirmed decisions
- Personal intelligent fitness coach; responsive web app, mobile-first.
- Personal use first, no mandatory login.
- Home: Today Action Center, not a large chatbot.
- Main navigation: Home, Training, Diet, My Progress.
- Training: weekly beginner plan, daily tasks, quick log plus optional details, history, transparent rule-based adjustments.
- Diet: targets, budget-aware menu suggestions, actual intake logs, saved common foods/recipes, portion editing, calorie/protein/fat/carbohydrate summaries.
- Progress: weight/waist records and trends, training/diet adherence summaries.
- Minimize repeated input; distinguish missing records from non-compliance.
- Deterministic code for calculations/core rules; AI optional, not a hard dependency.
- Include software tests; AI Evaluation only when AI features actually exist.

## Deferred
Food photo recognition, camera exercise recognition, live voice coaching, complex autonomous personalization, multi-user accounts/cloud sync, paid services without approval.

## Workflow
1. Read `AGENTS.md` and relevant docs.
2. Inspect repository and preserve existing work.
3. Agent chooses a simple low-cost stack and records assumptions.
4. Build a working end-to-end slice early; avoid static-only demos.
5. Run app/tests, fix failures, report actual evidence.
6. Update status, development log, and this handoff.

## Status at 2026-10-13（已实际实现并验证）
- 技术栈：Node.js 22 + Express 4 + Node 内置 `node:sqlite` + 零构建原生前端（ES 模块 + 原生 CSS）。
  - 前端：原生 HTML/JS ES 模块，零构建；原生 CSS 设计令牌体系（视觉规范参照 shadcn/ui，未引入 React/Tailwind/Vite）；lucide 风格内联 SVG 图标；支持浅色/深色模式；自写 SVG 图表。
  - 后端：routes → services → repositories 分层；结构化 JSON 日志；`.env` 配置（Node 22 内置 `--env-file-if-exists`）。
- 已跑通：今日行动中心、训练（计划/快速与明细记录/历史/规则化调整）、饮食（记录/重算/食物库/食谱/建议菜单）、进度（体重腰围趋势/依从/覆盖率）、SQLite 持久化、备份导出与恢复（需确认）、合成演示数据。
- 手机访问：`.env` 中 `HOST=0.0.0.0` 已开启；启动横幅自动打印局域网地址（当前环境为 `http://10.58.134.91:3100`，重启后 IP 可能变化）；应用内「档案与备份 → 访问方式」与 `GET /api/settings/network` 同样可查。连不上先按 README 放行防火墙 3100 端口。
- API Key 机制：程序自己从文件读（`AI_API_KEY_FILE_ENV` 填环境变量**名**，`AI_API_KEY_FILE` 填路径，`AI_API_KEY` 直填）。密钥只存服务端内存，不写日志、不回传浏览器；`/api/settings/ai-status` 只返回是否配置 + 来源 + 脱敏片段。**第一版功能不需要密钥**，断网可用。
- 测试实况：单元测试 38 项通过；集成测试 19 项通过；合计 57 项通过；冒烟脚本 8 项通过。
- 启动方式：`npm install` → `npm start` → 浏览器打开 http://127.0.0.1:3100 。
- 浏览器核验：无头 Chrome（CDP）在 1440 桌面与 390×844 移动视口下逐页截图，布局正常无溢出，截图见 `screenshots/`（含 shadcn 改版后的浅色/深色截图）。
- 未做：无 AI 能力接入，因此没有 AI Evaluation 结果；未做鉴权与部署。
- 文档同步说明：桌面的 `fitness_management_system_project_pack/` 目录已被用户移除，文档当前只存在于工作区 `C:\Users\肖坤林\WorkBuddy\健身管理工具\`。

## 排障经验（下次接手先看这里）
- 重启服务前必须确认端口真正空闲（curl 连不通才算）。沙箱内多次后台启动会留下孤儿 node 进程，`netstat` / `Get-NetTCPConnection` 都看不到，只能用 `taskkill /F /IM node.exe` 清理。否则会测到旧进程，误判"改的代码没生效"。
- 前端改了样式但截图没变化：先清 HTTP 缓存（CDP `Network.setCacheDisabled`）并换文件名；若仍异常，用 CDP 直接读计算样式确认，而不是靠肉眼看截图猜。
- 长时间任务用后台常驻方式启动服务；`npm start > log &` 这种写法会随工具调用结束被回收。

## 已上线（2026-10-13）
- **分享链接：https://personal-fitness-manager.app.workbuddy.host/** — 手机 WorkBuddy 与任意浏览器都能直接打开，无需同一 WiFi、无需电脑开机。
- 上线方式：WorkBuddy 应用发布（Node HTTP 服务，平台注入 PORT）；已实测首页/接口/页面渲染均正常，截图见 `screenshots/online-home.png`。
- **重要：云端与本地是两份独立数据库**。线上当前是全新种子数据；手机上录入的数据不会同步到电脑。需要迁移数据时用「档案与备份」导出 JSON 再在另一端导入。
- 发布前必改的两处（重发布时注意保持）：`HOST` 默认 0.0.0.0；`.env` 不写死 PORT。
- 线上同样无登录鉴权，链接即公开访问。

## Next task
1. 用手机连同一 WiFi 实际打开一次，验证手机端可用（连不上按 README 放行防火墙）。
2. 在「档案与备份」中填入真实身高体重等数据，重新生成训练计划与饮食目标。
3. 按使用反馈迭代易用性（动作替换、食物批量导入、周报）。
4. 若要公网访问，先讨论认证与部署方案（需用户明确同意）。

## Future-chat rules
- Project docs are the source of truth.
- Do not re-ask confirmed decisions unless implementation reveals a real conflict.
- Ask one focused question at a time only when user input is genuinely needed.
- Distinguish decisions, assumptions, and verified results.
- Keep work action-oriented; do not restart lengthy discovery.
