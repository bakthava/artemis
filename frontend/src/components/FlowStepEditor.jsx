import React, { useState } from 'react';

const OPERATORS = [
  { value: 'equals',       label: '= equals'        },
  { value: 'not_equals',   label: '≠ not equals'    },
  { value: 'contains',     label: '⊃ contains'      },
  { value: 'not_contains', label: '⊅ not contains'  },
  { value: 'matches',      label: '~ matches regex' },
  { value: 'not_matches',  label: '!~ not matches'  },
  { value: 'greater_than', label: '> greater than'  },
  { value: 'less_than',    label: '< less than'     },
  { value: 'exists',       label: '∃ exists'        },
  { value: 'not_exists',   label: '∄ not exists'    },
];

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const BODY_TYPES   = ['json', 'xml', 'text', 'form'];

// ── Shared: condition expression row ──────────────────────────────────────────
function ConditionRow({ condition = {}, onChange }) {
  const c = { left: '', operator: 'equals', right: '', ...condition };
  const noRight = c.operator === 'exists' || c.operator === 'not_exists';
  return (
    <div className="flow-cond-row">
      <input className="form-input flow-cond-left" placeholder="{{variable}} or value"
        value={c.left} onChange={e => onChange({ ...c, left: e.target.value })} />
      <select className="form-input flow-cond-op" value={c.operator}
        onChange={e => onChange({ ...c, operator: e.target.value })}>
        {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
      </select>
      {!noRight && (
        <input className="form-input flow-cond-right" placeholder="value or {{variable}}"
          value={c.right} onChange={e => onChange({ ...c, right: e.target.value })} />
      )}
    </div>
  );
}

// ── Shared: mini nested step list (inside condition / loop editors) ───────────
const MINI_TYPES = [
  { type: 'request',      icon: '🌐', label: 'HTTP Request'  },
  { type: 'condition',    icon: '🔀', label: 'Condition'     },
  { type: 'loop',         icon: '🔁', label: 'Loop'          },
  { type: 'delay',        icon: '⏱',  label: 'Delay'         },
  { type: 'set_variable', icon: '📝', label: 'Set Variable'  },
  { type: 'assert',       icon: '✅', label: 'Assert'         },
];
const TYPE_ICONS = Object.fromEntries(MINI_TYPES.map(t => [t.type, t.icon]));

function mkNested(type) {
  const id = `s${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
  switch (type) {
    case 'request':      return { id, type, name: 'HTTP Request', enabled: true, request: { method: 'GET', url: '', headers: {}, params: {}, body: '', bodyType: 'json' }, extractions: [], assertions: [] };
    case 'condition':    return { id, type, name: 'Condition', enabled: true, condition: { left: '', operator: 'equals', right: '' }, thenSteps: [], elseSteps: [] };
    case 'loop':         return { id, type, name: 'Loop', enabled: true, loopType: 'count', loopCount: 3, loopCondition: { left: '', operator: 'equals', right: '' }, loopSteps: [] };
    case 'delay':        return { id, type, name: 'Delay', enabled: true, delayMs: 1000 };
    case 'set_variable': return { id, type, name: 'Set Variable', enabled: true, variableName: '', variableValue: '' };
    case 'assert':       return { id, type, name: 'Assert', enabled: true, assertCondition: { left: '', operator: 'equals', right: '' }, assertMessage: 'Assertion failed' };
    default:             return { id, type, name: type, enabled: true };
  }
}

function MiniStepList({ steps = [], branch, onUpdateParent, statuses = {} }) {
  const [showMenu, setShowMenu] = useState(false);

  function add(type) {
    onUpdateParent({ [branch]: [...steps, mkNested(type)] });
    setShowMenu(false);
  }
  function remove(id) {
    onUpdateParent({ [branch]: steps.filter(s => s.id !== id) });
  }
  function rename(id, name) {
    onUpdateParent({ [branch]: steps.map(s => s.id === id ? { ...s, name } : s) });
  }

  return (
    <div className="mini-step-list">
      {steps.map(s => {
        const st = statuses[s.id]?.status || 'idle';
        return (
          <div key={s.id} className={`mini-step-card status-${st}`}>
            <span className="mini-step-icon">{TYPE_ICONS[s.type] || '?'}</span>
            <input className="mini-step-name-input" value={s.name || s.type}
              onChange={e => rename(s.id, e.target.value)} />
            <button className="mini-step-del" onClick={() => remove(s.id)} title="Remove">✕</button>
          </div>
        );
      })}
      <div style={{ position: 'relative' }}>
        <button className="mini-add-btn" onClick={() => setShowMenu(m => !m)}>+ Add Step</button>
        {showMenu && (
          <div className="mini-add-menu">
            {MINI_TYPES.map(t => (
              <button key={t.type} className="mini-add-menu-item" onClick={() => add(t.type)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FlowStepEditor({ step, onUpdate, stepStatuses = {} }) {
  const status = stepStatuses[step.id];

  function upd(updates) {
    onUpdate(step.id, updates);
  }
  function updReq(reqUpdates) {
    upd({ request: { ...step.request, ...reqUpdates } });
  }

  // ── Map helpers (headers / params inside request) ─────────────────────────
  function mapSet(field, oldKey, newKey, value) {
    const m = { ...(step.request?.[field] || {}) };
    if (oldKey !== newKey) delete m[oldKey];
    m[newKey] = value;
    updReq({ [field]: m });
  }
  function mapDel(field, key) {
    const m = { ...(step.request?.[field] || {}) };
    delete m[key];
    updReq({ [field]: m });
  }
  function mapAdd(field) {
    updReq({ [field]: { ...(step.request?.[field] || {}), '': '' } });
  }

  // ── Extractions ────────────────────────────────────────────────────────────
  function addEx() {
    upd({ extractions: [...(step.extractions || []), { variable: '', source: 'body', header: '', regex: '', matchGroup: 0 }] });
  }
  function updEx(i, changes) {
    const arr = [...(step.extractions || [])];
    arr[i] = { ...arr[i], ...changes };
    upd({ extractions: arr });
  }
  function delEx(i) {
    const arr = [...(step.extractions || [])];
    arr.splice(i, 1);
    upd({ extractions: arr });
  }

  // ── Assertions ─────────────────────────────────────────────────────────────
  function addAs() {
    upd({ assertions: [...(step.assertions || []), { source: 'body', header: '', operator: 'equals', expected: '' }] });
  }
  function updAs(i, changes) {
    const arr = [...(step.assertions || [])];
    arr[i] = { ...arr[i], ...changes };
    upd({ assertions: arr });
  }
  function delAs(i) {
    const arr = [...(step.assertions || [])];
    arr.splice(i, 1);
    upd({ assertions: arr });
  }

  return (
    <div className="flow-step-editor">
      {/* Name + enable toggle */}
      <div className="editor-header">
        <input className="form-input editor-name-input" placeholder="Step Name"
          value={step.name || ''}
          onChange={e => upd({ name: e.target.value })} />
        <label className="editor-enable-toggle" title="Enable / disable this step">
          <input type="checkbox" checked={step.enabled !== false}
            onChange={e => upd({ enabled: e.target.checked })} />
          <span>On</span>
        </label>
      </div>

      {/* Run status + timing + logs panel */}
      {status && status.status !== 'idle' && (
        <div className={`step-result-panel status-${status.status}`}>
          {/* Header row: status + duration */}
          <div className="srp-header">
            <span className="srp-status-icon">
              {status.status === 'running' && <span className="spin-icon">⟳</span>}
              {status.status === 'success' && '✓'}
              {status.status === 'failed'  && '✗'}
              {status.status === 'skipped' && '↷'}
            </span>
            <span className="srp-status-label">
              {status.status === 'running' && 'Running…'}
              {status.status === 'success' && 'Success'}
              {status.status === 'failed'  && (status.error || 'Failed')}
              {status.status === 'skipped' && 'Skipped'}
            </span>
            {status.result?.statusCode != null && (
              <span className="srp-http-code">HTTP {status.result.statusCode}</span>
            )}
            {status.durationMs != null && (
              <span className="srp-duration">{status.durationMs} ms</span>
            )}
            {status.result?.reqMs != null && status.result.reqMs !== status.durationMs && (
              <span className="srp-duration srp-req-ms" title="Network round-trip">🌐 {status.result.reqMs} ms</span>
            )}
          </div>

          {/* Extracted variables */}
          {status.result?.extractedVars && Object.keys(status.result.extractedVars).length > 0 && (
            <div className="srp-section">
              <div className="srp-sec-title">Extracted Variables</div>
              {Object.entries(status.result.extractedVars).map(([k, v]) => (
                <div key={k} className="srp-var-row">
                  <span className="srp-var-key">{k}</span>
                  <span className="srp-var-eq">=</span>
                  <span className="srp-var-val">{String(v).substring(0, 120)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Assertion results */}
          {status.result?.assertionResults?.length > 0 && (
            <div className="srp-section">
              <div className="srp-sec-title">Assertions</div>
              {status.result.assertionResults.map((r, i) => (
                <div key={i} className={`srp-assert-row ${r.passed ? 'pass' : 'fail'}`}>
                  <span className="srp-assert-icon">{r.passed ? '✓' : '✗'}</span>
                  <span className="srp-assert-desc">
                    {r.source}{r.header ? `[${r.header}]` : ''} <em>{r.operator}</em> &quot;{r.expected}&quot;
                    {!r.passed && <span className="srp-assert-actual"> ← got: &quot;{String(r.actual||'').substring(0,80)}&quot;</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Condition result */}
          {status.result?.conditionMet != null && (
            <div className="srp-section">
              <div className="srp-sec-title">Condition</div>
              <div className={`srp-cond-result ${status.result.conditionMet ? 'pass' : 'else'}`}>
                Branch taken: <strong>{status.result.conditionMet ? 'THEN ✓' : 'ELSE →'}</strong>
              </div>
            </div>
          )}

          {/* Set variable result */}
          {status.result?.variable && (
            <div className="srp-section">
              <div className="srp-sec-title">Variable Set</div>
              <div className="srp-var-row">
                <span className="srp-var-key">{status.result.variable}</span>
                <span className="srp-var-eq">=</span>
                <span className="srp-var-val">{String(status.result.value ?? '').substring(0, 120)}</span>
              </div>
            </div>
          )}

          {/* Logs */}
          {status.logs?.length > 0 && (
            <div className="srp-section">
              <div className="srp-sec-title">Execution Log</div>
              <div className="srp-logs">
                {status.logs.map((entry, i) => (
                  <div key={i} className={`srp-log-row log-${entry.level}`}>
                    <span className="srp-log-t">+{entry.t}ms</span>
                    <span className="srp-log-msg">{entry.msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── REQUEST ──────────────────────────────────────────────────────── */}
      {step.type === 'request' && (
        <div className="editor-body">
          {/* Method + URL */}
          <div className="editor-method-url">
            <select className="form-input editor-method-sel" value={step.request?.method || 'GET'}
              onChange={e => updReq({ method: e.target.value })}>
              {HTTP_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
            <input className="form-input editor-url-input"
              placeholder="https://{{baseUrl}}/path?q={{query}}"
              value={step.request?.url || ''}
              onChange={e => updReq({ url: e.target.value })} />
          </div>

          {/* Headers */}
          <div className="editor-section">
            <div className="editor-sec-title">Headers</div>
            {Object.entries(step.request?.headers || {}).map(([k, v], i) => (
              <div key={i} className="key-value-row">
                <input className="form-input" placeholder="Key" value={k}
                  onChange={e => mapSet('headers', k, e.target.value, v)} />
                <input className="form-input" placeholder="Value or {{var}}" value={v}
                  onChange={e => mapSet('headers', k, k, e.target.value)} />
                <button onClick={() => mapDel('headers', k)}>✕</button>
              </div>
            ))}
            <button className="add-row-button" onClick={() => mapAdd('headers')}>+ Header</button>
          </div>

          {/* Params */}
          <div className="editor-section">
            <div className="editor-sec-title">Query Params</div>
            {Object.entries(step.request?.params || {}).map(([k, v], i) => (
              <div key={i} className="key-value-row">
                <input className="form-input" placeholder="Key" value={k}
                  onChange={e => mapSet('params', k, e.target.value, v)} />
                <input className="form-input" placeholder="Value or {{var}}" value={v}
                  onChange={e => mapSet('params', k, k, e.target.value)} />
                <button onClick={() => mapDel('params', k)}>✕</button>
              </div>
            ))}
            <button className="add-row-button" onClick={() => mapAdd('params')}>+ Param</button>
          </div>

          {/* Body */}
          <div className="editor-section">
            <div className="editor-sec-title">Body</div>
            <select className="form-input" style={{ marginBottom: 8 }}
              value={step.request?.bodyType || 'json'}
              onChange={e => updReq({ bodyType: e.target.value })}>
              {BODY_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <textarea className="form-input form-textarea"
              placeholder={'{\n  "key": "{{variable}}"\n}'}
              value={step.request?.body || ''}
              onChange={e => updReq({ body: e.target.value })} />
          </div>

          {/* Extract Variables */}
          <div className="editor-section">
            <div className="editor-sec-title">
              Extract Variables
              <span className="sec-hint"> — save parts of response as variables</span>
            </div>
            {(step.extractions || []).map((ex, i) => (
              <div key={i} className="extraction-card">
                <div className="extraction-row1">
                  <span className="ex-label">Save as</span>
                  <input className="form-input ex-var" placeholder="variableName"
                    value={ex.variable || ''} onChange={e => updEx(i, { variable: e.target.value })} />
                  <span className="ex-label">from</span>
                  <select className="form-input ex-src" value={ex.source || 'body'}
                    onChange={e => updEx(i, { source: e.target.value })}>
                    <option value="body">Body</option>
                    <option value="header">Header</option>
                    <option value="status">Status</option>
                  </select>
                  {ex.source === 'header' && (
                    <input className="form-input ex-hdr" placeholder="Header name"
                      value={ex.header || ''} onChange={e => updEx(i, { header: e.target.value })} />
                  )}
                  <button className="row-del-btn" onClick={() => delEx(i)}>✕</button>
                </div>
                <div className="extraction-row2">
                  <span className="ex-label">Regex</span>
                  <input className="form-input ex-regex" placeholder='e.g. "token":"([^"]+)"'
                    value={ex.regex || ''} onChange={e => updEx(i, { regex: e.target.value })} />
                  <span className="ex-label">Group</span>
                  <input className="form-input ex-grp" type="number" min="0" max="20"
                    value={ex.matchGroup || 0}
                    onChange={e => updEx(i, { matchGroup: parseInt(e.target.value) || 0 })} />
                </div>
              </div>
            ))}
            <button className="add-row-button" onClick={addEx}>+ Add Extraction</button>
          </div>

          {/* Assertions */}
          <div className="editor-section">
            <div className="editor-sec-title">
              Assertions
              <span className="sec-hint"> — fail step if check does not pass</span>
            </div>
            {(step.assertions || []).map((a, i) => (
              <div key={i} className="assertion-card">
                <select className="form-input assert-src" value={a.source || 'body'}
                  onChange={e => updAs(i, { source: e.target.value })}>
                  <option value="body">Body</option>
                  <option value="header">Header</option>
                  <option value="status">Status</option>
                </select>
                {a.source === 'header' && (
                  <input className="form-input assert-hdr" placeholder="Header name"
                    value={a.header || ''} onChange={e => updAs(i, { header: e.target.value })} />
                )}
                <select className="form-input assert-op" value={a.operator || 'equals'}
                  onChange={e => updAs(i, { operator: e.target.value })}>
                  {OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                </select>
                <input className="form-input assert-exp" placeholder="expected or /regex/"
                  value={a.expected || ''} onChange={e => updAs(i, { expected: e.target.value })} />
                <button className="row-del-btn" onClick={() => delAs(i)}>✕</button>
              </div>
            ))}
            <button className="add-row-button" onClick={addAs}>+ Add Assertion</button>
          </div>
        </div>
      )}

      {/* ── CONDITION ────────────────────────────────────────────────────── */}
      {step.type === 'condition' && (
        <div className="editor-body">
          <div className="editor-section">
            <div className="editor-sec-title">IF condition:</div>
            <ConditionRow
              condition={step.condition || { left: '', operator: 'equals', right: '' }}
              onChange={c => upd({ condition: c })} />
            <div className="cond-var-hint">
              💡 Use <code>{'{{_statusCode}}'}</code> for the last HTTP status code,&nbsp;
              <code>{'{{_body}}'}</code> for the response body, or any extracted variable.
            </div>
          </div>

          <div className="editor-section">
            <div className="cond-edge-hint">
              <div className="cond-edge-hint-title">🔀 Branch routing via canvas edges</div>
              <div className="cond-edge-hint-body">
                Use the <span className="hint-then">●&nbsp;THEN</span> and <span className="hint-else">●&nbsp;ELSE</span> handles
                on the right edge of this node to connect to the next steps.
                When the condition is <strong>true</strong> the THEN connection runs;
                when <strong>false</strong> the ELSE connection runs.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LOOP ─────────────────────────────────────────────────────────── */}
      {step.type === 'loop' && (
        <div className="editor-body">
          <div className="editor-section">
            <div className="editor-sec-title">Loop Type</div>
            <div className="loop-type-row">
              <button className={`loop-type-btn ${step.loopType !== 'while' ? 'active' : ''}`}
                onClick={() => upd({ loopType: 'count' })}>Count</button>
              <button className={`loop-type-btn ${step.loopType === 'while' ? 'active' : ''}`}
                onClick={() => upd({ loopType: 'while' })}>While</button>
            </div>
          </div>

          {step.loopType !== 'while' ? (
            <div className="editor-section">
              <div className="editor-sec-title">Repeat count</div>
              <div className="loop-count-row">
                <input className="form-input loop-count-input" type="number" min="1" max="999"
                  value={step.loopCount || 1}
                  onChange={e => upd({ loopCount: Math.max(1, parseInt(e.target.value) || 1) })} />
                <span className="sec-hint">times&nbsp;— use <code>{'{{_loopIndex}}'}</code> for current index (0-based)</span>
              </div>
            </div>
          ) : (
            <div className="editor-section">
              <div className="editor-sec-title">While condition: <span className="sec-hint">(max 100 iterations)</span></div>
              <ConditionRow
                condition={step.loopCondition || { left: '', operator: 'equals', right: '' }}
                onChange={c => upd({ loopCondition: c })} />
            </div>
          )}

          <div className="editor-section">
            <div className="editor-sec-title">Loop Steps</div>
            <MiniStepList steps={step.loopSteps || []} branch="loopSteps"
              onUpdateParent={upd} statuses={stepStatuses} />
          </div>
        </div>
      )}

      {/* ── DELAY ────────────────────────────────────────────────────────── */}
      {step.type === 'delay' && (
        <div className="editor-body">
          <div className="editor-section">
            <div className="editor-sec-title">Wait duration</div>
            <div className="delay-row">
              <input className="form-input delay-input" type="number" min="0"
                value={step.delayMs || 1000}
                onChange={e => upd({ delayMs: Math.max(0, parseInt(e.target.value) || 0) })} />
              <span className="sec-hint">milliseconds</span>
            </div>
          </div>
        </div>
      )}

      {/* ── SET VARIABLE ─────────────────────────────────────────────────── */}
      {step.type === 'set_variable' && (
        <div className="editor-body">
          <div className="editor-section">
            <div className="editor-sec-title">Variable Assignment</div>
            <div className="set-var-row">
              <span className="ex-label">Set</span>
              <input className="form-input set-var-name" placeholder="variableName"
                value={step.variableName || ''}
                onChange={e => upd({ variableName: e.target.value })} />
              <span className="ex-label">=</span>
              <input className="form-input set-var-val" placeholder="value or {{otherVar}}"
                value={step.variableValue || ''}
                onChange={e => upd({ variableValue: e.target.value })} />
            </div>
            <div className="sec-hint" style={{ marginTop: 6 }}>
              Supports <code>{'{{variable}}'}</code> substitution in the value field.
            </div>
          </div>
        </div>
      )}

      {/* ── ASSERT ───────────────────────────────────────────────────────── */}
      {step.type === 'assert' && (
        <div className="editor-body">
          <div className="editor-section">
            <div className="editor-sec-title">Assert Condition</div>
            <ConditionRow
              condition={step.assertCondition || { left: '', operator: 'equals', right: '' }}
              onChange={c => upd({ assertCondition: c })} />
          </div>
          <div className="editor-section">
            <div className="editor-sec-title">Failure Message</div>
            <input className="form-input" placeholder="Assertion failed"
              value={step.assertMessage || ''}
              onChange={e => upd({ assertMessage: e.target.value })} />
          </div>
        </div>
      )}
    </div>
  );
}
