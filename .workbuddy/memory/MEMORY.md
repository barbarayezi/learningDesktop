# 学习桌面项目 · 长期约定

## 学习计划单一来源（2026-08-16 起）
- **学习计划只维护网站 `index.html`**（由 `proxy_server.py` 静态托管，本机访问 `http://localhost:8080/` 或局域网 `http://192.168.71.53:8080/`——**IP 随 WiFi/DHCP 变化，以 `ifconfig` 实际为准**），今后不再新建或更新 `01_考证/*.md`、`02_读博/*.md` 等 markdown 计划文件。
- 用户明确要求：今后所有计划改动都落到网站上，统一到单一来源。
- 2026-08-16 已执行「彻底单一来源」：删除 `01_考证/` 与 `02_读博/` 下全部 11 份计划 md（CDGA 复习/26周/每周材料/自测/自查/资料清单、DAMA 三级规划、数据开发排期；博士申请计划/推荐信/网址汇总），内容均已镜像在网站对应页面。
- 网站页面清单（2026-08-16 最终版）：cdga-daily（每日学习中心·单一自动路由入口，含 W1–W26 182 天打卡，按日期自动落 CDGA→软考→数据开发→CDGP 阶段；**顶部新增可折叠「CDGA 半年复习路线图」（26周逐周明细），原 cdga-plan 的"阶段路线图+逐周明细"已合并到此**）、cdga-check（自查清单）、cdga-quiz（自测题）、cdga-res（**资料与资讯中心**，tab 切换：📥 资料获取清单 / 📰 公众号推文精选 / 📡 关注源，原 cdga-news、cdga-sources 已并入）、advanced-plan（三级进阶总规划 + 数据开发证书，tab 切换）、advanced-check（软考/数据开发/CDGP 自查清单，tab 切换）、phd（博士申请：计划/推荐信/网址，tab 切换）。**cdga-plan 已不再是侧边栏独立入口**：完整备考百科内容（考试全貌/17知识域权重/拿分基本盘/项目经验映射/避坑失分点/里程碑自检）仍保留在 section#cdga-plan，由每日中心折叠区「📖 看完整备考百科 →」按钮跳转可达。
- **保留未删**：`资料/` 下的参考 md（备考笔记、免费备考路径、B站日程等）仍作站内资料阅读器源，不在"计划"范畴，保持不变。
- **Git 仓库结构（2026-08-16 变更）**：`learningDesktop` 现在是**独立 git 仓库**，自带 `.git`，`origin = git@github.com:barbarayezi/learningDesktop.git`（SSH）。注意：今天早些时候曾误把 learningDesktop/index.html 提交到上层 `01_Projects` 仓库（commit 5bb3eb0、313d3a8），后已把 learningDesktop 独立化为仓库并推送 `3925820` 到 GitHub main（删除 11 份 md 的单一来源收尾也一并上线）。上层 `01_Projects` 仓库仍把这些文件当它的跟踪对象，存在嵌套仓库冲突——建议后续在 `01_Projects` 用 `git rm --cached -r learningDesktop`（或加 .gitignore）解除跟踪，避免 git 把 learningDesktop 当 gitlink 报错。
- **提交方式**：在 learningDesktop 内直接 `git add -A && git commit && git push`（已配 tracking origin/main）。日常改 index.html 后直接 commit+push，无需再走 01_Projects。
- 提交历史：2026-08-16 将学习桌面独立化为 git 仓库并推送 GitHub（main = 3925820）。

## 公网部署（CloudBase 静态网站托管，2026-08-25 厘清并修通）
- 公网地址 `https://test-d5gf0o9ky7d34beaf-1469471831.tcloudbaseapp.com/`，即 CloudBase 静态网站托管，serve 的就是仓库里的 `index.html`（与本地/proxy 同源同文件）。
  - **⚠️ envId 真实值 = `test-d5gf0o9ky7d34beaf`（无后缀）**。公网默认域名里的 `-1469471831` 是 CloudBase 默认域名后缀（来自 appId/uin），**不属于 envId**。过去多次把域名后缀当 envId 传入，导致 `DescribeStaticStore` 报 `InvalidParameter`。**权威 envId 以 `tcb env list` 实测为准**（该密钥可见环境即 `test-d5gf0o9ky7d34beaf`，状态 Normal，region ap-shanghai）。
