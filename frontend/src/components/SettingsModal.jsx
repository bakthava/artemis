import React, { useEffect, useState } from 'react';
import { useRequest } from '../context/RequestContext';
import { useToast } from '../context/ToastContext';
import { TestJKS } from '../../wailsjs/go/main/App';

function SettingsModal({ isOpen, onClose }) {
  const { request, setRequest } = useRequest();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  const [disabledProtocols, setDisabledProtocols] = useState(
    request.disabledTLSProtocols?.join(', ') || ''
  );
  const [cipherSuites, setCipherSuites] = useState(
    request.cipherSuites?.join(', ') || ''
  );
  const [certFileName, setCertFileName] = useState(request.certificateFile?.name || null);
  const [keyFileName, setKeyFileName] = useState(request.keyFile?.name || null);
  const [jksFileName, setJksFileName] = useState(request.jksFile?.name || null);
  const [jksPassword, setJksPassword] = useState(request.jksPassword || '');
  const [jksTesting, setJksTesting] = useState(false);
  const [jksTestResult, setJksTestResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setDisabledProtocols(request.disabledTLSProtocols?.join(', ') || '');
    setCipherSuites(request.cipherSuites?.join(', ') || '');
  }, [isOpen, request.disabledTLSProtocols, request.cipherSuites]);

  if (!isOpen) return null;

  const handleSave = () => {
    setRequest({
      ...request,
      disabledTLSProtocols: disabledProtocols
        .split(',')
        .map(p => p.trim())
        .filter(p => p),
      cipherSuites: cipherSuites
        .split(',')
        .map(c => c.trim())
        .filter(c => c),
    });
    showToast('Settings saved', 'success');
    onClose();
  };

  const handleReset = () => {
    setRequest({
      ...request,
      httpVersion: 'Auto',
      maxResponseSize: 50,
      timeout: 30000,
      verifySSL: true,
      enableSSLKeyLog: false,
      disableCookieJar: false,
      followRedirects: true,
      followOriginalMethod: false,
      followAuthHeader: false,
      removeRefererOnRedirect: false,
      strictHTTPParser: false,
      encodeURLAutomatically: true,
      useServerCipherSuite: false,
      maxRedirects: 10,
      disabledTLSProtocols: [],
      cipherSuites: [],
      logLevel: 'info',
    });
    setDisabledProtocols('');
    setCipherSuites('');
    showToast('Settings reset to defaults', 'info');
  };

  const handleExportCertificate = (format) => {
    // Create a dummy certificate file for demonstration
    const certificateData = {
      pfx: 'This is a PFX format certificate export',
      p12: 'This is a P12 format certificate export',
      jks: 'This is a JKS format certificate export',
      cert: '-----BEGIN CERTIFICATE-----\nMIIC...\n-----END CERTIFICATE-----\n',
    };

    const content = certificateData[format] || '';
    const mimeTypes = {
      pfx: 'application/x-pkcs12',
      p12: 'application/x-pkcs12',
      jks: 'application/x-java-keystore',
      cert: 'application/x-pem-file',
    };

    const blob = new Blob([content], { type: mimeTypes[format] });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `certificate.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Certificate exported as ${format.toUpperCase()}`, 'success');
  };

  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]); // Get base64 part
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUploadCertificate = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ['pem', 'crt', 'cer', 'cert', 'p7b'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(`.${ext}`));

    if (!isValid) {
      showToast('Invalid certificate format. Supported: .pem, .crt, .cer, .cert, .p7b', 'error');
      return;
    }

    try {
      const base64Content = await readFileAsBase64(file);
      setCertFileName(file.name);
      setRequest({ ...request, certificateFile: base64Content });
      showToast(`Certificate file imported: ${file.name}`, 'success');

      // Check if key is also uploaded
      if (request.keyFile) {
        showToast('✓ Both certificate and key files are now imported', 'info');
      }
    } catch (err) {
      showToast(`Error reading certificate file: ${err.message}`, 'error');
    }

    // Reset input
    e.target.value = '';
  };

  const handleUploadKey = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validExtensions = ['key', 'pem', 'p8'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(`.${ext}`));

    if (!isValid) {
      showToast('Invalid key format. Supported: .key, .pem, .p8', 'error');
      return;
    }

    try {
      const base64Content = await readFileAsBase64(file);
      setKeyFileName(file.name);
      setRequest({ ...request, keyFile: base64Content });
      showToast(`Key file imported: ${file.name}`, 'success');

      // Check if certificate is also uploaded
      if (request.certificateFile) {
        showToast('✓ Both certificate and key files are now imported', 'info');
      }
    } catch (err) {
      showToast(`Error reading key file: ${err.message}`, 'error');
    }

    // Reset input
    e.target.value = '';
  };

  const handleClearCertificate = () => {
    setCertFileName(null);
    setRequest({ ...request, certificateFile: null });
    showToast('Certificate file cleared', 'info');
  };

  const handleClearKey = () => {
    setKeyFileName(null);
    setRequest({ ...request, keyFile: null });
    showToast('Key file cleared', 'info');
  };

  const handleUploadJKS = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.jks')) {
      showToast('Invalid file format. Please upload a .jks file', 'error');
      return;
    }

    try {
      const base64Content = await readFileAsBase64(file);
      setJksFileName(file.name);
      setJksPassword('');
      setJksTestResult(null);
      setRequest({ ...request, jksFile: base64Content, jksPassword: '' });
      showToast(`JKS Keystore imported: ${file.name}. Please enter the keystore password.`, 'success');
    } catch (err) {
      showToast(`Error reading JKS file: ${err.message}`, 'error');
    }

    // Reset input
    e.target.value = '';
  };

  const handleClearJKS = () => {
    setJksFileName(null);
    setJksPassword('');
    setJksTestResult(null);
    setRequest({ ...request, jksFile: null, jksPassword: '' });
    showToast('JKS Keystore cleared', 'info');
  };

  const handleTestJKS = async () => {
    if (!request.jksFile) {
      showToast('No JKS file imported', 'error');
      return;
    }
    if (!jksPassword) {
      showToast('Please enter the keystore password first', 'error');
      return;
    }
    setJksTesting(true);
    setJksTestResult(null);
    try {
      const result = await TestJKS(request.jksFile, jksPassword);
      setJksTestResult(result);
      if (result.expired) {
        showToast('JKS keystore is valid but the certificate has expired', 'warning');
      } else {
        showToast('JKS keystore is valid ✓', 'success');
      }
    } catch (err) {
      setJksTestResult({ valid: false, error: err.message || String(err) });
      showToast(`JKS test failed: ${err.message || err}`, 'error');
    } finally {
      setJksTesting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large modal-settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Request Settings</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Settings Tabs */}
        <div className="settings-tabs" style={{ borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0' }}>
          <button
            className={`settings-tab-button ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
            style={{
              flex: '1',
              padding: '12px 16px',
              background: activeTab === 'general' ? 'var(--bg-secondary)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'general' ? '2px solid var(--accent-color)' : '1px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'general' ? '500' : '400',
              marginBottom: '-1px',
            }}
          >
            General
          </button>
          <button
            className={`settings-tab-button ${activeTab === 'network' ? 'active' : ''}`}
            onClick={() => setActiveTab('network')}
            style={{
              flex: '1',
              padding: '12px 16px',
              background: activeTab === 'network' ? 'var(--bg-secondary)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'network' ? '2px solid var(--accent-color)' : '1px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'network' ? '500' : '400',
              marginBottom: '-1px',
            }}
          >
            Network
          </button>
          <button
            className={`settings-tab-button ${activeTab === 'ssl' ? 'active' : ''}`}
            onClick={() => setActiveTab('ssl')}
            style={{
              flex: '1',
              padding: '12px 16px',
              background: activeTab === 'ssl' ? 'var(--bg-secondary)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'ssl' ? '2px solid var(--accent-color)' : '1px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'ssl' ? '500' : '400',
              marginBottom: '-1px',
            }}
          >
            SSL/TLS
          </button>
          <button
            className={`settings-tab-button ${activeTab === 'certificates' ? 'active' : ''}`}
            onClick={() => setActiveTab('certificates')}
            style={{
              flex: '1',
              padding: '12px 16px',
              background: activeTab === 'certificates' ? 'var(--bg-secondary)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'certificates' ? '2px solid var(--accent-color)' : '1px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === 'certificates' ? '500' : '400',
              marginBottom: '-1px',
            }}
          >
            Certificates
          </button>
        </div>

        <div className="modal-body modal-settings-body">
          {activeTab === 'general' && (
            <>
              {/* HTTP Version */}
              <div className="form-group settings-group">
                <label className="form-label">HTTP Version</label>
                <select
                  className="form-input"
                  value={request.httpVersion || 'Auto'}
                  onChange={(e) => setRequest({ ...request, httpVersion: e.target.value })}
                >
                  <option value="Auto">Auto</option>
                  <option value="HTTP/1.1">HTTP/1.1</option>
                  <option value="HTTP/2">HTTP/2</option>
                  <option value="HTTP/3">HTTP/3</option>
                </select>
                <small className="settings-help-text">
                  Select the HTTP version to use for sending the request.
                </small>
              </div>

              {/* Log Level */}
              <div className="form-group settings-group">
                <label className="form-label">Log Level</label>
                <select
                  className="form-input"
                  value={request.logLevel || 'info'}
                  onChange={(e) => setRequest({ ...request, logLevel: e.target.value })}
                >
                  <option value="error">error</option>
                  <option value="info">info</option>
                  <option value="debug">debug</option>
                  <option value="trace">trace</option>
                </select>
                <small className="settings-help-text">
                  Controls execution diagnostics returned with each response.
                </small>
              </div>

              {/* Follow Redirects */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.followRedirects !== false}
                    onChange={(e) => setRequest({ ...request, followRedirects: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Automatically Follow Redirects</span>
                </label>
                <small className="settings-help-text">
                  Follow HTTP 3xx responses as redirects.
                </small>
              </div>

              {/* Follow Original HTTP Method */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.followOriginalMethod}
                    onChange={(e) => setRequest({ ...request, followOriginalMethod: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Follow Original HTTP Method</span>
                </label>
                <small className="settings-help-text">
                  Redirect with the original HTTP method instead of the default behavior of redirecting with GET.
                </small>
              </div>

              {/* Follow Authorization Header */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.followAuthHeader}
                    onChange={(e) => setRequest({ ...request, followAuthHeader: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Follow Authorization Header</span>
                </label>
                <small className="settings-help-text">
                  Retain authorization header when a redirect happens to a different hostname.
                </small>
              </div>

              {/* Remove Referer on Redirect */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.removeRefererOnRedirect}
                    onChange={(e) => setRequest({ ...request, removeRefererOnRedirect: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Remove Referer Header on Redirect</span>
                </label>
                <small className="settings-help-text">
                  Remove the referer header when a redirect happens.
                </small>
              </div>

              {/* Strict HTTP Parser */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.strictHTTPParser}
                    onChange={(e) => setRequest({ ...request, strictHTTPParser: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Enable Strict HTTP Parser</span>
                </label>
                <small className="settings-help-text">
                  Restrict responses with invalid HTTP headers.
                </small>
              </div>

              {/* Encode URL Automatically */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.encodeURLAutomatically !== false}
                    onChange={(e) => setRequest({ ...request, encodeURLAutomatically: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Encode URL Automatically</span>
                </label>
                <small className="settings-help-text">
                  Encode the URL's path, query parameters, and authentication fields.
                </small>
              </div>

              {/* Max Redirects */}
              <div className="form-group settings-group">
                <label className="form-label">Maximum Number of Redirects</label>
                <input
                  type="number"
                  className="form-input"
                  value={request.maxRedirects || 10}
                  onChange={(e) => setRequest({ ...request, maxRedirects: parseInt(e.target.value) || 10 })}
                  min="0"
                  max="100"
                />
                <small className="settings-help-text">
                  Set a cap on the maximum number of redirects to follow. Default: 10
                </small>
              </div>

              {/* Use Server Cipher Suite */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.useServerCipherSuite}
                    onChange={(e) => setRequest({ ...request, useServerCipherSuite: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Use Server Cipher Suite During Handshake</span>
                </label>
                <small className="settings-help-text">
                  Use the server's cipher suite order instead of the client's during handshake.
                </small>
              </div>
            </>
          )}

          {activeTab === 'network' && (
            <>
              {/* Request Timeout */}
              <div className="form-group settings-group">
                <label className="form-label">Request Timeout</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    className="form-input"
                    value={request.timeout || 30000}
                    onChange={(e) => setRequest({ ...request, timeout: parseInt(e.target.value) || 30000 })}
                    min="0"
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>ms</span>
                </div>
                <small className="settings-help-text">
                  Set how long a request should wait for a response before timing out. To never time out, set to 0.
                </small>
              </div>

              {/* Max Response Size */}
              <div className="form-group settings-group">
                <label className="form-label">Max Response Size</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="number"
                    className="form-input"
                    value={request.maxResponseSize || 50}
                    onChange={(e) => setRequest({ ...request, maxResponseSize: parseInt(e.target.value) || 50 })}
                    min="0"
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>MB</span>
                </div>
                <small className="settings-help-text">
                  Set the maximum size of a response to download. To download a response of any size, set to 0.
                </small>
              </div>

              {/* SSL Certificate Verification */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.verifySSL !== false}
                    onChange={(e) => setRequest({ ...request, verifySSL: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">SSL Certificate Verification</span>
                </label>
                <small className="settings-help-text">
                  Verify SSL certificates when sending a request. Verification failures will result in the request being aborted.
                </small>
              </div>

              {/* SSL/TLS Key Log */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.enableSSLKeyLog}
                    onChange={(e) => setRequest({ ...request, enableSSLKeyLog: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">SSL/TLS Key Log</span>
                </label>
                <small className="settings-help-text">
                  Enable SSL/TLS session key logging for debugging encrypted connections.
                </small>
              </div>

              {/* Disable Cookies */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.disableCookieJar}
                    onChange={(e) => setRequest({ ...request, disableCookieJar: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Disable Cookies</span>
                </label>
                <small className="settings-help-text">
                  Disable cookie jar for all requests. Existing cookies in the cookie jar will not be added as headers for this request.
                </small>
              </div>
            </>
          )}

          {activeTab === 'ssl' && (
            <>
              {/* SSL Certificate Verification */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.verifySSL !== false}
                    onChange={(e) => setRequest({ ...request, verifySSL: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Verify SSL Certificates</span>
                </label>
                <small className="settings-help-text">
                  Verify SSL certificates when sending a request. Verification failures will result in the request being aborted.
                </small>
              </div>

              {/* Use Server Cipher Suite */}
              <div className="form-group settings-group">
                <label className="settings-checkbox-row">
                  <input
                    type="checkbox"
                    checked={request.useServerCipherSuite}
                    onChange={(e) => setRequest({ ...request, useServerCipherSuite: e.target.checked })}
                  />
                  <span className="form-label settings-inline-label">Use Server Cipher Suite</span>
                </label>
                <small className="settings-help-text">
                  Use the server's cipher suite order instead of the client's during handshake.
                </small>
              </div>

              {/* Disabled TLS Protocols */}
              <div className="form-group settings-group">
                <label className="form-label">Disabled TLS/SSL Protocols</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="TLSv1.2, TLSv1.3"
                  value={disabledProtocols}
                  onChange={(e) => setDisabledProtocols(e.target.value)}
                  style={{ minHeight: '72px' }}
                />
                <small className="settings-help-text">
                  Specify the SSL and TLS protocol versions to be disabled during handshake. Comma-separated list.
                </small>
              </div>

              {/* Cipher Suite Selection */}
              <div className="form-group settings-group">
                <label className="form-label">Cipher Suite Selection</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Enter cipher suites (comma-separated)"
                  value={cipherSuites}
                  onChange={(e) => setCipherSuites(e.target.value)}
                  style={{ minHeight: '72px' }}
                />
                <small className="settings-help-text">
                  Order of cipher suites that the SSL server profile uses to establish a secure connection.
                </small>
              </div>
            </>
          )}

          {activeTab === 'certificates' && (
            <>
              {/* JKS Keystore Upload */}
              <div className="form-group settings-group">
                <label className="form-label">JKS Keystore</label>
                <small className="settings-help-text" style={{ marginBottom: '12px' }}>
                  Import a JKS (Java KeyStore) file that contains both certificate and private key
                </small>

                <input
                  type="file"
                  id="jks-upload"
                  accept=".jks"
                  onChange={handleUploadJKS}
                  style={{ display: 'none' }}
                />

                {jksFileName ? (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#dcfce7',
                    borderRadius: '4px',
                    marginBottom: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderLeft: '3px solid #22c55e',
                  }}>
                    <div>
                      <strong style={{ color: '#166534' }}>✓ {jksFileName}</strong>
                      <div style={{ fontSize: '12px', color: '#15803d' }}>JKS Keystore with cert & key imported</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn-small"
                        onClick={handleTestJKS}
                        disabled={jksTesting || !jksPassword}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          background: jksTesting ? '#93c5fd' : '#3b82f6',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: jksTesting || !jksPassword ? 'not-allowed' : 'pointer',
                          fontWeight: '500',
                          opacity: !jksPassword ? 0.5 : 1,
                        }}
                      >
                        {jksTesting ? 'Testing...' : 'Test'}
                      </button>
                      <button
                        className="btn-small"
                        onClick={handleClearJKS}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          background: '#fecaca',
                          color: '#dc2626',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontWeight: '500',
                        }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-secondary"
                    onClick={() => document.getElementById('jks-upload').click()}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      textAlign: 'center',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-secondary)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      marginBottom: '16px',
                    }}
                  >
                    Choose JKS Keystore File
                  </button>
                )}

                {/* JKS Password */}
                {jksFileName && (
                  <div className="form-group settings-group" style={{ marginBottom: '16px' }}>
                    <label className="form-label">Keystore Password</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="Enter JKS keystore password"
                      value={jksPassword}
                      onChange={(e) => {
                        setJksPassword(e.target.value);
                        setRequest({ ...request, jksPassword: e.target.value });
                      }}
                      style={{ marginTop: '4px' }}
                    />
                    <small className="settings-help-text">
                      JKS keystores require a password to access the certificate and private key.
                    </small>
                    {jksPassword === '' && (
                      <small style={{ color: '#f59e0b', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                        ⚠ Password is required to use this keystore for HTTPS requests.
                      </small>
                    )}
                  </div>
                )}

                {/* JKS Test Result */}
                {jksTestResult && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: jksTestResult.valid ? (jksTestResult.expired ? '#fef3c7' : '#dcfce7') : '#fef2f2',
                    borderRadius: '4px',
                    marginBottom: '12px',
                    borderLeft: `3px solid ${jksTestResult.valid ? (jksTestResult.expired ? '#f59e0b' : '#22c55e') : '#ef4444'}`,
                    fontSize: '13px',
                  }}>
                    {jksTestResult.valid ? (
                      <>
                        <strong style={{ color: jksTestResult.expired ? '#92400e' : '#166534' }}>
                          {jksTestResult.expired ? '⚠ Certificate Expired' : '✓ Keystore Valid'}
                        </strong>
                        <div style={{ marginTop: '8px', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                          <div><strong>Subject:</strong> {jksTestResult.subject}</div>
                          <div><strong>Issuer:</strong> {jksTestResult.issuer}</div>
                          <div><strong>Valid From:</strong> {new Date(jksTestResult.notBefore).toLocaleDateString()}</div>
                          <div><strong>Valid Until:</strong> {new Date(jksTestResult.notAfter).toLocaleDateString()}</div>
                          <div><strong>Serial:</strong> {jksTestResult.serialNumber}</div>
                          <div><strong>Certificates in chain:</strong> {jksTestResult.numCerts}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <strong style={{ color: '#dc2626' }}>✗ Test Failed</strong>
                        <div style={{ marginTop: '4px', color: '#991b1b' }}>{jksTestResult.error}</div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {!jksFileName && (
                <>
                  <div style={{ textAlign: 'center', margin: '20px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    ─── OR UPLOAD SEPARATELY ───
                  </div>

                  {/* Certificate File Management */}
                  <div className="form-group settings-group">
                    <label className="form-label">Certificate File</label>
                    <small className="settings-help-text" style={{ marginBottom: '12px' }}>
                      Upload your certificate file (.pem, .crt, .cer, .cert, .p7b)
                    </small>

                    <input
                      type="file"
                      id="cert-upload"
                      accept=".pem,.crt,.cer,.cert,.p7b"
                      onChange={handleUploadCertificate}
                      style={{ display: 'none' }}
                    />

                    {certFileName ? (
                      <div style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '4px',
                        marginBottom: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)' }}>✓ {certFileName}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Certificate imported</div>
                        </div>
                        <button
                          className="btn-small"
                          onClick={handleClearCertificate}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            background: 'var(--danger-light)',
                            color: 'var(--danger-color)',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn-secondary"
                        onClick={() => document.getElementById('cert-upload').click()}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          textAlign: 'center',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-secondary)',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          marginBottom: '12px',
                        }}
                      >
                        Choose Certificate File
                      </button>
                    )}
                  </div>

                  {/* Key File Management */}
                  <div className="form-group settings-group">
                    <label className="form-label">Private Key File</label>
                    <small className="settings-help-text" style={{ marginBottom: '12px' }}>
                      Upload your private key file (.key, .pem, .p8)
                    </small>

                    <input
                      type="file"
                      id="key-upload"
                      accept=".key,.pem,.p8"
                      onChange={handleUploadKey}
                      style={{ display: 'none' }}
                    />

                    {keyFileName ? (
                      <div style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '4px',
                        marginBottom: '12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <div>
                          <strong style={{ color: 'var(--text-primary)' }}>✓ {keyFileName}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Private key imported</div>
                        </div>
                        <button
                          className="btn-small"
                          onClick={handleClearKey}
                          style={{
                            padding: '6px 12px',
                            fontSize: '12px',
                            background: 'var(--danger-light)',
                            color: 'var(--danger-color)',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                          }}
                        >
                          Clear
                        </button>
                      </div>
                    ) : (
                      <button
                        className="btn-secondary"
                        onClick={() => document.getElementById('key-upload').click()}
                        style={{
                          width: '100%',
                          padding: '12px 16px',
                          textAlign: 'center',
                          borderRadius: '4px',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-secondary)',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          marginBottom: '12px',
                        }}
                      >
                        Choose Key File
                      </button>
                    )}
                  </div>

                  {/* Status */}
                  {(certFileName || keyFileName) && (
                    <div style={{
                      padding: '12px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '4px',
                      marginBottom: '16px',
                      borderLeft: `3px solid ${certFileName && keyFileName ? '#22c55e' : '#f59e0b'}`,
                    }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Import Status</strong>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: '1.5' }}>
                        {certFileName && <div>✓ Certificate: {certFileName}</div>}
                        {keyFileName && <div>✓ Private Key: {keyFileName}</div>}
                        {certFileName && keyFileName && (
                          <div style={{ marginTop: '6px', color: '#22c55e', fontWeight: '500' }}>
                            ✓ Both files are imported and ready for use
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Export Options */}
              <div className="form-group settings-group">
                <label className="form-label">Export Certificate</label>
                <small className="settings-help-text" style={{ marginBottom: '16px' }}>
                  Convert your imported certificate to other formats (PFX, P12, JKS, CERT)
                </small>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <button
                    className="btn-secondary"
                    onClick={() => handleExportCertificate('pfx')}
                    disabled={!certFileName && !jksFileName}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      background: (certFileName || jksFileName) ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
                      color: (certFileName || jksFileName) ? 'var(--text-primary)' : 'var(--text-disabled)',
                      cursor: (certFileName || jksFileName) ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: '500',
                      opacity: (certFileName || jksFileName) ? 1 : 0.5,
                    }}
                  >
                    Export as PFX
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleExportCertificate('p12')}
                    disabled={!certFileName && !jksFileName}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      background: (certFileName || jksFileName) ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
                      color: (certFileName || jksFileName) ? 'var(--text-primary)' : 'var(--text-disabled)',
                      cursor: (certFileName || jksFileName) ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: '500',
                      opacity: (certFileName || jksFileName) ? 1 : 0.5,
                    }}
                  >
                    Export as P12
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleExportCertificate('jks')}
                    disabled={!certFileName && !jksFileName}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      background: (certFileName || jksFileName) ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
                      color: (certFileName || jksFileName) ? 'var(--text-primary)' : 'var(--text-disabled)',
                      cursor: (certFileName || jksFileName) ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: '500',
                      opacity: (certFileName || jksFileName) ? 1 : 0.5,
                    }}
                  >
                    Export as JKS
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => handleExportCertificate('cert')}
                    disabled={!certFileName && !jksFileName}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'center',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      background: (certFileName || jksFileName) ? 'var(--bg-secondary)' : 'var(--bg-secondary)',
                      color: (certFileName || jksFileName) ? 'var(--text-primary)' : 'var(--text-disabled)',
                      cursor: (certFileName || jksFileName) ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      fontWeight: '500',
                      opacity: (certFileName || jksFileName) ? 1 : 0.5,
                    }}
                  >
                    Export as CERT
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={handleReset}>
            Reset to Defaults
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleSave}>
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
