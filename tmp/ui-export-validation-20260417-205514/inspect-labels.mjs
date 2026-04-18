import { chromium } from "playwright-core";

(async () => {
 const browser = await chromium.launch({ channel:'msedge', headless:true });
 const page = await browser.newPage();
 await page.goto('http://localhost:9090',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Flow/i}).first().click();
 await page.getByRole('button',{name:/Parameters/i}).first().click();
 for(let i=0;i<2;i++) await page.getByRole('button',{name:/Add Generator/i}).first().click();
 const labels = await page.locator('label').allTextContents();
 console.log(JSON.stringify(labels,null,2));
 await browser.close();
})();
