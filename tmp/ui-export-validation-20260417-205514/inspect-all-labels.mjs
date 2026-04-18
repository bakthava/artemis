import { chromium } from "playwright-core";
import path from "node:path";

(async () => {
 const browser = await chromium.launch({ channel:'msedge', headless:true });
 const page = await browser.newPage();
 await page.goto('http://localhost:9090',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Flow/i}).first().click();
 await page.getByRole('button',{name:/Parameters/i}).first().click();
 for(let i=0;i<4;i++) await page.getByRole('button',{name:/Add Generator/i}).first().click();
 await page.getByRole('button',{name:/Add Script/i}).first().click();
 await page.getByRole('button',{name:/Add File/i}).first().click();
 await page.locator('input[type="file"]').last().setInputFiles(path.resolve('./sample.csv'));
 const labels = await page.locator('label').allTextContents();
 console.log(JSON.stringify(labels,null,2));
 await browser.close();
})();
