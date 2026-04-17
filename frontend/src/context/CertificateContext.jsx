import React, { createContext, useReducer, useCallback, useEffect } from 'react';
import api from '../services/api';

export const CertificateContext = createContext();

const initialState = {
  certificates: [],
  certificateSets: [],
  loading: false,
  error: null,
};

const certificateReducer = (state, action) => {
  switch (action.type) {
    case 'SET_CERTIFICATES':
      return { ...state, certificates: action.payload };
    case 'ADD_CERTIFICATE':
      return { ...state, certificates: [...state.certificates, action.payload] };
    case 'REMOVE_CERTIFICATE':
      return {
        ...state,
        certificates: state.certificates.filter(c => c.id !== action.payload),
      };
    case 'SET_CERTIFICATE_SETS':
      return { ...state, certificateSets: action.payload };
    case 'ADD_CERTIFICATE_SET':
      return { ...state, certificateSets: [...state.certificateSets, action.payload] };
    case 'UPDATE_CERTIFICATE_SET':
      return {
        ...state,
        certificateSets: state.certificateSets.map(s =>
          s.id === action.payload.id ? action.payload : s
        ),
      };
    case 'REMOVE_CERTIFICATE_SET':
      return {
        ...state,
        certificateSets: state.certificateSets.filter(s => s.id !== action.payload),
      };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    default:
      return state;
  }
};

export const CertificateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(certificateReducer, initialState);

  useEffect(() => {
    const loadInitialCertificates = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });

        const [certificates, certificateSets] = await Promise.all([
          api.certificates.list(),
          api.certificates.listSets(),
        ]);

        dispatch({ type: 'SET_CERTIFICATES', payload: certificates || [] });
        dispatch({ type: 'SET_CERTIFICATE_SETS', payload: certificateSets || [] });
        dispatch({ type: 'SET_ERROR', payload: null });
      } catch (error) {
        dispatch({ type: 'SET_ERROR', payload: error.message || 'Failed to load certificates' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    loadInitialCertificates();
  }, []);

  const setCertificates = useCallback((certificates) => {
    dispatch({ type: 'SET_CERTIFICATES', payload: certificates });
  }, []);

  const addCertificate = useCallback((certificate) => {
    dispatch({ type: 'ADD_CERTIFICATE', payload: certificate });
  }, []);

  const removeCertificate = useCallback((id) => {
    dispatch({ type: 'REMOVE_CERTIFICATE', payload: id });
  }, []);

  const setCertificateSets = useCallback((sets) => {
    dispatch({ type: 'SET_CERTIFICATE_SETS', payload: sets });
  }, []);

  const addCertificateSet = useCallback((set) => {
    dispatch({ type: 'ADD_CERTIFICATE_SET', payload: set });
  }, []);

  const updateCertificateSet = useCallback((set) => {
    dispatch({ type: 'UPDATE_CERTIFICATE_SET', payload: set });
  }, []);

  const removeCertificateSet = useCallback((id) => {
    dispatch({ type: 'REMOVE_CERTIFICATE_SET', payload: id });
  }, []);

  const setLoading = useCallback((loading) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, []);

  const setError = useCallback((error) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const value = {
    ...state,
    setCertificates,
    addCertificate,
    removeCertificate,
    setCertificateSets,
    addCertificateSet,
    updateCertificateSet,
    removeCertificateSet,
    setLoading,
    setError,
  };

  return (
    <CertificateContext.Provider value={value}>
      {children}
    </CertificateContext.Provider>
  );
};

export const useCertificates = () => {
  const context = React.useContext(CertificateContext);
  if (!context) {
    throw new Error('useCertificates must be used within CertificateProvider');
  }
  return context;
};
