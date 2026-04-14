import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api';
import { useToast } from '../context/ToastContext';
import { useRequest } from '../context/RequestContext';
import { runFlow } from '../utils/flowRunner';
import FlowStepEditor from './FlowStepEditor';
import MetricsTable from './MetricsTable';

const NODE_W = 220;
const NODE_H = 68;
const FLOW_BUILDER_LAST_STATE_KEY = 'artemis.flowBuilder.lastState.v1';
const FLOW_DISCOVERY_PREFS_KEY = 'artemis.flowBuilder.discovery.v1';

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

function toEditableFlow(flow) {
  const steps = (flow?.steps || []).map((s, i) => ({
    ...s,
    x: s.x > 0 ? s.x : 80 + (i % 3) * (NODE_W + 60),
    y: s.y > 0 ? s.y : 80 + Math.floor(i / 3) * (NODE_H + 60),
  }));
  return { ...JSON.parse(JSON.stringify({ ...flow, steps })), edges: flow?.edges || [] };
}

function readLastFlowState() {
  try {
    const raw = window.localStorage.getItem(FLOW_BUILDER_LAST_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.flow || !Array.isArray(parsed.flow.steps)) return null;
    return parsed.flow;
  } catch {
    return null;
  }
}

function writeLastFlowState(flow) {
  try {
    const payload = {
      savedAt: Date.now(),
      flow: sanitizeForApi(flow),
    };
    window.localStorage.setItem(FLOW_BUILDER_LAST_STATE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures (private mode/quota)
  }
}

function readFlowDiscoveryPrefs() {
  const defaults = {
    query: '',
    sortMode: 'updated-desc',
    searchMode: 'name-meta',
  };
  try {
    const raw = window.localStorage.getItem(FLOW_DISCOVERY_PREFS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      query: typeof parsed?.query === 'string' ? parsed.query : defaults.query,
      sortMode: typeof parsed?.sortMode === 'string' ? parsed.sortMode : defaults.sortMode,
      searchMode: typeof parsed?.searchMode === 'string' ? parsed.searchMode : defaults.searchMode,
    };
  } catch {
    return defaults;
  }
}

function writeFlowDiscoveryPrefs(prefs) {
  try {
    window.localStorage.setItem(FLOW_DISCOVERY_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage write failures (private mode/quota)
  }
}

function fuzzySubsequenceMatch(query, target) {
  if (!query) return true;
  let qi = 0;
  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (query[qi] === target[i]) qi++;
  }
  return qi === query.length;
}

function renderHighlightedName(name, query) {
  const n = name || '';
  const q = (query || '').trim();
  if (!q) return n;
  const lo = n.toLowerCase();
  const idx = lo.indexOf(q.toLowerCase());
  if (idx === -1) return n;

  const before = n.slice(0, idx);
  const match = n.slice(idx, idx + q.length);
  const after = n.slice(idx + q.length);
  return (
    <>
      {before}
      <mark className="flow-list-hl">{match}</mark>
      {after}
    </>
  );
}

function collectStepSearchText(steps = []) {
  const parts = [];
  const walk = (items) => {
    (items || []).forEach((s) => {
      if (s?.name) parts.push(String(s.name));
      if (s?.type) parts.push(String(s.type));
      if (s?.request?.method) parts.push(String(s.request.method));
      if (s?.request?.url) parts.push(String(s.request.url));
      if (s?.thenSteps?.length) walk(s.thenSteps);
      if (s?.elseSteps?.length) walk(s.elseSteps);
      if (s?.loopSteps?.length) walk(s.loopSteps);
    });
  };
  walk(steps);
  return parts.join(' ').toLowerCase();
}

function sanitizeForApi(value) {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value
      .map(v => sanitizeForApi(v))
      .filter(v => v !== undefined);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      const sv = sanitizeForApi(v);
      if (sv !== undefined) out[k] = sv;
    });
    return out;
  }
  return value;
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
function StepNode({ step, selected, stepStatus = {}, onSelect, onDelete, onMoveStep, onConnectStart, onConnectTarget, onDoubleClickNode, onContextMenuNode, isTarget, branchLabels = [] }) {
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
        onDoubleClick={e => { e.stopPropagation(); onDoubleClickNode?.(step.id); }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenuNode?.(e, step); }}
        onClick={e => { e.stopPropagation(); onSelect(); }}
      >
        <div className="terminal-node-body">
          <div className="terminal-node-icon">{meta.icon}</div>
          <div className="terminal-node-name">{step.name}</div>
          <div className="terminal-node-pill">{step.type === 'start' ? 'ENTRY' : 'EXIT'}</div>
        </div>

        {branchLabels.length > 0 && (
          <div className="fn-branch-badges">
            {branchLabels.map(lbl => (
              <span
                key={`${step.id}-${lbl}`}
                className={`fn-branch-pill ${lbl === 'then' ? 'fn-branch-then' : 'fn-branch-else'}`}
              >
                {lbl.toUpperCase()}
              </span>
            ))}
          </div>
        )}

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
      onDoubleClick={e => { e.stopPropagation(); onDoubleClickNode?.(step.id); }}
      onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenuNode?.(e, step); }}
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

      {branchLabels.length > 0 && (
        <div className="fn-branch-badges">
          {branchLabels.map(lbl => (
            <span
              key={`${step.id}-${lbl}`}
              className={`fn-branch-pill ${lbl === 'then' ? 'fn-branch-then' : 'fn-branch-else'}`}
            >
              {lbl.toUpperCase()}
            </span>
          ))}
        </div>
      )}

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
  const { request } = useRequest();
  const canvasWrapRef = useRef(null);

  const [flows,        setFlows]        = useState([]);
  const [activeFlow,   setActiveFlow]   = useState(mkFlow);
  const [selectedId,   setSelectedId]   = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [stepStatuses, setStepStatuses] = useState({});
  const [runVars,      setRunVars]      = useState({});
  const [isRunning,    setIsRunning]    = useState(false);
  const [metrics,      setMetrics]      = useState({});  // { stepName: { count, minMs, maxMs, sumMs, errors, bytes, ... } }
  const [flowViewState, setFlowViewState] = useState({}); // { [flowId]: { minimized: bool, targetId: string|null } }
  const [nodeMenu, setNodeMenu] = useState(null); // { x, y, stepId }
  const [canvasMenu, setCanvasMenu] = useState(null); // { x, y, cx, cy }
  const abortRef = useRef(null);

  const [showVars,     setShowVars]     = useState(false);
  const [showAddMenu,  setShowAddMenu]  = useState(false);
  const prefs = useMemo(() => readFlowDiscoveryPrefs(), []);
  const [flowQuery, setFlowQuery] = useState(prefs.query);
  const [debouncedFlowQuery, setDebouncedFlowQuery] = useState(prefs.query.trim().toLowerCase());
  const [flowSortMode, setFlowSortMode] = useState(prefs.sortMode);
  const [flowSearchMode, setFlowSearchMode] = useState(prefs.searchMode);
  const [resultCursor, setResultCursor] = useState(0);
  const flowSearchRef = useRef(null);

  // Connection drawing
  const connectFromRef = useRef(null);   // { fromId, fromLabel }
  const connectTargRef = useRef(null);   // step id currently hovered during connect
  const [connLine,     setConnLine]     = useState(null);   // { x1,y1,x2,y2 } for SVG
  const [connTarget,   setConnTarget]   = useState(null);   // highlighted drop target

  useEffect(() => { loadFlows({ restoreActive: true }); }, []);

  useEffect(() => {
    writeLastFlowState(activeFlow);
  }, [activeFlow]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedFlowQuery(flowQuery.trim().toLowerCase());
    }, 120);
    return () => window.clearTimeout(t);
  }, [flowQuery]);

  useEffect(() => {
    writeFlowDiscoveryPrefs({
      query: flowQuery,
      sortMode: flowSortMode,
      searchMode: flowSearchMode,
    });
  }, [flowQuery, flowSortMode, flowSearchMode]);

  useEffect(() => {
    const onWindowKeyDown = (e) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const tag = (e.target?.tagName || '').toLowerCase();
        const editable = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
        if (editable) return;
        e.preventDefault();
        flowSearchRef.current?.focus();
        flowSearchRef.current?.select();
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, []);

  async function loadFlows(options = {}) {
    const { restoreActive = false } = options;
    try {
      const allFlows = await api.flows.getAll() || [];
      setFlows(allFlows);

      if (!restoreActive) return;

      const lastFlow = readLastFlowState();
      if (lastFlow?.id) {
        const stillExists = allFlows.some(f => f.id === lastFlow.id);
        if (stillExists) {
          setActiveFlow(toEditableFlow(lastFlow));
          setSelectedId(null);
          setSelectedEdge(null);
          setStepStatuses({});
          setRunVars({});
          return;
        }
      }

      if (lastFlow && !lastFlow.id) {
        setActiveFlow(toEditableFlow(lastFlow));
        setSelectedId(null);
        setSelectedEdge(null);
        setStepStatuses({});
        setRunVars({});
      }
    }
    catch (e) { showToast(`Load flows: ${e.message}`, 'error'); }
  }

  function selectFlow(f) {
    setActiveFlow(toEditableFlow(f));
    setSelectedId(null);
    setSelectedEdge(null);
    setStepStatuses({});
    setRunVars({});
  }

  const flowsForDiscovery = useMemo(() => {
    const base = [...(flows || [])];
    if (!activeFlow) return base;

    if (activeFlow.id) {
      const idx = base.findIndex(f => f.id === activeFlow.id);
      if (idx >= 0) {
        base[idx] = { ...base[idx], ...activeFlow };
      } else {
        base.unshift(activeFlow);
      }
      return base;
    }

    // Include unsaved draft flow in discovery so search works before first save.
    const hasUsableDraft = (activeFlow.name && activeFlow.name.trim()) || (activeFlow.steps || []).length > 1;
    if (hasUsableDraft) {
      base.unshift({ ...activeFlow, id: '__draft_active__' });
    }
    return base;
  }, [flows, activeFlow]);

  const discoveredFlows = useMemo(() => {
    const q = debouncedFlowQuery;
    const enriched = (flowsForDiscovery || []).map(f => {
      const name = (f.name || '').toLowerCase();
      const stepCount = (f.steps || []).length;
      const stepText = collectStepSearchText(f.steps || []);
      const meta = `${name} ${stepCount} ${stepText}`;
      const includesName = q ? name.includes(q) : true;
      const includesMeta = q ? meta.includes(q) : true;
      const fuzzyName = q ? fuzzySubsequenceMatch(q, name) : true;

      let score = 0;
      if (!q) score = 10;
      else if (includesName) score = name.startsWith(q) ? 100 : 80;
      else if (includesMeta) score = 60;
      else if (fuzzyName) score = 35;

      const matched = !q
        ? true
        : includesName || fuzzyName || (flowSearchMode === 'name-meta' && includesMeta) || includesMeta;

      return {
        flow: f,
        score,
        matched,
        stepCount,
        updatedAtTs: f.updatedAt ? new Date(f.updatedAt).getTime() : 0,
      };
    }).filter(x => x.matched);

    enriched.sort((a, b) => {
      if (flowSortMode === 'name-asc') return (a.flow.name || '').localeCompare(b.flow.name || '');
      if (flowSortMode === 'name-desc') return (b.flow.name || '').localeCompare(a.flow.name || '');
      if (flowSortMode === 'steps-desc') return b.stepCount - a.stepCount || b.score - a.score;
      if (flowSortMode === 'updated-asc') return a.updatedAtTs - b.updatedAtTs || b.score - a.score;
      return b.updatedAtTs - a.updatedAtTs || b.score - a.score;
    });

    if (q) {
      enriched.sort((a, b) => b.score - a.score || 0);
    }

    return enriched.map(x => x.flow);
  }, [flowsForDiscovery, debouncedFlowQuery, flowSortMode, flowSearchMode]);

  const visibleFlows = useMemo(() => {
    if (!activeFlow?.id) return discoveredFlows;
    if (!debouncedFlowQuery) return discoveredFlows;
    if (discoveredFlows.some(f => f.id === activeFlow.id)) return discoveredFlows;
    const activeFromAll = (flowsForDiscovery || []).find(f => f.id === activeFlow.id);
    if (!activeFromAll) return discoveredFlows;
    return [{ ...activeFromAll, _pinnedActive: true }, ...discoveredFlows];
  }, [discoveredFlows, activeFlow.id, flowsForDiscovery, debouncedFlowQuery]);

  useEffect(() => {
    setResultCursor(prev => {
      if (!visibleFlows.length) return 0;
      return Math.max(0, Math.min(prev, visibleFlows.length - 1));
    });
  }, [visibleFlows]);

  function handleFlowSearchKeyDown(e) {
    if (!visibleFlows.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setResultCursor(c => Math.min(c + 1, visibleFlows.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResultCursor(c => Math.max(c - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = visibleFlows[resultCursor] || visibleFlows[0];
      if (target) selectFlow(target);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setFlowQuery('');
      setResultCursor(0);
    }
  }

  async function saveFlow() {
    if (!activeFlow.name.trim()) { showToast('Enter a flow name', 'warning'); return; }
    if (!activeFlow.id && (flows?.length || 0) >= 200) {
      showToast('Flow limit reached: max 200 flows per project', 'warning');
      return;
    }
    try {
      const payload = sanitizeForApi(activeFlow);
      const saved = activeFlow.id
        ? await api.flows.update(payload)
        : await api.flows.create(payload);
      setActiveFlow(JSON.parse(JSON.stringify(saved)));
      
      // Export the flow to a JSON file
      try {
        await api.flows.export(saved.id);
      } catch (exportErr) {
        console.warn('Flow export to file failed:', exportErr.message);
        // Don't fail the save if export fails, just log a warning
      }
      
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

  function addStepAt(type, x, y) {
    const step = mkStep(type, Math.max(0, x), Math.max(0, y));
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
    if (nodeMenu?.stepId === id) setNodeMenu(null);
  }

  function openNodeContextMenu(e, step) {
    setCanvasMenu(null);
    setNodeMenu({ x: e.clientX, y: e.clientY, stepId: step.id });
  }

  function closeNodeContextMenu() {
    setNodeMenu(null);
  }

  function openCanvasContextMenu(e) {
    const p = getCanvasXY(e);
    setNodeMenu(null);
    setCanvasMenu({ x: e.clientX, y: e.clientY, cx: p.x, cy: p.y });
  }

  function closeCanvasContextMenu() {
    setCanvasMenu(null);
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

  function resetStats() {
    setMetrics({});
    setStepStatuses(collectIds(activeFlow.steps));
    setRunVars({ ...activeFlow.variables });
    showToast('Test statistics reset', 'info');
  }

  const flowViewKey = activeFlow.id || '__draft__';
  const currentView = flowViewState[flowViewKey] || { minimized: false, targetId: null };
  const isFlowMinimized = !!currentView.minimized;
  const minimizedTargetId = currentView.targetId || null;

  function setCurrentFlowView(partial) {
    setFlowViewState(prev => ({
      ...prev,
      [flowViewKey]: { ...(prev[flowViewKey] || { minimized: false, targetId: null }), ...partial },
    }));
  }

  function toggleFlowMinimize() {
    if (isFlowMinimized) {
      setCurrentFlowView({ minimized: false, targetId: null });
      return;
    }
    setCurrentFlowView({ minimized: true });
  }

  function minimizeToNode(stepId) {
    // Double-click same target toggles back to expanded view
    if (isFlowMinimized && minimizedTargetId === stepId) {
      setCurrentFlowView({ minimized: false, targetId: null });
      return;
    }
    setCurrentFlowView({ minimized: true, targetId: stepId });
  }

  function setGlobalFlowMinimize(minimized) {
    const keys = new Set((flows || []).map(f => f.id));
    keys.add(flowViewKey);
    setFlowViewState(prev => {
      const next = { ...prev };
      keys.forEach(k => {
        const cur = prev[k] || { minimized: false, targetId: null };
        next[k] = minimized
          ? { ...cur, minimized: true }
          : { minimized: false, targetId: null };
      });
      return next;
    });
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

    const sleepWithAbort = (ms) => new Promise((resolve, reject) => {
      if (ms <= 0) return resolve();
      const t = setTimeout(resolve, ms);
      const onAbort = () => {
        clearTimeout(t);
        reject(new Error('Aborted'));
      };
      ctrl.signal.addEventListener('abort', onAbort, { once: true });
    });

    const onMetrics = (stepName, metric) => {
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
    };

    try {
      const startStep = (activeFlow.steps || []).find(s => s.type === 'start');
      const isPerformance = startStep?.mode === 'performance';

      // Collect global SSL/request settings to inject into every flow HTTP step
      const reqSettings = {
        verifySSL: request.verifySSL,
        enableSSLKeyLog: request.enableSSLKeyLog,
        followRedirects: request.followRedirects,
        followOriginalMethod: request.followOriginalMethod,
        followAuthHeader: request.followAuthHeader,
        removeRefererOnRedirect: request.removeRefererOnRedirect,
        strictHTTPParser: request.strictHTTPParser,
        encodeURLAutomatically: request.encodeURLAutomatically,
        disableCookieJar: request.disableCookieJar,
        useServerCipherSuite: request.useServerCipherSuite,
        maxRedirects: request.maxRedirects,
        disabledTLSProtocols: request.disabledTLSProtocols,
        cipherSuites: request.cipherSuites,
        timeout: request.timeout,
        httpVersion: request.httpVersion,
        maxResponseSize: request.maxResponseSize,
        logLevel: request.logLevel,
      };

      const onUpdatePrimary = (stepId, update) => {
        if (typeof update === 'function') {
          setStepStatuses(prev => ({ ...prev, [stepId]: update(prev[stepId]) }));
        } else {
          setStepStatuses(prev => ({ ...prev, [stepId]: update }));
          if (update.variables) setRunVars(update.variables);
        }
      };

      if (!isPerformance) {
        await runFlow(activeFlow, onUpdatePrimary, onMetrics, ctrl.signal, reqSettings);
        showToast('Flow completed ✓', 'success');
        return;
      }

      // Performance mode: run the full flow concurrently with configured virtual users
      const numUsers = Math.min(100, Math.max(1, parseInt(startStep?.numUsers || 1)));
      const rampUpSeconds = Math.max(0, parseInt(startStep?.rampUpSeconds || 0));
      const durationMode = startStep?.durationMode === 'transactions' ? 'transactions' : 'duration';
      const durationSeconds = Math.max(1, parseInt(startStep?.durationSeconds || 60));
      const transactionsCount = Math.max(1, parseInt(startStep?.transactionsCount || 1));

      const rampMsTotal = rampUpSeconds * 1000;
      const delayPerUserMs = numUsers > 1 ? Math.floor(rampMsTotal / (numUsers - 1)) : 0;
      const testEndTs = Date.now() + durationSeconds * 1000;

      const runUser = async (userIndex) => {
        if (delayPerUserMs > 0 && userIndex > 0) {
          await sleepWithAbort(delayPerUserMs * userIndex);
        }

        const onUpdate = userIndex === 0 ? onUpdatePrimary : () => {};

        if (durationMode === 'transactions') {
          for (let i = 0; i < transactionsCount; i++) {
            if (ctrl.signal.aborted) throw new Error('Aborted');
            try {
              await runFlow(activeFlow, onUpdate, onMetrics, ctrl.signal, reqSettings);
            } catch (err) {
              if (err.message === 'Aborted') throw err;
              // In load mode continue remaining iterations even if a single flow run fails
            }
          }
          return;
        }

        while (!ctrl.signal.aborted && Date.now() < testEndTs) {
          try {
            await runFlow(activeFlow, onUpdate, onMetrics, ctrl.signal, reqSettings);
          } catch (err) {
            if (err.message === 'Aborted') throw err;
            // Keep generating load during duration window despite per-run failures
          }
        }
      };

      await Promise.all(Array.from({ length: numUsers }, (_, i) => runUser(i)));
      showToast(`Performance run completed ✓ (${numUsers} users)`, 'success');
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
  const visibleStepIds = useMemo(() => {
    const allSteps = activeFlow.steps || [];
    if (!isFlowMinimized) return new Set(allSteps.map(s => s.id));

    const start = allSteps.find(s => s.type === 'start');
    if (!start) return new Set(allSteps.map(s => s.id));

    const nextMap = new Map();
    (activeFlow.edges || []).forEach(e => {
      if (!nextMap.has(e.from)) nextMap.set(e.from, []);
      nextMap.get(e.from).push(e.to);
    });

    const reachableFromStart = new Set([start.id]);
    const reachQ = [start.id];
    while (reachQ.length > 0) {
      const cur = reachQ.shift();
      const nexts = nextMap.get(cur) || [];
      for (const n of nexts) {
        if (reachableFromStart.has(n)) continue;
        reachableFromStart.add(n);
        reachQ.push(n);
      }
    }

    const startBranchRoots = new Set((nextMap.get(start.id) || []).filter(Boolean));
    const stepById = new Map(allSteps.map(s => [s.id, s]));

    // If a target node is selected for compact mode, show path START -> target.
    let ids = null;
    if (minimizedTargetId && minimizedTargetId !== start.id) {
      const parent = new Map();
      const q = [start.id];
      parent.set(start.id, null);
      while (q.length > 0) {
        const cur = q.shift();
        const nexts = nextMap.get(cur) || [];
        for (const n of nexts) {
          if (parent.has(n)) continue;
          parent.set(n, cur);
          q.push(n);
        }
      }

      if (parent.has(minimizedTargetId)) {
        ids = new Set();
        let cur = minimizedTargetId;
        while (cur) {
          ids.add(cur);
          cur = parent.get(cur);
        }
      } else {
        // If target is disconnected from START, show START + target.
        ids = new Set([start.id, minimizedTargetId]);
      }
    }

    if (!ids) {
      ids = new Set([start.id, ...startBranchRoots]);

      // If START has no outgoing edge, keep one top candidate for orientation.
      if (ids.size === 1) {
        const candidates = allSteps.filter(s => s.id !== start.id && s.type !== 'end');
        if (candidates.length > 0) {
          candidates.sort((a, b) => (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0));
          ids.add(candidates[0].id);
        }
      }
    }

    // Keep all direct branches from START visible in compact mode for quick branch switching.
    startBranchRoots.forEach(id => ids.add(id));

    // Keep IF/ELSE sibling branches visible together for any visible condition node.
    const conditionQueue = [...ids].filter(id => stepById.get(id)?.type === 'condition');
    const seenConditions = new Set(conditionQueue);
    while (conditionQueue.length > 0) {
      const condId = conditionQueue.shift();
      const nexts = nextMap.get(condId) || [];
      nexts.forEach(n => {
        if (!ids.has(n)) ids.add(n);
        if (stepById.get(n)?.type === 'condition' && !seenConditions.has(n)) {
          seenConditions.add(n);
          conditionQueue.push(n);
        }
      });
    }

    // Keep orphan/disconnected steps visible as separate mini-flows in compact mode.
    allSteps.forEach(s => {
      if (!reachableFromStart.has(s.id)) ids.add(s.id);
    });

    return ids;
  }, [activeFlow.steps, activeFlow.edges, isFlowMinimized, minimizedTargetId]);

  const stepFilterQuery = debouncedFlowQuery;
  const matchedStepIds = useMemo(() => {
    if (!stepFilterQuery) return null;
    const ids = new Set();
    (activeFlow.steps || []).forEach((s) => {
      const haystack = [
        s.name || '',
        s.type || '',
        s.request?.method || '',
        s.request?.url || '',
      ].join(' ').toLowerCase();
      if (haystack.includes(stepFilterQuery)) ids.add(s.id);
    });
    return ids;
  }, [activeFlow.steps, stepFilterQuery]);

  const effectiveVisibleStepIds = useMemo(() => {
    if (!matchedStepIds) return visibleStepIds;
    const ids = new Set();
    visibleStepIds.forEach((id) => {
      if (matchedStepIds.has(id)) ids.add(id);
    });
    return ids;
  }, [visibleStepIds, matchedStepIds]);

  const renderedStepsFiltered = (activeFlow.steps || []).filter(s => effectiveVisibleStepIds.has(s.id));
  const renderedEdges = (edges || []).filter(e => effectiveVisibleStepIds.has(e.from) && effectiveVisibleStepIds.has(e.to));
  const branchLabelsByTarget = useMemo(() => {
    const stepById = new Map((activeFlow.steps || []).map(s => [s.id, s]));
    const byTarget = new Map();

    renderedEdges.forEach(edge => {
      const from = stepById.get(edge.from);
      const label = (edge.label || '').toLowerCase();
      if (from?.type !== 'condition') return;
      if (label !== 'then' && label !== 'else') return;

      if (!byTarget.has(edge.to)) byTarget.set(edge.to, new Set());
      byTarget.get(edge.to).add(label);
    });

    const out = {};
    byTarget.forEach((labels, stepId) => {
      out[stepId] = Array.from(labels).sort((a, b) => (a === 'then' ? -1 : b === 'then' ? 1 : a.localeCompare(b)));
    });
    return out;
  }, [activeFlow.steps, renderedEdges]);
  const selectedStep = selectedId ? findStep(selectedId, activeFlow.steps) : null;
  const contextStep = nodeMenu?.stepId ? findStep(nodeMenu.stepId, activeFlow.steps) : null;
  const startStep = (activeFlow.steps || []).find(s => s.type === 'start') || null;
  const startConfigStep = selectedStep?.type === 'start' ? selectedStep : startStep;

  return (
    <div className="flow-builder" onClick={() => { setShowAddMenu(false); setSelectedEdge(null); closeNodeContextMenu(); closeCanvasContextMenu(); }}>

      {/* ── Toolbar ── */}
      <div className="flow-toolbar">
        <div className="flow-name-wrap">
          <span className="flow-label">FLOW</span>
          <input className="flow-name-input" value={activeFlow.name} placeholder="Flow Name"
            onChange={e => setActiveFlow(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="flow-toolbar-search" onClick={e => e.stopPropagation()}>
          <input
            ref={flowSearchRef}
            className="flow-toolbar-search-input"
            placeholder="Search flows... ( / )"
            value={flowQuery}
            onChange={e => { setFlowQuery(e.target.value); setResultCursor(0); }}
            onKeyDown={handleFlowSearchKeyDown}
          />
          <select className="flow-toolbar-search-select" value={flowSearchMode} onChange={e => setFlowSearchMode(e.target.value)}>
            <option value="name">Name only</option>
            <option value="name-meta">Name + metadata</option>
          </select>
          <select className="flow-toolbar-search-select" value={flowSortMode} onChange={e => setFlowSortMode(e.target.value)}>
            <option value="updated-desc">Updated ↓</option>
            <option value="updated-asc">Updated ↑</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="steps-desc">Most steps</option>
          </select>
          <div className="flow-toolbar-search-summary">
            {visibleFlows.length} shown{debouncedFlowQuery ? ` • ${flows.length} total` : ''}
          </div>
        </div>
        <div className="flow-toolbar-btns">
          <button
            className="flow-btn"
            onClick={() => {
              flowSearchRef.current?.focus();
              flowSearchRef.current?.select();
            }}
            title="Focus flow search"
          >
            🔎 Search
          </button>
          <button className={`flow-btn run-btn${isRunning ? ' stop' : ''}`} onClick={handleRun}>
            {isRunning ? '■ Stop' : '▶ Run'}
          </button>
          <button className="flow-btn" onClick={saveFlow}>💾 Save</button>
          <button className="flow-btn" onClick={resetStats} disabled={Object.keys(metrics).length === 0}>↺ Reset Stats</button>
          <button className="flow-btn" onClick={toggleFlowMinimize}>
            {isFlowMinimized ? '⤢ Expand Flow' : '⤡ Minimize Flow'}
          </button>
          <button className="flow-btn" onClick={() => setGlobalFlowMinimize(true)}>▣ Global Minimize</button>
          <button className="flow-btn" onClick={() => setGlobalFlowMinimize(false)}>▢ Global Maximize</button>
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
          {flows.length > 0 && visibleFlows.length === 0 && (
            <div className="flow-list-empty">No matching flows. Try a shorter search.</div>
          )}
          {visibleFlows.map((f, idx) => (
            <div key={f.id}
              className={`flow-list-item${activeFlow.id === f.id ? ' active' : ''}${resultCursor === idx ? ' hover' : ''}${f._pinnedActive ? ' pinned' : ''}`}
              onClick={() => selectFlow(f)}>
              <div className="flow-list-name">{renderHighlightedName(f.name, debouncedFlowQuery)}</div>
              <div className="flow-list-meta">
                {(f.steps || []).length} step{(f.steps || []).length !== 1 ? 's' : ''}
                {f._pinnedActive ? ' • active (pinned)' : ''}
              </div>
            </div>
          ))}
        </div>

        {/* ── Node canvas ── */}
        <div className="flow-canvas-wrap" ref={canvasWrapRef}
          onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openCanvasContextMenu(e); }}
          onClick={() => setSelectedId(null)}>
          {isFlowMinimized && (
            <div style={{
              position: 'absolute',
              top: 10,
              left: 12,
              zIndex: 60,
              fontSize: 11,
              color: '#94a3b8',
              background: 'rgba(15,23,42,0.88)',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '4px 8px'
            }}>
              Compact view: START/IF roots + sibling branches + orphan flows (double-click any node)
            </div>
          )}
          {activeFlow.steps.length === 0 && (
            <div className="flow-canvas-empty">
              <div style={{ fontSize: 36 }}>⚡</div>
              <div>Click <strong>+ Step ▾</strong> in the toolbar to add your first step</div>
              <div style={{ fontSize: 11, marginTop: 8, opacity: 0.5 }}>
                Drag nodes to position · Pull the <span style={{ color: '#3b82f6' }}>●</span> handle on the right edge to connect steps
              </div>
            </div>
          )}
          {stepFilterQuery && activeFlow.steps.length > 0 && renderedStepsFiltered.length === 0 && (
            <div className="flow-canvas-empty" style={{ zIndex: 5 }}>
              <div style={{ fontSize: 26 }}>🔎</div>
              <div>No matching steps in this flow</div>
              <div style={{ fontSize: 11, marginTop: 6, opacity: 0.65 }}>Try another keyword or clear search</div>
            </div>
          )}

          <div className="flow-canvas-area" style={{ width: canvasW, height: canvasH }}>
            {/* SVG edge layer */}
            <svg className="flow-edges-svg" width={canvasW} height={canvasH}>
              <ArrowDefs />

              {/* Existing edges */}
              {renderedEdges.map(edge => {
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
                      <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                        {isFlowMinimized && (edge.label === 'then' || edge.label === 'else') && (
                          <rect
                            x={mx - 24}
                            y={my - 17}
                            width={48}
                            height={14}
                            rx={7}
                            fill={edge.label === 'then' ? 'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.18)'}
                            stroke={stroke}
                            strokeWidth={1}
                          />
                        )}
                        <text
                          x={mx}
                          y={my - 7}
                          textAnchor="middle"
                          className={[
                            'flow-edge-label',
                            edge.label === 'then' ? 'flow-edge-label-then' : '',
                            edge.label === 'else' ? 'flow-edge-label-else' : '',
                            isFlowMinimized && (edge.label === 'then' || edge.label === 'else') ? 'flow-edge-label-compact' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          {edge.label.toUpperCase()}
                        </text>
                      </g>
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
            {renderedStepsFiltered.map(step => (
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
                onDoubleClickNode={minimizeToNode}
                onContextMenuNode={openNodeContextMenu}
                isTarget={!!connLine && connTarget === step.id && connTarget !== connectFromRef.current?.fromId}
                branchLabels={isFlowMinimized ? (branchLabelsByTarget[step.id] || []) : []}
              />
            ))}

            {canvasMenu && (
              <div
                style={{
                  position: 'fixed',
                  left: canvasMenu.x,
                  top: canvasMenu.y,
                  zIndex: 520,
                  minWidth: 220,
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                  color: '#cbd5e1',
                  padding: 8,
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Add Step Here</div>
                {STEP_TYPES.map(t => (
                  <button
                    key={`ctx-${t.type}`}
                    className="flow-btn"
                    style={{ width: '100%', textAlign: 'left', marginBottom: 6 }}
                    onClick={() => {
                      addStepAt(t.type, canvasMenu.cx, canvasMenu.cy);
                      closeCanvasContextMenu();
                    }}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            )}

            {nodeMenu && contextStep && (
              <div
                style={{
                  position: 'fixed',
                  left: nodeMenu.x,
                  top: nodeMenu.y,
                  zIndex: 500,
                  minWidth: 220,
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                  color: '#cbd5e1',
                  padding: 8,
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Step Details</div>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{contextStep.name || contextStep.type}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>Type: {contextStep.type}</div>
                <button
                  className="flow-btn"
                  style={{ width: '100%', textAlign: 'left', marginBottom: 6 }}
                  onClick={() => {
                    setSelectedId(contextStep.id);
                    closeNodeContextMenu();
                  }}
                >
                  👁 Open Details
                </button>
                <button
                  className="flow-btn danger-btn"
                  style={{ width: '100%', textAlign: 'left' }}
                  disabled={contextStep.type === 'start'}
                  onClick={() => {
                    removeStep(contextStep.id);
                    closeNodeContextMenu();
                  }}
                >
                  🗑 Delete Step
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Step editor panel */}
        <div className="flow-editor-panel">
          {(selectedStep?.type === 'start' || !selectedStep) && startConfigStep ? (
            <div className="flow-start-editor">
              <div className="editor-header" style={{marginBottom: 16}}>
                <h3 style={{margin: 0}}>⚙️ Flow Start Config</h3>
              </div>
              <div className="editor-section">
                <div className="editor-sec-title">Execution Mode</div>
                <div style={{display: 'flex', gap: 8, marginBottom: 12}}>
                  <button 
                    className={`mode-btn ${startConfigStep?.mode !== 'performance' ? 'active' : ''}`}
                    onClick={() => updateStep({...startConfigStep, mode: 'functional'})}
                  >
                    🟢 Functional (1 user)
                  </button>
                  <button 
                    className={`mode-btn ${startConfigStep?.mode === 'performance' ? 'active' : ''}`}
                    onClick={() => updateStep({...startConfigStep, mode: 'performance'})}
                  >
                    ⚡ Performance (Load Test)
                  </button>
                </div>
              </div>

              {startConfigStep?.mode === 'performance' && (
                <>
                  <div className="editor-section">
                    <label className="editor-sec-title">Number of Concurrent Users</label>
                    <div style={{display: 'flex', gap: 8, alignItems: 'center', marginTop: 6}}>
                      <input type="number" min="1" max="100" value={startConfigStep?.numUsers || 1}
                        onChange={e => {
                          const val = Math.min(100, Math.max(1, parseInt(e.target.value) || 1));
                          updateStep({...startConfigStep, numUsers: val});
                        }}
                        className="form-input" style={{flex: 1}} />
                      <span style={{fontSize: 11, color: '#94a3b8'}}>/ 100 max</span>
                    </div>
                    {(startConfigStep?.numUsers || 1) > 100 && (
                      <div style={{fontSize: 11, color: '#dc2626', marginTop: 6}}>⚠️ Maximum 100 users allowed</div>
                    )}
                  </div>

                  <div className="editor-section">
                    <label className="editor-sec-title">Ramp-up Time (seconds)</label>
                    <input type="number" min="0" value={startConfigStep?.rampUpSeconds || 0}
                      onChange={e => updateStep({...startConfigStep, rampUpSeconds: parseInt(e.target.value) || 0})}
                      className="form-input" style={{marginTop: 6}} />
                    <div className="sec-hint">Time to spawn all users gradually (0 = instant)</div>
                  </div>

                  <div className="editor-section">
                    <div className="editor-sec-title">Execution Duration</div>
                    <div style={{display: 'flex', gap: 8, marginTop: 8, marginBottom: 12}}>
                      <button 
                        className={`mode-btn ${startConfigStep?.durationMode !== 'transactions' ? 'active' : ''}`}
                        onClick={() => updateStep({...startConfigStep, durationMode: 'duration'})}
                      >
                        By Time
                      </button>
                      <button 
                        className={`mode-btn ${startConfigStep?.durationMode === 'transactions' ? 'active' : ''}`}
                        onClick={() => updateStep({...startConfigStep, durationMode: 'transactions'})}
                      >
                        By Transactions
                      </button>
                    </div>

                    {startConfigStep?.durationMode !== 'transactions' ? (
                      <>
                        <label className="editor-sec-title">Duration (seconds)</label>
                        <input type="number" min="1" value={startConfigStep?.durationSeconds || 60}
                          onChange={e => updateStep({...startConfigStep, durationSeconds: parseInt(e.target.value) || 60})}
                          className="form-input" style={{marginTop: 6}} />
                      </>
                    ) : (
                      <>
                        <label className="editor-sec-title">Transactions per User</label>
                        <input type="number" min="1" value={startConfigStep?.transactionsCount || 1}
                          onChange={e => updateStep({...startConfigStep, transactionsCount: parseInt(e.target.value) || 1})}
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

      {/* ── Metrics table (performance mode) ── */}
      {activeFlow.steps.find(s => s.type === 'start')?.mode === 'performance' && (isRunning || Object.keys(metrics).length > 0) && (
        <div style={{
          backgroundColor: '#0f172a',
          borderTop: '1px solid #334155',
          padding: '12px 16px',
          margin: '12px 12px 12px',
          borderRadius: 6,
        }}>
          <div style={{color: '#cbd5e1', fontSize: 12, fontWeight: 600, marginBottom: 8}}>
            📊 Performance Metrics {isRunning && <span style={{color: '#fbbf24'}}>● Live</span>}
          </div>
          <MetricsTable metrics={metrics} flowName={activeFlow.name || 'untitled'} />
        </div>
      )}
    </div>
  );
}
