import { chromium } from "playwright-core";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:9090', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /Flow/i }).first().click();
  await page.getByRole('button', { name: /\+ Step/i }).first().click();
  const setVar = page.getByRole('button', { name: /Set Variable/i }).first();
  if (await setVar.count()) {
    await setVar.click();
  } else {
    await page.locator('text=Set Variable').first().click();
  }
  await page.waitForTimeout?.(500);
  await page.locator('text=Set Variable').first().click({ force: true });
  await page.waitForTimeout?.(500);
  const fields = await page.locator('label, input, textarea, select, h3, h4').evaluateAll((els)=>els.map((el)=>({tag:el.tagName,text:(el.textContent||'').trim(),placeholder:el.getAttribute('placeholder'),className:el.className,type:el.getAttribute('type'),value:el.value})).filter(x=>/variable|value|set/i.test((x.text||'')+' '+(x.placeholder||'')) || (x.className||'').includes('form-input')));
  console.log(JSON.stringify(fields.slice(0,200),null,2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
