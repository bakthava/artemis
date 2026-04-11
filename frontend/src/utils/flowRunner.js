import api from '../services/api';

/** Replace {{varName}} placeholders in a string with variable values */
export function substitute(str, variables) {
  if (typeof str !== 'string') return str;
  return str.replace(/\{\{([^}]+)\}\}/g, (_, k) => {
    const key = k.trim();
    return variables[key] !== undefined ? String(variables[key]) : `{{${key}}}`;
  });
}

/** Substitute all string fields inside a request object */
function substituteRequest(req, vars) {
  if (!req) return req;
  const headers = {};
  Object.entries(req.headers || {}).forEach(([k, v]) => {
    headers[substitute(k, vars)] = substitute(v, vars);
  });
  const params = {};
  Object.entries(req.params || {}).forEach(([k, v]) => {
    params[substitute(k, vars)] = substitute(v, vars);
  });
  return {
    ...req,
    url: substitute(req.url, vars),
    body: substitute(req.body, vars),
    headers,
    params,
  };
}

/** Evaluate a boolean condition against the current variable map */
export function evaluateCondition(condition, variables) {
  if (!condition) return true;
  const left = substitute(condition.left || '', variables);
  const right = substitute(condition.right || '', variables);
  switch (condition.operator) {
    case 'equals':       return left === right;
    case 'not_equals':   return left !== right;
    case 'contains':     return left.includes(right);
    case 'not_contains': return !left.includes(right);
    case 'matches':      try { return new RegExp(right).test(left); } catch { return false; }
    case 'not_matches':  try { return !new RegExp(right).test(left); } catch { return false; }
    case 'greater_than': return parseFloat(left) > parseFloat(right);
    case 'less_than':    return parseFloat(left) < parseFloat(right);
    case 'exists':       return left !== '' && left !== undefined;
    case 'not_exists':   return left === '' || left === undefined;
    default:             return false;
  }
}

/** Extract a value from a response using an Extraction config */
function extractValue(extraction, response) {
  let source = '';
  switch (extraction.source) {
    case 'status':
      source = String(response.statusCode ?? '');
      break;
    case 'header': {
      const hdrs = response.headers || {};
      source = hdrs[extraction.header] || hdrs[(extraction.header || '').toLowerCase()] || '';
      break;
    }
    case 'body':
    default:
      source = response.body || '';
  }
  if (extraction.regex) {
    try {
      const match = source.match(new RegExp(extraction.regex));
      if (match) {
        const g = extraction.matchGroup || 0;
        return match[g] !== undefined ? String(match[g]) : '';
      }
    } catch {
      // invalid regex — return empty
    }
    return '';
  }
  return source;
}

/** Run all assertions against a response. Returns array of result objects. */
export function runAssertions(assertions, response) {
  return (assertions || []).map(a => {
    let actual = '';
    switch (a.source) {
      case 'status':
        actual = String(response.statusCode ?? '');
        break;
      case 'header': {
        const hdrs = response.headers || {};
        actual = hdrs[a.header] || hdrs[(a.header || '').toLowerCase()] || '';
        break;
      }
      case 'body':
      default:
        actual = response.body || '';
    }
    let passed = false;
    switch (a.operator) {
      case 'equals':       passed = actual === a.expected; break;
      case 'not_equals':   passed = actual !== a.expected; break;
      case 'contains':     passed = actual.includes(a.expected); break;
      case 'not_contains': passed = !actual.includes(a.expected); break;
      case 'matches':      try { passed = new RegExp(a.expected).test(actual); } catch { passed = false; } break;
      case 'not_matches':  try { passed = !new RegExp(a.expected).test(actual); } catch { passed = false; } break;
      case 'greater_than': passed = parseFloat(actual) > parseFloat(a.expected); break;
      case 'less_than':    passed = parseFloat(actual) < parseFloat(a.expected); break;
      default:             passed = false;
    }
    return { ...a, actual, passed };
  });
}

/**
 * Run a flow asynchronously.
 * @param {object} flow        - the flow definition (steps, variables)
 * @param {function} onUpdate  - callback(stepId, { status, result, error, variables })
 * @param {AbortSignal} signal - optional cancellation signal
 */
