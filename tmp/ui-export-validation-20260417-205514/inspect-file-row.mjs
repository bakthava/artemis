import { chromium } from "playwright-core";
import path from "node:path";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:9090', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /Flow/i }).first().click();
  await page.getByRole('button', { name: /Parameters/i }).first().click();
  await page.getByRole('button', { name: /Add File/i }).first().click();
  await page.locator('input[type="file"]').last().setInputFiles(path.resolve('./sample.csv'));
  const pickSel = page.locator('label:has-text("Pick Value")').locator('xpath=following-sibling::select[1]');
  await pickSel.selectOption('index');
  await page.waitForTimeout?.(300);
  const rows = await page.locator('label, input, select').evaluateAll((els)=>els.map((el)=>({tag:el.tagName,text:(el.textContent||'').trim(),placeholder:el.getAttribute('placeholder'),className:el.className,type:el.getAttribute('type'),value:el.value})));
  console.log(JSON.stringify(rows.filter(r=>/row|pick|file|var|scope|index/i.test((r.text||'')+' '+(r.placeholder||'')) || (r.className||'').includes('form-input')).slice(0,120), null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
