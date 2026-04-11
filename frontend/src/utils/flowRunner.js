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

  // Set of condition step IDs that have outgoing edges — those use edge-routing,
  // NOT nested thenSteps/elseSteps, so we skip the nested execution for them.
  const conditionEdgeFromIds = new Set(
    (flow.edges || []).filter(e => e.label === 'then' || e.label === 'else').map(e => e.from)
  );

  async function runStep(step) {
    if (signal?.aborted) throw new Error('Aborted');
    if (step.enabled === false) {
      onUpdate(step.id, { status: 'skipped', logs: [{ level: 'info', msg: 'Step disabled — skipped' }] });
      return;
    }

    const stepStart = performance.now();
    const logs = [];
    function log(level, msg) { logs.push({ level, msg, t: Math.round(performance.now() - stepStart) }); }

    onUpdate(step.id, { status: 'running', variables: { ...variables }, logs: [] });
    log('info', `Starting step "${step.name || step.type}"`);

    try {
      switch (step.type) {

        // ── HTTP Request ──────────────────────────────────────────────────
        case 'request': {
          const req = substituteRequest(step.request, variables);
          log('info', `→ ${req.method} ${req.url}`);
          const reqStart = performance.now();
          const response = await api.request.execute(req);
          const reqMs = Math.round(performance.now() - reqStart);
          log('info', `← HTTP ${response.statusCode} in ${reqMs} ms`);

          // Extract variables from response
          const extractedVars = {};
          for (const ex of step.extractions || []) {
            if (ex.variable) {
              const val = extractValue(ex, response);
              variables[ex.variable] = val;
              extractedVars[ex.variable] = val;
              log('info', `  Extracted "${ex.variable}" = ${JSON.stringify(val)}`);
            }
          }

          // Run assertions
          const assertResults = runAssertions(step.assertions || [], response);
          assertResults.forEach(r => {
            log(r.passed ? 'info' : 'error',
              `  Assert ${r.source}${r.header ? `[${r.header}]` : ''} ${r.operator} "${r.expected}" → ${r.passed ? 'PASS' : `FAIL (got: "${String(r.actual || '').substring(0, 80)}")`}`
            );
          });

          const durationMs = Math.round(performance.now() - stepStart);
          const failed = assertResults.filter(r => !r.passed);
          const result = { response, assertionResults: assertResults, statusCode: response.statusCode, reqMs, extractedVars };

          if (failed.length > 0) {
            const msg = `${failed.length} assertion(s) failed`;
            log('error', `✗ ${msg} — total ${durationMs} ms`);
            onUpdate(step.id, { status: 'failed', result, error: msg, variables: { ...variables }, logs, durationMs });
            throw new Error(msg);
          }
          log('info', `✓ Done in ${durationMs} ms`);
          onUpdate(step.id, { status: 'success', result, variables: { ...variables }, logs, durationMs });
          break;
        }

        // ── Condition ─────────────────────────────────────────────────────
        case 'condition': {
          const conditionMet = evaluateCondition(step.condition, variables);
          const branch = conditionMet ? 'THEN' : 'ELSE';
          log('info', `Condition → ${branch} (left="${substitute(step.condition?.left||'',variables)}", op=${step.condition?.operator}, right="${substitute(step.condition?.right||'',variables)}")`);
          const durationMs = Math.round(performance.now() - stepStart);
          log('info', `✓ Done in ${durationMs} ms`);
          onUpdate(step.id, { status: 'success', result: { conditionMet }, variables: { ...variables }, logs, durationMs });
          // Only run nested thenSteps/elseSteps when there are NO outgoing condition edges
          // (backward-compatible with old flows that used nested steps instead of canvas edges)
          if (!conditionEdgeFromIds.has(step.id)) {
            const branchSteps = conditionMet ? (step.thenSteps || []) : (step.elseSteps || []);
            for (const child of branchSteps) {
              await runStep(child);
            }
          }
          return { conditionMet };
        }

        // ── Loop ──────────────────────────────────────────────────────────
        case 'loop': {
          if (step.loopType === 'while') {
            let itr = 0;
            log('info', `While loop (max 100 iterations)`);
            while (evaluateCondition(step.loopCondition, variables) && itr < 100) {
              variables['_loopIndex'] = String(itr);
              log('info', `  Iteration ${itr}`);
              for (const child of step.loopSteps || []) {
                await runStep(child);
                if (signal?.aborted) throw new Error('Aborted');
              }
              itr++;
            }
            log('info', `Loop ended after ${itr} iteration(s)`);
          } else {
            const count = Math.max(1, step.loopCount || 1);
            log('info', `Count loop — ${count} iteration(s)`);
            for (let i = 0; i < count; i++) {
              variables['_loopIndex'] = String(i);
              log('info', `  Iteration ${i}`);
              for (const child of step.loopSteps || []) {
                await runStep(child);
                if (signal?.aborted) throw new Error('Aborted');
              }
            }
          }
          const durationMs = Math.round(performance.now() - stepStart);
          log('info', `✓ Done in ${durationMs} ms`);
          onUpdate(step.id, { status: 'success', result: {}, variables: { ...variables }, logs, durationMs });
          break;
        }

        // ── Delay ─────────────────────────────────────────────────────────
        case 'delay': {
          const ms = step.delayMs || 1000;
          log('info', `Waiting ${ms} ms…`);
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, ms);
            signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('Aborted')); });
          });
          const durationMs = Math.round(performance.now() - stepStart);
          log('info', `✓ Delay complete (${durationMs} ms)`);
          onUpdate(step.id, { status: 'success', result: { delayMs: ms }, logs, durationMs });
          break;
        }

        // ── Set Variable ──────────────────────────────────────────────────
        case 'set_variable': {
          const value = substitute(step.variableValue || '', variables);
          if (step.variableName) variables[step.variableName] = value;
          log('info', `Set "${step.variableName}" = ${JSON.stringify(value)}`);
          const durationMs = Math.round(performance.now() - stepStart);
          log('info', `✓ Done in ${durationMs} ms`);
          onUpdate(step.id, {
            status: 'success',
            result: { variable: step.variableName, value },
            variables: { ...variables },
            logs,
            durationMs,
          });
          break;
        }

        // ── Assert ────────────────────────────────────────────────────────
        case 'assert': {
          const passed = evaluateCondition(step.assertCondition, variables);
          const durationMs = Math.round(performance.now() - stepStart);
          if (!passed) {
            const msg = step.assertMessage || 'Assertion failed';
            log('error', `✗ ${msg}`);
            onUpdate(step.id, { status: 'failed', result: {}, error: msg, logs, durationMs });
            throw new Error(msg);
          }
          log('info', `✓ Assertion passed in ${durationMs} ms`);
          onUpdate(step.id, { status: 'success', result: {}, logs, durationMs });
          break;
        }

        default: {
          const durationMs = Math.round(performance.now() - stepStart);
          onUpdate(step.id, { status: 'success', result: {}, logs, durationMs });
        }
      }
    } catch (err) {
      const durationMs = Math.round(performance.now() - stepStart);
      log('error', `✗ ${err.message}`);
      onUpdate(step.id, prev =>
        prev?.status === 'failed' ? { ...prev, logs, durationMs } : { status: 'failed', error: err.message, logs, durationMs }
      );
      throw err;
    }
  }

  // ── Edge-following execution ──────────────────────────────────────────────
  const edges    = flow.edges || [];
  const topSteps = flow.steps || [];

  // Index ALL steps (including nested) by id
  const stepMap = {};
  function indexSteps(arr) {
    arr.forEach(s => {
      stepMap[s.id] = s;
      indexSteps([...(s.thenSteps||[]), ...(s.elseSteps||[]), ...(s.loopSteps||[])]);
    });
  }
  indexSteps(topSteps);

  // No edges → run in array order (backward-compatible)
  if (edges.length === 0) {
    for (const step of topSteps) { await runStep(step); }
    return;
  }

  // Build adjacency: stepId → [{to, label}]
  const topIds  = new Set(topSteps.map(s => s.id));
  const nextMap = {};
  edges.forEach(e => {
    if (!topIds.has(e.from)) return;
    if (!nextMap[e.from]) nextMap[e.from] = [];
    nextMap[e.from].push({ to: e.to, label: e.label || '' });
  });

  // Entry steps = top-level steps with no incoming edge
  const hasIncoming = new Set(edges.filter(e => topIds.has(e.to)).map(e => e.to));
  const entrySteps  = topSteps.filter(s => !hasIncoming.has(s.id));

  // Follow edges with cycle protection
  const visited = new Set();
  async function executeFrom(stepId) {
    if (visited.has(stepId) || signal?.aborted) return;
    visited.add(stepId);
    const step = stepMap[stepId];
    if (!step) return;
    const result = await runStep(step);
    const nexts  = nextMap[stepId] || [];
    if (!nexts.length) return;
    if (step.type === 'condition' && result?.conditionMet !== undefined) {
      // Route ONLY to the matching labeled edge — never fall back to wrong branch
      const label = result.conditionMet ? 'then' : 'else';
      const next  = nexts.find(n => n.label === label);
      if (next) await executeFrom(next.to);
      // If no matching edge exists for this branch, execution simply stops here
    } else {
      for (const n of nexts) {
        if (signal?.aborted) break;
        await executeFrom(n.to);
      }
    }
  }

  for (const entry of entrySteps) {
    if (signal?.aborted) break;
    await executeFrom(entry.id);
  }
}
