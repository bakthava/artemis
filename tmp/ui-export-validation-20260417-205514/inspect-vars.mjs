import { chromium } from "playwright-core";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:9090', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /Flow/i }).first().click();
  await page.getByRole('button', { name: /\+ Step/i }).first().click();
  const setVar = page.getByRole('button', { name: /Set Variable/i }).first();
  if (await setVar.count()) await setVar.click(); else await page.locator('text=Set Variable').first().click();
  await page.locator('text=Set Variable').first().click({ force:true });
  await page.locator('input.set-var-name').fill('x');
  await page.locator('input.set-var-val').fill('y');
  await page.getByRole('button', { name: /Run/i }).first().click();
  await page.waitForTimeout?.(3500);
  await page.getByRole('button', { name: /Vars/i }).first().click();
  await page.waitForTimeout?.(1000);
  const txt = await page.locator('body').innerText();
  console.log(txt.slice(0,8000));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
