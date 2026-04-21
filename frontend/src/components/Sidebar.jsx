import React, { useRef, useState, useEffect } from 'react';
import { useCollections, useHistory, useEnvironments } from '../hooks';
import { useRequest } from '../context/RequestContext';
import { useToast } from '../context/ToastContext';
import CollectionTree from './CollectionTree';
import ConfirmDialog from './ConfirmDialog';
import api from '../services/api';

function Sidebar({ setResponse }) {
  const [activeTab, setActiveTab] = useState('collections');
  const { collections, createCollection, fetchCollections } = useCollections();
  const { history, clearHistory } = useHistory();
  const { environments, createEnvironment, fetchEnvironments } = useEnvironments();
  const { setMethod, setUrl, setHeaders, setParams, setBody, setBodyType, setAuth } = useRequest();
  const { showToast } = useToast();
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newEnvironmentName, setNewEnvironmentName] = useState('');
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, type: null, id: null, name: '' });
  const [envCollectionMapping, setEnvCollectionMapping] = useState({});
  const [settingsEnvId, setSettingsEnvId] = useState(null);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState(null); // 'environments' or 'collections'
  const [selectedExportIds, setSelectedExportIds] = useState({});
  const environmentImportRef = useRef(null);
  const collectionImportRef = useRef(null);

  // Load environment-collection mapping from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('artemis-env-collection-mapping');
      if (saved) {
        setEnvCollectionMapping(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Failed to load env-collection mapping:', err);
    }
  }, []);

  // Save mapping to localStorage
  const saveMapping = (mapping) => {
    setEnvCollectionMapping(mapping);
    try {
      localStorage.setItem('artemis-env-collection-mapping', JSON.stringify(mapping));
    } catch (err) {
      console.error('Failed to save env-collection mapping:', err);
    }
  };

  const handleToggleCollection = (envId, collectionId) => {
    const envCollections = envCollectionMapping[envId] || [];
    const updated = envCollections.includes(collectionId)
      ? envCollections.filter(id => id !== collectionId)
      : [...envCollections, collectionId];
    
    const newMapping = { ...envCollectionMapping, [envId]: updated };
    saveMapping(newMapping);
  };

  const handleOpenEnvSettings = (envId) => {
    setSettingsEnvId(envId);
    setShowCollectionModal(true);
  };

  const handleCloseCollectionModal = () => {
    setShowCollectionModal(false);
    setSettingsEnvId(null);
  };

  const downloadJSON = (data, fileName) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const readJSONFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(reader.result));
        } catch (err) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
      reader.readAsText(file);
    });
  };

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

  const handleImportEnvironments = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = await readJSONFile(file);
      await api.environments.import(payload);
      await fetchEnvironments();
      showToast('Environments imported', 'success');
      setShowImportModal(false);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleImportCollections = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = await readJSONFile(file);
      await api.collections.import(payload);
      await fetchCollections();
      showToast('Collections imported', 'success');
      setShowImportModal(false);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };

  const handleExportEnvironments = async () => {
    const selectedIds = Object.keys(selectedExportIds).filter(id => selectedExportIds[id]);
    if (selectedIds.length === 0) {
      showToast('Please select at least one environment', 'info');
      return;
    }
    try {
      const selectedEnvs = environments.filter(env => selectedIds.includes(env.id));
      downloadJSON(selectedEnvs, `environments-${Date.now()}.json`);
      showToast('Environments exported', 'success');
      setShowExportModal(false);
      setExportType(null);
      setSelectedExportIds({});
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleExportCollections = async () => {
    const selectedIds = Object.keys(selectedExportIds).filter(id => selectedExportIds[id]);
    if (selectedIds.length === 0) {
      showToast('Please select at least one collection', 'info');
      return;
    }
    try {
      const selectedColls = collections.filter(coll => selectedIds.includes(coll.id));
      downloadJSON(selectedColls, `collections-${Date.now()}.json`);
      showToast('Collections exported', 'success');
      setShowExportModal(false);
      setExportType(null);
      setSelectedExportIds({});
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleClearHistory = async () => {
    await clearHistory();
    setResponse(null);
    showToast('History cleared', 'info');
  };



  const handleDeleteCollection = (id, name) => {
    setConfirmDialog({ isOpen: true, type: 'collection', id, name });
  };

  const handleDeleteEnvironment = (id, name) => {
    setConfirmDialog({ isOpen: true, type: 'environment', id, name });
  };

  const handleConfirmDelete = async () => {
    const { type, id, name } = confirmDialog;
    try {
      if (type === 'collection') {
        await api.collections.delete(id);
        await fetchCollections();
        showToast(`Collection "${name}" deleted`, 'success');
      } else if (type === 'environment') {
        await api.environments.delete(id);
        await fetchEnvironments();
        showToast(`Environment "${name}" deleted`, 'success');
      }
    } catch (err) {
      showToast(`Failed to delete ${type}: ${err.message}`, 'error');
    } finally {
      setConfirmDialog({ isOpen: false, type: null, id: null, name: '' });
    }
  };

  const handleCancelDelete = () => {
    setConfirmDialog({ isOpen: false, type: null, id: null, name: '' });
  };

  return (
    <div className="sidebar">
      {/* Import/Export Buttons */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-color)', marginBottom: '8px', display: 'flex', gap: '6px' }}>
        <button
          className="send-button"
          onClick={() => setShowImportModal(true)}
          style={{ flex: 1, padding: '6px 12px', fontSize: '12px' }}
        >
          📥 Import
        </button>
        <button
          className="send-button"
          onClick={() => {
            setShowExportModal(true);
            setExportType(null);
            setSelectedExportIds({});
          }}
          style={{ flex: 1, padding: '6px 12px', fontSize: '12px' }}
        >
          📤 Export
        </button>
      </div>

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

        <CollectionTree collections={collections} setResponse={setResponse} onDeleteCollection={handleDeleteCollection} />
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
              <div key={env.id}>
                <div
                  className={`sidebar-item ${env.active ? 'active' : ''}`}
                  style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1 }}>
                    <span>{env.name}</span>
                    {env.active && <span style={{ fontSize: '10px' }}>✓</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      className="sidebar-add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEnvSettings(env.id);
                      }}
                      title="Manage collections"
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                    >
                      ⚙️
                    </button>
                    <button
                      className="sidebar-add-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEnvironment(env.id, env.name);
                      }}
                      title="Delete environment"
                      style={{ padding: '2px 6px', fontSize: '11px' }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                
                {/* Attached Collections */}
                {envCollectionMapping[env.id] && envCollectionMapping[env.id].length > 0 && (
                  <div style={{ paddingLeft: '16px', marginTop: '4px', marginBottom: '8px' }}>
                    {collections
                      ?.filter(c => envCollectionMapping[env.id].includes(c.id))
                      .map(collection => (
                        <div key={collection.id} style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          📁 {collection.name}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
              No environments
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={`Delete ${confirmDialog.type === 'collection' ? 'Collection' : 'Environment'}`}
        message={`Are you sure you want to delete "${confirmDialog.name}"? This action cannot be undone.`}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        confirmText="Delete"
        cancelText="Cancel"
        isDanger={true}
      />

      {/* Import Modal */}
      {showImportModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            padding: '20px',
            minWidth: '350px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
              What would you like to import?
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => environmentImportRef.current?.click()}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'var(--primary-color)';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'var(--bg-secondary)';
                  e.target.style.color = 'inherit';
                }}
              >
                🌍 Import Environments
              </button>

              <button
                onClick={() => collectionImportRef.current?.click()}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'var(--primary-color)';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'var(--bg-secondary)';
                  e.target.style.color = 'inherit';
                }}
              >
                📁 Import Collections
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowImportModal(false)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>

            {/* Hidden file inputs */}
            <input
              ref={environmentImportRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportEnvironments}
              style={{ display: 'none' }}
            />
            <input
              ref={collectionImportRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportCollections}
              style={{ display: 'none' }}
            />
          </div>
        </div>
      )}

      {/* Export Modal - Select Type */}
      {showExportModal && !exportType && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            padding: '20px',
            minWidth: '350px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
              What would you like to export?
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => setExportType('environments')}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'var(--primary-color)';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'var(--bg-secondary)';
                  e.target.style.color = 'inherit';
                }}
              >
                🌍 Export Environments
              </button>

              <button
                onClick={() => setExportType('collections')}
                style={{
                  padding: '10px 12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = 'var(--primary-color)';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'var(--bg-secondary)';
                  e.target.style.color = 'inherit';
                }}
              >
                📁 Export Collections
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setExportType(null);
                  setSelectedExportIds({});
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal - Select Items */}
      {showExportModal && exportType && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            padding: '20px',
            minWidth: '400px',
            maxHeight: '70vh',
            overflowY: 'auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
              Select {exportType === 'environments' ? 'Environments' : 'Collections'} to Export
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '50vh', overflowY: 'auto', marginBottom: '16px' }}>
              {exportType === 'environments' ? (
                environments && environments.length > 0 ? (
                  environments.map(env => (
                    <label
                      key={env.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px',
                        backgroundColor: selectedExportIds[env.id] ? 'var(--bg-secondary)' : 'transparent',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedExportIds[env.id] || false}
                        onChange={(e) => {
                          setSelectedExportIds({
                            ...selectedExportIds,
                            [env.id]: e.target.checked,
                          });
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{env.name}</span>
                    </label>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    No environments available
                  </div>
                )
              ) : (
                collections && collections.length > 0 ? (
                  collections.map(collection => (
                    <label
                      key={collection.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px',
                        backgroundColor: selectedExportIds[collection.id] ? 'var(--bg-secondary)' : 'transparent',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedExportIds[collection.id] || false}
                        onChange={(e) => {
                          setSelectedExportIds({
                            ...selectedExportIds,
                            [collection.id]: e.target.checked,
                          });
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{collection.name}</span>
                    </label>
                  ))
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                    No collections available
                  </div>
                )
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setExportType(null);
                  setSelectedExportIds({});
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={exportType === 'environments' ? handleExportEnvironments : handleExportCollections}
                className="send-button"
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                }}
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection Selection Modal for Environment */}
      {showCollectionModal && settingsEnvId && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            padding: '20px',
            minWidth: '400px',
            maxHeight: '70vh',
            overflowY: 'auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px' }}>
              Attach Collections to Environment
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '50vh', overflowY: 'auto' }}>
              {collections && collections.length > 0 ? (
                collections.map(collection => {
                  const isAttached = (envCollectionMapping[settingsEnvId] || []).includes(collection.id);
                  return (
                    <label
                      key={collection.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px',
                        backgroundColor: isAttached ? 'var(--bg-secondary)' : 'transparent',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isAttached}
                        onChange={() => handleToggleCollection(settingsEnvId, collection.id)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{collection.name}</span>
                    </label>
                  );
                })
              ) : (
                <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>
                  No collections available
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button
                onClick={handleCloseCollectionModal}
                className="send-button"
                style={{ padding: '6px 12px', fontSize: '12px' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}

export default Sidebar;
