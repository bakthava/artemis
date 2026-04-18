import { chromium } from "playwright-core";

(async () => {
 const browser = await chromium.launch({ channel:'msedge', headless:true });
 const page = await browser.newPage();
 await page.goto('http://localhost:9090',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:/Flow/i}).first().click();
 await page.getByRole('button',{name:/Parameters/i}).first().click();
 await page.getByRole('button',{name:/Add Generator/i}).first().click();
 const info = await page.locator('label:has-text("Variable Name")').first().evaluate((el)=>{
   let n=el;
   const arr=[];
   for(let i=0;i<6 && n;i++){arr.push({tag:n.tagName,className:n.className}); n=n.parentElement;}
   return arr;
 });
 console.log(JSON.stringify(info,null,2));
 const classes = await page.locator('div').evaluateAll(ds=>Array.from(new Set(ds.map(d=>d.className).filter(Boolean))).filter(c=>String(c).includes('param')).slice(0,80));
 console.log(JSON.stringify(classes,null,2));
 await browser.close();
})();
