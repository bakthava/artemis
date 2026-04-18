import { chromium } from "playwright-core";

(async () => {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:9090', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /Flow/i }).first().click();
  await page.getByRole('button', { name: /Parameters/i }).first().click();
  for (let i=0;i<4;i++) await page.getByRole('button', { name: /Add Generator/i }).first().click();
  await page.getByRole('button', { name: /Add Script/i }).first().click();
  await page.getByRole('button', { name: /Add File/i }).first().click();
  await page.waitForTimeout?.(500);

  const inputs = await page.locator('input, textarea, select').evaluateAll((els) => els.map((el, idx) => ({
    idx,
    tag: el.tagName,
    type: el.getAttribute('type'),
    name: el.getAttribute('name'),
    id: el.getAttribute('id'),
    placeholder: el.getAttribute('placeholder'),
    ariaLabel: el.getAttribute('aria-label'),
    className: el.className,
    value: el.value,
    options: el.tagName==='SELECT' ? Array.from(el.options).map(o=>o.textContent?.trim()) : undefined
  })));
  console.log(JSON.stringify(inputs, null, 2));

  const help = await page.locator('text=How to pass variables into script and requests').count();
  console.log('HELP_COUNT=' + help);

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
