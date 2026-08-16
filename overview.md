# 修复概览：学习桌面「打不开」+ 热力图消失

## 问题演进
1. 第一次反馈：每日学习中心热力图空白、统计全 0（页面能开，但热力图没渲染）。
2. 第二次反馈：整个站 http://192.168.103.37:8080/ 「打不开」（白屏）。

## 真正的根因（已更正）
主 inline script 在顶层 IIFE `initPhdPath()` → `updatePhdProgress()` 处抛
`TypeError: aAll.filter is not a function`。

`document.querySelectorAll()` 返回的是 **NodeList**，它**没有 `.filter()` 方法**
（只有 `forEach`）。代码对 `all` 用了正确的 `[...all].filter()`，却对
`aAll/bAll/cAll` 直接 `.filter()`（原第 2889–2894 行）——在**所有浏览器**都会抛错。

由于这是主脚本顶层抛错，整段脚本中断执行，`buildHeat()` / `refreshHeat()` /
`showPage('daily')` 全部不运行 → 默认页面拿不到 `.active` → 白屏（页面所有
`.page` 默认 `display:none`，靠 JS 显形）。

> ⚠️ 此前（commit 6f3f530）误判为 `localStorage.removeItem.bind` 问题并加了
> polyfill。真实浏览器里 localStorage 是完整的，polyfill 直接 return、根本不触发，
> 所以该 polyfill 并未解决真因（现作为无害兜底保留）。

## 端口冲突（加剧「打不开」的副因）
同一台机器上 8080 被**两个** proxy_server.py 同时监听（用户原有 2876 + 本会话
误启动 31104），OS 在两个 socket 间随机分派连接 → 访问时好时坏。已 kill 掉
多余的 31104，现仅 2876 单一监听。

## 修复（commit 50fa596，已推送 main）
- `[...aAll].filter` / `[...bAll].filter` / `[...cAll].filter` 先展开为数组再用 filter
- 清掉调试残留：`buildHeat` 里的 `console.log` 与 `background:#fff000` 黄色底

## 验证
用 jsdom 加载**线上真实页面**复现并验证：
- 修复前：heatGrid 子元素 0 格、脚本中途抛 `aAll.filter is not a function`
- 修复后：heatGrid 生成 **182 格**、默认页 `.active=1`、无 uncaught 错误、黄色底消失
- 端口：仅 1 个监听，连续请求稳定 HTTP 200，线上返回含修复的最新版

## 提交记录
- `50fa596` 修复 NodeList.filter 崩溃 + 清调试残留
- `6f3f530` localStorage polyfill（无害兜底，保留）
- `33b5a9a` 记忆更正

## 后续
刷新浏览器即可看到热力图与数据恢复。这类「静态 HTML + JS 渲染」站点的白屏，
排查时优先看「靠 JS 显形」的 CSS（如 `.page{display:none}`）+ 用 jsdom 跑真实
页面抓运行期崩溃，比 `node --check` 只查语法更有效。
