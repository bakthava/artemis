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
  const opts = await pickSel.evaluate((el)=>({value:el.value, options:Array.from(el.options).map(o=>({value:o.value,label:o.textContent?.trim()}))}));
  console.log(JSON.stringify(opts,null,2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
