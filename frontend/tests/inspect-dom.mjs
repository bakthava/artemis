import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.BASE_URL || 'http://localhost:9090';
const outDir = path.resolve(process.cwd(),'..','tmp');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
(async ()=>{
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  // take full page screenshot
  const shotPath = path.join(outDir, 'inspect-after-goto.png');
  try { await page.screenshot({ path: shotPath, fullPage: true }); } catch(e){}

  // save HTML
  const html = await page.content();
  fs.writeFileSync(path.join(outDir,'inspect-page.html'), html, 'utf8');

  // check selectors
  const selectors = [
    'button:has-text("Flow")',
    '[role="button"][title*="Flow"]',
    '.flow-builder',
    '.flow-params-actions .add-generator',
    '.flow-toolbar .certificate-selector select',
    '.flow-parameters-panel',
    '.flow-toolbar'
  ];
  const results = {};
  for (const s of selectors){
    try {
      const count = await page.locator(s).count();
      results[s] = count;
    } catch (e){ results[s] = 'error'; }
  }

  // get top nav buttons text
  const navButtons = await page.$$eval('header, .topbar, nav, .navbar, .app-header', (els)=>{
    for (const e of els){
      const btns = Array.from(e.querySelectorAll('button')).map(b=>b.textContent.trim()).filter(Boolean);
      if (btns.length) return btns.slice(0,20);
    }
    return [];
  });

  const payload = { url: baseUrl, timestamp: new Date().toISOString(), selectors: results, navButtons };
  fs.writeFileSync(path.join(outDir,'inspect-report.json'), JSON.stringify(payload,null,2));
  console.log('Wrote', path.join(outDir,'inspect-report.json'));
  console.log(JSON.stringify(payload,null,2));
  await browser.close();
})();
