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
// 已知欠债：不阻断部署，但会打印出来，避免"看不见就等于不存在"
function warn(name, cond, detail) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { console.log('  ⚠️  ' + name + (detail ? ' — ' + detail : '') + '  （已知欠债，不阻断）'); }
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
  'RK_QUIZ', 'QUIZ_DOMAINS', 'QUIZ_STORE', 'renderPractice', 'resetPractice',
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

// ─────────────────── 4b. daily 卡片文案跟随 antiRepeat（2026-09-03） ───────────────────
// 现场：daily 卡片永远写死「优先未答」，但用户在刷题页右上角关掉「防重复」后，
// 实际是从「全部题」随机抽 → 首题可能命中已做题（#167），文案与行为脱钩误导人。
group('4b. daily 卡片文案不写死「优先未答」，跟随 antiRepeat 真实状态');
ok('按钮文案按 antiRepeat 动态生成（hint 三元）',
  /const hint = practice\.antiRepeat \? '优先未答' : '随机抽取'/.test(html));
const staleStatic = (html.match(/题 · 优先未答 · 每日抽/g) || []);
ok('daily 按钮不再残留写死的「题 · 优先未答 · 每日抽」', staleStatic.length === 0,
  '残留 ' + staleStatic.length + ' 处（若 >0 说明又写死了）');
ok('防重复说明提示已双向化（开/关各一条文案）',
  /防重复模式开启：每天优先刷/.test(html) && /防重复模式已关闭：从全部题里随机抽/.test(html));

// ─────────────────── 4c. 防重复关 = 允许抽到已做题（行为定义，防误改） ───────────────────
// 复现用户现场：先在防重复开时答满该域前 N-2 题，再在刷题页里点「🆕 防重复」关掉
// （answers 保留，仅切换开关），随后切域 chip / 回到该域 → list 从「全部题」抽 5，
// 首题可能命中已做题。注意：不能用 openQuiz 模拟——它在 antiRepeat=关 时会清空 answers，
// 而真实用户路径（域 chip / mode-toggle / 防重复开关）都不清 answers。
group('4c. 防重复关闭 = 从全部题抽（可能命中已做）');
practice.answers = {};
const idxDomAll = QUIZ.map((q, i) => ({ q, i })).filter((t) => t.q.d === dom).map((t) => t.i);
idxDomAll.slice(0, idxDomAll.length - 2).forEach((i) => { practice.answers[i] = QUIZ[i].a; });
practice.antiRepeat = true;
practice.shuffle = false;
practice.pickSize = 5;
practice.finished = false;
practice.reviewSnapshot = null;
// 先在防重复开时进一次（openQuiz 不清 answers），再模拟页内关掉防重复（btn-anti 行为）
X.openQuiz(dom, 'practice');
practice.antiRepeat = false;
X._invalidateListCache();   // 等效 btn-anti 点击：翻转 + 清缓存（不清 answers）
const listOff = X.practiceList();
ok('防重复关：列表长度 = pickSize(5)', listOff.length === 5, 'len=' + listOff.length);
const listOff0 = !!practice.answers[listOff[0].i];
ok('防重复关：首题可命中已答题（本构造确定性命中）', listOff0,
  'list[0]=#' + (listOff[0].i + 1) + ' answered=' + JSON.stringify(practice.answers[listOff[0].i]));
ok('防重复关：answers 未被清空（页内切开关不清记录）',
  Object.keys(practice.answers).filter((k) => practice.answers[k]).length === idxDomAll.length - 2,
  'truthy=' + Object.keys(practice.answers).filter((k) => practice.answers[k]).length);
// 对照：同数据开防重复 → 首题必须是未答
practice.antiRepeat = true;
X._invalidateListCache();
const listOn = X.practiceList();
const listOn0 = !!practice.answers[listOn[0].i];
ok('对照：防重复开 + 同数据 → 首题是未答题', !listOn0,
  'list[0]=#' + (listOn[0].i + 1) + ' answered=' + JSON.stringify(practice.answers[listOn[0].i]));

