import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'fs';

const html = readFileSync('index.html', 'utf-8');
const errors = [];
const vc = new VirtualConsole()
  .on('jsdomError', e => errors.push('jsdomError: ' + e.message))
  .on('error', m => errors.push('console.error: ' + String(m).slice(0, 200)));

const dom = new JSDOM(html, {
  url: 'http://localhost:8080/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc
});
await new Promise(r => setTimeout(r, 1800));

const doc = dom.window.document;
const $ = s => doc.querySelector(s);
const $$ = s => Array.from(doc.querySelectorAll(s));

console.log('1. 默认页 cdga-daily.active =', $('#cdga-daily')?.classList.contains('active'));
console.log('2. heatGrid 子元素数 =', $('#heatGrid')?.children.length || 0);

// 切到 cdga-quiz
doc.querySelector('[data-page="cdga-quiz"]')?.click?.();
await new Promise(r => setTimeout(r, 250));

const tabs = $$('.mode-toggle button');
console.log('3. quiz tabs =', tabs.map(b => b.dataset.mode).join(','));

// 题库汇总 tab
tabs.find(t => t.dataset.mode === 'external')?.click();
await new Promise(r => setTimeout(r, 250));
console.log('4. 题库汇总卡片数 =', $$('#quiz-external .ext-bank-card').length);
console.log('5. 卡片 action 类型 =', $$('#quiz-external [data-act]').map(b => b.dataset.act).join(','));
console.log('   source chips 显示(题库汇总卡) 数字:',
  $$('#quiz-external .ext-bank-count').map(el => el.textContent.trim()).join(' / '));

// 切刷题模式看 source chips
tabs.find(t => t.dataset.mode === 'practice')?.click();
await new Promise(r => setTimeout(r, 250));
const srcChips = $$('#src-chips .domain-chip');
console.log('6. source chips 数 =', srcChips.length);
console.log('   source chips =', srcChips.map(c => c.textContent.trim()).join(' / '));

// 点「CSDN 公开」chip
doc.querySelector('#src-chips .domain-chip[data-s="csdn-public"]')?.click();
await new Promise(r => setTimeout(r, 250));
console.log('7. 点[CSDN 公开]后 practiceList 长度 =', dom.window.practiceList?.().length, '(期望 100)');

// 返回题库汇总,点「基于公开材料改编」卡片站内开刷
tabs.find(t => t.dataset.mode === 'external')?.click();
await new Promise(r => setTimeout(r, 250));
const card = Array.from(doc.querySelectorAll('#quiz-external .ext-bank-card'))
  .find(c => c.textContent.includes('基于公开材料改编'));
card?.querySelector('[data-act="practice"]')?.click();
await new Promise(r => setTimeout(r, 300));
console.log('8. 卡片开刷后 practice 显形 =', $('#quiz-practice')?.hidden === false,
  ', active source chip =', doc.querySelector('#src-chips .domain-chip.active')?.dataset.s,
  ', HUD =', Array.from(doc.querySelectorAll('#quiz-practice .practice-hud .stat')).map(e => e.textContent.trim()).join(' | '));

// 错题本 tab
tabs.find(t => t.dataset.mode === 'wrongbook')?.click();
await new Promise(r => setTimeout(r, 250));
console.log('9. 错题本显形 =', $('#quiz-wrongbook')?.hidden === false,
  ', 内容渲染字符数 >', ($('#quiz-wrongbook')?.textContent?.length || 0) > 50);

// 红条检测(远端有 reportErr 机制)
const redBanner = doc.querySelector('#err-banner, .err-banner, [class*="report"]');
console.log('10. 页面错误红条 =', redBanner ? redBanner.textContent.trim().slice(0, 100) : '(无)');

console.log('11. 捕获 jsdom 错误数 =', errors.length);
errors.slice(0, 8).forEach(e => console.log('   -', e.slice(0, 160)));
process.exit(errors.length > 0 ? 1 : 0);
