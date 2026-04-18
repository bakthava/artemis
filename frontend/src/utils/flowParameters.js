import * as XLSX from 'xlsx';

const ALLOWED_EXTENSIONS = new Set(['csv', 'dat', 'txt', 'xls', 'xlsx']);
const TEXT_CHARSETS = {
  alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
  alphabetic: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  numeric: '0123456789',
  hex: '0123456789abcdef',
};
const DEFAULT_TIME_PATTERN = 'YYYY-MM-DD HH:mm:ss';

function getFileExtension(filename = '') {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return '';
  return filename.slice(idx + 1).toLowerCase();
}

function removeFileExtension(filename = '') {
  const idx = filename.lastIndexOf('.');
  if (idx < 0) return filename;
  return filename.slice(0, idx);
}

function sanitizeVariableName(raw = '') {
  const normalized = String(raw).trim().replace(/[^a-zA-Z0-9_]+/g, '_');
  const withLeading = normalized.replace(/^[^a-zA-Z_]+/, '');
  return withLeading || 'parameterValue';
}

function uniqueVariableName(baseName, existingNames) {
  const set = new Set(existingNames || []);
  if (!set.has(baseName)) return baseName;

  let i = 2;
  while (set.has(`${baseName}${i}`)) i += 1;
  return `${baseName}${i}`;
}

function detectDelimiter(firstLine = '') {
  const candidates = [',', '\t', ';', '|'];
  let winner = ',';
  let maxCount = -1;

  candidates.forEach((candidate) => {
    const count = firstLine.split(candidate).length - 1;
    if (count > maxCount) {
      maxCount = count;
      winner = candidate;
    }
  });

  return maxCount > 0 ? winner : null;
}

function parseTextRows(text, ext) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  if (ext === 'txt') {
    return lines.map((line) => [line]);
  }

  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) {
    return lines.map((line) => [line]);
  }

  return lines.map((line) => line.split(delimiter).map((cell) => String(cell).trim()));
}

function normalizeRows(rows = []) {
  return rows
    .map((row) => {
      if (Array.isArray(row)) {
        return row.map((cell) => (cell === null || cell === undefined ? '' : String(cell)));
      }
      return [row === null || row === undefined ? '' : String(row)];
    })
    .filter((row) => row.some((cell) => String(cell).trim() !== ''));
}

function pickFirstNonEmptyCell(row = []) {
  for (const cell of row) {
    const value = String(cell || '').trim();
    if (value) return value;
  }
  return String(row[0] || '');
}

function normalizeInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function randomIntInclusive(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function generateUuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function padNumber(value, width = 2) {
  return String(value).padStart(width, '0');
}

function formatDateByPattern(date, pattern = DEFAULT_TIME_PATTERN) {
  const tokens = {
    YYYY: String(date.getFullYear()),
    MM: padNumber(date.getMonth() + 1),
    DD: padNumber(date.getDate()),
    HH: padNumber(date.getHours()),
    mm: padNumber(date.getMinutes()),
    ss: padNumber(date.getSeconds()),
    SSS: padNumber(date.getMilliseconds(), 3),
  };

  return String(pattern).replace(/YYYY|MM|DD|HH|mm|ss|SSS/g, (token) => tokens[token] || token);
}

function formatTimestamp(date, format = 'iso', customPattern = DEFAULT_TIME_PATTERN) {
  switch (format) {
    case 'unix_seconds':
      return String(Math.floor(date.getTime() / 1000));
    case 'unix_millis':
      return String(date.getTime());
    case 'utc':
      return date.toUTCString();
    case 'custom':
      return formatDateByPattern(date, customPattern || DEFAULT_TIME_PATTERN);
    case 'iso':
    default:
      return date.toISOString();
  }
}

function normalizeResolvedValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function inferParameterKind(param = {}) {
  if (param.kind === 'file' || param.kind === 'generator' || param.kind === 'script') {
    return param.kind;
  }
  if (Array.isArray(param.rows)) return 'file';
  if (typeof param.scriptBody === 'string') return 'script';
  if (param.generatorType || param.generatorConfig) return 'generator';
  return 'file';
}

function resolveFileParameterValue(param, next) {
  const rows = Array.isArray(param?.rows) ? param.rows : [];
  if (rows.length === 0) {
    throw new Error('No rows available in parameter file.');
  }

  let pickedIndex = 0;
  let hasStateChanged = false;

  if (param.pickMode === 'random') {
    pickedIndex = Math.floor(Math.random() * rows.length);
  } else if (param.pickMode === 'index') {
    const idx = normalizeInt(param.pickIndex, 1) - 1;
    pickedIndex = Math.max(0, Math.min(rows.length - 1, idx));
  } else {
    const cursor = Number.isFinite(Number(param.cursor)) ? Number(param.cursor) : 0;
    pickedIndex = Math.max(0, Math.min(rows.length - 1, cursor));
    const nextCursor = (pickedIndex + 1) % rows.length;
    if (nextCursor !== cursor) {
      hasStateChanged = true;
      next.cursor = nextCursor;
    }
  }

  const row = Array.isArray(rows[pickedIndex]) ? rows[pickedIndex] : [rows[pickedIndex]];
  return {
    value: pickFirstNonEmptyCell(row),
    hasStateChanged,
  };
}

function resolveGeneratorParameterValue(param) {
  const generatorType = String(param.generatorType || 'number').toLowerCase();
  const cfg = {
    numberMin: 0,
    numberMax: 100,
    numberInteger: true,
    numberPrecision: 2,
    textMinLength: 8,
    textMaxLength: 16,
    textCharset: 'alphanumeric',
    timeFormat: 'iso',
    timeCustomFormat: DEFAULT_TIME_PATTERN,
    ...(param.generatorConfig || {}),
  };

  if (generatorType === 'uuid') {
    return generateUuid();
  }

  if (generatorType === 'time') {
    const now = new Date();
    return formatTimestamp(now, cfg.timeFormat, cfg.timeCustomFormat);
  }

  if (generatorType === 'text') {
    const minLen = Math.max(1, normalizeInt(cfg.textMinLength, 8));
    const maxLen = Math.max(minLen, normalizeInt(cfg.textMaxLength, 16));
    const length = randomIntInclusive(minLen, maxLen);
    const charset = TEXT_CHARSETS[cfg.textCharset] || TEXT_CHARSETS.alphanumeric;

    let output = '';
    for (let i = 0; i < length; i += 1) {
      const idx = Math.floor(Math.random() * charset.length);
      output += charset[idx];
    }
    return output;
  }

  const min = normalizeNumber(cfg.numberMin, 0);
  const max = normalizeNumber(cfg.numberMax, 100);
  const integerMode = cfg.numberInteger !== false;

  if (integerMode) {
    return String(randomIntInclusive(Math.round(min), Math.round(max)));
  }

  const precision = Math.max(0, Math.min(8, normalizeInt(cfg.numberPrecision, 2)));
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const raw = lo + Math.random() * (hi - lo);
  return Number(raw.toFixed(precision)).toString();
}

function createScriptHelpers() {
  return {
    randomInt(min = 0, max = 100) {
      return randomIntInclusive(normalizeInt(min, 0), normalizeInt(max, 100));
    },
    randomFloat(min = 0, max = 1, precision = 2) {
      const lo = Math.min(normalizeNumber(min, 0), normalizeNumber(max, 1));
      const hi = Math.max(normalizeNumber(min, 0), normalizeNumber(max, 1));
      const p = Math.max(0, Math.min(8, normalizeInt(precision, 2)));
      return Number((lo + Math.random() * (hi - lo)).toFixed(p));
    },
    randomText(minLength = 8, maxLength = 16, charset = 'alphanumeric') {
      return resolveGeneratorParameterValue({
        generatorType: 'text',
        generatorConfig: {
          textMinLength: minLength,
          textMaxLength: maxLength,
          textCharset: charset,
        },
      });
    },
    uuid() {
      return generateUuid();
    },
    now(format = 'iso', customPattern = DEFAULT_TIME_PATTERN) {
      return formatTimestamp(new Date(), format, customPattern);
    },
  };
}

function executeUserScript(scriptBody, vars) {
  const source = String(scriptBody || '').trim();
  if (!source) {
    throw new Error('Script body is empty.');
  }

  const runtimeVars = { ...(vars || {}) };
  const helpers = createScriptHelpers();

  try {
    const statementFn = new Function('vars', 'helpers', 'inputs', '"use strict";\n' + source);
    const statementResult = statementFn(runtimeVars, helpers, runtimeVars);
    if (statementResult !== undefined) {
      return statementResult;
    }

    const expressionFn = new Function('vars', 'helpers', 'inputs', '"use strict";\nreturn (' + source + ');');
    return expressionFn(runtimeVars, helpers, runtimeVars);
  } catch (err) {
    throw new Error(err?.message || 'Script execution failed.');
  }
}

export async function parseParameterFile(file) {
  const ext = getFileExtension(file?.name || '');
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error('Unsupported file format. Use csv, dat, excel, or txt only.');
  }

  let rows = [];
  if (ext === 'xls' || ext === 'xlsx') {
    const buf = await file.arrayBuffer();
    const workbook = XLSX.read(buf, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('Excel file has no worksheet.');
    }
    const sheet = workbook.Sheets[firstSheetName];
    rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      blankrows: false,
      defval: '',
    });
  } else {
    const text = await file.text();
    rows = parseTextRows(text, ext);
  }

  const normalizedRows = normalizeRows(rows);
  if (normalizedRows.length === 0) {
    throw new Error('No data rows found in file.');
  }

  return {
    sourceType: ext === 'xls' || ext === 'xlsx' ? 'excel' : ext,
    sourceFileName: file.name,
    rows: normalizedRows,
  };
}

