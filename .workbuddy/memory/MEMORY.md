# 学习桌面项目 · 长期约定

## 学习计划单一来源（2026-08-16 起）
- **学习计划只维护网站 `index.html`**（由 `proxy_server.py` 静态托管，`http://192.168.103.37:8080/`），今后不再新建或更新 `01_考证/*.md`、`02_读博/*.md` 等 markdown 计划文件。
- 用户明确要求：今后所有计划改动都落到网站上，统一到单一来源。
- 2026-08-16 已执行「彻底单一来源」：删除 `01_考证/` 与 `02_读博/` 下全部 11 份计划 md（CDGA 复习/26周/每周材料/自测/自查/资料清单、DAMA 三级规划、数据开发排期；博士申请计划/推荐信/网址汇总），内容均已镜像在网站对应页面。
- 网站页面清单（2026-08-16 收尾合并后）：cdga-plan（半年复习规划）、cdga-daily（每日学习中心·单一自动路由入口，含 W1–W26 182 天打卡，按日期自动落 CDGA→软考→数据开发→CDGP 阶段）、cdga-check（自查清单）、cdga-quiz（自测题）、cdga-res（资料清单）、advanced-plan（三级进阶总规划 + 数据开发证书，tab 切换）、advanced-check（软考/数据开发/CDGP 自查清单，tab 切换）、phd（博士申请：计划/推荐信/网址，tab 切换）、cdga-news（推文精选）、cdga-sources（关注源）。
- **保留未删**：`资料/` 下的参考 md（备考笔记、免费备考路径、B站日程等）仍作站内资料阅读器源，不在"计划"范畴，保持不变。
- **Git 提交方式（已验证）**：仓库真实 `.git` 在 `D:/01_Projects/.git`（工作树根 `01_Projects`），git 正确解析到此仓库，AI 可正常 commit。只需 `cd /d/01_Projects/learningDesktop && git add index.html && git commit`（精确 add 单个文件，避免误带 `company_coding/dify` 等无关改动）。`learningDesktop/.git` 是被忽略的 stray 目录，不影响提交。
- 提交历史：2026-08-16 已首次将 learningDesktop/index.html 提交至 01_Projects 仓库（commit 5bb3eb0）。
