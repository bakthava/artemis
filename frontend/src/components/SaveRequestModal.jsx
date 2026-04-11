import React, { useState } from 'react';
import { useRequest } from '../context/RequestContext';
import { useCollections } from '../hooks';
import { useToast } from '../context/ToastContext';
import api from '../services/api';

export default function SaveRequestModal({ isOpen, onClose }) {
  const { request } = useRequest();
  const { collections, createCollection } = useCollections();
  const { showToast } = useToast();
  const [requestName, setRequestName] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const handleSave = async () => {
    if (!requestName.trim()) {
      showToast('Please enter a request name', 'warning');
      return;
    }
    if (!selectedCollection) {
      showToast('Please select a collection', 'warning');
      return;
    }

    try {
      const savedRequest = {
        ...request,
        name: requestName,
        id: `req-${Date.now()}`,
      };
      await api.collections.addRequest(selectedCollection, savedRequest);
      showToast('Request saved successfully', 'success');
      setRequestName('');
      setSelectedCollection('');
      onClose();
    } catch (err) {
      showToast(`Error saving request: ${err.message}`, 'error');
    }
  };

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) {
      showToast('Please enter a collection name', 'warning');
      return;
    }

    try {
      const newColl = await createCollection(newCollectionName);
      setSelectedCollection(newColl.id);
      setNewCollectionName('');
      setIsCreatingCollection(false);
      showToast('Collection created', 'success');
    } catch (err) {
      showToast(`Error creating collection: ${err.message}`, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Save Request</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Request Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g., Get User Profile"
              value={requestName}
              onChange={(e) => setRequestName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          <div className="form-group">
            <label>Collection</label>
            {!isCreatingCollection ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="form-input"
                  style={{ flex: 1 }}
                  value={selectedCollection}
                  onChange={(e) => setSelectedCollection(e.target.value)}
                >
                  <option value="">Select a collection...</option>
                  {collections?.map(col => (
                    <option key={col.id} value={col.id}>{col.name}</option>
                  ))}
                </select>
                <button
                  className="btn-secondary"
                  onClick={() => setIsCreatingCollection(true)}
                  style={{ padding: '8px 12px' }}
                >
                  + New
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Collection name"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateCollection()}
                />
                <button
                  className="btn-primary"
                  onClick={handleCreateCollection}
                  style={{ padding: '8px 12px' }}
                >
                  Create
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setIsCreatingCollection(false);
                    setNewCollectionName('');
                  }}
                  style={{ padding: '8px 12px' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save Request</button>
        </div>
      </div>
    </div>
  );
}
