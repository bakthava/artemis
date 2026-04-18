export async function testExportFlow(page, fixtures){
  try {
    await page.goto(fixtures.baseUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.flow-toolbar .certificate-selector select', { timeout: 15000 });
    const select = page.locator('.flow-toolbar .certificate-selector select').first();
    const selected = await select.evaluate((el) => {
      const opts = Array.from(el.options||[]);
      const first = opts.find(o => (o.value||'').trim()!=='');
      if (!first) return null;
      el.value = first.value;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      return first.value;
    });
    if (!selected) return { id: 'E-01', status: 'SKIP', reason: 'no non-empty certificate set available' };
    const exportBtn = page.locator('.flow-toolbar-btns .flow-btn', { hasText: 'Export' }).first();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60000 }),
      exportBtn.click()
    ]);
    const suggested = download.suggestedFilename() || `flow-export-${Date.now()}.zip`;
    const tempPath = fixtures.tempDir || '.';
    const savePath = require('path').join(tempPath, suggested);
    await download.saveAs(savePath);
    return { id: 'E-01', status: 'PASS', downloaded: savePath };
  } catch (err){
    return { id: 'E-01', status: 'FAIL', error: String(err) };
  }
}
