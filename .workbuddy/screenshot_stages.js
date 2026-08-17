const puppeteer = require('puppeteer-core');
const path = require('path');
const outDir = 'D:/01_Projects/learningDesktop/.workbuddy';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

  await page.goto('http://192.168.103.37:8080/', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));
  await page.setViewport({ width: 1280, height: 900 });
  await page.screenshot({ path: path.join(outDir, 'shot_home.png'), fullPage: false });

  const chips = await page.$$eval('#cdga-daily .stage-chip', el => el.map(e => ({ text: e.innerText, stage: e.dataset.stage })));
  console.log('CHIPS:', JSON.stringify(chips));

  for (const stage of ['ruankao-daily', 'datadev-daily', 'cdgp-daily']) {
    const ok = await page.evaluate((s) => {
      const b = document.querySelector('#cdga-daily .stage-chip[data-stage="' + s + '"]');
      if (b) { b.click(); return true; }
      return false;
    }, stage);
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: path.join(outDir, 'shot_' + stage + '.png'), fullPage: false });
    const title = await page.evaluate(() => document.querySelector('section.page.active .doc-title')?.textContent || '(none)');
    const card = await page.evaluate(() => document.querySelector('section.page.active .gen-card')?.textContent?.replace(/\s+/g, ' ').slice(0, 120) || '(none)');
    console.log(stage, 'clicked=', ok, 'title=', title, 'card=', card, 'errors=', errors.length ? errors.join(' | ') : 'none');
    errors.length = 0;
  }

  await browser.close();
})();