// ─────────────────── 4d. daily 入口 click handler 强制开 antiRepeat（2026-09-03） ───────────────────
// 用户真实痛点：daily card 文案动态化只是「不再误导」，但**刷题页首题仍是已做的题**。
// 根因 = 用户在刷题页里关了 antiRepeat → list 从全部题抽 → 命中已做题。
// 修复 = daily card 按钮 click handler 强制 antiRepeat=true（兑现承诺，可手动关回去）。
group('4d. daily 入口强制开启 antiRepeat（兑现「优先未答」承诺）');
ok('daily 入口 click handler 含「practice.antiRepeat=true」强制开启',
  /dataset\.mode==='practice' && !practice\.antiRepeat/.test(html) &&
  /practice\.antiRepeat=true/.test(html));
// 行为验证：模拟「用户刷题页里关了 → 再点 daily card」
practice.answers = {};
idxDomAll.slice(0, idxDomAll.length - 2).forEach((i) => { practice.answers[i] = QUIZ[i].a; });
practice.antiRepeat = false;   // 模拟刷题页里关了
practice.shuffle = false;
practice.pickSize = 5;
practice.finished = false;
practice.reviewSnapshot = null;
practice.domainFilter = dom;
practice.currentIdx = 0;
// 等效 click handler 行为：强制开 + savePractice + openQuiz
practice.antiRepeat = true;
X.savePractice();
X.openQuiz(dom, 'practice');
const listAfter = X.practiceList();
ok('daily 入口后 antiRepeat=true（兑现承诺）', practice.antiRepeat === true);
ok('daily 入口后首题是未答题（不命中已做）', !practice.answers[listAfter[0].i],
  'list[0]=#' + (listAfter[0].i + 1) + ' answered=' + JSON.stringify(practice.answers[listAfter[0].i]));

// ─────────────────── 4e. 云端 merge 后内存 practice 必须重载（2026-09-03）───────────────────
// 真实事故：用户 device A 答过 QUIZ[166]，上传云端；device B 打开 → initCloud 把 166
// 灌进 localStorage → 但「存储快照重载」boot 任务**漏了 loadPractice()** → 内存里
// practice.answers 仍是 stale（含 4 题、不含 166） → daily card 的 done=4 显示正常
// → 用户点 daily card → openQuiz 触发 savePractice 把内存 stale 写回 localStorage，
// 覆盖 initCloud merge 结果 → 再 loadPractice 重新读 → list 把 166 当成「未答」
// 抽进 unans 池 → 进入页看到「做过的样子」(QUIZ[166].a='B' 与 stale 内存不冲突)。
// 修复 = '存储快照重载' boot 任务里加 loadPractice()；并把脚本顶层 applyQuizMode()
//         移到 boot 队列，等 initCloud 完成后再跑。
group('4e. 云端 merge 后内存 practice 必须重载（daily card 与刷题页一致）');
// 「boot 任务含某调用」的检测要排除注释伪命中——逐行去掉 // 注释再查
// 用 lastIndexOf 找「最后一次」出现，因为注释里也可能误打 boot(...) 字面量
function bootCallbackCallsReal(label, fnName) {
  const needle = "boot('" + label + "'";
  const idx = html.lastIndexOf(needle);
  if (idx < 0) return false;
  // 切到下一个 boot( 或第一个 );\n 或 2000 字符内
  const tail = html.slice(idx, idx + 2000);
  const fnStart = tail.indexOf('function');
  if (fnStart < 0) return false;
  // 找函数体结束：连续 }) 行；优先找空行后的 });，其次找 }) 立即分号
  let fnEnd = tail.indexOf('\n});', fnStart);
  if (fnEnd < 0) fnEnd = tail.indexOf('});', fnStart);
  if (fnEnd < 0) fnEnd = tail.length;
  const cb = tail.slice(fnStart, fnEnd);
  for (const line of cb.split('\n')) {
    const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '');
    if (new RegExp('\\b' + fnName + '\\s*\\(').test(code)) return true;
  }
  return false;
}
ok('boot 任务「存储快照重载」回调内有 loadPractice() 实际调用（排除注释）',
  bootCallbackCallsReal('存储快照重载', 'loadPractice'));
