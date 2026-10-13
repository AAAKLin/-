# Development Log

## Initial setup
- Created an initial documentation pack from product decisions discussed with the user.
- No code change, app startup, test execution, or deployment is asserted here.
- Next: inspect actual workspace, select a simple stack, build a working end-to-end first version.

## Entry template
### YYYY-MM-DD — Task title
- Goal:
- Files changed:
- Decisions/assumptions:
- Commands actually run:
- Tests and results:
- Evaluation performed:
- Known issues:
- Next step:

---

### 2026-10-13 — 第一版全栈实现（后端 + 前端 + 持久化 + 测试）
- Goal: 交付一个真正能跑的响应式 Web 应用，打通今日行动中心、训练、饮食、进度、持久化与基础测试。
- Files changed:
  - 新增后端：`server/`（config、logger、errors、middleware、db 迁移与种子、repositories、services、routes、app、index）。
  - 新增前端：`public/index.html`、`public/styles.css`、`public/js/`（api、dom、charts、components/foodPicker、views/home|training|diet|progress|settings、app）。
  - 新增测试：`tests/unit/*`（5 个文件）、`tests/integration/api.test.js`、`scripts/smoke.js`。
  - 新增配置：`package.json`、`.env.example`；`.gitignore` 增加 `data/`。
  - 文档更新：`docs/PROJECT_STATUS.md`、`docs/CHAT_HANDOFF.md`、本文件、`README.md`。
- Decisions/assumptions:
  - 存储选 Node 内置 `node:sqlite`（零依赖、文件落盘），数据库文件放 `data/` 并加入 .gitignore。
  - 前端零构建（原生 ES 模块 + 原生 CSS），降低维护成本，避免打包工具链。
  - 目标推算用 Mifflin-St Jeor + 活动系数 + 减脂缺口；蛋白 1.8 g/kg（减脂）、脂肪 0.8 g/kg、碳水补足且不低于 50 g；设置安全热量下限。
  - 训练调整为确定性规则（连续两次轻松→加量，连续吃力→减量，有不适→退阶并提示就医），不调用任何 AI。
  - 建议菜单与实际摄入记录严格分离，只有用户点"记到今天"才写入。
  - 演示数据接口只补充缺失日期，不做删除（避免破坏性操作）。
- Commands actually run:
  - `npm install`（安装 express）
  - `node server/index.js`（多次启动，含排障重启）
  - `curl` 校验 /health、/ready、/api/today、/api/training/plan、/api/diet/day、/api/progress/summary、/api/demo/load
  - `node --test "tests/**/*.test.js"`（57 项）
  - `npm run smoke`（8 项）
- Tests and results:
  - 单元测试 38 项：全部通过。过程中发现并修复 3 个真实缺陷（见下）。
  - 集成测试 19 项：全部通过。
  - 冒烟检查 8 项：全部通过。
- 实际修复的缺陷：
  1. 训练规则读取历史记录时用了数据库下划线字段名，而仓储层返回驼峰字段，导致"实际次数/时长"永远取不到 → 进阶/退阶判断失效。已改为同时兼容两种命名并统一为驼峰。
  2. 种子动作数据少了一列（组间休息），导致提示文案被写进休息秒数字段。已修正种子数据并重建数据库。
  3. 计划写入时 `sessionMinutes || 40` 把休息日的 0 分钟错误写成 40 分钟。已改为 `?? 40`。
  4. 食谱"是否估算值"判断读了下划线字段，导致估算标记失效。已修正。
  5. 备份恢复时 `PRAGMA foreign_keys = OFF` 写在事务内部无效，导致导入因外键约束失败。已移到事务外。
  6. 测试脚本用固定 2026-02 日期，与真实"今天"不在同一统计窗口，趋势统计为 0。已改为相对今天的日期。
- Evaluation performed: 本阶段未做 AI Evaluation（未接入任何 AI 能力）。软件测试与 AI Evaluation 分开，按要求不编造评估结果。
---

