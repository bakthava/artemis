export async function testGeneratorNumberPositive(page, fixtures){
  const name = 'gNum';
  try {
    await page.goto(fixtures.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    // open flow and parameters
    await page.getByRole('button', { name: /Flow/i }).first().click();
    await page.waitForSelector('.flow-builder');
    await page.click('.flow-params-actions .add-generator');
    await page.waitForSelector('.flow-param-editor');
    await page.selectOption('.flow-param-editor select[name="generatorType"]', 'number');
    await page.fill('.flow-param-editor input[name="varName"]', name);
    await page.fill('.flow-param-editor input[name="min"]', '10');
    await page.fill('.flow-param-editor input[name="max"]', '12');
    await page.check('.flow-param-editor input[name="integer"]');
    await page.click('.flow-param-editor .save-param');

    // Run flow
    const runBtn = page.getByRole('button', { name: /Run/i }).first();
    await runBtn.click();
    await page.waitForSelector('.flow-runtime-row', { timeout: 20000 });
    const rows = await page.$$('.flow-runtime-row');
    let found = false;
    for (const r of rows){
      const code = await r.$('code');
      if (!code) continue;
      const key = (await code.textContent()).trim();
      if (key === name){
        const valEl = await r.$('.flow-runtime-val');
        const val = (await valEl.textContent()).trim();
        const n = Number(val);
        if (!Number.isNaN(n) && n >= 10 && n <= 12) {
          found = true;
        } else {
          throw new Error(`Value for ${name} out of range: ${val}`);
        }
      }
    }
    if (!found) throw new Error(`${name} not found in runtime`);
    return { id: 'G-01', status: 'PASS' };
  } catch (err) {
    return { id: 'G-01', status: 'FAIL', error: String(err) };
  }
}

export async function testGeneratorNumberInvalid(page, fixtures){
  try {
    await page.goto(fixtures.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.flow-builder');
    await page.click('.flow-params-actions .add-generator');
    await page.waitForSelector('.flow-param-editor');
    await page.selectOption('.flow-param-editor select[name="generatorType"]', 'number');
    await page.fill('.flow-param-editor input[name="varName"]', 'gNumBad');
    await page.fill('.flow-param-editor input[name="min"]', '20');
    await page.fill('.flow-param-editor input[name="max"]', '10');
    await page.click('.flow-param-editor .save-param');
    // Expect validation error element
    const err = await page.locator('.flow-param-error').first();
    if (await err.count()){
      return { id: 'G-02', status: 'PASS' };
    }
    // or runtime failure
    await page.getByRole('button', { name: /Run/i }).first().click();
    const runtimeErr = await page.locator('.flow-param-error, .flow-runtime-error').first();
    if (await runtimeErr.count()) return { id: 'G-02', status: 'PASS' };
    return { id: 'G-02', status: 'FAIL', error: 'No validation or runtime error detected for invalid min/max' };
  } catch (err) {
    return { id: 'G-02', status: 'FAIL', error: String(err) };
  }
}