ok('原 5288 那段（页面首次加载+applyQuizMode 顶层调用）已被删除',
  !/\/\/ 页面首次加载：按持久化的模式渲染[\s\S]{0,80}applyQuizMode\(\);/.test(html));
ok('boot 队列里包含「刷题模式初始化」回调内有 applyQuizMode() 实际调用（排除注释）',
  bootCallbackCallsReal('刷题模式初始化', 'applyQuizMode'));

// 行为验证：构造 stale 内存 → localStorage 含 166 → loadPractice → 内存同步 →
// daily card 的 done 计数与 list 行为不再脱钩
localStorage.removeItem(X.QUIZ_STORE);
// 模拟 initCloud merge 写回 localStorage 的「最新」值（云端 + 本地合并结果）
// 用 12 在三、元数据管理域作干扰项，验证 stale 内存里少 166（云端独有）会被找回
localStorage.setItem(X.QUIZ_STORE, JSON.stringify({
  answers: { 12: 'A', 17: 'B', 116: 'D', 165: 'B', 166: 'B' },
  currentIdx: 0, domainFilter: '四、数据仓库与BI', finished: false,
  pickSize: 5, shuffle: true, todaySeed: 0, sourceFilter: 'all', antiRepeat: true
}));
// 模拟 device B 「脏内存」：openQuiz 5288 那次用 stale localStorage 加载的 practice.answers
// 不含 166（云端独有），UI 显示 done=4 但内容里少了 166
practice.answers = { 12: 'A', 17: 'B', 116: 'D', 165: 'B' };
// 跑 boot 任务里的 loadPractice 重载
X.loadPractice();
ok('loadPractice 把 initCloud merge 的 166 灌进内存',
  practice.answers[166] === 'B', 'memory=' + JSON.stringify(practice.answers));
const dom166Idx = QUIZ.map((q,i)=>({q,i})).filter(x=>x.q.d==='四、数据仓库与BI').map(x=>x.i);
const doneInDom166 = dom166Idx.filter(i => practice.answers[i]).length;
// 17、116、165、166 都在「四、数据仓库与BI」域 → 已答 4 题（包含 166）
ok('daily card 的 done 计数 = 4（含云端 166，不含 12）', doneInDom166 === 4,
  'done=' + doneInDom166 + '（应为 4：17/116/165/166）');
ok('done 集合内确实含 166（云端独有答案不被丢）',
  dom166Idx.filter(i => practice.answers[i]).indexOf(166) >= 0,
  'done 集合=' + dom166Idx.filter(i => practice.answers[i]).join(','));

// 配套：内存修复后走一遍 daily card 入口（openQuiz+practiceList）→ list 不会把 166 抽进 unans
practice.shuffle = false;
practice.pickSize = 5;
practice.finished = false;
practice.reviewSnapshot = null;
X.openQuiz('四、数据仓库与BI', 'practice');
const listSync = X.practiceList();
ok('云端 merge 后 daily card 入口：list[0] 不命中已答对题',
  practice.answers[listSync[0].i] == null,
  'list[0]=#' + (listSync[0].i + 1) + ' answered=' + JSON.stringify(practice.answers[listSync[0].i]));
ok('云端 merge 后 daily card 入口：list 全程不含 166',
  !listSync.some(x => x.i === 166),
  'list=' + listSync.map(x=>x.i+1).join(','));

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

// ─────────────────── 6. 题库数据质量 ───────────────────
// 「题目本身的 bug」（答案字母越界、选项重复、题干重复、缺解析）不会让页面报错，
// 只会让人做题时看到错的东西 —— 逻辑测试抓不到，必须逐题体检。
group('6. 题库数据质量（逐题体检）');

const LETTERS = 'ABCDEFGH';

