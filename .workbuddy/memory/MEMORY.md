# 学习桌面项目 · 长期约定

## 🔴 改动交付铁律（2026-09-03 立，最高优先级）
起因：9-03 发现「已修复并推送」的刷题 bug 其实没上线——git 仓库损坏后我用
`git reset --mixed FETCH_HEAD` 恢复，把工作区 index.html 回退到旧版本，
而"去掉 `_listKey` 里 answeredCount"的关键编辑就此丢失。只靠 `curl | grep 特征串`
验证部署，只能证明"某字符串在公网上"，证明不了"行为正确"。

**四道防线，缺一不可：**
1. **回归测试是唯一验收标准**：改完 index.html 必须跑
   `node tests/regression.js`（零依赖，34+ 断言）。绿灯才允许 commit。
   覆盖：内联脚本语法 / 启动骨架完整性 / 刷题列表优先未答且一轮内不重排 /
   错题本 Leitner 升降盒与毕业。**不要再写用完就删的临时测试脚本**，
   要加断言就加进 `tests/regression.js`。
2. **CI 质量闸门**：`deploy.yml` 在部署前跑同一份测试，失败即 `exit 1` 中止，
   公网永远拿不到坏代码。（`tests/` 已加入部署前 `rm -rf` 清单，不上公网。）
3. **git 危险操作后必须复核改动是否还在**：凡执行
   `reset` / `checkout --` / `stash pop` / 仓库重建 / `pull --rebase` 后，
   立刻 `git diff HEAD -- index.html` + grep 关键特征，确认自己的编辑没被回退，
   再继续。**这条是 9-03 翻车的直接原因。**
4. **"已修复"的措辞门槛**：只有在「测试绿灯 + Actions `conclusion=success` +
   **三方哈希相等**」三者齐备后，才能对用户说已修复。
   把"我以为改好了"说成"已修复"是 8-21、9-03 两次翻车的共同主因。

**✅ 首选验收手段：三方哈希比对**（2026-09-03 加，取代"grep 特征串"作为主证据）
```bash
md5sum index.html                     # 本地工作区
git show HEAD:index.html | md5sum     # 已提交版本
curl -s <公网>/index.html | md5sum    # 线上版本
```
三者全等即字节级证明「我改的那份就是线上跑的那份」。
grep 只能证明"某字符串存在于公网"，无法证明整份文件是新的——这正是两次假修复的漏检点。

**⚠️ 断言用错特征串会造成虚警**：9-03 曾用 `wb-review-today`、`BOX_DAYS` 断言错题本，
公网计数 0 一度误判漏部署，回查本地也是 0（记错了类名）。
**断言前先在本地 grep 确认该特征真实存在**，否则"公网=0"无法区分"漏部署"与"写错串"。

**核验远程仓库文件内容**：`raw.githubusercontent.com` 在本沙箱被拦（200 但 body 空），
`api.github.com/contents` 会 403 限流。**用 `git show origin/main:<path>`**——
读 fetch 下来的远程真实对象，可靠且不受限流。
比对文件身份用 `git rev-parse origin/main:<path>` vs `git hash-object <path>`。

**受控崩溃测试**：新增断言后要验证它真能变红（例如临时注释 `bootAll();`
跑一遍应报错），否则测试可能是永远绿的假警报。

## 单一来源：学习计划只维护 `index.html`
- 所有计划改动落到网站，**不再新建/更新 `01_考证/*.md`、`02_读博/*.md`**
  （8-16 已删除全部 11 份计划 md，内容已镜像进网站页面）。
- 保留 `资料/` 下参考 md（备考笔记、免费备考路径、B站日程等），作站内资料阅读器源。
- 页面清单：`cdga-daily`（每日学习中心·唯一自动路由入口，W1–W26 共 182 天打卡，
  按日期自动落 CDGA→软考→数据开发→CDGP 阶段；顶部含可折叠「26周复习路线图」）、
  `cdga-check`（自查清单）、`cdga-quiz`（自测/刷题/错题本/外部题库 四模式）、
  `cdga-res`（资料与资讯中心，tab：资料清单/推文精选/关注源）、
  `advanced-plan`、`advanced-check`、`phd`。
  `cdga-plan`（完整备考百科）不在侧边栏，由每日中心折叠区按钮跳转可达。

