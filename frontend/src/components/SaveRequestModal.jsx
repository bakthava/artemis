import React, { useEffect, useState } from 'react';
import { useRequest } from '../context/RequestContext';
import { useCollections } from '../hooks';
import { useToast } from '../context/ToastContext';
import api from '../services/api';

export default function SaveRequestModal({ isOpen, onClose, onSaveComplete, mode = 'save' }) {
  const { request, setRequest } = useRequest();
  const { collections, createCollection } = useCollections();
  const { showToast } = useToast();
  const [requestName, setRequestName] = useState('');
  const [selectedCollection, setSelectedCollection] = useState('');
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    // For "Save As" mode, always start fresh; for "Save" mode, pre-fill if request exists
    if (mode === 'saveas') {
      setRequestName(request?.name ? `${request.name} (copy)` : '');
      setSelectedCollection('');
    } else {
      setRequestName(request?.name || '');
      if (request?.id) {
        const matchedCollection = collections?.find(col =>
          (col.requests || []).some(savedReq => savedReq?.id === request.id)
        );
        setSelectedCollection(matchedCollection?.id || '');
      } else {
        setSelectedCollection('');
      }
    }
  }, [isOpen, request?.id, request?.name, collections, mode]);

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
      // Determine if we're updating or creating new
      const isUpdate = mode === 'save' && request?.id;
      const newRequestId = isUpdate ? request.id : `req-${Date.now()}`;
      
      const savedRequest = {
        ...request,
        name: requestName,
        id: newRequestId,
      };
      
      await api.collections.addRequest(selectedCollection, savedRequest);
      
      // For "Save As", update the request context with new ID
      if (mode === 'saveas') {
        setRequest({ ...request, id: newRequestId, name: requestName });
        showToast('Request saved as new', 'success');
      } else {
        // For regular "Save", show appropriate message
        if (isUpdate) {
          showToast('Request updated successfully', 'success');
        } else {
          showToast('Request saved successfully', 'success');
          setRequest({ ...request, id: newRequestId, name: requestName });
        }
      }
      
      setRequestName('');
      setSelectedCollection('');
      onClose();
      // Refresh collections to show new/updated request
      onSaveComplete?.();
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
      onSaveComplete?.();
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
          <h2>{mode === 'saveas' ? 'Save Request As' : 'Save Request'}</h2>
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
          <button className="btn-primary" onClick={handleSave}>
            {mode === 'saveas' ? 'Save As' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
