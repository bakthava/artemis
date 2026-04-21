import React, { useState } from 'react';
import { useRequest } from '../context/RequestContext';

function CollectionTree({ collections, setResponse, onDeleteCollection }) {
  const { loadRequest } = useRequest();
  const [expandedCollections, setExpandedCollections] = useState({});

  const toggleExpanded = (collectionId) => {
    setExpandedCollections(prev => ({
      ...prev,
      [collectionId]: !prev[collectionId]
    }));
  };

  const handleRequestClick = (request, collectionId) => {
    loadRequest({ ...request, collectionId });
    setResponse(null); // Clear previous response
  };

  return (
    <div>
      {collections && collections.length > 0 ? (
        collections.map((collection) => (
          <div key={collection.id} style={{ marginBottom: '4px' }}>
            <div
              className="sidebar-item"
              onClick={() => toggleExpanded(collection.id)}
              style={{ cursor: 'pointer', fontWeight: '500', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span>
                {expandedCollections[collection.id] ? '▼' : '▶'} {collection.name}
              </span>
              {onDeleteCollection && (
                <button
                  className="sidebar-add-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteCollection(collection.id, collection.name);
                  }}
                  title="Delete collection"
                  style={{ padding: '2px 6px', fontSize: '11px' }}
                >
                  ✕
                </button>
              )}
            </div>

            {expandedCollections[collection.id] && collection.requests && (
              <div style={{ paddingLeft: '16px' }}>
                {collection.requests.length > 0 ? (
                  collection.requests.map((request) => (
                    <div
                      key={request.id}
                      className="sidebar-item"
                      onClick={() => handleRequestClick(request, collection.id)}
                      style={{
                        cursor: 'pointer',
                        fontSize: '11px',
                        paddingLeft: '8px',
                        backgroundColor: 'var(--bg-tertiary)',
                      }}
                    >
                      <span>{request.method}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                        {request.name}
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ padding: '4px 8px', color: 'var(--text-secondary)', fontSize: '11px' }}>
                    No requests
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      ) : (
        <div style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '12px' }}>
          No collections created
        </div>
      )}
    </div>
  );
}

export default CollectionTree;
