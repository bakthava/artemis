import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { runFlow } from '../utils/flowRunner';
import FlowStepEditor from './FlowStepEditor';
import MetricsTable from './MetricsTable';

const NODE_W = 220;
const NODE_H = 68;

const STEP_TYPES = [
  { type: 'start',        icon: '▶',  label: 'Start',          color: '#059669' },
  { type: 'request',      icon: '🌐', label: 'HTTP Request',  color: '#3b82f6' },
  { type: 'condition',    icon: '🔀', label: 'Condition',      color: '#f59e0b' },
  { type: 'loop',         icon: '🔁', label: 'Loop',           color: '#8b5cf6' },
  { type: 'delay',        icon: '⏱',  label: 'Delay',          color: '#6b7280' },
  { type: 'set_variable', icon: '📝', label: 'Set Variable',  color: '#10b981' },
  { type: 'assert',       icon: '✅', label: 'Assert',         color: '#ef4444' },
  { type: 'end',          icon: '⏹',  label: 'End',            color: '#dc2626' },
];
const TYPE_META = Object.fromEntries(STEP_TYPES.map(t => [t.type, t]));

function nodeW(step) {
  return (step?.type === 'start' || step?.type === 'end') ? 140 : NODE_W;
}

function nodeH(step) {
  return (step?.type === 'start' || step?.type === 'end') ? 80 : NODE_H;
}

function nextPos(steps) {
  if (!steps.length) return { x: 80, y: 80 };
  const bot = [...steps].sort((a, b) => (b.y || 0) - (a.y || 0))[0];
  return { x: bot.x || 80, y: (bot.y || 80) + NODE_H + 44 };
}

function mkStep(type, x, y) {
  const id = `s${Date.now()}${Math.random().toString(36).substr(2, 6)}`;
  const base = { id, type, enabled: true, x: x ?? 80, y: y ?? 80 };
  switch (type) {
    case 'start':        return { ...base, name: 'Start', mode: 'functional', numUsers: 1, rampUpSeconds: 0, durationMode: 'duration', durationSeconds: 60, transactionsCount: 1 };
    case 'request':      return { ...base, name: 'HTTP Request', request: { method: 'GET', url: '', headers: {}, params: {}, body: '', bodyType: 'json' }, extractions: [], assertions: [] };
    case 'condition':    return { ...base, name: 'Condition', condition: { left: '', operator: 'equals', right: '' }, thenSteps: [], elseSteps: [] };
    case 'loop':         return { ...base, name: 'Loop', loopType: 'count', loopCount: 3, loopCondition: { left: '', operator: 'equals', right: '' }, loopSteps: [] };
    case 'delay':        return { ...base, name: 'Delay', delayMs: 1000 };
    case 'set_variable': return { ...base, name: 'Set Variable', variableName: '', variableValue: '' };
    case 'assert':       return { ...base, name: 'Assert', assertCondition: { left: '', operator: 'equals', right: '' }, assertMessage: 'Assertion failed' };
    case 'end':          return { ...base, name: 'End' };
    default:             return { ...base, name: type };
  }
}

function mkFlow() {
  const startStep = mkStep('start', 80, 30);
  return {
    id: '',
    name: 'New Flow',
    steps: [startStep],
    edges: [],
    variables: {},
  };
}

function stepDesc(step) {
  switch (step.type) {
    case 'request':      return step.request ? `${step.request.method} ${step.request.url || '—'}` : '';
    case 'condition':    return step.condition ? `IF ${step.condition.left || '…'} ${step.condition.operator} ${step.condition.right || '…'}` : '';
    case 'loop':         return step.loopType === 'while' ? `While ${step.loopCondition?.left || '…'}` : `Repeat ${step.loopCount || 0}×`;
    case 'delay':        return `Wait ${step.delayMs || 0} ms`;
    case 'set_variable': return step.variableName ? `{{${step.variableName}}} = ${step.variableValue || ''}` : '';
    case 'assert':       return step.assertCondition ? `${step.assertCondition.left || '…'} ${step.assertCondition.operator} ${step.assertCondition.right || '…'}` : '';
    default:             return '';
  }
}

