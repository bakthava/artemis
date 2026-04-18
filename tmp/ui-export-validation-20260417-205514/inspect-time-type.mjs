import { chromium } from "playwright-core";

(async () => {
 const browser = await chromium.launch({ channel:'msedge', headless:true });
 const page = await browser.newPage();
 await page.goto('http://localhost:9090',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Flow/i}).first().click();
 await page.getByRole('button',{name:/Parameters/i}).first().click();
 await page.getByRole('button',{name:/Add Generator/i}).first().click();
 const card = page.locator('.flow-param-card').first();
 await card.locator('label:has-text("Generator Type")').locator('xpath=following-sibling::select[1]').selectOption('time');
 const labels = await card.locator('label').allTextContents();
 const selects = await card.locator('select').evaluateAll((els)=>els.map(el=>({value:el.value,opts:Array.from(el.options).map(o=>({v:o.value,t:o.textContent?.trim()}))})));
 const inputs = await card.locator('input').evaluateAll((els)=>els.map(el=>({type:el.type,placeholder:el.placeholder,value:el.value})));
 console.log(JSON.stringify({labels,selects,inputs},null,2));
 await browser.close();
})();
