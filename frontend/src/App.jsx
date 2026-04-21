import { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';
import { RequestProvider } from './context/RequestContext';
import { ToastProvider } from './context/ToastContext';
import { CertificateProvider } from './context/CertificateContext';
import { AppProvider, useAppContext } from './context/AppContext';
import Header from './components/Header';
import EnvSelector from './components/EnvSelector';
import Sidebar from './components/Sidebar';
import RequestBuilder from './components/RequestBuilder';
import ResponseViewer from './components/ResponseViewer';
import SaveRequestModal from './components/SaveRequestModal';
import SettingsModal from './components/SettingsModal';
import CertificateManager from './components/CertificateManager';
import FlowBuilder from './components/FlowBuilder';
import Toast from './components/Toast';
import { useKeyboardShortcuts, useAutoSave, useLoadDraftRequest, useCollections, useEnvironments } from './hooks';
import { useRequest } from './context/RequestContext';
import { useToast } from './context/ToastContext';
import api from './services/api';
import './style.css';

function AppContent() {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveMode, setSaveMode] = useState('save'); // 'save' or 'saveas'
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCertificateManager, setShowCertificateManager] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [requestPaneHeight, setRequestPaneHeight] = useState(380);
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth <= 768);
  const urlInputRef = useRef(null);
  const appContainerRef = useRef(null);
  const mainContentRef = useRef(null);
  const { request } = useRequest();
  const { refreshHistory, refreshCollections } = useAppContext();
  const { draft } = useLoadDraftRequest();
  const { fetchEnvironments } = useEnvironments();
  const { collections, fetchCollections } = useCollections();
  const { showToast } = useToast();

  // Direct save handler - saves without showing modal if request is already saved
  const handleDirectSave = useCallback(async () => {
    // Check if request has an ID and exists in a collection
    if (!request?.id) {
      // No ID means it's a new request - show modal
      setSaveMode('saveas');
      setShowSaveModal(true);
      return;
    }

    try {
      // Prefer explicit collectionId when available, then fallback by request id lookup.
      let matchedCollection = null;

      if (request.collectionId) {
        matchedCollection = (collections || []).find(col => col.id === request.collectionId) || null;
      }

      if (!matchedCollection) {
        matchedCollection = (collections || []).find(col =>
          (col.requests || []).some(savedReq => savedReq?.id === request.id)
        ) || null;
      }

      // If local state is stale, retry lookup from latest API data before showing modal.
      if (!matchedCollection) {
        const latestCollections = await api.collections.getAll();
        if (request.collectionId) {
          matchedCollection = (latestCollections || []).find(col => col.id === request.collectionId) || null;
        }
        if (!matchedCollection) {
          matchedCollection = (latestCollections || []).find(col =>
            (col.requests || []).some(savedReq => savedReq?.id === request.id)
          ) || null;
        }
      }

      if (!matchedCollection) {
        setSaveMode('saveas');
        setShowSaveModal(true);
        return;
      }

      const updatedRequest = {
        ...request,
        id: request.id,
      };
      await api.collections.addRequest(matchedCollection.id, updatedRequest);
      showToast('Request saved', 'success');
      refreshCollections();
    } catch (err) {
      showToast(`Error saving request: ${err.message}`, 'error');
    }
  }, [request, collections, showToast, refreshCollections]);

  const downloadJSON = useCallback((data, fileName) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const readJSONFile = useCallback((file) => {
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
  }, []);

  const handleExportEnvironments = useCallback(async () => {
    try {
      const payload = await api.environments.export();
      downloadJSON(payload, `environments-${Date.now()}.json`);
      showToast('Environments exported', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [downloadJSON, showToast]);

  const handleImportEnvironments = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = await readJSONFile(file);
      await api.environments.import(payload);
      await fetchEnvironments();
      showToast('Environments imported', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      e.target.value = '';
    }
  }, [readJSONFile, fetchEnvironments, showToast]);

  const handleExportProject = useCallback(async () => {
    try {
      const payload = await api.project.export();
      downloadJSON(payload, `project-${Date.now()}.json`);
      showToast('Project exported', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }, [downloadJSON, showToast]);

  const handleImportProject = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = await readJSONFile(file);
      await api.project.import(payload);
      await Promise.all([fetchCollections(), fetchEnvironments()]);
      showToast('Project imported', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      e.target.value = '';
    }
  }, [readJSONFile, fetchCollections, fetchEnvironments, showToast]);

  // Auto-save draft request
  useAutoSave(request, 1000);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startSidebarResize = useCallback((e) => {
    if (isNarrow) return;
    e.preventDefault();
    const containerRect = appContainerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const onMove = (moveEvent) => {
      const relativeX = moveEvent.clientX - containerRect.left;
      const nextWidth = Math.max(200, Math.min(520, relativeX));
      setSidebarWidth(nextWidth);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing-panels');
    };

    document.body.classList.add('is-resizing-panels');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [isNarrow]);

  const startHorizontalResize = useCallback((e) => {
    if (isNarrow) return;
    e.preventDefault();
    const mainRect = mainContentRef.current?.getBoundingClientRect();
    if (!mainRect) return;

    const onMove = (moveEvent) => {
      const relativeY = moveEvent.clientY - mainRect.top;
      const nextHeight = Math.max(220, Math.min(mainRect.height - 220, relativeY));
      setRequestPaneHeight(nextHeight);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('is-resizing-panels');
    };

    document.body.classList.add('is-resizing-panels');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [isNarrow]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    focusUrl: () => urlInputRef.current?.focus(),
    sendRequest: () => {
      const sendBtn = document.querySelector('.send-button');
      sendBtn?.click();
    },
    saveRequest: () => handleDirectSave(),
  });

  return (
    <>
      <Header
        onSave={handleDirectSave}
        onSaveAs={() => {
          setSaveMode('saveas');
          setShowSaveModal(true);
        }}
        onSettings={() => setShowSettingsModal(true)}
        onCertificates={() => setShowCertificateManager(true)}
        onFlow={() => setShowFlow(v => !v)}
        flowActive={showFlow}
      />
      {showFlow ? (
        <div className="flow-view">
          <FlowBuilder onClose={() => setShowFlow(false)} />
        </div>
      ) : (
        <>
          <EnvSelector />
          <div className="app-container" ref={appContainerRef}>
            <div
              className="app-sidebar-pane"
              style={isNarrow ? undefined : { width: `${sidebarWidth}px` }}
            >
              <Sidebar setResponse={setResponse} />
            </div>
            <div
              className="panel-resizer panel-resizer-vertical"
              onMouseDown={startSidebarResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize side panel"
            />

            <div className="main-content" ref={mainContentRef}>
              <div
                className="request-pane"
                style={isNarrow ? undefined : { height: `${requestPaneHeight}px` }}
              >
                <RequestBuilder
                  onResponse={setResponse}
                  loading={loading}
                  setLoading={setLoading}
                  urlInputRef={urlInputRef}
                  onRequestComplete={refreshHistory}
                />
              </div>

              <div
                className="panel-resizer panel-resizer-horizontal"
                onMouseDown={startHorizontalResize}
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize request and response panels"
              />

              <div className="response-pane">
                <ResponseViewer response={response} loading={loading} />
              </div>
            </div>
          </div>
        </>
      )}
      <SaveRequestModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSaveComplete={refreshCollections}
        mode={saveMode}
      />
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
      <CertificateManager
        isOpen={showCertificateManager}
        onClose={() => setShowCertificateManager(false)}
      />
      <Toast />
    </>
  );
}

function App() {
  return (
    <ToastProvider>
      <CertificateProvider>
        <RequestProvider>
          <AppProvider>
            <AppContent />
          </AppProvider>
        </RequestProvider>
      </CertificateProvider>
    </ToastProvider>
  );
}

export default App;