export function createParameterDefinition(fileData, existingVariableNames = []) {
  const baseName = sanitizeVariableName(removeFileExtension(fileData.sourceFileName || 'parameterValue'));
  const variableName = uniqueVariableName(baseName, existingVariableNames);

  return {
    id: `param-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'file',
    variableName,
    scope: 'local',
    pickMode: 'start', // start | index | random
    pickIndex: 1, // 1-based index when pickMode === index
    cursor: 0, // current 0-based cursor for pickMode === start
    sourceType: fileData.sourceType,
    sourceFileName: fileData.sourceFileName,
    rows: fileData.rows,
    createdAt: new Date().toISOString(),
  };
}

export function createGeneratorParameterDefinition(existingVariableNames = [], options = {}) {
  const generatorType = String(options.generatorType || 'number').toLowerCase();
  const defaultBaseNames = {
    number: 'randomNumber',
    uuid: 'randomUuid',
    time: 'currentTime',
    text: 'randomText',
  };
  const baseName = defaultBaseNames[generatorType] || 'generatedValue';
  const variableName = uniqueVariableName(baseName, existingVariableNames);

  return {
    id: `param-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'generator',
    variableName,
    scope: 'local',
    generatorType,
    generatorConfig: {
      numberMin: 0,
      numberMax: 100,
      numberInteger: true,
      numberPrecision: 2,
      textMinLength: 8,
      textMaxLength: 16,
      textCharset: 'alphanumeric',
      timeFormat: 'iso',
      timeCustomFormat: DEFAULT_TIME_PATTERN,
      ...(options.generatorConfig || {}),
    },
    createdAt: new Date().toISOString(),
  };
}

export function createScriptParameterDefinition(existingVariableNames = [], options = {}) {
  const variableName = uniqueVariableName('scriptValue', existingVariableNames);
  return {
    id: `param-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'script',
    variableName,
    scope: 'local',
    scriptBody: options.scriptBody || 'return helpers.uuid();',
    createdAt: new Date().toISOString(),
  };
}

export function resolveFlowParameters(parameters = [], baseVariables = {}) {
  const localValues = {};
  const globalValues = {};
  let hasParameterStateChanged = false;

  const baseVars = baseVariables && typeof baseVariables === 'object' ? baseVariables : {};

  const updatedParameters = (parameters || []).map((param) => {
    const next = { ...param };
    const variableName = String(param?.variableName || '').trim();
    const kind = inferParameterKind(param);

    if (!variableName) {
      return next;
    }

    const runtimeVars = {
      ...baseVars,
      ...globalValues,
      ...localValues,
    };

    try {
      let value = '';

      if (kind === 'generator') {
        value = resolveGeneratorParameterValue(param);
      } else if (kind === 'script') {
        value = executeUserScript(param.scriptBody, runtimeVars);
      } else {
        const fileResult = resolveFileParameterValue(param, next);
        value = fileResult.value;
        if (fileResult.hasStateChanged) {
          hasParameterStateChanged = true;
        }
      }

      const normalizedValue = normalizeResolvedValue(value);

      if (param.scope === 'global') {
        globalValues[variableName] = normalizedValue;
      } else {
        localValues[variableName] = normalizedValue;
      }

      if (next.lastError) {
        delete next.lastError;
        hasParameterStateChanged = true;
      }
    } catch (err) {
      const message = err?.message || 'Failed to resolve parameter value.';
      if (next.lastError !== message) {
        next.lastError = message;
        hasParameterStateChanged = true;
      }
    }

    return next;
  });

  return {
    localValues,
    globalValues,
    updatedParameters,
    hasParameterStateChanged,
  };
}

export function summarizeParameterRows(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const maxCols = safeRows.reduce((m, row) => Math.max(m, Array.isArray(row) ? row.length : 1), 1);
  return {
    rowCount: safeRows.length,
    columnCount: maxCols,
  };
}
