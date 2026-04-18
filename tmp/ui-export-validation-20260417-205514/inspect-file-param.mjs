import { chromium } from "playwright-core";
import path from "node:path";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:9090', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /Flow/i }).first().click();
  await page.getByRole('button', { name: /Parameters/i }).first().click();
  await page.getByRole('button', { name: /Add File/i }).first().click();
  const abs = path.resolve('./sample.csv');
  await page.locator('input[type="file"]').last().setInputFiles(abs);
  await page.waitForTimeout?.(500);
  const controls = await page.locator('input, textarea, select, button, label').evaluateAll((els)=>els.map((el)=>({
    tag: el.tagName,
    text: (el.textContent||'').trim(),
    placeholder: el.getAttribute('placeholder'),
    className: el.className,
    type: el.getAttribute('type'),
    value: el.value
  })).filter(x => (x.className||'').includes('form-input') || /file|row|index|random|variable|scope|pick|mode/i.test(x.text + ' ' + (x.placeholder||''))));
  console.log(JSON.stringify(controls.slice(0,300), null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
