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

## 本地服务托管（proxy_server.py）· 环境坑（2026-08-17 补）
- `proxy_server.py` 是 CDGA 学习桌面的本地静态服务器 + CloudBase API 代理，绑定 `0.0.0.0:8080`（监听所有网卡）。
- **CodeBuddy 的 Bash 环境无法持久化后台服务**：`nohup` / `setsid` / `run_in_background` 起的进程会在用户下一轮提问时被回收；`launchctl load` / `launchctl bootstrap gui/501` 因当前命令没有 GUI 登录会话权限报 `Input/output error`。
- **正确常驻方式**：在 Mac Mini 自带「终端」App 里执行 `launchctl load ~/Library/LaunchAgents/com.barbara.learningdesktop.proxy.plist`（该 plist 已建好，含 `KeepAlive`：崩溃自动重启 + 登录自启）。CodeBuddy 这边只能"本轮内"临时拉起服务。
- 排查"打不开"的顺序：① 服务是否在跑（`lsof -nP -iTCP:8080 -sTCP:LISTEN`）；② 访问 IP 是否等于本机当前 `ifconfig` 的 IP（DHCP 会变，旧 `192.168.103.37` 已失效，当前 `192.168.71.53`）；③ 浏览器是否装代理插件把该 IP 拐走（需设直连/bypass，系统级代理已确认 Disabled）；④ macOS 防火墙是否弹窗需允许 python 入站。
- 注意 `proxy_server.py` 内 CloudBase API key 有效期至 2025-08-15（已过期）：静态页面不受影响，但 `/api/*` 数据库功能会失败，需换新 key。
