import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reportPath = path.join(__dirname, "smoke-parameters-report.json");
const invalidPath = path.join(__dirname, "invalid.json");
const samplePath = path.join(__dirname, "sample.csv");

const errors = [];
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

function esc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function launchBrowser() {
  try {
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    return { browser, launchPathUsed: "msedge-channel" };
  } catch (e1) {
    try {
      const browser = await chromium.launch({ headless: true });
      return { browser, launchPathUsed: "chromium-headless-fallback", launchError: String(e1) };
    } catch (e2) {
      throw new Error(`Browser launch failed. msedge: ${e1}; fallback: ${e2}`);
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
  const label = card.locator("label").filter({ hasText: labelRx }).first();
  if (!(await label.count())) throw new Error(`Label not found: ${labelRx}`);

  const forAttr = await label.getAttribute("for");
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

  const parentInput = label.locator('xpath=..').locator("input,textarea").first();
  if (await parentInput.count()) {
    await parentInput.fill(String(value));
    return;
  }

  throw new Error(`Input/textarea not found for label: ${labelRx}`);
}

async function selectByLabel(card, labelRx, options) {
  const label = card.locator("label").filter({ hasText: labelRx }).first();
  if (!(await label.count())) throw new Error(`Label not found: ${labelRx}`);

  const forAttr = await label.getAttribute("for");
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
    const parent = label.locator('xpath=..').locator("select").first();
    if (await parent.count()) sel = parent;
  }
  if (!sel) throw new Error(`Select not found for label: ${labelRx}`);

  const optionList = Array.isArray(options) ? options : [options];
  for (const opt of optionList) {
    try {
      await sel.selectOption({ value: String(opt) });
      const v = await sel.inputValue();
      if (v === String(opt)) return;
    } catch {}
    try {
      await sel.selectOption({ label: String(opt) });
      return;
    } catch {}
  }

  const allOptions = await sel.evaluate((el) => Array.from(el.options).map((o) => ({ value: o.value, label: (o.textContent || "").trim() })));
  throw new Error(`Unable to set select for ${labelRx}. Tried ${JSON.stringify(optionList)}. Available: ${JSON.stringify(allOptions)}`);
}

(async () => {
  fs.writeFileSync(invalidPath, '{"bad":true}\n', "utf8");
  fs.writeFileSync(samplePath, "alpha\nbeta\n", "utf8");

  const { browser, launchPathUsed } = await launchBrowser();
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  let runtimeVariables = {};
  let setVarStatusRaw = "unknown";

  try {
    await page.goto("http://localhost:9090", { waitUntil: "domcontentloaded", timeout: 60000 });

    const clickedFlow = await clickByRoleRegex(page, "button", [/^Flow$/i, /Flow/i]);
    if (!clickedFlow) throw new Error("Flow button not found");

    await clickByRoleRegex(page, "button", [/^\+\s*New$/i, /^New$/i, /\+\s*New/i]);

    const openedParams = await clickByRoleRegex(page, "button", [/^Parameters$/i, /Parameters/i]);
    if (!openedParams) throw new Error("Parameters button not found");

    await page.getByText("How to pass variables into script and requests", { exact: false }).first().waitFor({ state: "visible", timeout: 30000 });

    const addGeneratorBtn = page.getByRole("button", { name: /Add Generator/i }).first();
    const addScriptBtn = page.getByRole("button", { name: /Add Script/i }).first();

    await addGeneratorBtn.waitFor({ state: "visible", timeout: 30000 });
    for (let i = 0; i < 4; i++) {
      await addGeneratorBtn.click();
    }
    await addScriptBtn.click();

    const fileInput = page.locator('.flow-builder input[type="file"][accept*=".xls"]').first();
    await fileInput.waitFor({ state: "attached", timeout: 30000 });
    const accept = (await fileInput.getAttribute("accept")) || "";
    if (!accept.toLowerCase().includes(".csv")) {
      errors.push(`File input accept does not include .csv. accept=${accept}`);
    }

    await fileInput.setInputFiles(invalidPath);
    await page.getByText("Unsupported file format", { exact: false }).first().waitFor({ state: "visible", timeout: 15000 });

    await fileInput.setInputFiles(samplePath);

    await page.waitForFunction(() => document.querySelectorAll(".flow-param-card").length >= 6, { timeout: 30000 });

    const genCards = page.locator('.flow-param-card').filter({ has: page.locator('label:has-text("Generator Type")') });
    if ((await genCards.count()) < 4) throw new Error("Expected at least 4 generator cards");

    const g1 = genCards.nth(0);
    await fillByLabel(g1, /Variable\s*Name/i, "gNum");
    await selectByLabel(g1, /Scope/i, ["global", "Global"]);
    await selectByLabel(g1, /Generator\s*Type/i, ["number", "Number"]);
    await fillByLabel(g1, /Min\s*Number/i, "10");
    await fillByLabel(g1, /Max\s*Number/i, "12");
    await selectByLabel(g1, /Number\s*Mode/i, ["integer", "Integer"]);

    const g2 = genCards.nth(1);
    await fillByLabel(g2, /Variable\s*Name/i, "gUuid");
    await selectByLabel(g2, /Generator\s*Type/i, ["uuid", "UUID"]);

    const g3 = genCards.nth(2);
    await fillByLabel(g3, /Variable\s*Name/i, "gTime");
    await selectByLabel(g3, /Generator\s*Type/i, ["time", "Time"]);
    await selectByLabel(g3, /Time\s*Format/i, ["custom", "Custom"]);
    await fillByLabel(g3, /Custom\s*Pattern/i, "YYYYMMDDHHmmss");

    const g4 = genCards.nth(3);
    await fillByLabel(g4, /Variable\s*Name/i, "gText");
    await selectByLabel(g4, /Generator\s*Type/i, ["text", "Text"]);
    await fillByLabel(g4, /Min\s*Length/i, "5");
    await fillByLabel(g4, /Max\s*Length/i, "8");
    await selectByLabel(g4, /Character\s*Set/i, ["alphanumeric", "Alphanumeric"]);

    const scriptCard = page.locator('.flow-param-card').filter({ has: page.locator('textarea') }).first();
    if (!(await scriptCard.count())) throw new Error("Script card not found");
    await fillByLabel(scriptCard, /Variable\s*Name/i, "scriptVar");
    await scriptCard.locator("textarea").first().fill('return String(vars.gNum || "") + "-" + helpers.randomInt(1, 9);');

    const fileCard = page.locator('.flow-param-card').filter({ hasText: /sample\.csv/i }).first();
    if (!(await fileCard.count())) throw new Error("File card for sample.csv not found");
    await fillByLabel(fileCard, /Variable\s*Name/i, "fileVar");
    await selectByLabel(fileCard, /Pick\s*Value/i, ["index", "Index"]);
    await fillByLabel(fileCard, /Row\s*Number/i, "2");

    const stepBtn = page.locator('.flow-toolbar-btns .flow-btn').filter({ hasText: '+ Step' }).first();
    await stepBtn.click();

    const setVarMenu = page.locator('.flow-add-menu-item').filter({ hasText: /Set Variable/i }).first();
    await setVarMenu.waitFor({ state: 'visible', timeout: 10000 });
    await setVarMenu.click();

    const setVarNode = page.locator('.react-flow__node, .flow-node, [class*="node"]').filter({ hasText: /Set Variable/i }).first();
    await setVarNode.waitFor({ state: "visible", timeout: 30000 });
    await setVarNode.click({ force: true });

    await page.locator('.set-var-name').first().fill("combined");
    await page.locator('.set-var-val').first().fill("{{gNum}}|{{gUuid}}|{{gTime}}|{{gText}}|{{scriptVar}}|{{fileVar}}");

    await clickByRoleRegex(page, "button", [/^Vars$/i, /Vars/i]);
    const runBtn = page.locator('.flow-toolbar-btns .run-btn').first();
    await runBtn.waitFor({ state: 'visible', timeout: 10000 });
    await runBtn.click();

    const nodeStatusStr = await page.waitForFunction(() => {
      const nodes = Array.from(document.querySelectorAll('.flow-node'));
      const target = nodes.find((n) => /Set\s*Variable/i.test((n.querySelector('.fn-name')?.textContent || '').trim()));
      if (!target) return null;
      const blob = `${target.className || ""} ${target.getAttribute("data-status") || ""} ${target.getAttribute("aria-label") || ""}`.toLowerCase();
      if (blob.includes("success") || blob.includes("failed") || blob.includes("error")) return blob;
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

    const gNum = Number.parseInt(String(runtimeVariables.gNum ?? ""), 10);
    checks.gNumInRange = Number.isInteger(gNum) && gNum >= 10 && gNum <= 12;

    const gUuid = String(runtimeVariables.gUuid ?? "");
    checks.gUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(gUuid);

    const gTime = String(runtimeVariables.gTime ?? "");
    checks.gTime14Digits = /^\d{14}$/.test(gTime);

    const gText = String(runtimeVariables.gText ?? "");
    checks.gTextLength = gText.length >= 5 && gText.length <= 8;

    const scriptVar = String(runtimeVariables.scriptVar ?? "");
    checks.scriptVarPrefix = scriptVar.startsWith(`${gNum}-`);

    const fileVar = String(runtimeVariables.fileVar ?? "");
    checks.fileVarBeta = fileVar === "beta";

    const combined = String(runtimeVariables.combined ?? "");
    checks.combinedResolvedAndPipes = !combined.includes("{{") && ((combined.match(/\|/g) || []).length === 5);

    for (const [k, ok] of Object.entries(checks)) {
      if (!ok) errors.push(`Check failed: ${k}`);
    }
  } catch (err) {
    errors.push(String(err?.stack || err));
  } finally {
    await context.close();
    await browser.close();
  }

  const status = errors.length === 0 ? "PASS" : "FAIL";
  const report = {
    status,
    launchPathUsed,
    checks,
    runtimeVariables,
    errors,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  const failingChecks = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  console.log(`SMOKE_PARAMETERS ${status} ${reportPath}`);
  if (failingChecks.length) {
    console.log(`FAILING_CHECKS ${failingChecks.join(",")}`);
  }
})();
