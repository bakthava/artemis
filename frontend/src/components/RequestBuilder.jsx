import React, { useState } from 'react';
import { useRequest } from '../context/RequestContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';

function RequestBuilder({ onResponse, loading, setLoading, urlInputRef, onRequestComplete }) {
  const { request, setMethod, setUrl, setHeaders, setParams, setBody, setBodyType, setAuth, setRequest, setRequestType, setGRPCConfig } = useRequest();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('params');

  const handleSend = async () => {
    // Check required fields based on request type
    if (request.requestType === 'GRPC') {
      if (!request.url.trim()) {
        showToast('Please enter gRPC server address', 'warning');
        return;
      }
      if (!request.grpcConfig.service) {
        showToast('Please select a gRPC service', 'warning');
        return;
      }
      if (!request.grpcConfig.method) {
        showToast('Please select a gRPC method', 'warning');
        return;
      }
    } else {
      if (!request.url.trim()) {
        showToast('Please enter a URL', 'warning');
        return;
      }
    }

    setLoading(true);
    try {
      let response;
      if (request.requestType === 'GRPC') {
        // gRPC request
        response = await api.request.executeGRPC({
          url: request.url,
          service: request.grpcConfig.service,
          method: request.grpcConfig.method,
          protoPath: request.grpcConfig.protoPath,
          messageFormat: request.grpcConfig.messageFormat,
          metadata: request.grpcConfig.metadata,
          body: request.body,
          callType: request.grpcConfig.callType,
          timeout: request.timeout,
          certificateFile: request.grpcConfig.certificateFile,
          keyFile: request.grpcConfig.keyFile,
          caCertFile: request.grpcConfig.caCertFile,
        });
      } else {
        // HTTP request
        response = await api.request.execute({
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
      }
      
      showToast('Request completed successfully', 'success');
      onResponse(response);
      onRequestComplete?.();
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
      onRequestComplete?.();
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

  const handleParamDelete = (index) => {
    const entries = Object.entries(request.params);
    const [keyToDelete] = entries[index] || [];
    if (keyToDelete === undefined) return;
    const newParams = { ...request.params };
    delete newParams[keyToDelete];
    setParams(newParams);
  };

  const handleHeaderDelete = (index) => {
    const entries = Object.entries(request.headers);
    const [keyToDelete] = entries[index] || [];
    if (keyToDelete === undefined) return;
    const newHeaders = { ...request.headers };
    delete newHeaders[keyToDelete];
    setHeaders(newHeaders);
  };

  return (
    <div className="request-builder">
      {/* Request Type Selector */}
      <div style={{ marginTop: '15px', marginBottom: '12px', padding: '0 5px' }}>
        <label style={{ fontWeight: 'bold', marginRight: '8px', display: 'inline-block' }}>Request Type:</label>
        <select
          value={request.requestType || 'HTTP'}
          onChange={(e) => setRequestType(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '120px' }}
        >
          <option value="HTTP">HTTP</option>
          <option value="GRPC">gRPC</option>
        </select>
      </div>

      {/* URL Bar */}
      <div className="url-bar">
        {request.requestType === 'GRPC' ? (
          <>
            <input
              type="text"
              className="url-input"
              placeholder="localhost:50051"
              value={request.url}
              onChange={(e) => setUrl(e.target.value)}
              style={{ flex: 1 }}
            />
            <select
              value={request.grpcConfig?.messageFormat || 'JSON'}
              onChange={(e) => setGRPCConfig({ messageFormat: e.target.value })}
              title="Message format"
              style={{ padding: '6px', borderRadius: '4px' }}
            >
              <option value="JSON">JSON</option>
              <option value="BINARY">Binary</option>
            </select>
          </>
        ) : (
          <>
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
          </>
        )}
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
        {request.requestType === 'GRPC' ? (
          <>
            <button
              className={`tab-button ${activeTab === 'grpc-config' ? 'active' : ''}`}
              onClick={() => setActiveTab('grpc-config')}
            >
              gRPC Config
            </button>
            <button
              className={`tab-button ${activeTab === 'metadata' ? 'active' : ''}`}
              onClick={() => setActiveTab('metadata')}
            >
              Metadata
            </button>
            <button
              className={`tab-button ${activeTab === 'body' ? 'active' : ''}`}
              onClick={() => setActiveTab('body')}
            >
              Body
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* gRPC Config Tab */}
        {request.requestType === 'GRPC' && activeTab === 'grpc-config' && (
          <div>
            <h4>gRPC Configuration</h4>
            <div className="form-group">
              <label className="form-label">Service</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., artemistest.Greeter"
                value={request.grpcConfig?.service || ''}
                onChange={(e) => setGRPCConfig({ service: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Method</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., SayHello"
                value={request.grpcConfig?.method || ''}
                onChange={(e) => setGRPCConfig({ method: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Call Type</label>
              <select
                className="form-input"
                value={request.grpcConfig?.callType || 'unary'}
                onChange={(e) => setGRPCConfig({ callType: e.target.value })}
              >
                <option value="unary">Unary</option>
                <option value="server_stream">Server Streaming</option>
                <option value="client_stream">Client Streaming</option>
                <option value="bidirectional_stream">Bidirectional</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Proto File Path</label>
              <input
                type="text"
                className="form-input"
                placeholder="/path/to/proto/file.proto"
                value={request.grpcConfig?.protoPath || ''}
                onChange={(e) => setGRPCConfig({ protoPath: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* gRPC Metadata Tab */}
        {request.requestType === 'GRPC' && activeTab === 'metadata' && (
          <div>
            <h4>gRPC Metadata</h4>
            {Object.entries(request.grpcConfig?.metadata || {}).map(([key, value], index) => (
              <div key={index} className="key-value-row">
                <input
                  type="text"
                  placeholder="Key"
                  value={key}
                  onChange={(e) => {
                    const newMetadata = { ...request.grpcConfig.metadata };
                    delete newMetadata[key];
                    newMetadata[e.target.value] = value;
                    setGRPCConfig({ metadata: newMetadata });
                  }}
                  className="form-input"
                />
                <input
                  type="text"
                  placeholder="Value"
                  value={value}
                  onChange={(e) => {
                    const newMetadata = { ...request.grpcConfig.metadata, [key]: e.target.value };
                    setGRPCConfig({ metadata: newMetadata });
                  }}
                  className="form-input"
                />
                <button
                  onClick={() => {
                    const newMetadata = { ...request.grpcConfig.metadata };
                    delete newMetadata[key];
                    setGRPCConfig({ metadata: newMetadata });
                  }}
                  title="Delete metadata"
                >✕</button>
              </div>
            ))}
            <button
              className="add-row-button"
              onClick={() => setGRPCConfig({ metadata: { ...request.grpcConfig?.metadata, '': '' } })}
            >
              + Add Metadata
            </button>
          </div>
        )}

        {/* Params Tab (HTTP only) */}
        {request.requestType !== 'GRPC' && activeTab === 'params' && (
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
                <button
                  onClick={() => handleParamDelete(index)}
                  title="Delete parameter"
                >✕</button>
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

        {/* Headers Tab (HTTP only) */}
        {request.requestType !== 'GRPC' && activeTab === 'headers' && (
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
                <button
                  onClick={() => handleHeaderDelete(index)}
                  title="Delete header"
                >✕</button>
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
