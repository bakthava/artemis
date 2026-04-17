import React, { createContext, useReducer, useCallback, useEffect, useRef } from 'react';

export const RequestContext = createContext();

const initialState = {
  // Request Type
  requestType: 'HTTP',  // HTTP or GRPC
  selectedCertificateSetId: null,  // Global certificate set selector

  // HTTP Settings
  method: 'GET',
  url: '',
  headers: {},
  params: {},
  body: '',
  bodyType: 'json',
  auth: {
    type: 'none',
    username: '',
    password: '',
    token: '',
  },
  preScript: '',
  postScript: '',
  timeout: 30000,
  // Settings
  httpVersion: 'Auto',
  maxResponseSize: 50,
  verifySSL: true,
  enableSSLKeyLog: false,
  followRedirects: true,
  followOriginalMethod: false,
  followAuthHeader: false,
  removeRefererOnRedirect: false,
  strictHTTPParser: false,
  encodeURLAutomatically: true,
  disableCookieJar: false,
  useServerCipherSuite: false,
  maxRedirects: 10,
  disabledTLSProtocols: [],
  cipherSuites: [],
  logLevel: 'info',
  // Certificates
  certificateFile: null,
  keyFile: null,
  jksFile: null,
  jksPassword: '',

  // gRPC Settings
  grpcConfig: {
    service: '',
    method: '',
    protoPath: '',
    protoDirectory: '',
    messageFormat: 'JSON',  // JSON or BINARY
    metadata: {},
    callType: 'unary',  // unary, server_stream, client_stream, bidirectional_stream
    useTLS: false,
    useServerCipherSuite: false,
    disabledTLSProtocols: [],
    cipherSuites: [],
    certificateFile: null,
    keyFile: null,
    caCertFile: null,
    protoContent: '',
  },
};

const requestReducer = (state, action) => {
  switch (action.type) {
    case 'SET_REQUEST_TYPE':
      return { ...state, requestType: action.payload };
    case 'SET_CERTIFICATE_SET_ID':
      return { ...state, selectedCertificateSetId: action.payload };
    case 'SET_METHOD':
      return { ...state, method: action.payload };
    case 'SET_URL':
      return { ...state, url: action.payload };
    case 'SET_HEADERS':
      return { ...state, headers: action.payload };
    case 'SET_PARAMS':
      return { ...state, params: action.payload };
    case 'SET_BODY':
      return { ...state, body: action.payload };
    case 'SET_BODY_TYPE':
      return { ...state, bodyType: action.payload };
    case 'SET_AUTH':
      return { ...state, auth: action.payload };
    case 'SET_PRE_SCRIPT':
      return { ...state, preScript: action.payload };
    case 'SET_POST_SCRIPT':
      return { ...state, postScript: action.payload };
    case 'SET_TIMEOUT':
      return { ...state, timeout: action.payload };
    case 'SET_GRPC_CONFIG':
      return { ...state, grpcConfig: { ...state.grpcConfig, ...action.payload } };
    case 'SET_REQUEST':
      return { ...state, ...action.payload };
    case 'LOAD_REQUEST':
      return action.payload;
    case 'RESET':
      return initialState;
    default:
      return state;
  }
};

