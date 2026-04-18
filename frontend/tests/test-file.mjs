import path from 'node:path';
export async function testFileImportPositive(page, fixtures){
  try {
    await page.goto(fixtures.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.flow-builder');
    await page.click('.flow-params-actions .add-file');
    await page.waitForSelector('.flow-param-editor');
    await page.fill('.flow-param-editor input[name="varName"]', 'fileVar');
    const filePath = path.resolve(fixtures.projectRoot, 'tests', 'fixtures', 'sample.csv');
    const input = await page.locator('.flow-param-editor input[type=file]').first();
    await input.setInputFiles(filePath);
    // select row 2 maybe via UI; attempt to pick second value
    await page.click('.flow-param-editor .save-param');
    await page.getByRole('button', { name: /Run/i }).first().click();
    await page.waitForSelector('.flow-runtime-row', { timeout: 20000 });
    const rows = await page.$$('.flow-runtime-row');
    let ok = false;
    for (const r of rows){
      const code = await r.$('code'); if (!code) continue;
      const key = (await code.textContent()).trim();
      if (key === 'fileVar'){
        const val = (await (await r.$('.flow-runtime-val')).textContent()).trim();
        if (val === 'beta') ok = true;
      }
    }
    if (!ok) throw new Error('fileVar value mismatch');
    return { id: 'F-01', status: 'PASS' };
  } catch (err){
    return { id: 'F-01', status: 'FAIL', error: String(err) };
  }
}

export async function testFileImportInvalid(page, fixtures){
  try {
    await page.goto(fixtures.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.flow-builder');
    await page.click('.flow-params-actions .add-file');
    await page.waitForSelector('.flow-param-editor');
    await page.fill('.flow-param-editor input[name="varName"]', 'fileBad');
    const filePath = path.resolve(fixtures.projectRoot, 'tests', 'fixtures', 'invalid.json');
    const input = await page.locator('.flow-param-editor input[type=file]').first();
    await input.setInputFiles(filePath);
    await page.click('.flow-param-editor .save-param');
    const err = await page.locator('.flow-param-error, .toast-error').first();
    if (await err.count()) return { id: 'F-02', status: 'PASS' };
    return { id: 'F-02', status: 'FAIL', error: 'No error shown for invalid file' };
  } catch (err){
    return { id: 'F-02', status: 'FAIL', error: String(err) };
  }
}
