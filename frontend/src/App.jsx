import { useState, useRef } from 'react';
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
import { useKeyboardShortcuts, useAutoSave, useLoadDraftRequest } from './hooks';
import { useRequest } from './context/RequestContext';
import './style.css';

function AppContent() {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCertificateManager, setShowCertificateManager] = useState(false);
  const [showFlow, setShowFlow] = useState(false);
  const urlInputRef = useRef(null);
  const { request } = useRequest();
  const { refreshHistory, refreshCollections } = useAppContext();
  const { draft } = useLoadDraftRequest();

  // Auto-save draft request
  useAutoSave(request, 1000);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    focusUrl: () => urlInputRef.current?.focus(),
    sendRequest: () => {
      const sendBtn = document.querySelector('.send-button');
      sendBtn?.click();
    },
    saveRequest: () => setShowSaveModal(true),
  });

  return (
    <>
      <Header
        onSave={() => setShowSaveModal(true)}
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
          <div className="app-container">
            <Sidebar setResponse={setResponse} />
            <div className="main-content">
              <RequestBuilder
                onResponse={setResponse}
                loading={loading}
                setLoading={setLoading}
                urlInputRef={urlInputRef}
                onRequestComplete={refreshHistory}
              />
              <ResponseViewer response={response} loading={loading} />
            </div>
          </div>
        </>
      )}
      <SaveRequestModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSaveComplete={refreshCollections}
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

