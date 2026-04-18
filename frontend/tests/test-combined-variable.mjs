export async function testCombinedVariable(page, fixtures){
  try {
    await page.goto(fixtures.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.flow-builder');
    // Add a Set Variable node - this is UI-specific; attempt to open node creation
    await page.click('.flow-nodes-toolbar .add-set-variable, .add-node-setvar');
    // wait for node editor
    await page.waitForSelector('.set-var-editor, .node-editor', { timeout: 5000 });
    // Fill name and value template
    const nameInput = await page.locator('.set-var-editor input[name="name"]').first();
    if (await nameInput.count()){
      await nameInput.fill('combined');
      const valInput = await page.locator('.set-var-editor textarea[name="value"]').first();
      await valInput.fill('{{gNum}}|{{gUuid}}|{{gTime}}|{{gText}}|{{scriptVar}}|{{fileVar}}');
      await page.click('.set-var-editor .save-node');
    } else {
      // fallback: assume there's a simple form
      await page.fill('.node-editor input[name="name"]', 'combined');
      await page.fill('.node-editor textarea[name="value"]', '{{gNum}}|{{gUuid}}|{{gTime}}|{{gText}}|{{scriptVar}}|{{fileVar}}');
      await page.click('.node-editor .save');
    }
    // run
    await page.getByRole('button', { name: /Run/i }).first().click();
    await page.waitForSelector('.flow-runtime-row', { timeout: 20000 });
    const rows = await page.$$('.flow-runtime-row');
    let ok = false;
    for (const r of rows){
      const code = await r.$('code'); if (!code) continue;
      const key = (await code.textContent()).trim();
      if (key === 'combined'){
        const val = (await (await r.$('.flow-runtime-val')).textContent()).trim();
        if (!val.includes('{{') && (val.split('|').length >= 6)) ok = true;
      }
    }
    if (!ok) throw new Error('combined var not resolved');
    return { id: 'V-01', status: 'PASS' };
  } catch (err){
    return { id: 'V-01', status: 'FAIL', error: String(err) };
  }
}