- **GitHub Actions 自动部署**：`.github/workflows/deploy.yml` 在 `push` 到 `main` 且改动命中 `index.html` / `资料/**` / `articles.js` / 工作流本身时自动部署。
  - **🔴 历史坑（2026-08-21→08-25）**：最初用 `TencentCloudBase/cloudbase-action@v1`（node12），在 GitHub node24 runner 上登录失败「无有效身份信息」；中间一度误把域名后缀塞进 envId 又引出 `DescribeStaticStore: InvalidParameter`；并曾误以为 Secrets 没配。
  - **✅ 2026-08-25 修好并首次 success（run 29, commit `01dc60b`）**：部署步骤改为**腾讯云官方 CLI**——`npm i -g @cloudbase/cli` → `tcb login --apiKeyId $TCB_SECRET_ID --apiKey $TCB_SECRET_KEY` → `tcb env use $TCB_ENV_ID` → `tcb hosting deploy . --env-id $TCB_ENV_ID --yes`。环境参数必须用 `--env-id`（tcb V3 全局选项），`-e` 不被 hosting 子命令识别。
  - **Secrets 名（一字不差）**：`TCB_SECRET_ID`、`TCB_SECRET_KEY`（用户已在仓库 Settings → Secrets → Actions 配好，2026-08-25 验证 Pre-check 通过）。密钥为子账号 CAM 密钥，对该 envId 有 CloudBase 权限（env list/use/hosting 均通）。
  - 工作流部署前 `rm -rf`：`.git .github .workbuddy proxy_server.py cloudbase-sync-proxy landing-page Find overview.md node_modules 资料/harvest_articles.py cloudbaserc.json`，确保含 service_role 密钥的后端文件**绝不上公网**（cloudbaserc.json 含错误短版 envId，一并删掉、改用 --env-id 显式指定）。
  - 工作流会把 `资料/articles.js` 复制到根目录 `articles.js`（因 `index.html` 引用根目录 articles.js，但仓库里它在 `资料/` 下），保证公网「资讯」tab 不 404。
  - 手动部署兜底（需本机 `tcb login` 已登录）：`tcb hosting deploy . -e test-d5gf0o9ky7d34beaf --yes`。
- **安全提醒**：CAM 的 `TCB_SECRET_KEY` 是账号级密钥，仓库为 public，切勿明文提交；建议子账号最小权限。proxy_server.py / cloudbase-sync-proxy 仍属后端，工作流已排除。
- **当前工作机（Windows）tcb 未登录**：沙箱无法完成 `tcb login` 浏览器交互，本机不能直接 deploy；公网部署走 GitHub Actions 即可（2026-08-25 实测 `tcb env list` 通过 CI 正常返回，确认密钥有效）。
- 是否生效的验证：`curl -s 公网URL | grep 特征串`；Ch12 链接修复后公网应出现 `BV14t4y1Z7Hg`、消失 `BV1p5mEBkESv`；更严：确认公网上存在 `资料/03_机构免费资料/*.pdf` 等 ≥5 个子目录文件，仅 index.html 200 不能算通。
- **「Actions 已配」验收铁律**：任何改动 deploy.yml / 加 secrets / 改 push 路径后，必须在同回合**轮询 GitHub Actions API**（GET `/actions/runs?per_page=1`）确认 `conclusion=success`，再写「已配好」。记忆陷阱：把「我以为配了」写成「已配好」是 8-21 翻车主因。

