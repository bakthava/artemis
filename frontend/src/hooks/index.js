import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const useCollections = () => {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.collections.getAll();
      setCollections(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createCollection = useCallback(async (name) => {
    try {
      const newCollection = await api.collections.create(name);
      setCollections([...collections, newCollection]);
      return newCollection;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [collections]);

  const deleteCollection = useCallback(async (id) => {
    try {
      await api.collections.delete(id);
      setCollections(collections.filter(c => c.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [collections]);

  const updateCollection = useCallback(async (collection) => {
    try {
      await api.collections.update(collection);
      setCollections(collections.map(c => c.id === collection.id ? collection : c));
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [collections]);

  const addRequest = useCallback(async (collectionId, request) => {
    try {
      await api.collections.addRequest(collectionId, request);
      await fetchCollections(); // Refresh to get updated requests
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchCollections]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  return {
    collections,
    loading,
    error,
    fetchCollections,
    createCollection,
    deleteCollection,
    updateCollection,
    addRequest,
  };
};

export const useEnvironments = () => {
  const [environments, setEnvironments] = useState([]);
  const [activeEnvironment, setActiveEnvironment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEnvironments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.environments.getAll();
      setEnvironments(data || []);
      const active = (data || []).find(env => env.active);
      setActiveEnvironment(active || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createEnvironment = useCallback(async (name) => {
    try {
      const newEnv = await api.environments.create(name);
      setEnvironments([...environments, newEnv]);
      return newEnv;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [environments]);

  const updateEnvironment = useCallback(async (environment) => {
    try {
      await api.environments.update(environment);
      setEnvironments(environments.map(e => e.id === environment.id ? environment : e));
      if (environment.active) {
        setActiveEnvironment(environment);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [environments]);

  const switchEnvironment = useCallback(async (id) => {
    try {
      await api.environments.setActive(id);
      const env = environments.find(e => e.id === id);
      if (env) {
        setActiveEnvironment(env);
        // Update all environments to reflect active status
        setEnvironments(environments.map(e => ({
          ...e,
          active: e.id === id
        })));
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [environments]);

  const deleteEnvironment = useCallback(async (id) => {
    try {
      await api.environments.delete(id);
      setEnvironments(environments.filter(e => e.id !== id));
      if (activeEnvironment?.id === id) {
        setActiveEnvironment(null);
      }
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [environments, activeEnvironment]);

  useEffect(() => {
    fetchEnvironments();
  }, [fetchEnvironments]);

  return {
    environments,
    activeEnvironment,
    loading,
    error,
    fetchEnvironments,
    createEnvironment,
    updateEnvironment,
    switchEnvironment,
    deleteEnvironment,
  };
};

export const useHistory = (limit = 50) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHistory = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.history.getRecent(limit, offset);
      setHistory(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const clearHistory = useCallback(async () => {
    try {
      await api.history.clear();
      setHistory([]);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    history,
    loading,
    error,
    fetchHistory,
    clearHistory,
  };
};

export const useAutoSave = (request, delayMs = 1000) => {
  useEffect(() => {
    if (!request || !request.url) return;

    const timer = setTimeout(() => {
      localStorage.setItem('artemis-draft-request', JSON.stringify(request));
    }, delayMs);

    return () => clearTimeout(timer);
  }, [request, delayMs]);
};

export const useLoadDraftRequest = () => {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('artemis-draft-request') || sessionStorage.getItem('artemis-draft-request');
      if (saved) {
        setDraft(JSON.parse(saved));
      }
    } catch (err) {
      // Ignore errors
    }
  }, []);

  const clearDraft = useCallback(() => {
    localStorage.removeItem('artemis-draft-request');
    sessionStorage.removeItem('artemis-draft-request');
    setDraft(null);
  }, []);

  return { draft, clearDraft };
};

export const useKeyboardShortcuts = (handlers = {}) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K: Focus URL input
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        handlers.focusUrl?.();
      }
      // Ctrl+Enter: Send request
      else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handlers.sendRequest?.();
      }
      // Ctrl+S: Save request
      else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handlers.saveRequest?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
};
