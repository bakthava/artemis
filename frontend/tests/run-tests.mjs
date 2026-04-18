import path from 'node:path';
import fs from 'node:fs';
import { launchBrowser } from './utils.mjs';

const fixtures = {
  baseUrl: process.env.BASE_URL || 'http://localhost:9090',
  projectRoot: path.resolve(process.cwd(), '..'),
  tempDir: path.resolve(process.cwd(), '..', 'tmp')
};

const tests = [
  { name: 'generator-number', file: './test-generator-number.mjs' },
  { name: 'script', file: './test-script.mjs' },
  { name: 'file', file: './test-file.mjs' },
  { name: 'combined', file: './test-combined-variable.mjs' },
  { name: 'export', file: './test-export-flow.mjs' }
];

async function run(){
  const headed = process.argv.includes('--headed') || process.env.HEADED === '1';
  const report = { timestamp:new Date().toISOString(), baseUrl: fixtures.baseUrl, headed, results: [] };
  const { browser } = await launchBrowser(headed);
  try {
    for (const t of tests){
      const modPath = path.resolve(path.dirname(import.meta.url.replace('file:///','')), t.file);
      // dynamic import using relative path
      const module = await import(t.file);
      // create a simple context (no video) to avoid ffmpeg dependency
      const context = await browser.newContext({ acceptDownloads: true });
      const page = await context.newPage();
      // wrap page.goto to capture a full-page screenshot immediately after navigation
      const origGoto = page.goto.bind(page);
      page.goto = async (url, options) => {
        const res = await origGoto(url, options);
        try {
          const ts = Date.now();
          const shot = path.join(fixtures.tempDir, `${t.name}-after-goto-${ts}.png`);
          if (!fs.existsSync(fixtures.tempDir)) fs.mkdirSync(fixtures.tempDir, { recursive: true });
          await page.screenshot({ path: shot, fullPage: true });
        } catch (s) {}
        return res;
      };
      try {
        if (module.default){
          const res = await module.default(page, fixtures);
          report.results.push({ test: t.name, result: res });
        } else {
          // call exported functions if present
          const resArr = [];
          for (const k of Object.keys(module)){
            if (typeof module[k] === 'function'){
              try {
                const r = await module[k](page, fixtures);
                resArr.push(r);
              } catch (e){
                // capture screenshot on failure
                const ts = Date.now();
                const screenshotPath = path.join(fixtures.tempDir, `${t.name}-${k}-${ts}.png`);
                try { await page.screenshot({ path: screenshotPath, fullPage: true }); } catch (s) {}
                resArr.push({ id: k, status: 'FAIL', error: String(e), screenshot: screenshotPath });
              }
            }
          }
          report.results.push({ test: t.name, result: resArr });
        }
      } catch (e) {
        const ts = Date.now();
        const screenshotPath = path.join(fixtures.tempDir, `${t.name}-error-${ts}.png`);
        try { await page.screenshot({ path: screenshotPath, fullPage: true }); } catch (s) {}
        report.results.push({ test: t.name, error: String(e), screenshot: screenshotPath });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    const outPath = path.join(fixtures.tempDir, 'playwright-report.json');
    if (!fs.existsSync(fixtures.tempDir)) fs.mkdirSync(fixtures.tempDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log('Wrote report to', outPath);
  }
}

run().catch((e)=>{ console.error(e); process.exit(1) });