### 2026-10-13（第二部分）— 前端 UI 按 shadcn 风格改版 + API Key 安全机制 + 局域网访问
- Goal: ① 前端视觉升级到 shadcn/ui 观感；② 建立不经过对话的密钥配置机制；③ 支持手机在同一 WiFi 访问。
- Files changed:
  - `public/styles.css`：整体重写（620 行）。引入 shadcn 的 HSL 设计令牌体系（--primary/--muted/--accent/--border 等），主色改为近黑；新增深色主题（.dark）；Card/Button(5 种变体)/Badge/Progress/Input/Tabs/Dialog/Toast 全部按 shadcn 观感重做；细滚动条、focus ring、动效。
  - `public/index.html`：emoji 图标全部替换为内联 SVG sprite（lucide 风格线性图标）；新增主题切换按钮（太阳/月亮，localStorage 持久化 + 跟随系统，head 阶段初始化避免闪屏）。
  - `public/js/charts.js`：图表颜色支持主题自适应（深浅模式各一套明度），网格线/刻度改用 currentColor。
  - `public/js/views/progress.js`：图表改用 tone 语义色（blue/green）替代硬编码色值。
  - `server/config.js`：新增 AI 密钥解析（三种方式：AI_API_KEY 直填 / AI_API_KEY_FILE 文件路径 / AI_API_KEY_FILE_ENV 环境变量名→文件路径）；密钥本体不进 config 对象（防 console.log 泄露），只通过 getApiKey() 取用。
  - `server/routes/health.js`：新增 `GET /api/settings/ai-status` 自检接口，只返回是否已配置 + 来源 + 脱敏片段（前 2 后 2 位），绝不返回密钥原文。
  - `package.json`：start/dev 脚本加 `--env-file-if-exists=.env`（Node 22 内置，不引入 dotenv 依赖）。
  - `.env.example`、`.env`（本机）：补充 AI 密钥配置说明；HOST 改为 0.0.0.0 允许局域网访问。
  - `scripts/screenshot.cjs`：支持主题参数与禁用缓存；新增 `scripts/check-viewport.cjs`（布局溢出检查）。
- Decisions/assumptions:
  - **不引入真正的 shadcn/ui（React+Tailwind+Vite）**，因为那会把项目从"零构建"变成"必须构建"，与低成本、易维护、易上云的原则冲突；改为用原生 CSS 复刻其设计令牌与组件观感，视觉效果一致。
  - 密钥三选一的配置方式覆盖了"密钥文件路径已存在系统环境变量"的场景：用户只需告诉程序环境变量的**名字**，全程无需把密钥内容发给任何人（包括 AI）。
- Commands actually run:
  - node --test（57 项）、npm run smoke（8 项）
  - scripts/screenshot.cjs（浅色/深色/移动端逐页截图核验）
  - scripts/check-viewport.cjs（390px 视口溢出检查：scrollWidth==clientWidth，无溢出）
- Tests and results: 57 项测试全部通过；冒烟 8 项通过；截图核验浅色/深色/移动端全部正常。
- 排障记录（重要经验）：
  - 截图初看"按钮还是蓝色、侧边栏还是浅蓝"——先用 CDP 读取计算样式定位，发现页面实际处于**深色模式**（截图脚本上一轮写入的 localStorage 残留），新 CSS 早已生效；随后把截图脚本改为显式设置主题再刷新。
  - 多次出现 `EADDRINUSE 0.0.0.0:3100` 且 netstat/Get-NetTCPConnection 均查不到监听进程：沙箱内多次 run_in_background 启动的 npm 服务留下孤儿 node 进程，宿主侧网络工具不可见。解决：taskkill /F /IM node.exe 全部清理后重启。**经验：重启服务前必须确认端口真正空闲（curl 连不通才算），否则测到的是旧进程。**
- Known issues:
  - HOST=0.0.0.0 后同一 WiFi 内任何人都能访问（无登录密码），已在 .env 注释中提醒；公共网络请改回 127.0.0.1。
  - Windows 防火墙首次弹窗需点"允许"，否则手机仍连不上（README 已给出单端口放行命令）。
  - AI 接入目前只有"密钥管理与自检"，尚未有实际调用 AI 的功能（按 PRD 属后续迭代）。
- Next step: 用户确认环境变量名后填入 .env 的 AI_API_KEY_FILE_ENV；后续再做 AI 建议功能时直接用 getApiKey()。

---

### 2026-10-13（第三部分）— 手机访问体验闭环 + 文档补全
- Goal: 让用户不必记 IP、不必猜防火墙问题，直接看到手机能用的网址；并把"手机访问 / 技术栈 / API Key 机制"写进文档。
- Files changed:
  - `server/index.js`：新增 `listLanAddresses()`（读 `os.networkInterfaces()` 过滤内部地址）；启动横幅改为打印「本机访问 / 手机访问（局域网地址列表）/ 未开启时的提示 / 数据文件」。
  - `server/routes/health.js`：新增 `GET /api/settings/network`，返回 port、lanEnabled、localUrl、lanUrls、hint、securityNote。
  - `public/js/views/settings.js`：档案弹窗顶部新增「访问方式」区块，展示本机与手机地址（并行请求，接口失败时静默降级不阻塞弹窗）。
  - `public/styles.css`：新增 `code` 内联代码样式（等宽字体、muted 底色、`user-select:all` 便于整段复制网址）。
  - `README.md`：新增「手机访问（同一 WiFi）」（含防火墙放行命令与排查清单）、「技术栈」（前端/后端/测试分栏说明 + 为什么不用官方 shadcn）、「API Key 怎么给程序」三节。
  - 文档同步：`docs/PROJECT_STATUS.md`、`docs/DEVELOPMENT_LOG.md`、`docs/CHAT_HANDOFF.md`。
