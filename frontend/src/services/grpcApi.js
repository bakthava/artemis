/**
 * gRPC API Service
 * Handles all gRPC-related API calls to the backend
 */

const API_BASE = window.location.origin;

export const grpcApi = {
  /**
   * Get all available gRPC services from uploaded proto files
   */
  getAvailableServices: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/grpc/services`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to get available gRPC services:', error);
      throw error;
    }
  },

  /**
   * Upload a proto file
   * @param {string} filename - Name of the proto file
   * @param {string} content - Content of the proto file
   */
  uploadProtoFile: async (filename, content) => {
    try {
      const response = await fetch(`${API_BASE}/api/grpc/proto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename, content }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to upload proto file:', error);
      throw error;
    }
  },

  /**
   * List all uploaded proto files
   */
  listProtoFiles: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/grpc/proto`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to list proto files:', error);
      throw error;
    }
  },

  /**
   * Delete a proto file
   * @param {string} filename - Name of the proto file to delete
   */
  deleteProtoFile: async (filename) => {
    try {
      const response = await fetch(`${API_BASE}/api/grpc/proto/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to delete proto file:', error);
      throw error;
    }
  },

  /**
   * Load proto files from a directory
   * @param {string} dirPath - Directory path to scan for proto files
   */
  loadProtoFilesFromDirectory: async (dirPath) => {
    try {
      const response = await fetch(`${API_BASE}/api/grpc/proto-dir?path=${encodeURIComponent(dirPath)}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to load proto files from directory:', error);
      throw error;
    }
  },

  /**
   * Execute a gRPC request
   * @param {Object} request - The gRPC request object
   */
  executeGRPCRequest: async (request) => {
    try {
      const response = await fetch(`${API_BASE}/api/grpc/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to execute gRPC request:', error);
      throw error;
    }
  },

  /**
   * Get the proto directory path where uploaded files are stored
   */
  getProtoDirectory: async () => {
    try {
      const response = await fetch(`${API_BASE}/api/grpc/proto-dir`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('Failed to get proto directory:', error);
      throw error;
    }
  },

  /**
   * Call app methods directly using Wails bridge
   * These are alternatives if API endpoints are not available
   */
  wails: {
    getAvailableServices: () => {
      return window.go?.main?.App?.GetAvailableGRPCServices?.();
    },
    uploadProtoFile: (filename, content) => {
      return window.go?.main?.App?.UploadProtoFile?.(filename, content);
    },
    listProtoFiles: () => {
      return window.go?.main?.App?.ListProtoFiles?.();
    },
    deleteProtoFile: (filename) => {
      return window.go?.main?.App?.DeleteProtoFile?.(filename);
    },
    loadProtoFilesFromDirectory: (dirPath) => {
      return window.go?.main?.App?.LoadProtoFilesFromDirectory?.(dirPath);
    },
    executeRequest: (request) => {
      return window.go?.main?.App?.ExecuteRequest?.(request);
    },
    getProtoDirectory: () => {
      return window.go?.main?.App?.GetProtoDirectory?.();
    },
  },
};

export default grpcApi;
