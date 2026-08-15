# MEMORY.md — 长期偏好与项目约定

## 用户备考方向（关键）
- 双线备考：**考证 = DAMA/CDGA 数据治理**；**考博 = 上海交大在职/工程博士（国内申请-考核制）**。
- 考博是**国内（交大）申请-考核制**：要考前套磁联系导师、要 2 封专家推荐信、看交大招生简章/复试线。
- **国外申博经验默认降级**：纯国外语境文章（英国/美国/香港博士招生、留服·境外学历认证等）不要混进每日核心学习流，归入「拓展·海外」可选分类。
  - 例外：**推荐信 / 套磁手艺文国内外通用**，必须保留在核心流（交大同样需要）。判定靠标题是否含强国外-system 信号，不含则视为通用手艺。

## 项目：公众号监控学习站
- 单文件静态 SPA：`index.html` + `资料/articles.js`(`window.ARTICLES`/`window.SOURCES`/`ARTICLES_UPDATED`)。`file://` 直接打开。
- 抓取：`资料/harvest_articles.py`（搜狗微信检索，关键词发现 + 账号定向跟踪 + `useful()` 精选 + `region_for()` 海外降级）。
- 自动更新：macOS launchd `com.barbara.dama-news.plist`，**每天 2 次（09:00 + 20:00）**。
- 全文：搜狗反爬，AI/WebFetch 逐字补（说「刷新全文」即补）；批量>2 篇易触发验证码。
- 关注源页「📡 关注源」展示 20 个被命中账号（考证10/考博10）。
- **GitHub**: `git@github.com:barbarayezi/learningDesktop.git` (main)。本机 `.gitignore` 排除 `.DS_Store / *.bak / __pycache__`。

## CDGA 学习站 · 信息架构原则
- **核心痛点**：用户说"东西太多，看了就忘"——captured ≠ surfaced ≠ reinforced。信息"放在那里"不等于被吸收。
- **去重**: 三页合一：`cdga-plan` 战略层 + 26 周明细(并入为 4.1/4.2/4.3 节) + `cdga-check` 原子清单。删独立 `cdga-weekly` 页（导航 / titles / GROUP 同步清理）。
- **主动投递**: 每日学习中心是每日唯一入口。每日展示「本周主题 + 3 个关键概念（按 WEEK_DOMAINS 映射到清单 checkbox）+ 复习提醒（spaced repetition 3/7/14/30/60/90 天）」。
- **清单设计**: `bb-cdga-check` = `{i: bool}`（兼容旧 schema）；新增 `bb-cdga-check-dates` = `{i: ISO-date}`（mastered_at）。勾选时记录，取消时删除。`setCheckState(i, checked)` 统一入口同步主页 checkbox + mastered_at。概念文本从 `#cdga-check` DOM 抽取，单一来源免维护。
- **新页面/导航**: 半年复习规划 + 知识点自查清单 + 每日学习中心 + 我的进度。**无**独立的 26 周页面。
