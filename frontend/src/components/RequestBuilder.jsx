import React, { useState } from 'react';
import { useRequest } from '../context/RequestContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';

function RequestBuilder({ onResponse, loading, setLoading, urlInputRef }) {
  const { request, setMethod, setUrl, setHeaders, setParams, setBody, setBodyType, setAuth, setRequest } = useRequest();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('params');

  const handleSend = async () => {
    if (!request.url.trim()) {
      showToast('Please enter a URL', 'warning');
      return;
    }

    setLoading(true);
    try {
      const response = await api.request.execute({
        method: request.method,
        url: request.url,
        headers: request.headers,
        queryParams: request.params,
        body: request.body,
        bodyType: request.bodyType,
        auth: request.auth,
        timeout: request.timeout,
        httpVersion: request.httpVersion,
        maxResponseSize: request.maxResponseSize,
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
        logLevel: request.logLevel,
      });
      
      showToast('Request completed successfully', 'success');
      onResponse(response);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
      if (err.response) {
        onResponse(err.response);
      } else {
        onResponse({
          statusCode: 0,
          status: 'Error',
          body: err.message,
          time: 0,
          size: 0,
          connectionTime: 0,
          networkTime: 0,
          responseTime: 0,
          prepareTime: 0,
          socketInitializationTime: 0,
          dnsLookupTime: 0,
          tcpHandshakeTime: 0,
          waitingTime: 0,
          downloadTime: 0,
          processTime: 0,
          bytesSent: 0,
          bytesReceived: 0,
          protocol: request.httpVersion || 'Auto',
          logLevel: request.logLevel || 'info',
          logs: [`[ERROR] ${err.message}`],
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleHeaderChange = (key, value, index) => {
    const headers = Object.entries(request.headers);
    const [oldKey] = headers[index] || ['', ''];
    const newHeaders = { ...request.headers };
    
    // If key changed, delete old key and add new one
    if (key !== oldKey && key !== '') {
      delete newHeaders[oldKey];
      newHeaders[key] = value;
    } else if (key === '' && value === '') {
      // If both empty, delete the entry
      delete newHeaders[oldKey];
    } else {
      // Just update the value
      newHeaders[oldKey] = value;
    }
    setHeaders(newHeaders);
  };

  const handleParamChange = (key, value, index) => {
    const params = Object.entries(request.params);
    const [oldKey] = params[index] || ['', ''];
    const newParams = { ...request.params };
    
    // If key changed, delete old key and add new one
    if (key !== oldKey && key !== '') {
      delete newParams[oldKey];
      newParams[key] = value;
    } else if (key === '' && value === '') {
      // If both empty, delete the entry
      delete newParams[oldKey];
    } else {
      // Just update the value
      newParams[oldKey] = value;
    }
    setParams(newParams);
  };

  return (
    <div className="request-builder">
      {/* URL Bar */}
      <div className="url-bar">
        <select
          className="method-select"
          value={request.method}
          onChange={(e) => setMethod(e.target.value)}
        >
          <option>GET</option>
          <option>POST</option>
          <option>PUT</option>
          <option>PATCH</option>
          <option>DELETE</option>
          <option>HEAD</option>
          <option>OPTIONS</option>
        </select>
        <input
          ref={urlInputRef}
          type="text"
          className="url-input"
          placeholder="https://example.com/api/endpoint"
          value={request.url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <select
          className="protocol-select"
          value={request.httpVersion || 'Auto'}
          onChange={(e) => setRequest({ ...request, httpVersion: e.target.value })}
          title="HTTP protocol version"
        >
          <option value="Auto">Auto</option>
          <option value="HTTP/1.1">HTTP/1.x</option>
          <option value="HTTP/2">HTTP/2</option>
          <option value="HTTP/3">HTTP/3</option>
        </select>
        <button
          className="send-button"
          onClick={handleSend}
          disabled={loading}
          title="Send request (Ctrl+Enter)"
        >
          {loading ? 'Sending...' : 'Send'}
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'params' ? 'active' : ''}`}
          onClick={() => setActiveTab('params')}
        >
          Params
        </button>
        <button
          className={`tab-button ${activeTab === 'headers' ? 'active' : ''}`}
          onClick={() => setActiveTab('headers')}
        >
          Headers
        </button>
        <button
          className={`tab-button ${activeTab === 'body' ? 'active' : ''}`}
          onClick={() => setActiveTab('body')}
        >
          Body
        </button>
        <button
          className={`tab-button ${activeTab === 'auth' ? 'active' : ''}`}
          onClick={() => setActiveTab('auth')}
        >
          Auth
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Params Tab */}
        {activeTab === 'params' && (
          <div>
            <h4>Query Parameters</h4>
            {Object.entries(request.params).map(([key, value], index) => (
              <div key={index} className="key-value-row">
                <input
                  type="text"
                  placeholder="Key"
                  value={key}
                  onChange={(e) => handleParamChange(e.target.value, value, index)}
                  className="form-input"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={value}
                  onChange={(e) => handleParamChange(key, e.target.value, index)}
                  className="form-input"
                />
              </div>
            ))}
            <button
              className="add-row-button"
              onClick={() => setParams({ ...request.params, '': '' })}
            >
              + Add Parameter
            </button>
          </div>
        )}

        {/* Headers Tab */}
        {activeTab === 'headers' && (
          <div>
            <h4>Headers</h4>
            {Object.entries(request.headers).map(([key, value], index) => (
              <div key={index} className="key-value-row">
                <input
                  type="text"
                  placeholder="Key"
                  value={key}
                  onChange={(e) => handleHeaderChange(e.target.value, value, index)}
                  className="form-input"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={value}
                  onChange={(e) => handleHeaderChange(key, e.target.value, index)}
                  className="form-input"
                />
              </div>
            ))}
            <button
              className="add-row-button"
              onClick={() => setHeaders({ ...request.headers, '': '' })}
            >
              + Add Header
            </button>
          </div>
        )}

        {/* Body Tab */}
        {activeTab === 'body' && (
          <div>
            <div className="form-group">
              <label className="form-label">Body Type</label>
              <select
                className="form-input"
                value={request.bodyType}
                onChange={(e) => setBodyType(e.target.value)}
              >
                <option value="json">JSON</option>
                <option value="xml">XML</option>
                <option value="text">Text</option>
                <option value="form">Form</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Request Body</label>
              <textarea
                className="form-input form-textarea"
                placeholder={'{\n  "key": "value"\n}'}
                value={request.body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Auth Tab */}
        {activeTab === 'auth' && (
          <div>
            <div className="form-group">
              <label className="form-label">Auth Type</label>
              <select
                className="form-input"
                value={request.auth?.type || 'none'}
                onChange={(e) => setAuth({ ...request.auth, type: e.target.value })}
              >
                <option value="none">None</option>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token</option>
                <option value="oauth2">OAuth2</option>
              </select>
            </div>

            {request.auth?.type === 'basic' && (
              <>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input
                    type="text"
                    className="form-input"
                    value={request.auth?.username || ''}
                    onChange={(e) => setAuth({ ...request.auth, username: e.target.value })}
                    placeholder="Username"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-input"
                    value={request.auth?.password || ''}
                    onChange={(e) => setAuth({ ...request.auth, password: e.target.value })}
                    placeholder="Password"
                  />
                </div>
              </>
            )}

            {(request.auth?.type === 'bearer' || request.auth?.type === 'oauth2') && (
              <div className="form-group">
                <label className="form-label">Token</label>
                <textarea
                  className="form-input form-textarea"
                  value={request.auth?.token || ''}
                  onChange={(e) => setAuth({ ...request.auth, token: e.target.value })}
                  placeholder="Paste your token here"
                  style={{ minHeight: '120px' }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RequestBuilder;