## Git 仓库
- `learningDesktop` 是**独立 git 仓库**，`origin = git@github.com:barbarayezi/learningDesktop.git`（SSH）。
- 日常：仓库内直接 `git add -A && git commit && git push`（已配 tracking origin/main）。
- ⚠️ 上层 `01_Projects` 仓库仍跟踪着这些文件，存在嵌套仓库冲突。
  建议在 `01_Projects` 执行 `git rm --cached -r learningDesktop` 或加 .gitignore 解除跟踪。
- ⚠️ **本机 git 环境不稳定**：曾出现 `.git/refs` 与 pack 数据文件丢失导致
  「不是仓库」。恢复路径：`git init -b main` → `git remote add origin` →
  `git fetch origin main` → `git reset --mixed FETCH_HEAD`（**注意 `--soft` 不动索引，
  会把全部文件误判为删除，必须用 `--mixed`**）→ 然后立刻执行上面铁律第 3 条复核。

## 公网部署（CloudBase 静态托管 + GitHub Actions）
- 公网地址 `https://test-d5gf0o9ky7d34beaf-1469471831.tcloudbaseapp.com/`，
  serve 的就是仓库里的 `index.html`。
- **⚠️ envId 真实值 = `test-d5gf0o9ky7d34beaf`（无后缀）**。域名里的 `-1469471831`
  是默认域名后缀，**不属于 envId**；误传会让 `DescribeStaticStore` 报 `InvalidParameter`。
- `.github/workflows/deploy.yml` 在 push 到 main 且命中
  `index.html` / `资料/**` / `articles.js` / `tests/**` / 工作流本身时触发。
  步骤：checkout → setup-node → **回归测试闸门** → 补根目录 articles.js →
  删除非站点文件 → 装 `@cloudbase/cli` → 校验 Secrets → `tcb login` → `tcb hosting deploy`。
- 关键命令：`tcb login --apiKeyId $TCB_SECRET_ID --apiKey $TCB_SECRET_KEY` →
  `tcb hosting deploy . --env-id $TCB_ENV_ID --yes`。
  **环境参数必须用 `--env-id`**（`-e` 不被 hosting 子命令识别）。
- Secrets 名（一字不差）：`TCB_SECRET_ID`、`TCB_SECRET_KEY`（已配好并验证）。
- 部署前 `rm -rf` 清单含 `.git .github .workbuddy tests proxy_server.py`
  `cloudbase-sync-proxy landing-page cloudbaserc.json` 等——含密钥的后端文件绝不上公网。
- 工作流会把 `资料/articles.js` 复制到根目录（index.html 引用根目录版本），防「资讯」tab 404。
- **本机 Windows 未 `tcb login`**（沙箱无法完成浏览器交互），公网部署一律走 Actions。
- 验收：轮询 `GET /repos/barbarayezi/learningDesktop/actions/runs?per_page=1`
  确认 `conclusion=success`，再 curl 公网做**双向断言**。
  ⚠️ 轮询别写长 for 循环（会触发沙箱资源限制），单次查询即可。

## 云同步架构（2026-09-01 起：Cloudflare Worker）
- **背景**：CloudBase 账户欠费 → 云函数 `syncProxy` 被冻结
  （`InsufficientBalance`），静态托管不受影响。云函数挂 → `cloudReady=false`
  → localStorage 拦截器 `if(!cloudReady) return` 只写本地不上云 → 换设备看不到打卡。
- **现方案**：`cloudflare-sync-proxy/worker.js`（worker 名 `learningdesktop-sync-proxy`）
  转发到 `https://test-d5gf0o9ky7d34beaf.api.tcloudbasegateway.com`，
  服务端注入 `apikey` + `Authorization: Bearer`，密钥走
  `wrangler secret put CLOUDBASE_SERVICE_KEY`（**严禁写入仓库**）。
- 部署：`cd cloudflare-sync-proxy && npx wrangler login && npx wrangler deploy`，
  或 Dashboard 粘贴 worker.js + 加 Secret。