function auditBank(bankName, bank, keyField) {
  if (!Array.isArray(bank) || bank.length === 0) {
    ok(bankName + ' 题库存在且非空', false, 'got ' + typeof bank);
    return;
  }
  ok(bankName + ' 题库存在且非空', true, bank.length + ' 题');

  const badField = [];
  const badOpts = [];
  const badAnswer = [];
  const dupOpts = [];
  const noExplain = [];
  const dupStem = [];
  const seenStem = new Map();

  bank.forEach((q, i) => {
    const tag = '#' + i + ' ' + String(q && q.q || '').slice(0, 18);

    // 字段完整性
    if (!q || typeof q.q !== 'string' || !q.q.trim() || !q[keyField]) badField.push(tag);

    // 选项：数组 / 至少 2 项 / 无空串
    if (!Array.isArray(q.o) || q.o.length < 2 ||
        q.o.some((o) => typeof o !== 'string' || !o.trim())) {
      badOpts.push(tag);
    } else {
      // 同题内选项不得重复（重复选项会出现两个"正确答案"）
      const norm = q.o.map((o) => o.trim());
      if (new Set(norm).size !== norm.length) dupOpts.push(tag);
    }

    // 答案字母必须落在选项范围内：'B' 且只有 2 个选项 → 越界
    const pos = typeof q.a === 'string' ? LETTERS.indexOf(q.a.trim()) : -1;
    if (pos < 0 || !Array.isArray(q.o) || pos >= q.o.length) {
      badAnswer.push(tag + ' a=' + JSON.stringify(q.a) + ' o.len=' + (q.o ? q.o.length : 'n/a'));
    }

    // 解析不能为空（错题本复盘全靠它）
    if (typeof q.e !== 'string' || !q.e.trim()) noExplain.push(tag);

    // 题干去重
    const stem = String(q.q || '').replace(/\s+/g, '');
    if (seenStem.has(stem)) dupStem.push(tag + ' ↔ #' + seenStem.get(stem));
    else seenStem.set(stem, i);
  });

  ok(bankName + ' 每题字段完整(q/' + keyField + ')', badField.length === 0,
    badField.slice(0, 3).join(' | '));
  ok(bankName + ' 选项合法(数组/≥2项/无空串)', badOpts.length === 0, badOpts.slice(0, 3).join(' | '));
  ok(bankName + ' 同题内无重复选项', dupOpts.length === 0, dupOpts.slice(0, 3).join(' | '));
  ok(bankName + ' 答案字母落在选项范围内', badAnswer.length === 0, badAnswer.slice(0, 3).join(' | '));
  ok(bankName + ' 每题都有解析', noExplain.length === 0,
    noExplain.length + ' 题缺解析: ' + noExplain.slice(0, 3).join(' | '));
  ok(bankName + ' 无重复题干', dupStem.length === 0,
    dupStem.length + ' 组重复: ' + dupStem.slice(0, 3).join(' | '));
}

auditBank('CDGA', QUIZ, 'd');
auditBank('软考', X.RK_QUIZ, 't');