## 本地服务托管（proxy_server.py）· 环境坑（2026-08-17 补）
- `proxy_server.py` 是 CDGA 学习桌面的本地静态服务器 + CloudBase API 代理，绑定 `0.0.0.0:8080`（监听所有网卡）。
- **CodeBuddy 的 Bash 环境无法持久化后台服务**：`nohup` / `setsid` / `run_in_background` 起的进程会在用户下一轮提问时被回收；`launchctl load` / `launchctl bootstrap gui/501` 因当前命令没有 GUI 登录会话权限报 `Input/output error`。
- **正确常驻方式**：在 Mac Mini 自带「终端」App 里执行 `launchctl load ~/Library/LaunchAgents/com.barbara.learningdesktop.proxy.plist`（该 plist 已建好，含 `KeepAlive`：崩溃自动重启 + 登录自启）。CodeBuddy 这边只能"本轮内"临时拉起服务。
- 排查"打不开"的顺序：① 服务是否在跑（`lsof -nP -iTCP:8080 -sTCP:LISTEN`）；② 访问 IP 是否等于本机当前 `ifconfig` 的 IP（DHCP 会变，旧 `192.168.103.37` 已失效，当前 `192.168.71.53`）；③ 浏览器是否装代理插件把该 IP 拐走（需设直连/bypass，系统级代理已确认 Disabled）；④ macOS 防火墙是否弹窗需允许 python 入站。
- **跨设备云同步根因与修复（2026-08-18 定案）**：旧 `CLOUDBASE_KEY` 是一把 API-key JWT，有效期仅 1 小时且 `exp=2025-08-16 01:00Z`（已过期一年）；更致命的是 `proxy_request` **从没把密钥注入**转发请求 → 网关收不到凭证 → 匿名登录失败 → `cloudReady=false` → `localStorage.setItem` 拦截器 `if(!cloudReady) return` 导致数据**从不上报云端**，所以各设备各存各的 localStorage、互不连通。
- **修复（commit `65e7d40`）**：① 换成用户从 CloudBase 控制台新生成的 **service_role 密钥**（`role=service_role`、永不过期 `exp=9999`、绕过 RLS）；② `proxy_request` 现在对**每次 `/api/*` 请求强制注入** `apikey: <KEY>` 与 `Authorization: Bearer <KEY>`（浏览器不持有密钥，服务端统一鉴权）；③ `index.html` 的 `initCloud` 改为「匿名登录失败不阻断，只要云端 select 通就 `cloudReady=true`」。
- **已验证**：本地起测试代理(127.0.0.1:8099)对真实 CloudBase 网关跑通 GET 200（云端 `user_data` 表里**已有用户真实数据**：`cdga-daily-checks` 含 `2026-08-15/16/17` 打卡，说明历史进度没丢）/ upsert 201 / select 200 / delete 204。
- **生效前提（关键）**：运行中的服务器(`192.168.103.37:8080`)仍跑旧代码，**必须在该机 `git pull` 并重启 `proxy_server.py`** 修复才生效；重启后 `cloudReady` 变 true，云端已有数据会合并回本地、后续写入会上云。
- **安全提醒**：service_role 是项目全权限密钥，现硬编码在 git 跟踪的 `proxy_server.py` 中；若仓库为 public，应改为环境变量/`config.json`(gitignore) 或轮换密钥。

## 前端渲染铁律 —— 不再让单点错误整页空白（2026-08-17 立）
- 本项目 `index.html` 是单一超大 `<script>` 文件。任何顶层未捕获异常都会在该点中断脚本，导致**热力图、每日学习卡、B站视频表等全部空白**。
- 血的教训（2026-08-17 晚两次白屏）：① 把 `_origSetItem` 拦截器定义放到 `initCloud` 之后；② 在 `const WEEKS` 定义之前立即执行访问 `WEEKS` 的 IIFE。
- **从今以后的原则**：所有「启动期」调用/事件绑定/DOM 初始化必须走 `safe(label, fn)`；新增任何 boot 点时，先问自己「如果这段抛错，会不会中断后面整个脚本」。
- 当前已加固的入口（2026-08-17 最终）：`initCloud` 自含 try/catch；主题切换、阶段导航条、侧边栏、搜索、日期/周切换、热力图、今日学习卡、B站视频表、资讯、关注源、`initChecks`/`initLadder`/`initPhdPath`/`initDataDev` 均已 `safe()` 隔离。
- 错误展示：`reportErr()` 会在页面底部生成固定红色横幅，列出出错的子模块及调用栈，其它模块继续正常渲染。
- 验证方法：每次改动后用 Chrome headless 截图（`--window-size=1280,2600`）确认 ① 无底部红条；② 热力图、今日学习卡、B站视频表、侧边栏均可见。必要时做受控崩溃测试（临时在某函数首行 `throw`）。
