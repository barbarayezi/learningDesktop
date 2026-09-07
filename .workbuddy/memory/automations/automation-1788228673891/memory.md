# 自动化执行记忆：三项目「可删除垃圾」只读扫描

## 2026-09-07 首跑（只读，零改动）
- 对象：learningDesktop / literature / self_coding\sleep_traking 三个本地 git 仓库。
- 方法：find 匹配缓存/临时文件模式 + `git ls-files`/`git check-ignore` 排除已跟踪项，`git status --porcelain` + `git clean -ndX`（dry-run）交叉验证，未删除/移动/改名任何文件。
- 结论：总确定性可清理 ≈ 0.7 MB。仅 2 处实质项：
  1. learningDesktop `_shot_final.png`（505 KB，被 .gitignore:39 忽略的调试截图）；
  2. sleep_traking `__pycache__/`（150 KB，两个 .pyc）+ 若干运行时状态小文件（.logs/ 空目录、.active_port、.last_started）。
- 待确认项：sleep_traking `sleep_tracker.db`（156 KB，本地 SQLite，若 Turso 云端可完整恢复才建议删）。
- 重要发现（供下次参考）：
  - 3 仓库工作区均干净；literature 无任何确定性垃圾（PDF 等全部已跟踪）。
  - learningDesktop `landing-page/.wrangler/cache/{pages.json, wrangler-account.json}` 被误提交入库——按规则不算垃圾，但含 wrangler 账号缓存，建议日后移出版本库并加入 .gitignore（本次只读未动）。
  - 判定垃圾以「git 忽略 + 未跟踪」为准；`.workbuddy` 目录一律豁免（literature 的空目录全在其 backup 树下）。

## 2026-09-07 复跑（同日 17:00，只读，零改动）
- 与首跑相隔数小时后重扫：**三仓确定性可清理已归零**——learningDesktop `_shot_final.png` 已不存在（.gitignore:39 规则仍在）；sleep_traking 的 `__pycache__`/`.logs`/`.active_port`/`.last_started` 已被移入
  `.workbuddy/backup/junk-clean-20260907/`（今日某次清理会话所为，备份目录属豁免区）。
- 当前残留均非「确定性垃圾」：
  - 待确认：sleep_traking `sleep_tracker.db`（156 KB，本地 SQLite，云端可恢复才建议删）；`.env`（978 B，含密钥，保留并已忽略）。
  - literature：`.obsidian/workspace.json`（8.9 KB，可再生）、`.claude/settings.local.json`（94 B，本地偏好，不建议删）、`.claude/scheduled_tasks.lock`（90 B）——均为忽略的工具本地状态。
  - 附注（已跟踪非垃圾）：learningDesktop 根目录 `_check.js`/`_heat_test.html`/`bypass-open.html`/`idx.html`/`overview.md` 均已入库；
    sleep_traking 根目录 11 张调试 PNG（432 KB，dashboard_full/debug_*/fix_v*/rebrand/research_*）已入库，日后可评估移出版本库瘦身。
- 方法同首跑；另验证「判定前先查 git ls-files/git check-ignore」可防把已跟踪文件误报为垃圾。
