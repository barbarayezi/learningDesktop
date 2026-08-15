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
- **视频资源偏好**：每日中心的视频必须**由 AI 预先筛选成具体可点的 BV 链接**（按周/章节对应），**绝不能用"去 B站自己搜"的搜索链接糊弄**。用户原话："让我自己搜索选择视频吗？我还指望你帮我筛选呢"。兜底仅限冲刺周(W25/W26)的 `search` 链接。
- **微信公众号外链偏好（commit c65176c）**：文章卡片底部的「阅读原文」按钮**绝不能**直接指向 `weixin.sogou.com/link?url=...` 这类搜狗中转 URL——几天到几周就 404 显示「链接已过期」。必须改造为两条**确定可用**的路径：
  1. **「🔍 微信内搜」按钮**：`window.open('https://weixin.sogou.com/weixin?type=2&ie=utf8&query=' + encodeURIComponent(title))`，搜狗搜索 URL 本身永不过期。
  2. **「📋 复制出处」按钮**：`navigator.clipboard.writeText(url)` + 底部 toast。`file://` 下要兜底 `document.execCommand('copy')`。
  遇到推文卡片设计需求，按此模式，别再直接给 `<a>` 跳外链。

## 资料阅读器 · Markdown 渲染
- `.md` 文件**不能**直接做 `iframe.src`（浏览器当纯文本显示，可读性差）。
- 必须走 **`fetch + mdRender`** 链路：检测 `.md` 扩展名 → fetch → `mdRender()` → 注入 `#mdHost`。
- 渲染器：`mdEsc(s) / mdInline(s) / mdRender(md)`，自实现约 50 行无外部依赖，支持 GFM 表格/代码块/列表/引用/链接/粗斜体。失败自动 fallback 到 iframe。
- 样式全跟主题走，加载中/失败都有视觉反馈（`.md-loading` 旋转动画 + `.md-err`）。
- **⚠️ file:// fetch 陷阱**：Chrome 默认禁止 `file:// → file://` 的 `fetch()`（file origin 为 null）。这导致 `fetch(r.file)` 必然失败 → catch 走 iframe → 用户看到原始文本。
- **修复模式（单文件 SPA、file:// 部署）**：把要阅读的 `.md` 内容**内嵌**为 `<template id="mdSrc-{key}">…</template>`，`openReader` 优先读 `tpl.content.textContent` → `mdRender`，找不到再回退 fetch（保留 http/https 兼容路径）。新增 .md 资源时同步加 template。
- **Patch script 自检纪律**：用 Node 脚本 `s.replace()` 改文件后，**立刻** `node --check <extracted_script>`，不要相信肉眼。手抖错一个字符（典型：`()=>{` 写成 `()>{`）Node 报错位置往往指错行，bisect 反推 bug 行号不可靠；直接重写 diff 范围或 hex-diff 两个版本最快。

## 每日中心 · 今日目标 quiz 按钮
- **不要**在早阶段（`准备 / 通读 / 高分精学 / 中分精学 / 低分精学`）渲染高亮的 `🎯 全量刷题 92 题` 主按钮——视觉欺骗 + 数字吓人，会被截屏「这是啥意思，让我一天答完吗」。
- **正确模式**：早阶段只渲染 ghost 样式的「📖 看全部题（建立题感）」按钮 + `.dc-tip` 蓝色提示卡解释「本阶段无需强行作答，真正练习从 W21 开始」。
- 后期阶段（`刷题 / 冲刺`）才允许 practice 主按钮，**必须**叠加进度徽章 `[已答/总数]`，让用户知道这是多日累计。
- 进度数据源：`practice.answers`（localStorage key `cdga-quiz-progress-v1`）。统计 `Object.keys(answers).filter(k=>answers[k]).length`；单域按 `QUIZ.filter(q=>q.d===k)` 二次过滤。
- **数据-UI 失配警示**：同一 `domains:['all']` 字段在 W1/W24/W26 三个不同 stage 共用，UI **必须**按 stage 分流，不能一刀切。
- **自检纪律**：涉及 stage/分支判断的 patch，写完必须模拟 ≥3 种 stage 的真实数据验证，不能只看 `node --check` 语法 OK（commit 31c7ae4 第一次写反了 `!`，只能靠真数据抓出来）。
