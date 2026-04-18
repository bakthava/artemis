import { chromium } from 'playwright-core';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_BASE_URL = 'http://localhost:9090';
const DEFAULT_OUT_FILE = 'tmp/smoke-parameters-report.json';

function parseArgs(argv) {
  const options = {
    baseUrl: DEFAULT_BASE_URL,
    outFile: DEFAULT_OUT_FILE,
    channel: 'msedge',
    headed: false,
    invalidFile: null,
    sampleFile: null,
    keepArtifacts: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--headed') {
      options.headed = true;
      continue;
    }
    if (arg === '--keep-artifacts') {
      options.keepArtifacts = true;
      continue;
    }
    if (arg === '--base-url') {
      options.baseUrl = argv[i + 1] || options.baseUrl;
      i += 1;
      continue;
    }
    if (arg === '--out') {
      options.outFile = argv[i + 1] || options.outFile;
      i += 1;
      continue;
    }
    if (arg === '--channel') {
      options.channel = argv[i + 1] || options.channel;
      i += 1;
      continue;
    }
    if (arg === '--invalid-file') {
      options.invalidFile = argv[i + 1] || options.invalidFile;
      i += 1;
      continue;
    }
    if (arg === '--sample-file') {
      options.sampleFile = argv[i + 1] || options.sampleFile;
      i += 1;
      continue;
    }
  }

  return options;
}

function printHelp() {
  console.log('Artemis Parameters Smoke Test');
  console.log('');
  console.log('Usage: node scripts/smoke-parameters.mjs [options]');
  console.log('');
  console.log('Options:');
  console.log('  --base-url <url>        App URL (default: http://localhost:9090)');
  console.log('  --out <file>            Report output path (default: tmp/smoke-parameters-report.json)');
  console.log('  --channel <name>        Browser channel, e.g. msedge/chrome (default: msedge)');
  console.log('  --headed                Run headed browser');
  console.log('  --sample-file <file>    CSV file to use for parameter file tests');
  console.log('  --invalid-file <file>   Invalid file used to verify format rejection');
  console.log('  --keep-artifacts        Keep generated temp files');
  console.log('  --help, -h              Show this help');
}

function toAbsolutePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeReport(outFile, report) {
  const absOut = toAbsolutePath(outFile);
  await fsp.mkdir(path.dirname(absOut), { recursive: true });
  await fsp.writeFile(absOut, JSON.stringify(report, null, 2), 'utf8');
  return absOut;
}

async function launchBrowser(channel, headed) {
  try {
    const browser = await chromium.launch({ channel, headless: !headed });
    return { browser, launchPathUsed: `${channel}-channel` };
  } catch (e1) {
    try {
      const browser = await chromium.launch({ headless: !headed });
      return {
        browser,
        launchPathUsed: 'chromium-fallback',
        launchError: String(e1),
      };
    } catch (e2) {
      throw new Error(`Browser launch failed. ${channel}: ${e1}; fallback: ${e2}`);
    }
  }
}

async function clickByRoleRegex(page, role, regexes) {
  for (const rx of regexes) {
    const loc = page.getByRole(role, { name: rx }).first();
    if (await loc.count()) {
      await loc.click();
      return true;
    }
  }
  return false;
}

async function fillByLabel(card, labelRx, value) {
  const label = card.locator('label').filter({ hasText: labelRx }).first();
  if (!(await label.count())) throw new Error(`Label not found: ${labelRx}`);

  const forAttr = await label.getAttribute('for');
  if (forAttr) {
    const target = card.locator(`#${forAttr}`).first();
    if (await target.count()) {
      await target.fill(String(value));
      return;
    }
  }

  const siblingInput = label.locator('xpath=following-sibling::input[1] | following-sibling::textarea[1]').first();
  if (await siblingInput.count()) {
    await siblingInput.fill(String(value));
    return;
  }

  const parentInput = label.locator('xpath=..').locator('input,textarea').first();
  if (await parentInput.count()) {
    await parentInput.fill(String(value));
    return;
  }

  throw new Error(`Input/textarea not found for label: ${labelRx}`);
}

