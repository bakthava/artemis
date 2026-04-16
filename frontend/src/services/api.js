// HTTP API wrapper for Artemis web server
// Use window.location.origin to dynamically get the API base URL
// This allows the port to be configurable via config.json
const API_BASE = `${window.location.origin}/api`;

const api = {
  request: {
    execute: async (request) => {
      try {
        const response = await fetch(`${API_BASE}/request/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const message = payload?.error?.message || `HTTP ${response.status}`;
          const err = new Error(message);
          if (payload?.error?.response) {
            err.response = payload.error.response;
          }
          throw err;
        }

        return payload;
      } catch (err) {
        if (err?.response) {
          throw err;
        }
        throw new Error(`Failed to execute request: ${err.message}`);
      }
    },

    executeGRPC: async (request) => {
      try {
        const response = await fetch(`${API_BASE}/request/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          const message = payload?.error?.message || `gRPC ${response.status}`;
          const err = new Error(message);
          if (payload?.error?.response) {
            err.response = payload.error.response;
          }
          throw err;
        }

        return payload;
      } catch (err) {
        if (err?.response) {
          throw err;
        }
        throw new Error(`Failed to execute gRPC request: ${err.message}`);
      }
    },
  },

  collections: {
    create: async (name) => {
      try {
        const response = await fetch(`${API_BASE}/collections`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to create collection: ${err.message}`);
      }
    },

    getAll: async () => {
      try {
        const response = await fetch(`${API_BASE}/collections`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to fetch collections: ${err.message}`);
      }
    },

    getById: async (id) => {
      try {
        const response = await fetch(`${API_BASE}/collections/${id}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to fetch collection: ${err.message}`);
      }
    },

    update: async (collection) => {
      try {
        const response = await fetch(`${API_BASE}/collections/${collection.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: collection.name }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to update collection: ${err.message}`);
      }
    },

    delete: async (id) => {
      try {
        const response = await fetch(`${API_BASE}/collections/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        throw new Error(`Failed to delete collection: ${err.message}`);
      }
    },

    addRequest: async (collectionId, request) => {
      try {
        const response = await fetch(`${API_BASE}/collections/${collectionId}/requests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        throw new Error(`Failed to add request: ${err.message}`);
      }
    },
  },

  environments: {
    create: async (name) => {
      try {
        const response = await fetch(`${API_BASE}/environments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to create environment: ${err.message}`);
      }
    },

    getAll: async () => {
      try {
        const response = await fetch(`${API_BASE}/environments`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to fetch environments: ${err.message}`);
      }
    },

    update: async (environment) => {
      try {
        const response = await fetch(`${API_BASE}/environments/${environment.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variables: environment.variables }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to update environment: ${err.message}`);
      }
    },

    delete: async (id) => {
      try {
        const response = await fetch(`${API_BASE}/environments/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        throw new Error(`Failed to delete environment: ${err.message}`);
      }
    },

    setActive: async (id) => {
      try {
        const response = await fetch(`${API_BASE}/environments/${id}/active`, {
          method: 'POST',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        throw new Error(`Failed to set active environment: ${err.message}`);
      }
    },
  },

  history: {
    getRecent: async (limit = 50, offset = 0) => {
      try {
        const response = await fetch(`${API_BASE}/history`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to fetch history: ${err.message}`);
      }
    },

    clear: async () => {
      try {
        const response = await fetch(`${API_BASE}/history`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        throw new Error(`Failed to clear history: ${err.message}`);
      }
    },
  },

  flows: {
    getAll: async (options = {}) => {
      try {
        const params = new URLSearchParams();
        if (options.name) params.set('name', options.name);
        if (options.sort) params.set('sort', options.sort);
        if (Number.isFinite(options.limit)) params.set('limit', String(options.limit));
        if (Number.isFinite(options.offset)) params.set('offset', String(options.offset));
        const qs = params.toString();
        const response = await fetch(`${API_BASE}/flows${qs ? `?${qs}` : ''}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to fetch flows: ${err.message}`);
      }
    },

    create: async (flow) => {
      try {
        const response = await fetch(`${API_BASE}/flows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flow),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to create flow: ${err.message}`);
      }
    },

    update: async (flow) => {
      try {
        const response = await fetch(`${API_BASE}/flows/${flow.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(flow),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to update flow: ${err.message}`);
      }
    },

    delete: async (id) => {
      try {
        const response = await fetch(`${API_BASE}/flows/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (err) {
        throw new Error(`Failed to delete flow: ${err.message}`);
      }
    },

    export: async (id) => {
      try {
        const response = await fetch(`${API_BASE}/flows/${id}/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to export flow: ${err.message}`);
      }
    },
  },

  grpc: {
    getAvailableServices: async () => {
      try {
        const response = await fetch(`${API_BASE}/grpc/services`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        console.error('Failed to get gRPC services:', err);
        return {};
      }
    },

    uploadProtoFile: async (filename, content) => {
      try {
        const response = await fetch(`${API_BASE}/grpc/proto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, content }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to upload proto file: ${err.message}`);
      }
    },

    listProtoFiles: async () => {
      try {
        const response = await fetch(`${API_BASE}/grpc/proto`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        console.error('Failed to list proto files:', err);
        return [];
      }
    },

    deleteProtoFile: async (filename) => {
      try {
        const response = await fetch(`${API_BASE}/grpc/proto/${encodeURIComponent(filename)}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to delete proto file: ${err.message}`);
      }
    },

    loadProtoFilesFromDirectory: async (dirPath) => {
      try {
        const response = await fetch(`${API_BASE}/grpc/proto-dir?path=${encodeURIComponent(dirPath)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        throw new Error(`Failed to load proto files from directory: ${err.message}`);
      }
    },

    getProtoDirectory: async () => {
      try {
        const response = await fetch(`${API_BASE}/grpc/proto-dir`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (err) {
        console.error('Failed to get proto directory:', err);
        return '';
      }
    },
  },
};

export default api;
