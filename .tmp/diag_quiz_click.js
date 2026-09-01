// 验证 3 个场景：A) 答中间题 B) 切 shuffle 后 list 换 C) 切 antiRepeat 后 list 换
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT_CDP = 9250;
const PORT_HTTP = 8785;
const ROOT = 'D:/01_Projects/learningDesktop';
const PAGE_URL = 'http://127.0.0.1:' + PORT_HTTP + '/index.html';

const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('404'); return; }
  const ext = path.extname(f).toLowerCase();
  const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css'}[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  fs.createReadStream(f).pipe(res);
});
server.listen(PORT_HTTP, '127.0.0.1', () => console.log('http on :'+PORT_HTTP));

const userData = 'D:/Temp_chrome_rb_' + Date.now();
fs.mkdirSync(userData, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=' + PORT_CDP,
  '--user-data-dir=' + userData,
  '--window-size=1280,1800', PAGE_URL
], { stdio: 'pipe' });
chrome.stderr.on('data', () => {});

const wait = ms => new Promise(r => setTimeout(r, ms));
function getJSON(path){
  return new Promise((res, rej)=>{
    http.get('http://127.0.0.1:' + PORT_CDP + path, r => {
      let buf = ''; r.on('data', c => buf += c);
      r.on('end', () => { try{ res(JSON.parse(buf)); }catch(e){ rej(e); } });
    }).on('error', rej);
  });
}

(async () => {
  for (let i = 0; i < 40; i++){ try{ await getJSON('/json/version'); break; }catch(e){ await wait(300); } }
  const tabs = await getJSON('/json');
  const target = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej)=>{ ws.onopen = res; ws.onerror = rej; });

  let msgId = 0;
  const pending = new Map();
  const exceptions = [];
  ws.onmessage = ev => {
    let m; try { m = JSON.parse(ev.data); } catch(e){ return; }
    if (m.id != null && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown'){ exceptions.push(JSON.stringify(m.params.exceptionDetails).slice(0,1500)); }
  };

  function send(method, params={}){
    const id = ++msgId;
    return new Promise(res => {
      pending.set(id, m => res(m.result || m.error));
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  function ev(expr){
    return send('Runtime.evaluate', { expression: '(()=>{ try{ return ' + expr + '; } catch(e) { return { __err: String(e), stack: e.stack }; } })()', returnByValue: true });
  }

  await send('Runtime.enable');
  await send('Page.enable');
  for (let i = 0; i < 40; i++){ const r = await ev('typeof QUIZ!=="undefined" ? QUIZ.length : -1'); if (r.result && r.result.value > 0) break; await wait(300); }
  await wait(800);

  // 进入自测页
  await ev('(function(){ document.querySelectorAll("section.page").forEach(s=>s.classList.remove("active")); document.getElementById("cdga-quiz").classList.add("active"); document.getElementById("quiz-study").hidden = true; document.getElementById("quiz-practice").hidden = false; document.getElementById("quiz-external").hidden = true; const wb = document.getElementById("quiz-wrongbook"); if (wb) wb.hidden = true; document.querySelectorAll(".mode-toggle button").forEach(b => { const on = b.dataset.mode === "practice"; b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false"); }); quizMode = "practice"; return true; })()');

  // === 场景 A：答第 1 题 (curIdx=0) ===
  await ev('(function(){ practice.domainFilter = "二、数据质量"; practice.pickSize = 5; practice.shuffle = true; practice.todaySeed = 9999; practice.sourceFilter = "all"; practice.antiRepeat = true; practice.answers = {}; practice.currentIdx = 0; practice.finished = false; return true; })()');
  await ev('renderPractice()');
  await wait(200);
  const a1 = await ev('({cur: practice.currentIdx, listIds: practiceList().map(x=>x.i), pcNum: (document.querySelector(".pc-num")||{}).innerText, q: ((document.querySelector(".pc-question")||{}).innerText || "").slice(0,30)})');
  console.log('A) before click:', JSON.stringify(a1.result.value));
  const a2 = await ev('(function(){ const opt = document.querySelector("#quiz-practice .pc-opt"); if (!opt) return { err: "no opt" }; opt.click(); return { cur: practice.currentIdx, listIds: practiceList().map(x=>x.i), pcNum: (document.querySelector(".pc-num")||{}).innerText, hasFb: !!document.querySelector("#quiz-practice .pc-feedback"), locked: !!document.querySelector(".pc-opt.locked"), hasNext: !!document.querySelector("#btn-next"), hasFinish: !!document.querySelector("#btn-finish") }; })()');
  console.log('A) after click (curIdx=0, expect hasNext=true):', JSON.stringify(a2.result.value));

  // === 场景 B：切 shuffle 后 list 应重算 ===
  const b1 = await ev('({listIds: practiceList().map(x=>x.i), shuffle: practice.shuffle, todaySeed: practice.todaySeed})');
  console.log('B) before toggle shuffle:', JSON.stringify(b1.result.value));
  await ev('document.querySelector("#btn-shuffle").click()');
  await wait(200);
  const b2 = await ev('({listIds: practiceList().map(x=>x.i), shuffle: practice.shuffle, todaySeed: practice.todaySeed})');
  console.log('B) after toggle shuffle (expect list changed):', JSON.stringify(b2.result.value));

  // === 场景 C：切 antiRepeat 后 list 应重算 ===
  // 先回滚刚才
  await ev('document.querySelector("#btn-shuffle").click()');
  await wait(200);
  const c1 = await ev('({listIds: practiceList().map(x=>x.i), anti: practice.antiRepeat})');
  console.log('C) before toggle anti:', JSON.stringify(c1.result.value));
  await ev('document.querySelector("#btn-anti").click()');
  await wait(200);
  const c2 = await ev('({listIds: practiceList().map(x=>x.i), anti: practice.antiRepeat})');
  console.log('C) after toggle anti (expect list changed):', JSON.stringify(c2.result.value));

  // === 场景 D：点「下一题」按钮（curIdx++）后 list 应当保持稳定（cache 命中） ===
  // 回到 curIdx=0，antiRepeat=true
  await ev('document.querySelector("#btn-anti").click()');
  await ev('(function(){ practice.answers = {}; practice.currentIdx = 0; renderPractice(); return true; })()');
  await wait(200);
  const d1 = await ev('({cur: practice.currentIdx, listIds: practiceList().map(x=>x.i)})');
  console.log('D) before click first:', JSON.stringify(d1.result.value));
  await ev('(function(){ const opt = document.querySelector("#quiz-practice .pc-opt"); if (opt) opt.click(); return true; })()');
  await wait(200);
  const d2 = await ev('({cur: practice.currentIdx, listIds: practiceList().map(x=>x.i)})');
  console.log('D) after click first:', JSON.stringify(d2.result.value));
  await ev('document.querySelector("#btn-next") && document.querySelector("#btn-next").click()');
  await wait(200);
  const d3 = await ev('({cur: practice.currentIdx, listIds: practiceList().map(x=>x.i), pcNum: (document.querySelector(".pc-num")||{}).innerText})');
  console.log('D) after click "下一题" button (expect curIdx=1, list stable):', JSON.stringify(d3.result.value));

  console.log('=== exceptions ===');
  exceptions.forEach(e => console.log(e));

  ws.close(); chrome.kill(); server.close();
  try{ fs.rmSync(userData, { recursive:true, force:true }); }catch(e){}
  process.exit(0);
})().catch(e=>{ console.error('FAIL', e); chrome.kill(); server.close(); process.exit(1); });
