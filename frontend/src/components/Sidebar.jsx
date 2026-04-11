import React, { useState } from 'react';
import { useCollections, useHistory, useEnvironments } from '../hooks';
import { useRequest } from '../context/RequestContext';
import { useToast } from '../context/ToastContext';
import CollectionTree from './CollectionTree';

function Sidebar({ setResponse }) {
  const [activeTab, setActiveTab] = useState('collections');
  const { collections, createCollection } = useCollections();
  const { history, clearHistory } = useHistory();
  const { environments, createEnvironment } = useEnvironments();
  const { setMethod, setUrl, setHeaders, setParams, setBody, setBodyType, setAuth } = useRequest();
  const { showToast } = useToast();
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newEnvironmentName, setNewEnvironmentName] = useState('');

  const handleCreateCollection = async () => {
    if (newCollectionName.trim()) {
      await createCollection(newCollectionName);
      setNewCollectionName('');
    }
  };

  const handleCreateEnvironment = async () => {
    if (newEnvironmentName.trim()) {
      await createEnvironment(newEnvironmentName);
      setNewEnvironmentName('');
    }
  };

  const handleClearHistory = async () => {
    await clearHistory();
    setResponse(null);
    showToast('History cleared', 'info');
  };

  return (
    <div className="sidebar">
      {/* Collections Tab */}
      <div className="sidebar-section">
        <div className="sidebar-title">
          <span>Collections</span>
          <button 
            className="sidebar-add-btn"
            onClick={() => setActiveTab(activeTab !== 'collections-new' ? 'collections-new' : 'collections')}
          >
            +
          </button>
        </div>
        
        {activeTab === 'collections-new' && (
          <div style={{ marginBottom: '12px', display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder="Collection name"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              className="form-input"
              style={{ flex: 1, fontSize: '12px' }}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateCollection()}
            />
            <button
              onClick={handleCreateCollection}
              className="send-button"
              style={{ padding: '4px 12px', fontSize: '12px' }}
            >
              Create
            </button>
          </div>
        )}

        <CollectionTree collections={collections} setResponse={setResponse} />
      </div>

      {/* History Tab */}
      <div className="sidebar-section">
        <div className="sidebar-title">
          <span>History</span>
          <button
            className="sidebar-add-btn"
            onClick={handleClearHistory}
            title="Clear history"
            disabled={!history || history.length === 0}
            style={{ fontSize: '11px', padding: '2px 6px' }}
          >
            Clear
          </button>
        </div>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {history && history.length > 0 ? (
            history.map((entry) => (
              <div
                key={entry.id}
                className="sidebar-item"
                style={{ cursor: 'pointer', fontSize: '12px' }}
                onClick={() => {
                  // Restore full request to RequestContext
                  if (entry.request) {
                    setMethod(entry.request.method);
                    setUrl(entry.request.url);
                    setHeaders(entry.request.headers || {});
                    setParams(entry.request.queryParams || {});
                    setBody(entry.request.body || '');
                    setBodyType(entry.request.bodyType || 'json');
                    if (entry.request.auth) {
                      setAuth(entry.request.auth);
                    }
                  }
                  // Display full response
                  if (entry.response) {
                    setResponse(entry.response);
                  }
                }}
              >
                <span>
                  {entry.request?.method} {entry.request?.url?.substring(0, 30)}...
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  {entry.response?.statusCode}
                </span>
              </div>
            ))
          ) : (
            <div style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
              No history yet
            </div>
          )}
        </div>
      </div>

      {/* Environments Tab */}
      <div className="sidebar-section">
        <div className="sidebar-title">
          <span>Environments</span>
          <button
            className="sidebar-add-btn"
            onClick={() => setActiveTab(activeTab !== 'environments-new' ? 'environments-new' : 'environments')}
          >
            +
          </button>
        </div>

        {activeTab === 'environments-new' && (
          <div style={{ marginBottom: '12px', display: 'flex', gap: '6px' }}>
            <input
              type="text"
              placeholder="Environment name"
              value={newEnvironmentName}
              onChange={(e) => setNewEnvironmentName(e.target.value)}
              className="form-input"
              style={{ flex: 1, fontSize: '12px' }}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateEnvironment()}
            />
            <button
              onClick={handleCreateEnvironment}
              className="send-button"
              style={{ padding: '4px 12px', fontSize: '12px' }}
            >
              Create
            </button>
          </div>
        )}

        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {environments && environments.length > 0 ? (
            environments.map((env) => (
              <div
                key={env.id}
                className={`sidebar-item ${env.active ? 'active' : ''}`}
                style={{ fontSize: '12px' }}
              >
                <span>{env.name}</span>
                {env.active && <span style={{ fontSize: '10px' }}>✓</span>}
              </div>
            ))
          ) : (
            <div style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
              No environments
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