// 解析质量棘轮：e 只有出处署名、没有任何讲解的题，允许存量、禁止新增。
// 这类题不会报错，但答错后错题本复盘时看不到"为什么错" → 学习闭环断掉。
const NO_EXPLAIN_BASELINE = 91;   // 2026-09-03 实测存量；只允许降、不允许升
// 精确判定：按 · ｜ | 切段，丢掉纯署名段，若一段不剩 → 只有出处、没有讲解。
// 不用长度阈值 —— 「全生命周期管理。」这类短解析是真解析，不能误判为欠债。
const ATTR_SEG = /^(网友回忆版|CC BY-SA\s*4\.0.*|weixin_\d+|csdn[-\w]*|答案推断[:：]?)$/i;
function isBareAttribution(e) {
  const segs = String(e || '')
    .split(/[·｜|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !ATTR_SEG.test(s));
  return segs.length === 0;
}
const bare = QUIZ.map((q, i) => ({ q, i })).filter((x) => isBareAttribution(x.q.e));
ok('无讲解题数未新增（棘轮，只许降不许升）', bare.length <= NO_EXPLAIN_BASELINE,
  '当前 ' + bare.length + ' 题 > 基线 ' + NO_EXPLAIN_BASELINE + '，说明新加的题没写解析');
warn('全部题目都有真正的讲解（非仅出处署名）', bare.length === 0,
  bare.length + '/' + QUIZ.length + ' 题只有出处署名');
if (bare.length < NO_EXPLAIN_BASELINE) {
  console.log('     ↑ 基线可下调至 ' + bare.length + '（请同步改 NO_EXPLAIN_BASELINE）');
}

// 域清单必须由题库真实推导，且每域题目数够抽一轮
ok('域清单非空且来自题库', Array.isArray(X.QUIZ_DOMAINS) && X.QUIZ_DOMAINS.length > 0,
  'domains=' + (X.QUIZ_DOMAINS || []).length);
const thinDomains = (X.QUIZ_DOMAINS || []).filter((d) => domCount[d] < 5);
ok('每个域题目数 ≥ 5（够抽一轮 pickSize=5）', thinDomains.length === 0,
  thinDomains.map((d) => d + '=' + domCount[d]).join(', '));

// ─────────────────── 7. 答题推进与边界 ───────────────────
// 列表对了但渲染越界照样白屏/错位，这一组盯的是"用户实际点下去"的路径。
group('7. 答题推进与边界（渲染不崩 / 数量不缩水 / 重置生效）');

practice.answers = {};
practice.antiRepeat = true;
practice.pickSize = 5;
practice.shuffle = true;
practice.finished = false;
practice.reviewSnapshot = null;
X.openQuiz(dom, 'practice');
const rl = X.practiceList();
ok('一轮题量 = pickSize（不缩水）', rl.length === practice.pickSize,
  'len=' + rl.length + ' pickSize=' + practice.pickSize);

// 逐题答完，每步都渲染一次，任何一步抛错都算回归
let renderErr = null;
try {
  for (let i = 0; i < rl.length; i++) {
    practice.currentIdx = i;
    X.renderPractice();
    practice.answers[rl[i].i] = QUIZ[rl[i].i].a;
  }
} catch (e) { renderErr = e; }
ok('逐题作答+渲染全程不抛错', renderErr === null, renderErr ? renderErr.message : '');

// 全答完后列表不得塌缩（否则"答到第5题时列表只剩1条"→ 索引错位）
const rlAfter = X.practiceList();
ok('全部答完后列表长度不变', rlAfter.length === rl.length,
  rl.length + ' → ' + rlAfter.length);

// currentIdx 越界必须被修正，而不是渲染出 undefined 题目
let boundErr = null;
practice.currentIdx = 999;
try { X.renderPractice(); } catch (e) { boundErr = e; }
ok('currentIdx 越界时渲染不崩', boundErr === null, boundErr ? boundErr.message : '');
ok('currentIdx 越界被修正回合法范围', practice.currentIdx < rlAfter.length && practice.currentIdx >= 0,
  'currentIdx=' + practice.currentIdx);

// 负索引同样兜住
practice.currentIdx = -5;
let negErr = null;
try { X.renderPractice(); } catch (e) { negErr = e; }
ok('currentIdx 负值时渲染不崩且被修正', negErr === null && practice.currentIdx >= 0,
  'currentIdx=' + practice.currentIdx);

// 重置：清空作答并重新出题
if (typeof X.resetPractice === 'function') {
  X.resetPractice();
  const rlReset = X.practiceList();
  ok('重置后作答清空', Object.keys(practice.answers || {}).length === 0,
    '剩余 ' + Object.keys(practice.answers || {}).length + ' 条作答');
  ok('重置后仍能出题', rlReset.length > 0, 'len=' + rlReset.length);
} else {
  ok('resetPractice 已导出', false, '未取到该函数');
}

// 换域必须换题：切到另一个域后列表里不应残留原域题目
const otherDom = Object.keys(domCount).filter((d) => d !== dom && domCount[d] >= 5)[0];
if (otherDom) {
  X.openQuiz(otherDom, 'practice');
  const rlOther = X.practiceList();
  const leaked = rlOther.filter((x) => QUIZ[x.i].d !== otherDom).length;
  ok('切换域后列表只含该域题目', leaked === 0, '混入 ' + leaked + ' 题 (dom=' + otherDom + ')');
} else {
  ok('存在第二个可测域', false, '题库域不足，无法测切换');
}

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