async function selectByLabel(card, labelRx, options) {
  const label = card.locator('label').filter({ hasText: labelRx }).first();
  if (!(await label.count())) throw new Error(`Label not found: ${labelRx}`);

  const forAttr = await label.getAttribute('for');
  let sel = null;
  if (forAttr) {
    const target = card.locator(`#${forAttr}`).first();
    if (await target.count()) sel = target;
  }
  if (!sel) {
    const sibling = label.locator('xpath=following-sibling::select[1]').first();
    if (await sibling.count()) sel = sibling;
  }
  if (!sel) {
    const parent = label.locator('xpath=..').locator('select').first();
    if (await parent.count()) sel = parent;
  }
  if (!sel) throw new Error(`Select not found for label: ${labelRx}`);

  const optionList = Array.isArray(options) ? options : [options];
  for (const opt of optionList) {
    try {
      await sel.selectOption({ value: String(opt) });
      if ((await sel.inputValue()) === String(opt)) return;
    } catch {
      // continue
    }
    try {
      await sel.selectOption({ label: String(opt) });
      return;
    } catch {
      // continue
    }
  }

  const allOptions = await sel.evaluate((el) =>
    Array.from(el.options).map((o) => ({ value: o.value, label: (o.textContent || '').trim() })),
  );
  throw new Error(
    `Unable to set select for ${labelRx}. Tried ${JSON.stringify(optionList)}. Available: ${JSON.stringify(allOptions)}`,
  );
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function ensureFixtureFiles(options) {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'artemis-params-smoke-'));
  let createdFixtureRoot = true;

  let invalidPath = options.invalidFile ? toAbsolutePath(options.invalidFile) : path.join(fixtureRoot, 'invalid.json');
  let samplePath = options.sampleFile ? toAbsolutePath(options.sampleFile) : path.join(fixtureRoot, 'sample.csv');

  if (options.invalidFile) {
    if (!(await fileExists(invalidPath))) {
      throw new Error(`Provided invalid file not found: ${invalidPath}`);
    }
  } else {
    await fsp.writeFile(invalidPath, '{"bad":true}\n', 'utf8');
  }

  if (options.sampleFile) {
    if (!(await fileExists(samplePath))) {
      throw new Error(`Provided sample file not found: ${samplePath}`);
    }
  } else {
    await fsp.writeFile(samplePath, 'alpha\nbeta\n', 'utf8');
  }

  if (options.invalidFile || options.sampleFile || options.keepArtifacts) {
    createdFixtureRoot = false;
  }

  return { fixtureRoot, createdFixtureRoot, invalidPath, samplePath };
}

async function cleanupFixtureDir(fixtureRoot, shouldCleanup) {
  if (!shouldCleanup) return;
  await fsp.rm(fixtureRoot, { recursive: true, force: true });
}