- Decisions/assumptions:
  - 启动横幅打印局域网地址优于让用户手动跑 `ipconfig`；同时保留接口与 UI 两处入口，覆盖"服务已启动但没看控制台"的场景。
  - 网络信息接口的失败不能阻断档案弹窗，故用 `.catch(() => null)` 降级。
- Commands actually run:
  - 清理孤儿进程后 `npm start`，确认启动横幅打印 `http://10.58.134.91:3100`
  - `curl /api/settings/network` → lanEnabled=true，返回 1 个局域网地址
  - `node --test "tests/**/*.test.js"` → 57 项通过；`npm run smoke` → 8 项通过
- Tests and results: 57 项测试全部通过；冒烟 8 项通过；network 接口返回正确。
- 排障记录：`npm start > log &`（非 background 模式）随工具调用结束被回收，导致后续 curl 报 ECONNREFUSED；改用后台常驻方式启动后正常。
- Next step: 用户在手机上实际打开 `http://10.58.134.91:3100` 验证（若连不上按 README 放行防火墙端口）。

---

### 2026-10-13（第四部分）— 发布上线（手机 WorkBuddy 可直接访问）
- Goal: 让项目脱离"只能本机预览"，通过 WorkBuddy 应用发布能力生成可分享的在线链接。
- Files changed:
  - `server/config.js`：HOST 默认值 127.0.0.1 → 0.0.0.0（云端平台只注入 PORT，默认绑本机会导致平台无法访问服务）。
  - `.env`：移除写死的 `PORT=3100`（避免覆盖平台注入的端口导致 EADDRINUSE/端口不匹配）。
  - `server/index.js`：启动横幅补充"绑定地址"与"未显式设 HOST 时的安全提示"。
  - `data/` 清理后重建：云端使用全新种子数据，不携带本机测试数据。
- Commands actually run:
  - `workbuddy_sites_deploy`（directory=项目根，language=node）→ 返回 shareLink，verified=true
  - `curl https://personal-fitness-manager.app.workbuddy.host/` → 200
  - `curl /health` → 200；`curl /api/today` → 返回正常 JSON
  - `scripts/screenshot.cjs` 截取线上首页 → 页面完整渲染（截图 `screenshots/online-home.png`）
- Tests and results: 发布前回归 57 项测试全部通过；发布后线上接口与页面实际验证通过。
- 部署前必修的两件事（经验）：
  1. `.env` 里不能写死 PORT——平台注入的 PORT 会被 .env 覆盖，服务监听错误端口。
  2. HOST 必须能绑 0.0.0.0——云端反向代理只能访问非 loopback 绑定。
- Known issues:
  - 云端与本地是两份独立 SQLite 数据库，数据不互通；云端库随重新发布会重置为上传时的内容。
  - 线上版本同样没有登录鉴权，链接等于公开访问，不要放进含隐私数据的场景。
- Next step: 在手机 WorkBuddy 中打开分享链接体验；确认是否需要把本地数据导出后导入线上（当前线上为种子数据）。

---

### 2026-10-13（第五部分）— 源码上传 GitHub（求职作品集）
- Goal: 把项目源码传到 GitHub 公开仓库，作为求职作品集；运行环境继续用已上线的云应用（GitHub Pages 无法运行 Express+SQLite，已向用户说明）。
- Files changed:
  - `.gitignore`：补齐 `.workbuddy/`、`.wbapp_*.genie`、`logs/`、`tmp/`；screenshots 改为白名单模式（`screenshots/*` + 3 行 `!` 例外，只放行 README 展示用的 3 张）。
  - `README.md`：新增在线体验链接块与 3 张运行截图（移动端/桌面浅色/桌面深色）。
  - 新增提交 `b6a4345`（76 文件 / 9606 行，首个完整版本）与 `008f397`（README 截图）。
- Commands actually run:
  - `git init -b main` → `git add -A` → 核对暂存清单（确认 .env/data/node_modules/.workbuddy 均被忽略，逐一 check-ignore 验证）→ commit
  - 关联 origin `https://github.com/AAAKLin/-.git`；沙箱内 git 访问 GitHub 报 CONNECT tunnel failed 502（代理限制），推送由用户在宿主机 PowerShell 执行
  - 用户执行 `git push -u origin main --force` 成功；GitHub API 复核：根目录 11 项（docs/public/scripts/server/tests + 配置文件），README 正常渲染