- `index.html` 的 `SYNC_PROXY_URL` 填入 worker 地址后，任意设备直连同步，
  不依赖家里 Mac、也绕开 CloudBase 欠费；置空 `""` 则回退同源 `/api` 局域网模式。
- **安全**：service_role 是项目全权限密钥，仓库为 public，绝不能明文提交。

## 本地服务（proxy_server.py）
- 本地静态服务器 + CloudBase API 代理，绑定 `0.0.0.0:8080`。
- **CodeBuddy Bash 环境无法持久化后台服务**（nohup/setsid/run_in_background 起的进程
  下一轮会被回收；launchctl 无 GUI 会话权限）。常驻需在 Mac 自带终端执行
  `launchctl load ~/Library/LaunchAgents/com.barbara.learningdesktop.proxy.plist`。
- 打不开的排查顺序：① 服务在跑吗（`lsof -nP -iTCP:8080 -sTCP:LISTEN`）；
  ② 访问 IP 是否等于当前 `ifconfig` 的 IP（**DHCP 会变**，别用记忆里的旧 IP）；
  ③ 浏览器代理插件是否劫持；④ macOS 防火墙是否需允许 python 入站。

## 前端渲染铁律 —— 不让单点错误整页空白
- `index.html` 是单一超大内联 `<script>`，**任何顶层未捕获异常都会在该点中断脚本**，
  导致热力图、每日学习卡、B站视频表等全部空白。
- 历史白屏教训：① 拦截器定义放到了使用点之后；② 在 `const WEEKS` 定义前
  执行了访问 `WEEKS` 的 IIFE。
- **当前机制（已从 `safe()` 演进为 `boot()` 队列）**：
  `boot(label, fn)` 把启动任务 push 进 `_bootTasks`，文件末尾 `bootAll()`
  在 `bootSplash` 遮罩下逐个执行并单独 try/catch；`safe(label, fn)` 仍保留作即时包裹。
  **⚠️ `boot()` 只入队，必须有 `bootAll()` 消费——漏调则所有初始化静默不执行、整页空白。
  这条已写成 `tests/regression.js` 的断言。**
- 首屏遮罩有 15s 超时兜底：主脚本崩了也会放行，不会永久卡在 loading。
- `reportErr()` 在页面底部生成红色横幅列出出错模块，其它模块继续渲染。
- 新增 boot 点时先自问：「这段抛错会不会中断后面整个脚本」。

## 刷题 / 错题本 数据模型
- 刷题列表缓存：`_listKey` 由「日期+域+来源+seed+pickSize+shuffle+antiRepeat」组成，
  **刻意不含"已答集合"**——一轮内列表固定，答一题不重排，避免"答完就跳下一道、
  看不到本题反馈"。只在 `openQuiz` 进入、切模式、重置时 `_invalidateListCache()`。
- 错题本 `cdga-wrong-book-v1`：每题存
  `wrongAt/wrongCount/box/lastReview/reviewCount/streakCorrect/reason/graduated`。
  Leitner 五盒间隔 `[1,2,4,8,16]` 天；答对升盒、答错回盒 1、**连续做对 3 次毕业**移出。
  错因 4 类：概念不清 / 粗心跳步 / 审题失误 / 时间不足。
- 复习 session 用 `practice.reviewSnapshot` 固定题目集，避免复习中升盒导致列表缩短错位。

## CDGA 清单「题面/答案」盲测数据模型
- `#cdga-check .chk-row span` 统一 **一条一括号**：括号前=题面，括号内=答案本体
  （一条最多一组括号，答案文本内禁止再出现括号字符）。
- **标签（必考/重点/高频）禁止进括号**，改用 `必考点｜` 前缀或直接删除。
- **不增删 `.chk-row`、保持索引顺序**（勾选状态按索引存 localStorage，会错位）；
  新增概念只能插在索引尾部。清单结构变更需配 schema 版本号做幂等迁移（见 `loadChecks` v2）。
- 写入清单前先自问「这条怎么盲测？答案是什么」，避免「答案：必考」这类把标签当答案的 bug。
