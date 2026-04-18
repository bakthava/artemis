import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

export async function launchBrowser(headed = false) {
  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: !headed });
    return { browser, launchPathUsed: 'msedge-channel' };
  } catch (e1) {
    const browser = await chromium.launch({ headless: !headed });
    return { browser, launchPathUsed: 'chromium-headless-fallback', launchError: String(e1) };
  }
}

export async function clickFlow(page) {
  const roleBtn = page.getByRole('button', { name: /Flow/i }).first();
  if (await roleBtn.count()) {
    await roleBtn.click();
    return;
  }
  const loc = page.locator('button:has-text("Flow"), [role="button"]:has-text("Flow")').first();
  await loc.click();
}

export async function openParametersPanel(page) {
  await clickFlow(page);
  // Wait for flow builder
  await page.waitForSelector('.flow-builder', { timeout: 15000 });
  const paramsBtn = page.getByRole('button', { name: /Parameters/i }).first();
  if (await paramsBtn.count()) {
    await paramsBtn.click();
  } else {
    // fallback: click params tab selector
    const alt = page.locator('.flow-params-toggle').first();
    if (await alt.count()) await alt.click();
  }
  await page.waitForSelector('.flow-parameters-panel', { timeout: 10000 });
}

export async function addNumberGenerator(page, {name='gNum', min=10, max=12, integer=true}){
  await openParametersPanel(page);
  await page.click('.flow-params-actions .add-generator');
  await page.waitForSelector('.flow-param-editor', { timeout: 5000 });
  // select type number
  await page.selectOption('.flow-param-editor select[name="kind"]', 'generator');
  await page.selectOption('.flow-param-editor select[name="generatorType"]', 'number');
  await page.fill('.flow-param-editor input[name="varName"]', name);
  await page.fill('.flow-param-editor input[name="min"]', String(min));
  await page.fill('.flow-param-editor input[name="max"]', String(max));
  if (integer) {
    await page.check('.flow-param-editor input[name="integer"]');
  }
  await page.click('.flow-param-editor .save-param');
}

export async function addScriptParameter(page, {name='scriptVar', script='return 42;'}){
  await openParametersPanel(page);
  await page.click('.flow-params-actions .add-script');
  await page.waitForSelector('.flow-param-editor', { timeout: 5000 });
  await page.fill('.flow-param-editor input[name="varName"]', name);
  await page.fill('.flow-param-editor textarea[name="script"]', script);
  await page.click('.flow-param-editor .save-param');
}

export async function addFileParameter(page, {name='fileVar', filePath}){
  await openParametersPanel(page);
  await page.click('.flow-params-actions .add-file');
  await page.waitForSelector('.flow-param-editor', { timeout: 5000 });
  await page.fill('.flow-param-editor input[name="varName"]', name);
  // attach file to file input inside the editor
  const input = await page.locator('.flow-param-editor input[type=file]').first();
  await input.setInputFiles(filePath);
  await page.click('.flow-param-editor .save-param');
}

export async function runFlowAndGetRuntime(page){
  // Click Run in toolbar
  const runBtn = page.getByRole('button', { name: /Run/i }).first();
  if (await runBtn.count()) {
    await runBtn.click();
  } else {
    await page.click('.flow-toolbar .run-button');
  }
  // Wait for runtime panel rows
  await page.waitForSelector('.flow-runtime-row', { timeout: 20000 });
  const rows = await page.$$('.flow-runtime-row');
  const vars = {};
  for (const r of rows) {
    try {
      const keyEl = await r.$('code');
      const valEl = await r.$('.flow-runtime-val');
      if (keyEl && valEl) {
        const key = (await keyEl.textContent()).trim();
        const val = (await valEl.textContent()).trim();
        vars[key] = val;
      }
    } catch (e) {
      // continue
    }
  }
  return vars;
}

export function writeReport(reportPath, payload){
  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
}
