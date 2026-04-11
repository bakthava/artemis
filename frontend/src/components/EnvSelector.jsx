import React, { useState } from 'react';
import { useEnvironments } from '../hooks';

function EnvSelector() {
  const { 
    environments, 
    activeEnvironment, 
    switchEnvironment, 
    createEnvironment, 
    updateEnvironment, 
    deleteEnvironment 
  } = useEnvironments();
  
  const [showModal, setShowModal] = useState(false);
  const [editingEnv, setEditingEnv] = useState(null);
  const [newEnvName, setNewEnvName] = useState('');
  const [envVariables, setEnvVariables] = useState({});
  const [varKey, setVarKey] = useState('');
  const [varValue, setVarValue] = useState('');

  const handleAddVariable = () => {
    if (varKey.trim()) {
      setEnvVariables({ ...envVariables, [varKey]: varValue });
      setVarKey('');
      setVarValue('');
    }
  };

  const handleRemoveVariable = (key) => {
    const updated = { ...envVariables };
    delete updated[key];
    setEnvVariables(updated);
  };

  const handleCreateNew = async () => {
    if (newEnvName.trim()) {
      await createEnvironment(newEnvName);
      setNewEnvName('');
      setEnvVariables({});
      setEditingEnv(null);
      setShowModal(false);
    }
  };

  const handleSaveEdit = async () => {
    if (editingEnv) {
      await updateEnvironment(editingEnv.id, envVariables);
      setEditingEnv(null);
      setEnvVariables({});
      setShowModal(false);
    }
  };

  const handleDeleteEnv = async (id) => {
    if (window.confirm('Delete this environment?')) {
      await deleteEnvironment(id);
      setEditingEnv(null);
      setShowModal(false);
    }
  };

  const handleEditEnv = (env) => {
    setEditingEnv(env);
    setEnvVariables(env.variables || {});
    setShowModal(true);
  };

  const activeEnvName = environments.find(e => e.active)?.name || 'No Environment';

  return (
    <>
      <div className="env-selector">
        <div className="env-dropdown">
          <div className="env-label">Environment:</div>
          <select 
            className="env-select"
            value={activeEnvironment?.id || ''}
            onChange={(e) => switchEnvironment(e.target.value)}
          >
            <option value="">None</option>
            {environments.map(env => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
          <button 
            className="env-edit-btn"
            onClick={() => {
              if (activeEnvironment) {
                handleEditEnv(activeEnvironment);
              }
            }}
            disabled={!activeEnvironment}
          >
            ⚙️
          </button>
          <button 
            className="env-add-btn"
            onClick={() => {
              setEditingEnv(null);
              setNewEnvName('');
              setEnvVariables({});
              setShowModal(true);
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Modal for create/edit */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>{editingEnv ? `Edit: ${editingEnv.name}` : 'New Environment'}</h2>
              <button 
                className="modal-close"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {!editingEnv && (
                <div className="form-group">
                  <label>Environment Name</label>
                  <input
                    type="text"
                    value={newEnvName}
                    onChange={(e) => setNewEnvName(e.target.value)}
                    placeholder="e.g., Development, Production"
                    className="form-input"
                  />
                </div>
              )}

              <div className="form-group">
                <label>Variables</label>
                <div className="var-input-row">
                  <input
                    type="text"
                    value={varKey}
                    onChange={(e) => setVarKey(e.target.value)}
                    placeholder="Key (e.g., API_URL)"
                    className="form-input"
                  />
                  <input
                    type="text"
                    value={varValue}
                    onChange={(e) => setVarValue(e.target.value)}
                    placeholder="Value"
                    className="form-input"
                  />
                  <button 
                    className="btn-small"
                    onClick={handleAddVariable}
                  >
                    Add
                  </button>
                </div>

                <div className="var-list">
                  {Object.entries(envVariables).map(([key, value]) => (
                    <div key={key} className="var-item">
                      <div className="var-key">{key}</div>
                      <div className="var-value">{value}</div>
                      <button
                        className="var-remove"
                        onClick={() => handleRemoveVariable(key)}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {editingEnv && (
                <button 
                  className="btn-danger"
                  onClick={() => handleDeleteEnv(editingEnv.id)}
                >
                  Delete
                </button>
              )}
              <button 
                className="btn-secondary"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={editingEnv ? handleSaveEdit : handleCreateNew}
              >
                {editingEnv ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default EnvSelector;