async function runSmoke(options) {
  const checks = {
    gNumInRange: false,
    gUuidFormat: false,
    gTime14Digits: false,
    gTextLength: false,
    scriptVarPrefix: false,
    fileVarBeta: false,
    combinedResolvedAndPipes: false,
    setVariableNodeSuccess: false,
  };

  const errors = [];
  let runtimeVariables = {};
  let setVarStatusRaw = 'unknown';

  const fixtures = await ensureFixtureFiles(options);
  const { browser, launchPathUsed, launchError } = await launchBrowser(options.channel, options.headed);
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(options.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const clickedFlow = await clickByRoleRegex(page, 'button', [/^Flow$/i, /Flow/i]);
    if (!clickedFlow) throw new Error('Flow button not found');

    await clickByRoleRegex(page, 'button', [/^\+\s*New$/i, /^New$/i, /\+\s*New/i]);

    const openedParams = await clickByRoleRegex(page, 'button', [/^Parameters$/i, /Parameters/i]);
    if (!openedParams) throw new Error('Parameters button not found');

    await page
      .getByText('How to pass variables into script and requests', { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });

    const addGeneratorBtn = page.getByRole('button', { name: /Add Generator/i }).first();
    const addScriptBtn = page.getByRole('button', { name: /Add Script/i }).first();

    await addGeneratorBtn.waitFor({ state: 'visible', timeout: 30000 });
    for (let i = 0; i < 4; i += 1) {
      await addGeneratorBtn.click();
    }
    await addScriptBtn.click();

    const fileInput = page.locator('.flow-builder input[type="file"][accept*=".xls"]').first();
    await fileInput.waitFor({ state: 'attached', timeout: 30000 });

    const accept = (await fileInput.getAttribute('accept')) || '';
    if (!accept.toLowerCase().includes('.csv')) {
      errors.push(`File input accept does not include .csv. accept=${accept}`);
    }

    await fileInput.setInputFiles(fixtures.invalidPath);
    await page.getByText('Unsupported file format', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });

    await fileInput.setInputFiles(fixtures.samplePath);

    await page.waitForFunction(() => document.querySelectorAll('.flow-param-card').length >= 6, { timeout: 30000 });

    const genCards = page.locator('.flow-param-card').filter({ has: page.locator('label:has-text("Generator Type")') });
    if ((await genCards.count()) < 4) throw new Error('Expected at least 4 generator cards');

    const g1 = genCards.nth(0);
    await fillByLabel(g1, /Variable\s*Name/i, 'gNum');
    await selectByLabel(g1, /Scope/i, ['global', 'Global']);
    await selectByLabel(g1, /Generator\s*Type/i, ['number', 'Number']);
    await fillByLabel(g1, /Min\s*Number/i, '10');
    await fillByLabel(g1, /Max\s*Number/i, '12');
    await selectByLabel(g1, /Number\s*Mode/i, ['integer', 'Integer']);

    const g2 = genCards.nth(1);
    await fillByLabel(g2, /Variable\s*Name/i, 'gUuid');
    await selectByLabel(g2, /Generator\s*Type/i, ['uuid', 'UUID']);

    const g3 = genCards.nth(2);
    await fillByLabel(g3, /Variable\s*Name/i, 'gTime');
    await selectByLabel(g3, /Generator\s*Type/i, ['time', 'Time']);
    await selectByLabel(g3, /Time\s*Format/i, ['custom', 'Custom']);
    await fillByLabel(g3, /Custom\s*Pattern/i, 'YYYYMMDDHHmmss');

    const g4 = genCards.nth(3);
    await fillByLabel(g4, /Variable\s*Name/i, 'gText');
    await selectByLabel(g4, /Generator\s*Type/i, ['text', 'Text']);
    await fillByLabel(g4, /Min\s*Length/i, '5');
    await fillByLabel(g4, /Max\s*Length/i, '8');
    await selectByLabel(g4, /Character\s*Set/i, ['alphanumeric', 'Alphanumeric']);

    const scriptCard = page.locator('.flow-param-card').filter({ has: page.locator('textarea') }).first();
    if (!(await scriptCard.count())) throw new Error('Script card not found');
    await fillByLabel(scriptCard, /Variable\s*Name/i, 'scriptVar');
    await scriptCard.locator('textarea').first().fill('return String(vars.gNum || "") + "-" + helpers.randomInt(1, 9);');

    const fileCard = page.locator('.flow-param-card').filter({ hasText: /sample\.csv/i }).first();
    if (!(await fileCard.count())) throw new Error('File card for sample.csv not found');
    await fillByLabel(fileCard, /Variable\s*Name/i, 'fileVar');
    await selectByLabel(fileCard, /Pick\s*Value/i, ['index', 'Index']);
    await fillByLabel(fileCard, /Row\s*Number/i, '2');

    const stepBtn = page.locator('.flow-toolbar-btns .flow-btn').filter({ hasText: '+ Step' }).first();
    await stepBtn.click();

    const setVarMenu = page.locator('.flow-add-menu-item').filter({ hasText: /Set Variable/i }).first();
    await setVarMenu.waitFor({ state: 'visible', timeout: 10000 });
    await setVarMenu.click();

    const setVarNode = page
      .locator('.react-flow__node, .flow-node, [class*="node"]')
      .filter({ hasText: /Set Variable/i })
      .first();
    await setVarNode.waitFor({ state: 'visible', timeout: 30000 });
    await setVarNode.click({ force: true });

    await page.locator('.set-var-name').first().fill('combined');
    await page.locator('.set-var-val').first().fill('{{gNum}}|{{gUuid}}|{{gTime}}|{{gText}}|{{scriptVar}}|{{fileVar}}');

    await clickByRoleRegex(page, 'button', [/^Vars$/i, /Vars/i]);
    const runBtn = page.locator('.flow-toolbar-btns .run-btn').first();
    await runBtn.waitFor({ state: 'visible', timeout: 10000 });
    await runBtn.click();

    const nodeStatusStr = await page.waitForFunction(() => {
      const nodes = Array.from(document.querySelectorAll('.flow-node'));
      const target = nodes.find((n) => /Set\s*Variable/i.test((n.querySelector('.fn-name')?.textContent || '').trim()));
      if (!target) return null;
      const blob = `${target.className || ''} ${target.getAttribute('data-status') || ''} ${target.getAttribute('aria-label') || ''}`.toLowerCase();
      if (blob.includes('success') || blob.includes('failed') || blob.includes('error')) return blob;
      return null;
    }, { timeout: 90000 });

    setVarStatusRaw = await nodeStatusStr.jsonValue();
    checks.setVariableNodeSuccess = /success/.test(setVarStatusRaw) && !/failed|error/.test(setVarStatusRaw);

    await page.waitForSelector('.flow-runtime-row', { timeout: 30000 });
    runtimeVariables = await page.evaluate(() => {
      const out = {};
      const rows = Array.from(document.querySelectorAll('.flow-runtime-row'));
      for (const row of rows) {
        const key = (row.querySelector('code')?.textContent || '').trim();
        const value = (row.querySelector('.flow-runtime-val')?.textContent || '').trim();
        if (key) out[key] = value;
      }
      return out;
    });

    const gNum = Number.parseInt(String(runtimeVariables.gNum ?? ''), 10);
    checks.gNumInRange = Number.isInteger(gNum) && gNum >= 10 && gNum <= 12;

    const gUuid = String(runtimeVariables.gUuid ?? '');
    checks.gUuidFormat = isUuid(gUuid);

    const gTime = String(runtimeVariables.gTime ?? '');
    checks.gTime14Digits = /^\d{14}$/.test(gTime);

    const gText = String(runtimeVariables.gText ?? '');
    checks.gTextLength = gText.length >= 5 && gText.length <= 8;

    const scriptVar = String(runtimeVariables.scriptVar ?? '');
    checks.scriptVarPrefix = scriptVar.startsWith(`${gNum}-`);

    const fileVar = String(runtimeVariables.fileVar ?? '');
    checks.fileVarBeta = fileVar === 'beta';

    const combined = String(runtimeVariables.combined ?? '');
    checks.combinedResolvedAndPipes = !combined.includes('{{') && ((combined.match(/\|/g) || []).length === 5);

    for (const [name, passed] of Object.entries(checks)) {
      if (!passed) errors.push(`Check failed: ${name}`);
    }
  } catch (err) {
    errors.push(String(err?.stack || err));
  } finally {
    await context.close();
    await browser.close();
    await cleanupFixtureDir(fixtures.fixtureRoot, fixtures.createdFixtureRoot);
  }

  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    launchPathUsed,
    launchError: launchError || null,
    checks,
    runtimeVariables,
    setVarStatusRaw,
    errors,
    optionsUsed: {
      baseUrl: options.baseUrl,
      channel: options.channel,
      headed: options.headed,
      sampleFile: options.sampleFile || '(generated)',
      invalidFile: options.invalidFile || '(generated)',
    },
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const report = await runSmoke(options);
  const reportPath = await writeReport(options.outFile, report);

  const failingChecks = Object.entries(report.checks)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  console.log(`SMOKE_PARAMETERS ${report.status}`);
  console.log(`REPORT_PATH ${reportPath}`);
  if (failingChecks.length > 0) {
    console.log(`FAILING_CHECKS ${failingChecks.join(',')}`);
  }

  if (report.status !== 'PASS') {
    process.exitCode = 1;
  }
}

main().catch(async (err) => {
  const fallback = {
    status: 'FAIL',
    checks: {},
    runtimeVariables: {},
    errors: [String(err?.stack || err)],
  };
  const reportPath = await writeReport(DEFAULT_OUT_FILE, fallback);
  console.error(`SMOKE_PARAMETERS FAIL`);
  console.error(`REPORT_PATH ${reportPath}`);
  process.exit(1);
});
