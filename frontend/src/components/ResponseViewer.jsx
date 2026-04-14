import React, { useState } from 'react';

function ResponseViewer({ response, loading }) {
  const [activeTab, setActiveTab] = useState('body');

  const logLevel = response ? (response.logLevel || 'info').toLowerCase() : 'info';
  const showVerboseDetails = logLevel === 'debug' || logLevel === 'trace';

  const visibleLogs = response && Array.isArray(response.logs)
    ? response.logs.filter((line) => {
        if (showVerboseDetails) {
          return true;
        }
        return line.includes('[ERROR]') || line.includes('[INFO]');
      })
    : [];

  const formatMs = (value) => `${Number(value || 0).toFixed(2)} ms`;

  const responseTimingDetails = response ? [
    'Response Time',
    formatMs(response.time),
    'Prepare',
    formatMs(response.prepareTime),
    'Socket Initialization',
    formatMs(response.socketInitializationTime),
    'DNS Lookup',
    formatMs(response.dnsLookupTime),
    'TCP Handshake',
    formatMs(response.tcpHandshakeTime),
    'Waiting (TTFB)',
    formatMs(response.waitingTime),
    'Download',
    formatMs(response.downloadTime),
    'Process',
    formatMs(response.processTime),
  ].join('\n') : '';

  const getStatusLabel = () => {
    const code = response?.statusCode;
    const status = String(response?.status || '').trim();

    if (!status) {
      return String(code || '');
    }

    // If status already includes the leading code (e.g. "200 OK"), return as-is.
    if (code && status.startsWith(`${code} `)) {
      return status;
    }

    if (code) {
      return `${code} ${status}`;
    }

    return status;
  };

  const formatBytes = (bytes) => {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getStatusColor = (statusCode) => {
    if (statusCode >= 200 && statusCode < 300) return 'success';
    if (statusCode >= 400) return 'error';
    return '';
  };

  const formatJSON = (jsonString) => {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return jsonString;
    }
  };

  const parseHeaders = (headerString) => {
    if (typeof response.headers === 'object') {
      return response.headers;
    }
    return {};
  };

  if (loading) {
    return (
      <div className="response-container">
        <div className="response-empty">
          <div>Loading response...</div>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="response-container">
        <div className="response-empty">
          <div>Response will appear here</div>
        </div>
      </div>
    );
  }

  return (
    <div className="response-container">
      <div className="response-header">
        <div className={`response-status ${getStatusColor(response.statusCode)}`}>
          {getStatusLabel()}
        </div>
        <div className="diagnostics-panel">
          <div className="diag-item" title={responseTimingDetails}><span>Total Response Time</span><strong>{response.time || 0}ms</strong></div>
          <div className="diag-item"><span>Connect</span><strong>{response.connectionTime || 0}ms</strong></div>
          <div className="diag-item"><span>Sent</span><strong>{formatBytes(response.bytesSent)}</strong></div>
          <div className="diag-item"><span>Received</span><strong>{formatBytes(response.bytesReceived || response.size)}</strong></div>
          <div className="diag-item"><span>Protocol</span><strong>{response.protocol || 'N/A'}</strong></div>
          <div className="diag-item"><span>Log</span><strong>{(response.logLevel || 'info').toUpperCase()}</strong></div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'body' ? 'active' : ''}`}
          onClick={() => setActiveTab('body')}
        >
          Body
        </button>
        <button
          className={`tab-button ${activeTab === 'headers' ? 'active' : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </button>
        <button
          className={`tab-button ${activeTab === 'cookies' ? 'active' : ''}`}
          onClick={() => setActiveTab('cookies')}
        >
          Cookies
        </button>
        <button
          className={`tab-button ${activeTab === 'trace' ? 'active' : ''}`}
          onClick={() => setActiveTab('trace')}
        >
          Details
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'body' && (
          <div className="response-body">
            {response.body ? (
              <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word' }}>{formatJSON(response.body)}</pre>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>No response body</div>
            )}
          </div>
        )}

        {activeTab === 'headers' && (
          <div className="response-body">
            {response.headers && typeof response.headers === 'object' ? (
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '12px',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '8px' }}>Header</th>
                    <th style={{ textAlign: 'left', padding: '8px' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(response.headers).map(([key, value]) => (
                    <tr key={key} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '8px', fontWeight: '500' }}>{key}</td>
                      <td style={{ padding: '8px' }}>{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: 'var(--text-secondary)' }}>No headers</div>
            )}
          </div>
        )}

        {activeTab === 'cookies' && (
          <div className="response-body">
            <div style={{ color: 'var(--text-secondary)' }}>
              Cookie support coming soon
            </div>
          </div>
        )}

        {activeTab === 'trace' && (
          <div className="response-body">
            {showVerboseDetails && (
              <div style={{ marginBottom: '12px', color: 'var(--text-secondary)', fontSize: '12px' }}>
                Verbose diagnostics enabled ({logLevel.toUpperCase()})
              </div>
            )}
            {visibleLogs.length > 0 ? <pre>{visibleLogs.join('\n')}</pre> : <div style={{ color: 'var(--text-secondary)' }}>No diagnostic logs</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default ResponseViewer;