export const RequestProvider = ({ children }) => {
  const [state, dispatch] = useReducer(requestReducer, initialState);
  const hasHydratedRef = useRef(false);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('artemis-draft-request') || sessionStorage.getItem('artemis-draft-request');
      const savedCertificateSetId = localStorage.getItem('artemis-selected-certificate-set-id');

      if (!saved) {
        if (savedCertificateSetId) {
          dispatch({ type: 'SET_CERTIFICATE_SET_ID', payload: savedCertificateSetId });
        }
        hasHydratedRef.current = true;
        return;
      }

      const parsed = JSON.parse(saved);
      dispatch({
        type: 'LOAD_REQUEST',
        payload: {
          ...initialState,
          ...parsed,
          headers: parsed.headers || {},
          params: parsed.params || parsed.queryParams || {},
          auth: parsed.auth || initialState.auth,
          disabledTLSProtocols: parsed.disabledTLSProtocols || [],
          cipherSuites: parsed.cipherSuites || [],
          logLevel: parsed.logLevel || 'info',
          selectedCertificateSetId: parsed.selectedCertificateSetId || savedCertificateSetId || null,
        },
      });
    } catch (err) {
      // Ignore invalid draft payloads.
    } finally {
      hasHydratedRef.current = true;
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (!hasHydratedRef.current) {
      return;
    }

    try {
      localStorage.setItem('artemis-draft-request', JSON.stringify(state));
      if (state.selectedCertificateSetId) {
        localStorage.setItem('artemis-selected-certificate-set-id', state.selectedCertificateSetId);
      } else {
        localStorage.removeItem('artemis-selected-certificate-set-id');
      }
    } catch (err) {
      console.warn('Failed to save draft request to localStorage:', err);
    }
  }, [state]);

  // Self-heal selected certificate set if another state load path clears it.
  useEffect(() => {
    if (!hasHydratedRef.current || state.selectedCertificateSetId) {
      return;
    }

    try {
      const savedCertificateSetId = localStorage.getItem('artemis-selected-certificate-set-id');
      if (savedCertificateSetId) {
        dispatch({ type: 'SET_CERTIFICATE_SET_ID', payload: savedCertificateSetId });
      }
    } catch (err) {
      // Non-blocking storage fallback.
    }
  }, [state.selectedCertificateSetId]);

  const setMethod = useCallback((method) => {
    dispatch({ type: 'SET_METHOD', payload: method });
  }, []);

  const setUrl = useCallback((url) => {
    dispatch({ type: 'SET_URL', payload: url });
  }, []);

  const setHeaders = useCallback((headers) => {
    dispatch({ type: 'SET_HEADERS', payload: headers });
  }, []);

  const setParams = useCallback((params) => {
    dispatch({ type: 'SET_PARAMS', payload: params });
  }, []);

  const setBody = useCallback((body) => {
    dispatch({ type: 'SET_BODY', payload: body });
  }, []);

  const setBodyType = useCallback((bodyType) => {
    dispatch({ type: 'SET_BODY_TYPE', payload: bodyType });
  }, []);

  const setAuth = useCallback((auth) => {
    dispatch({ type: 'SET_AUTH', payload: auth });
  }, []);

  const setPreScript = useCallback((script) => {
    dispatch({ type: 'SET_PRE_SCRIPT', payload: script });
  }, []);

  const setPostScript = useCallback((script) => {
    dispatch({ type: 'SET_POST_SCRIPT', payload: script });
  }, []);

  const setTimeout = useCallback((timeout) => {
    dispatch({ type: 'SET_TIMEOUT', payload: timeout });
  }, []);

  const setRequestType = useCallback((type) => {
    dispatch({ type: 'SET_REQUEST_TYPE', payload: type });
  }, []);

  const setCertificateSetId = useCallback((id) => {
    try {
      if (id) {
        localStorage.setItem('artemis-selected-certificate-set-id', id);
      } else {
        localStorage.removeItem('artemis-selected-certificate-set-id');
      }
    } catch (err) {
      // Non-blocking storage fallback.
    }
    dispatch({ type: 'SET_CERTIFICATE_SET_ID', payload: id });
  }, []);

  const setGRPCConfig = useCallback((config) => {
    dispatch({ type: 'SET_GRPC_CONFIG', payload: config });
  }, []);

  const loadRequest = useCallback((request) => {
    const selectedCertificateSetId = request.selectedCertificateSetId || state.selectedCertificateSetId || null;

    dispatch({ 
      type: 'LOAD_REQUEST', 
      payload: {
        ...initialState,
        selectedCertificateSetId,
        requestType: request.type || 'HTTP',
        method: request.method || 'GET',
        url: request.url || '',
        headers: request.headers || {},
        params: request.queryParams || {},
        body: request.body || '',
        bodyType: request.bodyType || 'json',
        auth: request.auth || { type: 'none', username: '', password: '', token: '' },
        preScript: request.preScript || '',
        postScript: request.postScript || '',
        timeout: request.timeout || 30,
        httpVersion: request.httpVersion || 'Auto',
        verifySSL: request.verifySSL !== false,
        followRedirects: request.followRedirects !== false,
        followOriginalMethod: request.followOriginalMethod || false,
        followAuthHeader: request.followAuthHeader || false,
        removeRefererOnRedirect: request.removeRefererOnRedirect || false,
        strictHTTPParser: request.strictHTTPParser || false,
        encodeURLAutomatically: request.encodeURLAutomatically !== false,
        disableCookieJar: request.disableCookieJar || false,
        useServerCipherSuite: request.useServerCipherSuite || false,
        maxRedirects: request.maxRedirects || 10,
        disabledTLSProtocols: request.disabledTLSProtocols || [],
        cipherSuites: request.cipherSuites || [],
        logLevel: request.logLevel || 'info',
        grpcConfig: request.grpcConfig || initialState.grpcConfig,
      }
    });
  }, [state.selectedCertificateSetId]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const setRequest = useCallback((request) => {
    dispatch({ type: 'SET_REQUEST', payload: request });
  }, []);

  const value = {
    request: state,
    setRequestType,
    setCertificateSetId,
    setMethod,
    setUrl,
    setHeaders,
    setParams,
    setBody,
    setBodyType,
    setAuth,
    setPreScript,
    setPostScript,
    setTimeout,
    setGRPCConfig,
    setRequest,
    loadRequest,
    reset,
  };

  return (
    <RequestContext.Provider value={value}>
      {children}
    </RequestContext.Provider>
  );
};

export const useRequest = () => {
  const context = React.useContext(RequestContext);
  if (!context) {
    throw new Error('useRequest must be used within a RequestProvider');
  }
  return context;
};
