import { chromium } from "playwright-core";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:9090', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /Flow/i }).first().click();
  await page.getByRole('button', { name: /Parameters/i }).first().click();
  await page.waitForTimeout?.(500);
  const texts = await page.locator('button, [role="button"], h1, h2, h3, h4, label, .parameter-section, .parameters-panel, .param-controls, .toast, .notification').allTextContents();
  console.log(JSON.stringify([...new Set(texts.map(t=>t.trim()).filter(Boolean))].slice(0,400), null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
