#!/usr/bin/env node
/**
 * index.html 回归测试（零依赖，只用 node 内置 fs/vm/path）
 *
 * 用途：每次改完 index.html，本地跑一遍；GitHub Actions 部署前也会跑，
 *      任何一条断言失败 → exit 1 → 公网不会拿到坏代码。
 *
 * 跑法：node tests/regression.js
 *
 * ── 为什么需要它 ────────────────────────────────────────────────
 * index.html 是单一超大内联 <script>，任何顶层未捕获异常都会在该点中断脚本，
 * 导致热力图/每日学习卡/视频表等全部空白。历史上多次踩坑：
 *   - 2026-08-17 两次白屏（拦截器定义顺序、WEEKS 定义前访问 WEEKS）
 *   - 2026-09-03 git reset --mixed 把工作区回退，"已修复"的代码其实没上线
 * 靠 grep 特征串只能证明"部署了某个字符串"，证明不了"行为正确"。
 *
 * ── 踩过的 stub 坑（改本文件前先读，避免重踩）────────────────────
 *  1) fakeEl.querySelector 返回 null → 某些 init 会空引用崩溃 → 必须返回 fakeEl()
 *  2) window 必须有 addEventListener / removeEventListener / scrollTo
 *  3) GEN / DAILY_BY_ISO 等要挂成 sandbox 全局，不能只挂 window
 *  4) 顶层 const/let 绑定不会挂到 sandbox → 在 bundle 末尾追加导出语句才能取到
 *  5) 题库 domain 编码是中文（如「一、数据治理」），别用 D01 之类假编码
 *  6) 提取 <script> 时要用负前瞻排除 src=，否则外链 script 会把主脚本一起吞掉
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'index.html');

let failed = 0;
let passed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log('  ✅ ' + name);
  } else {
    failed++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log('  ❌ ' + name + (detail ? ' — ' + detail : ''));
  }
}
function group(title) {
  console.log('\n【' + title + '】');
}

// ───────────────────────── 1. 提取内联脚本 ─────────────────────────
group('1. 内联脚本提取与语法');

const html = fs.readFileSync(HTML, 'utf8');
// 负前瞻排除带 src= 的 <script>（否则外链 script 会把后面的主脚本一起吞进匹配）
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
const blocks = [];
let m;
while ((m = re.exec(html)) !== null) {
  const body = m[1];
  if (body && body.trim().length > 0) blocks.push(body);
}
ok('提取到内联脚本块', blocks.length >= 2, 'blocks=' + blocks.length);

const bundle = blocks.join('\n;\n');
ok('脚本总体积合理(>100KB)', bundle.length > 100 * 1024, bundle.length + ' bytes');

// 语法校验：编译但不执行
let script = null;
try {
  script = new vm.Script(bundle, { filename: 'index.html.inline.js' });
  ok('语法校验通过', true);
} catch (e) {
  ok('语法校验通过', false, e.message);
  // 语法都不过，后面没法跑，直接收尾
  summary();
}

// ─────────────────── 2. 静态结构检查（不执行也能查） ───────────────────
group('2. 启动骨架静态检查');

// boot() 只是把任务 push 进队列，必须有地方消费；否则所有初始化静默不执行 → 整页空白
ok('boot() 已定义', /function boot\(label,\s*fn\)/.test(html));
ok('safe() 已定义', /function safe\(label,\s*fn\)/.test(html));
ok('_bootTasks 队列已定义', /var _bootTasks\s*=\s*\[\]/.test(html));
ok('bootAll() 已定义', /async function bootAll\(\)/.test(html));
ok('bootAll() 被调用（否则 boot 队列永不执行）', /^bootAll\(\);/m.test(html));
ok('bootAll 内部消费了 _bootTasks', /_bootTasks\[i\]/.test(html));
ok('首屏遮罩 bootSplash 存在', /id="bootSplash"/.test(html));
ok('遮罩有超时兜底（主脚本崩了也能放行）', /bootSplash'\)[\s\S]{0,120}display\s*=\s*'none'/.test(html));

// 刷题列表缓存：_listKey 绝不能包含"已答集合"，否则答一题就重排 → 跳题
const listKeyBody = (html.match(/function _listKey\(\)\{[\s\S]*?\n\}/) || [''])[0];
ok('_listKey 存在', listKeyBody.length > 0);
ok('_listKey 不含 answeredCount（含则答一题就重排→跳题）',
  listKeyBody.length > 0 && !/answeredCount/.test(listKeyBody));
ok('openQuiz 进入时清列表缓存', /function openQuiz[\s\S]{0,900}_invalidateListCache\(\)/.test(html));

// ─────────────────── 3. VM 加载：顶层不得抛错 ───────────────────
group('3. VM 加载主脚本（顶层未捕获异常检测）');

const store = {};
const localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  clear: () => { for (const k in store) delete store[k]; },
  key: (i) => Object.keys(store)[i] || null,
  get length() { return Object.keys(store).length; },
};

const fakeEl = () => ({
  hidden: false, innerHTML: '', outerHTML: '', textContent: '', value: '', checked: false,
  style: {}, dataset: {}, offsetTop: 0, offsetHeight: 0, scrollTop: 0, children: [],
  classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
  setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
  addEventListener() {}, removeEventListener() {},
  // 坑 1：返回 null 会让部分 init 空引用崩溃，必须返回可链式访问的 stub
  querySelector() { return fakeEl(); },
  querySelectorAll() { return []; },
  appendChild() {}, insertBefore() {}, remove() {}, closest() { return null; },
  focus() {}, blur() {}, click() {}, scrollIntoView() {}, scrollTo() {}, getBoundingClientRect() {
    return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 };
  },
});

const document = {
  getElementById: () => fakeEl(),
  querySelector: () => fakeEl(),
  querySelectorAll: () => [],
  createElement: () => fakeEl(),
  createDocumentFragment: () => fakeEl(),
  addEventListener() {}, removeEventListener() {},
  body: fakeEl(), documentElement: fakeEl(), head: fakeEl(),
  readyState: 'complete', cookie: '',
};

const sandbox = {
  document, localStorage, console,
  alert: () => {}, confirm: () => true, prompt: () => null,
  setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: () => 0,
  fetch: () => Promise.reject(new Error('offline in test')),
  location: { href: 'http://localhost/', hash: '', search: '', reload() {} },
  navigator: { userAgent: 'node-test', onLine: false },
  Math, Date, JSON, Object, Array, String, Number, Boolean, Promise, Error,
  parseInt, parseFloat, isNaN, isFinite, Set, Map, WeakMap, RegExp, Symbol,
  encodeURIComponent, decodeURIComponent, escape: (s) => s, unescape: (s) => s,
  // 坑 3：这些要在 sandbox 顶层可见
  GEN: {}, DAILY_BY_ISO: {},
  showPage() {}, scrollTo() {}, open() {},
  addEventListener() {}, removeEventListener() {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.self = sandbox;

// 坑 4：顶层 const/let 不挂 sandbox，末尾追加导出语句把它们捞出来
const EXPORT_NAMES = [
  'QUIZ', 'practice', 'practiceList', 'openQuiz', '_invalidateListCache', '_listKey',
  'loadPractice', 'savePractice', 'LEITNER', 'WRONG_STORE', 'WRONG_REASONS',
  'addWrong', 'markWrongReview', 'markGraduate', 'setWrongReason',
  'wrongTodayList', 'loadWrongBook', 'saveWrongBook', '_todayISO', '_daysBetween',
];
const exportTail = '\n;globalThis.__X__ = {' +
  EXPORT_NAMES.map((n) => `get ${n}(){ try{ return ${n}; }catch(e){ return undefined; } }`).join(',') +
  '};\n';

let loadErr = null;
try {
  new vm.Script(bundle + exportTail, { filename: 'index.html.inline.js' })
    .runInNewContext(sandbox, { timeout: 30000 });
} catch (e) {
  loadErr = e;
}
ok('主脚本顶层加载无未捕获异常', loadErr === null, loadErr ? loadErr.message : '');

const X = sandbox.__X__ || {};
ok('导出关键符号成功', typeof X.practiceList === 'function' && Array.isArray(X.QUIZ),
  'practiceList=' + typeof X.practiceList + ' QUIZ=' + (Array.isArray(X.QUIZ) ? X.QUIZ.length : 'n/a'));

if (typeof X.practiceList !== 'function' || !Array.isArray(X.QUIZ)) {
  summary();
}

const QUIZ = X.QUIZ;
const practice = X.practice;

// ─────────────────── 4. 刷题列表行为断言 ───────────────────
group('4. 刷题列表：优先未答 + 一轮内不重排');

// 取一个题目数够多的真实域（domain 编码是中文，坑 5）
const domCount = {};
QUIZ.forEach((q) => { domCount[q.d] = (domCount[q.d] || 0) + 1; });
const dom = Object.keys(domCount).sort((a, b) => domCount[b] - domCount[a])[0];
ok('找到真实域用于测试', !!dom && domCount[dom] >= 10, 'dom=' + dom + ' n=' + domCount[dom]);

// 模拟：该域前 11 题已答过
const idxOfDom = QUIZ.map((q, i) => ({ q, i })).filter((t) => t.q.d === dom).map((t) => t.i);
practice.answers = {};
idxOfDom.slice(0, 11).forEach((i) => { practice.answers[i] = QUIZ[i].a; });
practice.antiRepeat = true;
practice.pickSize = 5;
practice.shuffle = true;
practice.finished = false;
practice.reviewSnapshot = null;

// 从入口进入（openQuiz 内部会 _invalidateListCache）
X.openQuiz(dom, 'practice');
const list1 = X.practiceList();
const answeredInList = list1.filter((t) => practice.answers[t.i] != null).length;
ok('进入刷题后列表非空', list1.length > 0, 'len=' + list1.length);
ok('进入刷题后已答题数 = 0（首题不再是做过的题）', answeredInList === 0,
  '已答 ' + answeredInList + '/' + list1.length);

// 答第 1 题后，列表顺序必须不变（否则会"答完就跳下一道，看不到本题反馈"）
const before = list1.map((t) => t.i).join(',');
const firstIdx = list1[0].i;
practice.answers[firstIdx] = QUIZ[firstIdx].a;   // 真实逻辑：答题不清缓存
const list2 = X.practiceList();
ok('答一题后列表顺序不变', list2.map((t) => t.i).join(',') === before,
  before + '  →  ' + list2.map((t) => t.i).join(','));
ok('点下一题仍落在原第 2 题', list2[1] && list2[1].i === list1[1].i);

// all 域也要优先未答
practice.answers = {};
QUIZ.slice(0, 30).forEach((q, i) => { practice.answers[i] = q.a; });
X.openQuiz('all', 'practice');
const listAll = X.practiceList();
ok('all 域同样优先未答', listAll.filter((t) => practice.answers[t.i] != null).length === 0,
  '已答 ' + listAll.filter((t) => practice.answers[t.i] != null).length + '/' + listAll.length);

// ─────────────────── 5. 错题本 Leitner 行为断言 ───────────────────
group('5. 错题本：收纳 / 升盒降盒 / 毕业');

ok('Leitner 间隔为 [1,2,4,8,16]', JSON.stringify(X.LEITNER) === '[1,2,4,8,16]', JSON.stringify(X.LEITNER));
ok('错因分类 4 类', Array.isArray(X.WRONG_REASONS) && X.WRONG_REASONS.length === 4);

localStorage.removeItem(X.WRONG_STORE);
const t = idxOfDom[0];
X.addWrong(t);
let wb = X.loadWrongBook();
ok('答错自动收录进错题本', !!wb[t], JSON.stringify(wb[t] || null));
ok('新收录进盒 1', wb[t] && wb[t].box === 1);
ok('新收录未毕业', wb[t] && wb[t].graduated === false);

X.markWrongReview(t, true);
wb = X.loadWrongBook();
ok('复习答对 → 升到盒 2', wb[t].box === 2, 'box=' + wb[t].box);
ok('复习答对 → streak=1', wb[t].streakCorrect === 1);

X.markWrongReview(t, false);
wb = X.loadWrongBook();
ok('复习答错 → 回盒 1', wb[t].box === 1, 'box=' + wb[t].box);
ok('复习答错 → streak 归零', wb[t].streakCorrect === 0);

X.markWrongReview(t, true);
X.markWrongReview(t, true);
X.markWrongReview(t, true);
wb = X.loadWrongBook();
ok('连续答对 3 次 → 毕业', wb[t].graduated === true, 'streak=' + wb[t].streakCorrect);

// 毕业后不应再出现在今日待复习
const todayIds = X.wrongTodayList().map((x) => x.i);
ok('毕业题不再进入今日待复习', !todayIds.includes(t), 'today=' + JSON.stringify(todayIds));

X.setWrongReason(t, 'concept');
wb = X.loadWrongBook();
ok('错因可标注', wb[t].reason === 'concept', 'reason=' + wb[t].reason);

// ─────────────────── 收尾 ───────────────────
summary();

function summary() {
  console.log('\n' + '─'.repeat(52));
  if (failed === 0) {
    console.log(`✅ 全部通过：${passed} 项断言`);
    process.exit(0);
  } else {
    console.log(`❌ 失败 ${failed} 项 / 通过 ${passed} 项`);
    failures.forEach((f) => console.log('   · ' + f));
    console.log('\n⛔ 回归测试未通过 —— 不要提交，更不要部署。');
    process.exit(1);
  }
}