function findStep(id, steps) {
  for (const s of steps) {
    if (s.id === id) return s;
    const found = findStep(id, [...(s.thenSteps || []), ...(s.elseSteps || []), ...(s.loopSteps || [])]);
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

// Bezier path between two points
function bezier(x1, y1, x2, y2) {
  const cp = Math.max(60, Math.abs(x2 - x1) * 0.5);
  return `M${x1},${y1} C${x1 + cp},${y1} ${x2 - cp},${y2} ${x2},${y2}`;
}

// ── SVG arrowhead markers ─────────────────────────────────────────────────────
const ArrowDefs = () => (
  <defs>
    {[
      { id: 'am-default', c: '#94a3b8' },
      { id: 'am-then',    c: '#16a34a' },
      { id: 'am-else',    c: '#dc2626' },
      { id: 'am-sel',     c: '#3b82f6' },
      { id: 'am-live',    c: '#3b82f6' },
    ].map(({ id, c }) => (
      <marker key={id} id={id} markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
        <path d="M0,0 L0,6 L7,3 z" fill={c} />
      </marker>
    ))}
  </defs>
);

// ── Step node ─────────────────────────────────────────────────────────────────
function StepNode({ step, selected, stepStatus = {}, onSelect, onDelete, onMoveStep, onConnectStart, onConnectTarget, isTarget }) {
  const meta  = TYPE_META[step.type] || { icon: '?', color: '#6b7280' };
  const st    = stepStatus.status || 'idle';
  const durMs = stepStatus.durationMs;
  const httpC = stepStatus.result?.statusCode;
  const reqMs = stepStatus.result?.reqMs;
  const err   = stepStatus.error;

  const dragRef = useRef(null);

  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (e.target.closest('.conn-handle') || e.target.closest('.node-del-btn')) return;
    e.stopPropagation();
    onSelect();
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: step.x || 0, oy: step.y || 0 };
    function onMove(ev) {
      if (!dragRef.current) return;
      onMoveStep(step.id,
        Math.max(0, dragRef.current.ox + ev.clientX - dragRef.current.sx),
        Math.max(0, dragRef.current.oy + ev.clientY - dragRef.current.sy));
    }
    function onUp() {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  // Special styling for start/end nodes
  if (step.type === 'start' || step.type === 'end') {
    const kindClass = step.type === 'start' ? 'flow-node-start' : 'flow-node-end';
    return (
      <div
        className={['flow-node', 'flow-node-terminal', kindClass, selected ? 'fn-selected' : '', isTarget ? 'fn-target' : ''].filter(Boolean).join(' ')}
        style={{
          left: step.x || 0,
          top: step.y || 0,
          width: 140,
          height: 80,
          position: 'absolute'
        }}
        onMouseDown={onMouseDown}
        onMouseEnter={() => onConnectTarget(step.id)}
        onMouseLeave={() => onConnectTarget(null)}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        <div className="terminal-node-body">
          <div className="terminal-node-icon">{meta.icon}</div>
          <div className="terminal-node-name">{step.name}</div>
          <div className="terminal-node-pill">{step.type === 'start' ? 'ENTRY' : 'EXIT'}</div>
        </div>

        {/* Connection handle for START - clickable circle on right edge */}
        {step.type === 'start' && (
          <div 
            className="conn-handle hnd-main" 
            title="Pull to connect to next step →"
            style={{
              position: 'absolute',
              width: 14,
              height: 14,
              right: -10,
              top: '50%',
              transform: 'translateY(-50%)',
              cursor: 'crosshair',
              opacity: 1,
              pointerEvents: 'auto',
              zIndex: 100,
            }}
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onConnectStart(step.id, '', e); }} 
          />
        )}
        
        {/* Connection indicator for END - shows it accepts input */}
        {step.type === 'end' && (
          <div 
            className="terminal-end-dot"
            style={{
              position: 'absolute',
              width: 14,
              height: 14,
              left: -10,
              top: '50%',
              transform: 'translateY(-50%)',
              pointerEvents: 'none',
              zIndex: 1,
            }} 
          />
        )}

        {/* Delete button (not for START) */}
        {step.type !== 'start' && (
          <button 
            className="node-del-btn" 
            onClick={e => { e.stopPropagation(); onDelete(); }} 
            title="Delete step"
            style={{ 
              position: 'absolute', 
              top: -6, 
              right: -6,
              zIndex: 99,
            }}
          >✕</button>
        )}
      </div>
    );
  }

  const stClass = st !== 'idle' ? `fn-${st}` : '';
  const isCondition = step.type === 'condition';

  return (
    <div
      className={['flow-node', selected ? 'fn-selected' : '', stClass, !step.enabled ? 'fn-disabled' : '', isTarget ? 'fn-target' : ''].filter(Boolean).join(' ')}
      style={{ left: step.x || 0, top: step.y || 0 }}
      onMouseDown={onMouseDown}
      onMouseEnter={() => onConnectTarget(step.id)}
      onMouseLeave={() => onConnectTarget(null)}
      onClick={e => { e.stopPropagation(); onSelect(); }}
    >
      {/* Colored icon strip on the left */}
      <div className="fn-strip" style={{ background: meta.color }}>
        <span className="fn-icon">{meta.icon}</span>
      </div>

      {/* Body */}
      <div className="fn-body">
        <div className="fn-name">{step.name || step.type}</div>
        <div className="fn-desc">{stepDesc(step)}</div>
        {err && <div className="fn-err">✗ {err}</div>}
        {(httpC != null || durMs != null) && (
          <div className="fn-badges">
            {httpC  != null && <span className={`fn-http${httpC >= 400 ? ' fn-http-err' : ''}`}>{httpC}</span>}
            {reqMs  != null && <span className="fn-timing">🌐{reqMs}ms</span>}
            {durMs  != null && st !== 'running' && <span className="fn-timing">{durMs}ms</span>}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="fn-status">
        {st === 'running' && <span className="spin-icon" style={{ color: '#3b82f6' }}>⟳</span>}
        {st === 'success' && <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>}
        {st === 'failed'  && <span style={{ color: '#dc2626', fontWeight: 700 }}>✗</span>}
        {st === 'skipped' && <span style={{ color: '#94a3b8' }}>↷</span>}
      </div>

      {/* Delete */}
      <button className="node-del-btn" onClick={e => { e.stopPropagation(); onDelete(); }} title="Delete step">✕</button>

      {/* Connection handles — right edge */}
      {isCondition ? (
        <>
          <div className="conn-handle hnd-then" title="THEN branch →"
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onConnectStart(step.id, 'then', e); }} />
          <div className="conn-handle hnd-else" title="ELSE branch →"
            onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onConnectStart(step.id, 'else', e); }} />
        </>
      ) : (
        <div className="conn-handle hnd-main" title="Connect to next step →"
          onMouseDown={e => { e.stopPropagation(); e.preventDefault(); onConnectStart(step.id, '', e); }} />
      )}
    </div>
  );
}

