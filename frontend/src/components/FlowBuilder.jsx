import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { runFlow } from '../utils/flowRunner';
import FlowStepEditor from './FlowStepEditor';

// ── Step type registry ─────────────────────────────────────────────────────────
const STEP_TYPES = [
  { type: 'request',      icon: '🌐', label: 'HTTP Request'    },
  { type: 'condition',    icon: '🔀', label: 'Condition If/Else' },
  { type: 'loop',         icon: '🔁', label: 'Loop'            },
  { type: 'delay',        icon: '⏱',  label: 'Delay'           },
  { type: 'set_variable', icon: '📝', label: 'Set Variable'    },
  { type: 'assert',       icon: '✅', label: 'Assert'           },
];
const TYPE_META = Object.fromEntries(STEP_TYPES.map(t => [t.type, t]));

// ── Step factory ───────────────────────────────────────────────────────────────
function mkStep(type) {
  const id = `s${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
  switch (type) {
    case 'request':
      return { id, type, name: 'HTTP Request', enabled: true,
        request: { method: 'GET', url: '', headers: {}, params: {}, body: '', bodyType: 'json' },
        extractions: [], assertions: [] };
    case 'condition':
      return { id, type, name: 'Condition', enabled: true,
        condition: { left: '', operator: 'equals', right: '' }, thenSteps: [], elseSteps: [] };
    case 'loop':
      return { id, type, name: 'Loop', enabled: true, loopType: 'count', loopCount: 3,
        loopCondition: { left: '', operator: 'equals', right: '' }, loopSteps: [] };
    case 'delay':
      return { id, type, name: 'Delay', enabled: true, delayMs: 1000 };
    case 'set_variable':
      return { id, type, name: 'Set Variable', enabled: true, variableName: '', variableValue: '' };
    case 'assert':
      return { id, type, name: 'Assert', enabled: true,
        assertCondition: { left: '', operator: 'equals', right: '' }, assertMessage: 'Assertion failed' };
    default:
      return { id, type, name: type, enabled: true };
  }
}

function mkFlow() {
  return { id: '', name: 'New Flow', steps: [], variables: {} };
}

// ── Step description (shown on canvas card) ────────────────────────────────────
function stepDesc(step) {
  switch (step.type) {
    case 'request':
      return step.request ? `${step.request.method}  ${step.request.url || '—'}` : '';
    case 'condition':
      return step.condition
        ? `IF ${step.condition.left || '…'} ${step.condition.operator} ${step.condition.right || '…'}`
        : '';
    case 'loop':
      return step.loopType === 'while'
        ? `While ${step.loopCondition?.left || '…'}`
        : `Repeat ${step.loopCount || 0}×`;
    case 'delay':      return `Wait ${step.delayMs || 0} ms`;
    case 'set_variable': return step.variableName ? `{{${step.variableName}}} = ${step.variableValue || ''}` : '';
    case 'assert':
      return step.assertCondition
        ? `${step.assertCondition.left || '…'} ${step.assertCondition.operator} ${step.assertCondition.right || '…'}`
        : '';
    default: return '';
  }
}

// ── Recursive helpers for nested step trees ───────────────────────────────────
function findStep(id, steps) {
  for (const s of steps) {
    if (s.id === id) return s;
    const nested = [...(s.thenSteps || []), ...(s.elseSteps || []), ...(s.loopSteps || [])];
    const found = findStep(id, nested);
    if (found) return found;
  }
  return null;
}

function applyUpdate(steps, id, updates) {
  return steps.map(s => {
    if (s.id === id) return { ...s, ...updates };
    return {
      ...s,
      thenSteps: s.thenSteps ? applyUpdate(s.thenSteps, id, updates) : s.thenSteps,
      elseSteps: s.elseSteps ? applyUpdate(s.elseSteps, id, updates) : s.elseSteps,
      loopSteps: s.loopSteps ? applyUpdate(s.loopSteps, id, updates) : s.loopSteps,
    };
  });
}

function collectIds(steps, out = {}) {
  steps.forEach(s => {
    out[s.id] = { status: 'idle' };
    collectIds([...(s.thenSteps || []), ...(s.elseSteps || []), ...(s.loopSteps || [])], out);
  });
  return out;
}

// ── Status icon ───────────────────────────────────────────────────────────────
function StatusIcon({ status }) {
  if (!status || status === 'idle') return <span className="step-status idle" />;
  if (status === 'running') return <span className="step-status running spin-icon">⟳</span>;
  if (status === 'success') return <span className="step-status success">✓</span>;
  if (status === 'failed')  return <span className="step-status failed">✗</span>;
  if (status === 'skipped') return <span className="step-status skipped">↷</span>;
  return null;
}

// ── FlowBuilder ───────────────────────────────────────────────────────────────
export default function FlowBuilder({ onClose }) {
  const { showToast } = useToast();

  // Saved flows list
  const [flows,        setFlows]        = useState([]);
  // Currently editing flow (local copy — not auto-saved)
  const [activeFlow,   setActiveFlow]   = useState(mkFlow);
  const [selectedId,   setSelectedId]   = useState(null);

  // Execution state
  const [stepStatuses, setStepStatuses] = useState({});
  const [runVars,      setRunVars]      = useState({});
  const [isRunning,    setIsRunning]    = useState(false);
  const abortRef = useRef(null);

  // UI toggles
  const [showVars,     setShowVars]     = useState(false);
  const [showAddMenu,  setShowAddMenu]  = useState(false);
  const [dragIdx,      setDragIdx]      = useState(null);
  const [dragOver,     setDragOver]     = useState(null);

  useEffect(() => { loadFlows(); }, []);

  async function loadFlows() {
    try { setFlows(await api.flows.getAll() || []); }
    catch (e) { showToast(`Load flows: ${e.message}`, 'error'); }
  }

  function selectFlow(f) {
    setActiveFlow(JSON.parse(JSON.stringify(f)));
    setSelectedId(null);
    setStepStatuses({});
    setRunVars({});
    setShowVars(false);
  }

  async function saveFlow() {
    if (!activeFlow.name.trim()) { showToast('Enter a flow name', 'warning'); return; }
    try {
      const saved = activeFlow.id
        ? await api.flows.update(activeFlow)
        : await api.flows.create(activeFlow);
      setActiveFlow(JSON.parse(JSON.stringify(saved)));
      await loadFlows();
      showToast('Flow saved ✓', 'success');
    } catch (e) { showToast(`Save failed: ${e.message}`, 'error'); }
  }

  async function deleteFlow() {
    if (!activeFlow.id) { setActiveFlow(mkFlow()); return; }
    if (!window.confirm(`Delete flow "${activeFlow.name}"?`)) return;
    try {
      await api.flows.delete(activeFlow.id);
      await loadFlows();
      setActiveFlow(mkFlow());
      setSelectedId(null);
      showToast('Flow deleted', 'info');
    } catch (e) { showToast(`Delete failed: ${e.message}`, 'error'); }
  }

  // ── Steps ─────────────────────────────────────────────────────────────────
  function addStep(type) {
    const step = mkStep(type);
    setActiveFlow(f => ({ ...f, steps: [...f.steps, step] }));
    setSelectedId(step.id);
    setShowAddMenu(false);
  }

  function removeStep(id) {
    setActiveFlow(f => ({ ...f, steps: f.steps.filter(s => s.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }

  function updateStep(id, updates) {
    setActiveFlow(f => ({ ...f, steps: applyUpdate(f.steps, id, updates) }));
  }

  // ── Drag & drop (top-level steps) ─────────────────────────────────────────
  function onDragStart(e, i) { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; }
  function onDragOver(e, i)  { e.preventDefault(); setDragOver(i); }
  function onDrop(e, i) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOver(null); return; }
    const steps = [...activeFlow.steps];
    const [moved] = steps.splice(dragIdx, 1);
    steps.splice(i, 0, moved);
    setActiveFlow(f => ({ ...f, steps }));
    setDragIdx(null); setDragOver(null);
  }
  function onDragEnd() { setDragIdx(null); setDragOver(null); }

  // ── Run / stop ────────────────────────────────────────────────────────────
  async function handleRun() {
    if (isRunning) { abortRef.current?.abort(); return; }
    setStepStatuses(collectIds(activeFlow.steps));
    setRunVars({ ...activeFlow.variables });
    setIsRunning(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await runFlow(activeFlow, (stepId, update) => {
        // update can be an object or (rarely) a function — handle both
        if (typeof update === 'function') {
          setStepStatuses(prev => ({ ...prev, [stepId]: update(prev[stepId]) }));
        } else {
          setStepStatuses(prev => ({ ...prev, [stepId]: update }));
          if (update.variables) setRunVars(update.variables);
        }
      }, ctrl.signal);
      showToast('Flow completed ✓', 'success');
    } catch (e) {
      if (e.message !== 'Aborted') showToast(`Flow stopped: ${e.message}`, 'error');
    } finally { setIsRunning(false); }
  }

  // ── Variables ─────────────────────────────────────────────────────────────
  function addVar() {
    setActiveFlow(f => ({ ...f, variables: { ...f.variables, '': '' } }));
  }
  function setVar(oldKey, newKey, value) {
    setActiveFlow(f => {
      const v = { ...f.variables };
      if (oldKey !== newKey) delete v[oldKey];
      v[newKey] = value;
      return { ...f, variables: v };
    });
  }
  function delVar(key) {
    setActiveFlow(f => { const v = { ...f.variables }; delete v[key]; return { ...f, variables: v }; });
  }

  const selectedStep = selectedId ? findStep(selectedId, activeFlow.steps) : null;

  return (
    <div className="flow-builder" onClick={() => setShowAddMenu(false)}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flow-toolbar">
        <div className="flow-name-wrap">
          <span className="flow-label">FLOW</span>
          <input
            className="flow-name-input"
            value={activeFlow.name}
            onChange={e => setActiveFlow(f => ({ ...f, name: e.target.value }))}
            placeholder="Flow Name"
          />
        </div>
        <div className="flow-toolbar-btns">
          <button
            className={`flow-btn run-btn${isRunning ? ' stop' : ''}`}
            onClick={handleRun}
          >
            {isRunning ? '■ Stop' : '▶ Run'}
          </button>
          <button className="flow-btn" onClick={saveFlow}>💾 Save</button>
          <button className="flow-btn" onClick={() => { setActiveFlow(mkFlow()); setSelectedId(null); setStepStatuses({}); }}>+ New</button>
          <button className="flow-btn danger-btn" onClick={deleteFlow} disabled={!activeFlow.id}>🗑 Del</button>
          <button className={`flow-btn${showVars ? ' active-btn' : ''}`} onClick={() => setShowVars(v => !v)}>
            ⚙ Vars{Object.keys(activeFlow.variables).length > 0 ? ` (${Object.keys(activeFlow.variables).length})` : ''}
          </button>
          <button className="flow-btn close-btn" onClick={onClose}>✕ Close</button>
        </div>
      </div>

      {/* ── Variables panel ──────────────────────────────────────────────── */}
      {showVars && (
        <div className="flow-vars-panel">
          <div className="flow-vars-heading">
            Variables
            <span className="flow-vars-hint"> — use <code>{'{{name}}'}</code> in requests, URLs, params, body</span>
          </div>
          {Object.entries(activeFlow.variables).map(([k, v], i) => (
            <div key={i} className="flow-var-row">
              <input className="form-input flow-var-key" placeholder="name"
                value={k} onChange={e => setVar(k, e.target.value, v)} />
              <input className="form-input flow-var-val" placeholder="value"
                value={v} onChange={e => setVar(k, k, e.target.value)} />
              {runVars[k] !== undefined && runVars[k] !== v && (
                <span className="flow-var-live" title="Runtime value">→&nbsp;{String(runVars[k]).substring(0, 28)}</span>
              )}
              <button className="flow-var-del" onClick={() => delVar(k)}>✕</button>
            </div>
          ))}
          <button className="add-row-button" style={{ marginTop: 8 }} onClick={addVar}>+ Add Variable</button>

          {/* Runtime snapshot */}
          {Object.keys(runVars).length > 0 && (
            <div className="flow-runtime-snap">
              <div className="flow-vars-heading" style={{ marginTop: 12 }}>Runtime snapshot</div>
              {Object.entries(runVars).map(([k, v]) => (
                <div key={k} className="flow-runtime-row">
                  <code>{k}</code>
                  <span>=</span>
                  <span className="flow-runtime-val">{String(v).substring(0, 100)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flow-main">

        {/* Saved flows list */}
        <div className="flow-list-panel">
          <div className="flow-list-title">Saved Flows</div>
          {flows.length === 0 && <div className="flow-list-empty">No flows saved yet</div>}
          {flows.map(f => (
            <div
              key={f.id}
              className={`flow-list-item${activeFlow.id === f.id ? ' active' : ''}`}
              onClick={() => selectFlow(f)}
            >
              <div className="flow-list-name">{f.name}</div>
              <div className="flow-list-meta">{(f.steps || []).length} step{(f.steps || []).length !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>

        {/* Flow canvas */}
        <div className="flow-canvas">
          {activeFlow.steps.length === 0 && (
            <div className="flow-canvas-empty">
              <div style={{ fontSize: 32 }}>⚡</div>
              <div>No steps yet</div>
              <div style={{ fontSize: 12, marginTop: 6, opacity: 0.6 }}>
                Click "Add Step" below to start building your flow
              </div>
            </div>
          )}

          {activeFlow.steps.map((step, i) => {
            const st  = stepStatuses[step.id]?.status || 'idle';
            const err = stepStatuses[step.id]?.error;
            return (
              <React.Fragment key={step.id}>
                {i > 0 && (
                  <div className={`flow-connector${isRunning && st === 'running' ? ' pulse' : ''}`} />
                )}
                <div
                  className={[
                    'flow-step-card',
                    selectedId === step.id ? 'selected' : '',
                    `st-${st}`,
                    !step.enabled ? 'step-disabled' : '',
                    dragOver === i ? 'drag-over' : '',
                  ].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={e => onDragStart(e, i)}
                  onDragOver={e => onDragOver(e, i)}
                  onDrop={e => onDrop(e, i)}
                  onDragEnd={onDragEnd}
                  onClick={e => { e.stopPropagation(); setSelectedId(step.id); }}
                  title={err || ''}
                >
                  <span className="step-drag-handle" title="Drag to reorder">⠿</span>
                  <span className="step-type-icon">{TYPE_META[step.type]?.icon || '?'}</span>
                  <div className="step-card-body">
                    <div className="step-card-name">{step.name || step.type}</div>
                    <div className="step-card-desc">{stepDesc(step)}</div>
                    {err && <div className="step-card-err">{err}</div>}
                  </div>
                  <StatusIcon status={st} />
                  {step.type === 'condition' && st === 'success' && stepStatuses[step.id]?.result?.conditionMet !== undefined && (
                    <span className={`flow-branch-pill ${stepStatuses[step.id].result.conditionMet ? 'then' : 'else'}`}>
                      {stepStatuses[step.id].result.conditionMet ? 'THEN' : 'ELSE'}
                    </span>
                  )}
                  <button
                    className="step-del-btn"
                    onClick={e => { e.stopPropagation(); removeStep(step.id); }}
                    title="Delete step"
                  >✕</button>
                </div>
              </React.Fragment>
            );
          })}

          {/* Add step */}
          <div className="flow-add-area" onClick={e => e.stopPropagation()}>
            <button className="flow-add-step-btn" onClick={() => setShowAddMenu(m => !m)}>
              + Add Step
            </button>
            {showAddMenu && (
              <div className="flow-add-menu">
                {STEP_TYPES.map(t => (
                  <button key={t.type} className="flow-add-menu-item" onClick={() => addStep(t.type)}>
                    <span>{t.icon}</span>&nbsp;{t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Step editor panel */}
        <div className="flow-editor-panel">
          {selectedStep
            ? (
              <FlowStepEditor
                step={selectedStep}
                onUpdate={updateStep}
                stepStatuses={stepStatuses}
              />
            )
            : (
              <div className="step-editor-empty">
                <div style={{ fontSize: 24 }}>✏️</div>
                <div>Select a step to edit</div>
                <div style={{ fontSize: 12, marginTop: 6, opacity: 0.5 }}>Click any step card in the canvas</div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}
