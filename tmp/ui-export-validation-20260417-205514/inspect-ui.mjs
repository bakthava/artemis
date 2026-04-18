import { chromium } from "playwright-core";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:9090', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const flowBtn = page.getByRole('button', { name: /Flow/i }).first();
  if (await flowBtn.count()) await flowBtn.click();
  await page.waitForTimeout?.(1000);
  const texts = await page.locator('button, [role="button"], h1, h2, h3, h4, label, .tab, .panel').allTextContents();
  console.log(JSON.stringify(texts.slice(0,200), null, 2));
  await browser.close();
})().catch(async e => { console.error(e); process.exit(1); });
