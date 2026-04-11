import React from 'react';
import { exportMetricsAsHTML, exportMetricsAsCSV } from '../utils/metricsExport';

export default function MetricsTable({ metrics, flowName = 'untitled' }) {
  if (!metrics || Object.keys(metrics).length === 0) {
    return <div style={{ padding: 16, color: '#94a3b8', textAlign: 'center' }}>No requests completed</div>;
  }

  // Calculate percentile from samples
  function getPercentile(samples, p) {
    if (!samples || samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round(sorted[Math.max(0, idx)]);
  }

  // Calculate standard deviation
  function getStdDev(metric) {
    if (metric.count <= 1) return 0;
    const variance = (metric.sumSqMs - (metric.sumMs ** 2) / metric.count) / (metric.count - 1);
    return Math.round(Math.sqrt(Math.max(0, variance)));
  }

  // Format bytes to KB
  function formatBytes(bytes) {
    return (bytes / 1024).toFixed(2);
  }

  const rows = Object.entries(metrics).map(([name, m]) => ({
    name,
    count: m.count,
    minMs: m.minMs === Infinity ? 0 : m.minMs,
    avgMs: m.avgMs || 0,
    maxMs: m.maxMs,
    p90Ms: getPercentile(m.samples, 90),
    stdDev: getStdDev(m),
    errorPct: ((m.errors / m.count) * 100).toFixed(1),
    throughput: (m.count / (m.sumMs / 1000)).toFixed(2),
    recvKBps: m.totalBytesRecv ? (m.totalBytesRecv / (m.sumMs / 1000) / 1024).toFixed(2) : '0.00',
    sentKBps: m.totalBytesSent ? (m.totalBytesSent / (m.sumMs / 1000) / 1024).toFixed(2) : '0.00',
    avgBytes: Math.round((m.totalBytesRecv + m.totalBytesSent) / m.count),
  }));

  return (
    <div>
      <div style={{display: 'flex', gap: 8, marginBottom: 12}}>
        <button
          onClick={() => exportMetricsAsHTML(metrics, flowName)}
          style={{
            padding: '6px 12px',
            fontSize: 11,
            backgroundColor: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #475569',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.target.style.backgroundColor = '#334155'; }}
          onMouseLeave={e => { e.target.style.backgroundColor = '#1e293b'; }}
        >
          📊 Export HTML
        </button>
        <button
          onClick={() => exportMetricsAsCSV(metrics, flowName)}
          style={{
            padding: '6px 12px',
            fontSize: 11,
            backgroundColor: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #475569',
            borderRadius: 4,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.target.style.backgroundColor = '#334155'; }}
          onMouseLeave={e => { e.target.style.backgroundColor = '#1e293b'; }}
        >
          📋 Export CSV
        </button>
      </div>

      <div style={{
        overflowX: 'auto',
        borderTop: '1px solid #334155',
        maxHeight: 400,
        overflowY: 'auto',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 12,
          fontFamily: 'monospace',
        }}>
          <thead style={{ position: 'sticky', top: 0, backgroundColor: '#1e293b', zIndex: 10 }}>
            <tr style={{ borderBottom: '1px solid #475569' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#cbd5e1', fontWeight: 600 }}>Request Name</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Count</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Min (ms)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Avg (ms)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Max (ms)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>P90 (ms)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Std Dev</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Error %</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Throughput (req/s)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Recv (KB/s)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Sent (KB/s)</th>
              <th style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1', fontWeight: 600 }}>Avg Size (B)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={idx} style={{
                borderBottom: '1px solid #334155',
                backgroundColor: idx % 2 === 0 ? '#0f172a' : '#1a202c',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1e293b'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#0f172a' : '#1a202c'}
              >
                <td style={{ padding: '8px 12px', color: '#cbd5e1', fontWeight: 500 }}>{row.name}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.count}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.minMs}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.avgMs}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.maxMs}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.p90Ms}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.stdDev}</td>
                <td style={{
                  padding: '8px 12px',
                  textAlign: 'right',
                  color: parseFloat(row.errorPct) > 0 ? '#fca5a5' : '#cbd5e1',
                }}>{row.errorPct}%</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.throughput}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.recvKBps}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.sentKBps}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#cbd5e1' }}>{row.avgBytes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
