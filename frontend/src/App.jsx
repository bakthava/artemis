import { useState, useRef } from 'react';
import './App.css';
import { RequestProvider } from './context/RequestContext';
import { ToastProvider } from './context/ToastContext';
import Header from './components/Header';
import EnvSelector from './components/EnvSelector';
import Sidebar from './components/Sidebar';
import RequestBuilder from './components/RequestBuilder';
import ResponseViewer from './components/ResponseViewer';
import SaveRequestModal from './components/SaveRequestModal';
import SettingsModal from './components/SettingsModal';
import Toast from './components/Toast';
import { useKeyboardShortcuts, useAutoSave, useLoadDraftRequest } from './hooks';
import { useRequest } from './context/RequestContext';
import './style.css';

function AppContent() {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const urlInputRef = useRef(null);
  const { request } = useRequest();
  const { draft } = useLoadDraftRequest();

  // Auto-save draft request
  useAutoSave(request, 1000);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    focusUrl: () => urlInputRef.current?.focus(),
    sendRequest: () => {
      // Find and click the send button (handled via ref in RequestBuilder)
      const sendBtn = document.querySelector('.send-button');
      sendBtn?.click();
    },
    saveRequest: () => setShowSaveModal(true),
  });

  // Load draft on startup
  // Note: This is handled by RequestContext via useEffect in the provider

  return (
    <>
      <Header onSave={() => setShowSaveModal(true)} onSettings={() => setShowSettingsModal(true)} />
      <EnvSelector />
      <div className="app-container">
        <Sidebar setResponse={setResponse} />
        <div className="main-content">
          <RequestBuilder 
            onResponse={setResponse}
            loading={loading}
            setLoading={setLoading}
            urlInputRef={urlInputRef}
          />
          <ResponseViewer response={response} loading={loading} />
        </div>
      </div>
      <SaveRequestModal 
        isOpen={showSaveModal} 
        onClose={() => setShowSaveModal(false)} 
      />
      <SettingsModal 
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />
      <Toast />
    </>
  );
}

function App() {
  return (
    <ToastProvider>
      <RequestProvider>
        <AppContent />
      </RequestProvider>
    </ToastProvider>
  );
}

export default App;