// ── FlowBuilder ───────────────────────────────────────────────────────────────
export default function FlowBuilder({ onClose }) {
  const { showToast } = useToast();
  const canvasWrapRef = useRef(null);

  const [flows,        setFlows]        = useState([]);
  const [activeFlow,   setActiveFlow]   = useState(mkFlow);
  const [selectedId,   setSelectedId]   = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [stepStatuses, setStepStatuses] = useState({});
  const [runVars,      setRunVars]      = useState({});
  const [isRunning,    setIsRunning]    = useState(false);
  const [metrics,      setMetrics]      = useState({});  // { stepName: { count, minMs, maxMs, sumMs, errors, bytes, ... } }
  const abortRef = useRef(null);

  const [showVars,     setShowVars]     = useState(false);
  const [showAddMenu,  setShowAddMenu]  = useState(false);

  // Connection drawing
  const connectFromRef = useRef(null);   // { fromId, fromLabel }
  const connectTargRef = useRef(null);   // step id currently hovered during connect
  const [connLine,     setConnLine]     = useState(null);   // { x1,y1,x2,y2 } for SVG
  const [connTarget,   setConnTarget]   = useState(null);   // highlighted drop target

  useEffect(() => { loadFlows(); }, []);

  async function loadFlows() {
    try { setFlows(await api.flows.getAll() || []); }
    catch (e) { showToast(`Load flows: ${e.message}`, 'error'); }
  }

  function selectFlow(f) {
    const steps = (f.steps || []).map((s, i) => ({
      ...s,
      x: s.x > 0 ? s.x : 80 + (i % 3) * (NODE_W + 60),
      y: s.y > 0 ? s.y : 80 + Math.floor(i / 3) * (NODE_H + 60),
    }));
    setActiveFlow({ ...JSON.parse(JSON.stringify({ ...f, steps })), edges: f.edges || [] });
    setSelectedId(null);
    setSelectedEdge(null);
    setStepStatuses({});
    setRunVars({});
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

  function addStep(type) {
    const { x, y } = nextPos(activeFlow.steps);
    const step = mkStep(type, x, y);
    setActiveFlow(f => ({ ...f, steps: [...f.steps, step] }));
    setSelectedId(step.id);
    setShowAddMenu(false);
  }

  function removeStep(id) {
    setActiveFlow(f => ({
      ...f,
      steps: f.steps.filter(s => s.id !== id),
      edges: (f.edges || []).filter(e => e.from !== id && e.to !== id),
    }));
    if (selectedId === id) setSelectedId(null);
  }

  function moveStep(id, x, y) {
    setActiveFlow(f => ({ ...f, steps: f.steps.map(s => s.id === id ? { ...s, x, y } : s) }));
  }

  function updateStep(idOrStep, updates) {
    // Accept either updateStep(stepId, updates) or updateStep(fullStep)
    if (idOrStep && typeof idOrStep === 'object' && idOrStep.id) {
      const nextStep = idOrStep;
      setActiveFlow(f => ({
        ...f,
        steps: f.steps.map(s => (s.id === nextStep.id ? nextStep : s)),
      }));
      return;
    }
    setActiveFlow(f => ({ ...f, steps: applyUpdate(f.steps, idOrStep, updates) }));
  }

  function addEdge(fromId, toId, label) {
    setActiveFlow(f => {
      const edges = f.edges || [];
      if (edges.find(e => e.from === fromId && e.to === toId && (e.label || '') === (label || ''))) return f;
      const id = `e${Date.now()}${Math.random().toString(36).substr(2, 5)}`;
      return { ...f, edges: [...edges, { id, from: fromId, to: toId, label: label || '' }] };
    });
  }

  function removeEdge(id) {
    setActiveFlow(f => ({ ...f, edges: (f.edges || []).filter(e => e.id !== id) }));
    setSelectedEdge(null);
  }

  // ── Run / stop ────────────────────────────────────────────────────────────
  async function handleRun() {
    if (isRunning) { abortRef.current?.abort(); return; }
    setStepStatuses(collectIds(activeFlow.steps));
    setRunVars({ ...activeFlow.variables });
    setMetrics({}); // Reset metrics for new run
    setIsRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await runFlow(activeFlow, 
        (stepId, update) => {
          if (typeof update === 'function') {
            setStepStatuses(prev => ({ ...prev, [stepId]: update(prev[stepId]) }));
          } else {
            setStepStatuses(prev => ({ ...prev, [stepId]: update }));
            if (update.variables) setRunVars(update.variables);
          }
        },
        (stepName, metric) => {
          // Aggregate metrics per request name
          setMetrics(prev => {
            const existing = prev[stepName] || {
              count: 0,
              minMs: Infinity,
              maxMs: 0,
              sumMs: 0,
              sumSqMs: 0,
              errors: 0,
              totalBytesRecv: 0,
              totalBytesSent: 0,
              samples: [],
            };
            const count = existing.count + 1;
            const sumMs = existing.sumMs + metric.responseTime;
            const sumSqMs = existing.sumSqMs + (metric.responseTime ** 2);
            const samples = [...existing.samples, metric.responseTime];
            return {
              ...prev,
              [stepName]: {
                count,
                minMs: Math.min(existing.minMs, metric.responseTime),
                maxMs: Math.max(existing.maxMs, metric.responseTime),
                sumMs,
                sumSqMs,
                avgMs: Math.round(sumMs / count),
                errors: existing.errors + (metric.success ? 0 : 1),
                totalBytesRecv: existing.totalBytesRecv + metric.bytesRecv,
                totalBytesSent: existing.totalBytesSent + metric.bytesSent,
                samples,
              },
            };
          });
        },
        ctrl.signal
      );
      showToast('Flow completed ✓', 'success');
    } catch (e) {
      if (e.message !== 'Aborted') showToast(`Flow stopped: ${e.message}`, 'error');
    } finally { setIsRunning(false); }
  }

  // ── Variables ─────────────────────────────────────────────────────────────
  function addVar()                  { setActiveFlow(f => ({ ...f, variables: { ...f.variables, '': '' } })); }
  function setVar(ok, nk, v)         { setActiveFlow(f => { const m = { ...f.variables }; if (ok !== nk) delete m[ok]; m[nk] = v; return { ...f, variables: m }; }); }
  function delVar(k)                 { setActiveFlow(f => { const m = { ...f.variables }; delete m[k]; return { ...f, variables: m }; }); }

  // ── Canvas coordinate helper (accounts for scroll) ────────────────────────
  function getCanvasXY(e) {
    const el = canvasWrapRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop };
  }

  // ── Start drawing a connection ─────────────────────────────────────────────
  function handleConnectStart(fromId, fromLabel, e) {
    const step = activeFlow.steps.find(s => s.id === fromId);
    if (!step) return;
    const nodeW = (step.type === 'start' || step.type === 'end') ? 140 : NODE_W;
    const nodeH = (step.type === 'start' || step.type === 'end') ? 80 : NODE_H;
    const pos = getCanvasXY(e);
    let fy = (step.y || 0) + nodeH / 2;
    if (fromLabel === 'then') fy = (step.y || 0) + nodeH * 0.28;
    if (fromLabel === 'else') fy = (step.y || 0) + nodeH * 0.72;
    connectFromRef.current = { fromId, fromLabel };
    setConnLine({ x1: (step.x || 0) + nodeW + 8, y1: fy, x2: pos.x, y2: pos.y });

    function onMove(ev) {
      const p = getCanvasXY(ev);
      setConnLine(l => l ? { ...l, x2: p.x, y2: p.y } : null);
    }
    function onUp(ev) {
      const cf = connectFromRef.current;
      let ct = connectTargRef.current;

      // Fallback hit test on mouse-up so connect works even if hover events are missed while dragging.
      if (!ct && cf) {
        const p = getCanvasXY(ev);
        const targetStep = (activeFlow.steps || []).find(s => {
          if (s.id === cf.fromId) return false;
          const w = (s.type === 'start' || s.type === 'end') ? 140 : NODE_W;
          const h = (s.type === 'start' || s.type === 'end') ? 80 : NODE_H;
          const sx = s.x || 0;
          const sy = s.y || 0;
          return p.x >= sx && p.x <= sx + w && p.y >= sy && p.y <= sy + h;
        });
        ct = targetStep?.id || null;
      }

      if (cf && ct && ct !== cf.fromId) addEdge(cf.fromId, ct, cf.fromLabel || '');
      connectFromRef.current = null;
      connectTargRef.current = null;
      setConnLine(null);
      setConnTarget(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleConnectTarget(stepId) {
    connectTargRef.current = stepId;
    setConnTarget(stepId);
  }

  // Canvas size computed from step positions
  const { canvasW, canvasH } = useMemo(() => {
    const steps = activeFlow.steps || [];
    return {
      canvasW: Math.max(1400, ...steps.map(s => (s.x || 0) + NODE_W + 200)),
      canvasH: Math.max(800,  ...steps.map(s => (s.y || 0) + NODE_H + 200)),
    };
  }, [activeFlow.steps]);

  const edges       = activeFlow.edges || [];
  const selectedStep = selectedId ? findStep(selectedId, activeFlow.steps) : null;

  return (
    <div className="flow-builder" onClick={() => { setShowAddMenu(false); setSelectedEdge(null); }}>

      {/* ── Toolbar ── */}
      <div className="flow-toolbar">
        <div className="flow-name-wrap">
          <span className="flow-label">FLOW</span>
          <input className="flow-name-input" value={activeFlow.name} placeholder="Flow Name"
            onChange={e => setActiveFlow(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="flow-toolbar-btns">
          <button className={`flow-btn run-btn${isRunning ? ' stop' : ''}`} onClick={handleRun}>
            {isRunning ? '■ Stop' : '▶ Run'}
          </button>
          <button className="flow-btn" onClick={saveFlow}>💾 Save</button>
          {/* + Step dropdown */}
          <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button className="flow-btn" onClick={() => setShowAddMenu(m => !m)}>+ Step ▾</button>
            {showAddMenu && (
              <div className="flow-add-menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 300 }}>
                {STEP_TYPES.map(t => (
                  <button key={t.type} className="flow-add-menu-item" onClick={() => addStep(t.type)}>
                    <span>{t.icon}</span>&nbsp;{t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="flow-btn" onClick={() => { setActiveFlow(mkFlow()); setSelectedId(null); setStepStatuses({}); }}>+ New</button>
          <button className="flow-btn danger-btn" onClick={deleteFlow} disabled={!activeFlow.id}>🗑 Del</button>
          <button className={`flow-btn${showVars ? ' active-btn' : ''}`} onClick={() => setShowVars(v => !v)}>
            ⚙ Vars{Object.keys(activeFlow.variables).length > 0 ? ` (${Object.keys(activeFlow.variables).length})` : ''}
          </button>
          <button className="flow-btn close-btn" onClick={onClose}>✕ Close</button>
        </div>
      </div>

      {/* ── Variables panel ── */}
      {showVars && (
        <div className="flow-vars-panel">
          <div className="flow-vars-heading">Variables <span className="flow-vars-hint">— use <code>{'{{name}}'}</code> in requests</span></div>
          {Object.entries(activeFlow.variables).map(([k, v], i) => (
            <div key={i} className="flow-var-row">
              <input className="form-input flow-var-key" placeholder="name"  value={k} onChange={e => setVar(k, e.target.value, v)} />
              <input className="form-input flow-var-val" placeholder="value" value={v} onChange={e => setVar(k, k, e.target.value)} />
              {runVars[k] !== undefined && runVars[k] !== v && (
                <span className="flow-var-live" title="Runtime value">→ {String(runVars[k]).substring(0, 28)}</span>
              )}
              <button className="flow-var-del" onClick={() => delVar(k)}>✕</button>
            </div>
          ))}
          <button className="add-row-button" style={{ marginTop: 8 }} onClick={addVar}>+ Add Variable</button>
          {Object.keys(runVars).length > 0 && (
            <div className="flow-runtime-snap">
              <div className="flow-vars-heading" style={{ marginTop: 12 }}>Runtime snapshot</div>
              {Object.entries(runVars).map(([k, v]) => (
                <div key={k} className="flow-runtime-row">
                  <code>{k}</code> = <span className="flow-runtime-val">{String(v).substring(0, 100)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Main ── */}
      <div className="flow-main">

        {/* Saved flows list */}
        <div className="flow-list-panel">
          <div className="flow-list-title">Saved Flows</div>
          {flows.length === 0 && <div className="flow-list-empty">No flows yet</div>}
          {flows.map(f => (
            <div key={f.id}
              className={`flow-list-item${activeFlow.id === f.id ? ' active' : ''}`}
              onClick={() => selectFlow(f)}>
              <div className="flow-list-name">{f.name}</div>
              <div className="flow-list-meta">{(f.steps || []).length} step{(f.steps || []).length !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>

        {/* ── Node canvas ── */}
        <div className="flow-canvas-wrap" ref={canvasWrapRef}
          onClick={() => setSelectedId(null)}>
          {activeFlow.steps.length === 0 && (
            <div className="flow-canvas-empty">
              <div style={{ fontSize: 36 }}>⚡</div>
              <div>Click <strong>+ Step ▾</strong> in the toolbar to add your first step</div>
              <div style={{ fontSize: 11, marginTop: 8, opacity: 0.5 }}>
                Drag nodes to position · Pull the <span style={{ color: '#3b82f6' }}>●</span> handle on the right edge to connect steps
              </div>
            </div>
          )}

          <div className="flow-canvas-area" style={{ width: canvasW, height: canvasH }}>
            {/* SVG edge layer */}
            <svg className="flow-edges-svg" width={canvasW} height={canvasH}>
              <ArrowDefs />

              {/* Existing edges */}
              {edges.map(edge => {
                const from = activeFlow.steps.find(s => s.id === edge.from);
                const to   = activeFlow.steps.find(s => s.id === edge.to);
                if (!from || !to) return null;

                const fromW = nodeW(from);
                const fromH = nodeH(from);
                const toH = nodeH(to);

                let y1 = (from.y || 0) + fromH / 2;
                if (from.type === 'condition') {
                  y1 = edge.label === 'else'
                    ? (from.y || 0) + fromH * 0.72
                    : (from.y || 0) + fromH * 0.28;
                }
                const x1 = (from.x || 0) + fromW + 8;
                const x2 = to.x || 0;
                const y2 = (to.y || 0) + toH / 2;
                const d  = bezier(x1, y1, x2, y2);
                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;
                const isSel = selectedEdge === edge.id;
                const mark = edge.label === 'then' ? 'am-then' : edge.label === 'else' ? 'am-else' : isSel ? 'am-sel' : 'am-default';
                const stroke = edge.label === 'then' ? '#16a34a' : edge.label === 'else' ? '#dc2626' : isSel ? '#3b82f6' : '#94a3b8';

                return (
                  <g key={edge.id}
                    onClick={e => { e.stopPropagation(); setSelectedEdge(isSel ? null : edge.id); }}>
                    {/* Wide invisible hit area */}
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14}
                      style={{ cursor: 'pointer', pointerEvents: 'all' }} />
                    {/* Visible arrow */}
                    <path d={d} fill="none" stroke={stroke}
                      strokeWidth={isSel ? 2.5 : 1.8}
                      markerEnd={`url(#${mark})`} />
                    {/* Branch label */}
                    {edge.label && (
                      <text x={mx} y={my - 7} textAnchor="middle" fontSize={9} fontWeight={700}
                        fill={stroke} style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {edge.label.toUpperCase()}
                      </text>
                    )}
                    {/* Delete button when selected */}
                    {isSel && (
                      <g style={{ pointerEvents: 'all', cursor: 'pointer' }}
                        onClick={e => { e.stopPropagation(); removeEdge(edge.id); }}>
                        <circle cx={mx} cy={my} r={9} fill="#dc2626" />
                        <text x={mx} y={my + 4} textAnchor="middle" fontSize={12}
                          fill="white" fontWeight={700} style={{ pointerEvents: 'none' }}>×</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* In-progress connection line */}
              {connLine && (
                <line x1={connLine.x1} y1={connLine.y1} x2={connLine.x2} y2={connLine.y2}
                  stroke="#3b82f6" strokeWidth={2} strokeDasharray="6,4"
                  markerEnd="url(#am-live)" style={{ pointerEvents: 'none' }} />
              )}
            </svg>

            {/* All step nodes (including START and END) */}
            {activeFlow.steps.map(step => (
              <StepNode
                key={step.id}
                step={step}
                selected={selectedId === step.id}
                stepStatus={stepStatuses[step.id] || {}}
                onSelect={() => setSelectedId(step.id)}
                onDelete={() => removeStep(step.id)}
                onMoveStep={moveStep}
                onConnectStart={handleConnectStart}
                onConnectTarget={handleConnectTarget}
                isTarget={!!connLine && connTarget === step.id && connTarget !== connectFromRef.current?.fromId}
              />
            ))}
          </div>
        </div>

        {/* ── Metrics table (performance mode) ── */}
        {activeFlow.steps.find(s => s.type === 'start')?.mode === 'performance' && (isRunning || Object.keys(metrics).length > 0) && (
          <div style={{
            backgroundColor: '#0f172a',
            borderTop: '1px solid #334155',
            padding: '12px 16px',
            margin: '0 12px 12px',
            borderRadius: 6,
          }}>
            <div style={{color: '#cbd5e1', fontSize: 12, fontWeight: 600, marginBottom: 8}}>
              📊 Performance Metrics {isRunning && <span style={{color: '#fbbf24'}}>● Live</span>}
            </div>
            <MetricsTable metrics={metrics} flowName={activeFlow.name || 'untitled'} />
          </div>
        )}

        {/* Step editor panel */}
        <div className="flow-editor-panel">
          {selectedStep?.type === 'start' ? (
            <div className="flow-start-editor">
              <div className="editor-header" style={{marginBottom: 16}}>
                <h3 style={{margin: 0}}>⚙️ Flow Start Config</h3>
              </div>
              <div className="editor-section">
                <div className="editor-sec-title">Execution Mode</div>
                <div style={{display: 'flex', gap: 8, marginBottom: 12}}>
                  <button 
                    className={`mode-btn ${selectedStep?.mode !== 'performance' ? 'active' : ''}`}
                    onClick={() => updateStep({...selectedStep, mode: 'functional'})}
                  >
                    🟢 Functional (1 user)
                  </button>
                  <button 
                    className={`mode-btn ${selectedStep?.mode === 'performance' ? 'active' : ''}`}
                    onClick={() => updateStep({...selectedStep, mode: 'performance'})}
                  >
                    ⚡ Performance (Load Test)
                  </button>
                </div>
              </div>

              {selectedStep?.mode === 'performance' && (
                <>
                  <div className="editor-section">
                    <label className="editor-sec-title">Number of Concurrent Users</label>
                    <div style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 6}}>
                      <input type="number" min="1" max="100" value={selectedStep?.numUsers || 1}
                        onChange={e => {
                          const val = Math.min(100, Math.max(1, parseInt(e.target.value) || 1));
                          updateStep({...selectedStep, numUsers: val});
                        }}
                        className="form-input" style={{flex: 1}} />
                      <span style={{fontSize: 11, color: '#94a3b8'}}>/ 100 max</span>
                    </div>
                    {(selectedStep?.numUsers || 1) > 100 && (
                      <div style={{fontSize: 11, color: '#dc2626', marginTop: 6}}>⚠️ Maximum 100 users allowed</div>
                    )}
                  </div>

                  <div className="editor-section">
                    <label className="editor-sec-title">Ramp-up Time (seconds)</label>
                    <input type="number" min="0" value={selectedStep?.rampUpSeconds || 0}
                      onChange={e => updateStep({...selectedStep, rampUpSeconds: parseInt(e.target.value) || 0})}
                      className="form-input" style={{marginTop: 6}} />
                    <div className="sec-hint">Time to spawn all users gradually (0 = instant)</div>
                  </div>

                  <div className="editor-section">
                    <div className="editor-sec-title">Execution Duration</div>
                    <div style={{display: 'flex', gap: 8, marginTop: 8, marginBottom: 12}}>
                      <button 
                        className={`mode-btn ${selectedStep?.durationMode !== 'transactions' ? 'active' : ''}`}
                        onClick={() => updateStep({...selectedStep, durationMode: 'duration'})}
                      >
                        By Time
                      </button>
                      <button 
                        className={`mode-btn ${selectedStep?.durationMode === 'transactions' ? 'active' : ''}`}
                        onClick={() => updateStep({...selectedStep, durationMode: 'transactions'})}
                      >
                        By Transactions
                      </button>
                    </div>

                    {selectedStep?.durationMode !== 'transactions' ? (
                      <>
                        <label className="editor-sec-title">Duration (seconds)</label>
                        <input type="number" min="1" value={selectedStep?.durationSeconds || 60}
                          onChange={e => updateStep({...selectedStep, durationSeconds: parseInt(e.target.value) || 60})}
                          className="form-input" style={{marginTop: 6}} />
                      </>
                    ) : (
                      <>
                        <label className="editor-sec-title">Transactions per User</label>
                        <input type="number" min="1" value={selectedStep?.transactionsCount || 1}
                          onChange={e => updateStep({...selectedStep, transactionsCount: parseInt(e.target.value) || 1})}
                          className="form-input" style={{marginTop: 6}} />
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : selectedStep?.type === 'end' ? (
            <div className="flow-end-editor">
              <div className="editor-header" style={{marginBottom: 16}}>
                <h3 style={{margin: 0}}>⏹ Flow End</h3>
              </div>
              <div className="step-editor-empty" style={{height: 'auto', justifyContent: 'flex-start', paddingTop: 20}}>
                <div style={{fontSize: 18, marginBottom: 10}}>✓</div>
                <div>Flow execution ends here</div>
                <div style={{fontSize: 11, marginTop: 10, opacity: 0.5}}>Connect from step(s) to this END step</div>
              </div>
            </div>
          ) : selectedStep ? (
            <FlowStepEditor step={selectedStep} onUpdate={updateStep} stepStatuses={stepStatuses} />
          ) : (
            <div className="step-editor-empty">
              <div style={{ fontSize: 24 }}>✏️</div>
              <div>Select a step to edit</div>
              <div style={{ fontSize: 11, marginTop: 6, opacity: 0.5 }}>Click any node on the canvas</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
