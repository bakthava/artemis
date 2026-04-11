/**
 * Export metrics to HTML, CSV, or PDF formats
 */

export function exportMetricsAsHTML(metrics, flowName) {
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

  let totalCount = 0, totalErrors = 0, totalMs = 0;
  rows.forEach(r => {
    totalCount += r.count;
    totalErrors += Math.round((parseFloat(r.errorPct) / 100) * r.count);
    totalMs += m.sumMs || 0;
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 20px; background: #f3f4f6; }
    h1 { color: #1f2937; margin-bottom: 8px; }
    .summary { background: white; padding: 16px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .summary-item { }
    .summary-label { font-size: 12px; color: #6b7280; text-transform: uppercase; }
    .summary-value { font-size: 24px; font-weight: bold; color: #1f2937; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
    thead { background: #f3f4f6; }
    th { padding: 12px; text-align: left; font-size: 12px; font-weight: 600; color: #374151; border-bottom: 1px solid #e5e7eb; }
    td { padding: 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    tr:hover { background: #f9fafb; }
    .number { text-align: right; font-family: monospace; }
    .error { color: #dc2626; }
  </style>
</head>
<body>
  <h1>Performance Test Report: ${flowName}</h1>
  <div style="color: #6b7280; margin-bottom: 20px;">Generated: ${new Date().toLocaleString()}</div>

  <div class="summary">
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">Total Requests</div>
        <div class="summary-value">${totalCount}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Total Errors</div>
        <div class="summary-value ${totalErrors > 0 ? 'error' : ''}">${totalErrors}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Error Rate</div>
        <div class="summary-value ${totalErrors > 0 ? 'error' : ''}">${((totalErrors / totalCount) * 100).toFixed(2)}%</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Duration</div>
        <div class="summary-value">${(totalMs / 1000).toFixed(1)}s</div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Request Name</th>
        <th class="number">Count</th>
        <th class="number">Min (ms)</th>
        <th class="number">Avg (ms)</th>
        <th class="number">Max (ms)</th>
        <th class="number">P90 (ms)</th>
        <th class="number">Std Dev</th>
        <th class="number">Error %</th>
        <th class="number">Throughput</th>
        <th class="number">Recv (KB/s)</th>
        <th class="number">Sent (KB/s)</th>
        <th class="number">Avg Size (B)</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => `
        <tr>
          <td>${r.name}</td>
          <td class="number">${r.count}</td>
          <td class="number">${r.minMs}</td>
          <td class="number">${r.avgMs}</td>
          <td class="number">${r.maxMs}</td>
          <td class="number">${r.p90Ms}</td>
          <td class="number">${r.stdDev}</td>
          <td class="number ${parseFloat(r.errorPct) > 0 ? 'error' : ''}">${r.errorPct}%</td>
          <td class="number">${r.throughput} req/s</td>
          <td class="number">${r.recvKBps}</td>
          <td class="number">${r.sentKBps}</td>
          <td class="number">${r.avgBytes}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>
  `;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `metrics-${flowName}-${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportMetricsAsCSV(metrics, flowName) {
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

  const headers = [
    'Request Name', 'Count', 'Min (ms)', 'Avg (ms)', 'Max (ms)', 'P90 (ms)', 'Std Dev', 
    'Error %', 'Throughput (req/s)', 'Recv (KB/s)', 'Sent (KB/s)', 'Avg Size (B)'
  ];

  const csv = [
    headers.join(','),
    ...rows.map(r =>
      `"${r.name}",${r.count},${r.minMs},${r.avgMs},${r.maxMs},${r.p90Ms},${r.stdDev},${r.errorPct},${r.throughput},${r.recvKBps},${r.sentKBps},${r.avgBytes}`
    )
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `metrics-${flowName}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Helper functions
function getPercentile(samples, p) {
  if (!samples || samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[Math.max(0, idx)]);
}

function getStdDev(m) {
  if (m.count <= 1) return 0;
  const variance = (m.sumSqMs - (m.sumMs ** 2) / m.count) / (m.count - 1);
  return Math.round(Math.sqrt(Math.max(0, variance)));
}
