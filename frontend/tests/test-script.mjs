export async function testScriptPositive(page, fixtures){
  try {
    await page.goto(fixtures.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.flow-builder');
    await page.click('.flow-params-actions .add-script');
    await page.waitForSelector('.flow-param-editor');
    await page.fill('.flow-param-editor input[name="varName"]', 'scriptVar');
    const script = 'return (vars.gNum||"0") + "-" + String(Math.floor(Math.random()*9)+1);';
    await page.fill('.flow-param-editor textarea[name="script"]', script);
    await page.click('.flow-param-editor .save-param');
    // run
    await page.getByRole('button', { name: /Run/i }).first().click();
    await page.waitForSelector('.flow-runtime-row', { timeout: 20000 });
    const rows = await page.$$('.flow-runtime-row');
    let ok = false;
    for (const r of rows){
      const code = await r.$('code');
      if (!code) continue;
      const key = (await code.textContent()).trim();
      if (key === 'scriptVar'){
        const val = (await (await r.$('.flow-runtime-val')).textContent()).trim();
        if (/^[0-9]+-[0-9]$/.test(val)) ok = true;
      }
    }
    if (!ok) throw new Error('scriptVar not resolved or format mismatch');
    return { id: 'S-01', status: 'PASS' };
  } catch (err){
    return { id: 'S-01', status: 'FAIL', error: String(err) };
  }
}

export async function testScriptError(page, fixtures){
  try {
    await page.goto(fixtures.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.flow-builder');
    await page.click('.flow-params-actions .add-script');
    await page.waitForSelector('.flow-param-editor');
    await page.fill('.flow-param-editor input[name="varName"]', 'badScript');
    await page.fill('.flow-param-editor textarea[name="script"]', 'throw new Error("bad")');
    await page.click('.flow-param-editor .save-param');
    await page.getByRole('button', { name: /Run/i }).first().click();
    const err = await page.locator('.flow-param-error, .flow-runtime-error').first();
    if (await err.count()) return { id: 'S-02', status: 'PASS' };
    return { id: 'S-02', status: 'FAIL', error: 'No script error captured' };
  } catch (err){
    return { id: 'S-02', status: 'FAIL', error: String(err) };
  }
}