export async function runFlow(flow, onUpdate, signal) {
  // Mutable variable map shared across all steps
  const variables = { ...(flow.variables || {}) };

  async function runStep(step) {
    if (signal?.aborted) throw new Error('Aborted');
    if (step.enabled === false) {
      onUpdate(step.id, { status: 'skipped' });
      return;
    }

    onUpdate(step.id, { status: 'running', variables: { ...variables } });

    try {
      switch (step.type) {

        // ── HTTP Request ──────────────────────────────────────────────────
        case 'request': {
          const req = substituteRequest(step.request, variables);
          const response = await api.request.execute(req);

          // Extract variables from response first
          for (const ex of step.extractions || []) {
            if (ex.variable) {
              variables[ex.variable] = extractValue(ex, response);
            }
          }

          // Then run assertions
          const assertResults = runAssertions(step.assertions || [], response);
          const failed = assertResults.filter(r => !r.passed);
          const result = { response, assertionResults: assertResults, statusCode: response.statusCode };

          if (failed.length > 0) {
            const msg = `${failed.length} assertion(s) failed`;
            onUpdate(step.id, { status: 'failed', result, error: msg, variables: { ...variables } });
            throw new Error(msg);
          }
          onUpdate(step.id, { status: 'success', result, variables: { ...variables } });
          break;
        }

        // ── Condition ─────────────────────────────────────────────────────
        case 'condition': {
          const conditionMet = evaluateCondition(step.condition, variables);
          onUpdate(step.id, { status: 'success', result: { conditionMet }, variables: { ...variables } });
          const branch = conditionMet ? (step.thenSteps || []) : (step.elseSteps || []);
          for (const child of branch) {
            await runStep(child);
          }
          break;
        }

        // ── Loop ──────────────────────────────────────────────────────────
        case 'loop': {
          onUpdate(step.id, { status: 'running', variables: { ...variables } });
          if (step.loopType === 'while') {
            let itr = 0;
            while (evaluateCondition(step.loopCondition, variables) && itr < 100) {
              variables['_loopIndex'] = String(itr);
              for (const child of step.loopSteps || []) {
                await runStep(child);
                if (signal?.aborted) throw new Error('Aborted');
              }
              itr++;
            }
          } else {
            // count loop (default)
            const count = Math.max(1, step.loopCount || 1);
            for (let i = 0; i < count; i++) {
              variables['_loopIndex'] = String(i);
              for (const child of step.loopSteps || []) {
                await runStep(child);
                if (signal?.aborted) throw new Error('Aborted');
              }
            }
          }
          onUpdate(step.id, { status: 'success', result: {}, variables: { ...variables } });
          break;
        }

        // ── Delay ─────────────────────────────────────────────────────────
        case 'delay': {
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, step.delayMs || 1000);
            signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('Aborted')); });
          });
          onUpdate(step.id, { status: 'success', result: {} });
          break;
        }

        // ── Set Variable ──────────────────────────────────────────────────
        case 'set_variable': {
          const value = substitute(step.variableValue || '', variables);
          if (step.variableName) variables[step.variableName] = value;
          onUpdate(step.id, {
            status: 'success',
            result: { variable: step.variableName, value },
            variables: { ...variables },
          });
          break;
        }

        // ── Assert ────────────────────────────────────────────────────────
        case 'assert': {
          const passed = evaluateCondition(step.assertCondition, variables);
          if (!passed) {
            const msg = step.assertMessage || 'Assertion failed';
            onUpdate(step.id, { status: 'failed', result: {}, error: msg });
            throw new Error(msg);
          }
          onUpdate(step.id, { status: 'success', result: {} });
          break;
        }

        default:
          onUpdate(step.id, { status: 'success', result: {} });
      }
    } catch (err) {
      // Only set failed if not already set (request step sets it explicitly)
      onUpdate(step.id, prev =>
        prev?.status === 'failed' ? prev : { status: 'failed', error: err.message }
      );
      throw err;
    }
  }

  for (const step of flow.steps || []) {
    await runStep(step);
  }
}