- Tests and results: 推送前 57 项测试 + 8 项冒烟全部通过；推送后经 GitHub API 实际验证文件完整。
- 排障记录（重要经验）：
  - 首次推送预计会失败：建仓时勾选 "Add a README file" 会让远程产生初始提交，本地推送属于非快进被拒。解决：`--force` 覆盖（远程仅空 README，无数据损失）。
  - 用户曾找不到项目文件夹：`C:\Users\肖坤林\.workbuddy\projects\...` 是 WorkBuddy 内部会话数据目录，与项目无关；项目真身在 `C:\Users\肖坤林\WorkBuddy\健身管理工具`（已用资源管理器帮用户直接弹出窗口）。
- Known issues:
  - 沙箱 git 无法直连 GitHub（502），后续推送仍需用户在宿主机终端执行；可先用 curl + GitHub API 验证结果。
- Next step: 用户执行第二条 push（截图提交 008f397）；GitHub 仓库 About 填 Website=在线 demo 链接；需要公网独立域名时可评估 Render 等平台（需用户同意）。

---

### 2026-10-13（第六部分）— 接入第一个 AI 功能：AI 教练建议（智谱 GLM）
- Goal: 把项目从"CRUD 应用"升级为"AI 应用"（求职作品集核心项）；同时验证"AI 挂了也不影响使用"的降级设计。
- Files changed:
  - `server/lib/aiClient.js`（新增）：OpenAI 兼容协议极简客户端，零第三方依赖（Node 内置 fetch + AbortController 超时）。错误分类为 6 种 code（NOT_CONFIGURED/TIMEOUT/NETWORK/AUTH/RATE_LIMIT/BAD_RESPONSE/SERVER），所有错误信息绝不含密钥原文。
  - `server/services/aiService.js`（新增）：复用 todayService.snapshot() 聚合数据 → 压缩成紧凑 JSON 载荷（日期/体重趋势/今日训练完成度/饮食达成/两周依从）→ 组装 system+user prompt 调用 GLM。**失败/未配置一律降级为规则建议（resolve 绝不 reject）**，调用方无感知。
  - `server/routes/today.js`：新增 `POST /api/today/ai-advice`，永远返回 200，body.source 标记 ai/rule 来源。
  - `server/config.js`：AI 配置补默认值（智谱 baseUrl `https://open.bigmodel.cn/api/paas/v4`、AI_TIMEOUT_MS=30000、AI_MAX_TOKENS=600）。
  - `public/js/views/home.js`：今日行动中心新增"AI 教练建议"卡片（首个），点击才调用（避免每次刷新烧额度），渲染来源标签（AI 生成/规则建议）+ 失败原因。
  - `.env.example`、`README.md`：AI 配置与功能说明更新。
- Decisions/assumptions:
  - **AI 只做增强不做依赖**：prompt 载荷只含当天汇总数据；未配密钥直接降级不发请求；调用失败降级到规则建议。这是产品第一设计原则的落地。
  - 选智谱 GLM：用户已有免费额度渠道；OpenAI 兼容协议意味着将来换任何服务商只改 baseUrl/model 两个配置。
  - 前端"点击生成"而非"自动生成"：免费额度有限，且建议不需要每次刷新都变。
- Commands actually run:
  - `node --test tests/unit/aiClient.test.js tests/unit/aiService.test.js` → 17 项通过（mock fetch 覆盖 401/429/500/超时/网络断/坏响应；降级链三路径全测）
  - `node --test "tests/**/*.test.js"` → **75 项全部通过**（57 旧 + 17 AI 单元 + 1 AI 集成）
  - 重启服务实测：`GET /api/settings/ai-status` → configured:false 且带 hint；`POST /api/today/ai-advice` → source:"rule" + reason"AI 未配置"，降级链路真实生效
  - CDP 截图首页 → "AI 教练建议"卡片正常渲染在首位（`screenshots/v3-ai-home.png`）
- 排障记录：
  - 首版 AI 单测有两个失败：未配置密钥时 aiService 在 fetch 之前就降级，导致 mock 的 chat 永不被调用。修正：测试用"清 require 缓存 + 注入假密钥"重新加载模块链，分别覆盖未配置/失败/成功三条路径。
  - aiClient 超时用例原本要等 30s：测试加载前设 `AI_TIMEOUT_MS=300` 压到 300ms。
- Known issues:
  - 用户此前设置的"密钥文件路径环境变量"经查不存在（用户级/机器级均无 KEY/API/GLM 相关变量），需要重设；真实 GLM 调用尚未在线上验证过（等用户配好密钥）。
  - 模型名 `glm-4.7-flash` 来自用户提供信息，若智谱控制台型号不同，改 .env 的 AI_MODEL 即可。
- Next step: 用户按 README 配置密钥 → 访问 ai-status 确认 configured:true → 在首页点"生成 AI 建议"验证真实调用；通过后把 AI 功能部署上线（重新发布）。
