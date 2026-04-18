import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
const tempDir = process.env.UI_TEMP_DIR || process.cwd();
const resultPath = path.join(tempDir, "ui-export-result.json");
const write = (o) => fs.writeFileSync(resultPath, JSON.stringify(o, null, 2));
async function launchBrowser() {
  try { return { browser: await chromium.launch({ channel: "msedge", headless: true }), launchPathUsed: "msedge-channel" }; }
  catch (e1) {
    try { return { browser: await chromium.launch({ headless: true }), launchPathUsed: "chromium-headless-fallback", launchError: String(e1) }; }
    catch (e2) { write({ status:"LAUNCH_FAILED", launchPathUsed:"none", msedgeError:String(e1), chromiumFallbackError:String(e2) }); throw e2; }
  }
}
(async () => {
  const { browser, launchPathUsed, launchError } = await launchBrowser();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  try {
    await page.goto("http://localhost:9090", { waitUntil: "domcontentloaded", timeout: 60000 });
    const flow = page.getByRole("button", { name: /Flow/i }).first();
    if (await flow.count()) { await flow.click(); } else { await page.locator('button:has-text("Flow"), [role="button"]:has-text("Flow")').first().click(); }
    await page.waitForSelector('.flow-toolbar .certificate-selector select', { timeout: 30000 });
    const selectedCertificateSetId = await page.locator('.flow-toolbar .certificate-selector select').first().evaluate((el) => {
      const first = Array.from(el.options || []).find(o => (o.value || "").trim() !== "");
      if (!first) return null;
      el.value = first.value; el.dispatchEvent(new Event("input", { bubbles:true })); el.dispatchEvent(new Event("change", { bubbles:true }));
      return first.value;
    });
    if (!selectedCertificateSetId) throw new Error("No non-empty certificate set option found");
    const exportBtn = page.locator('.flow-toolbar-btns .flow-btn', { hasText: "Export" }).first();
    await exportBtn.waitFor({ state: "visible", timeout: 30000 });
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), exportBtn.click()]);
    const filePath = path.join(tempDir, download.suggestedFilename() || `flow-export-${Date.now()}.zip`);
    await download.saveAs(filePath);
    const out = { status:"OK", launchPathUsed, launchError: launchError || null, selectedCertificateSetId, downloadedFilePath:filePath };
    write(out); console.log(JSON.stringify(out));
  } finally { await context.close(); await browser.close(); }
})().catch((err) => { console.error(err); process.exit(1); });