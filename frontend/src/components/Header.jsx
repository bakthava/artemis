import React, { useState, useEffect, useRef } from 'react';

function Header({ onSave, onSettings, onFlow, onCertificates, flowActive, onExportEnv, onImportEnv, onExportProject, onImportProject }) {
  const [isDark, setIsDark] = useState(() =>
    localStorage.getItem('artemis-theme') === 'dark'
  );

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('artemis-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('artemis-theme', 'light');
    }
  }, [isDark]);

  const envImportRef = useRef(null);
  const projectImportRef = useRef(null);

  return (
    <div className="header">
      <div className="header-logo">ARTEMIS</div>
      <div className="header-title">HTTP Client</div>
      <div className="header-buttons">
        <button className="header-button" onClick={onSave} title="Save request (Ctrl+S)">
          💾 Save
        </button>
        <button className="header-button" onClick={onExportEnv} title="Export environments">
          Export Env
        </button>
        <button className="header-button" onClick={() => envImportRef.current?.click()} title="Import environments">
          Import Env
        </button>
        <button className="header-button" onClick={onExportProject} title="Export full project">
          Export Project
        </button>
        <button className="header-button" onClick={() => projectImportRef.current?.click()} title="Import full project">
          Import Project
        </button>
        <input
          ref={envImportRef}
          type="file"
          accept="application/json,.json"
          onChange={onImportEnv}
          style={{ display: 'none' }}
        />
        <input
          ref={projectImportRef}
          type="file"
          accept="application/json,.json"
          onChange={onImportProject}
          style={{ display: 'none' }}
        />
        <button
          className={`header-button flow-header-btn${flowActive ? ' active' : ''}`}
          onClick={onFlow}
          title="Open Flow Builder"
        >
          ⚡ Flow
        </button>
        <button className="header-button" onClick={onCertificates} title="Manage certificates">
          🔐 Certificates
        </button>
        <button
          className="theme-toggle-btn"
          onClick={() => setIsDark(prev => !prev)}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
        <button className="header-button" onClick={onSettings} title="Request settings">
          ⚙️ Settings
        </button>
      </div>
    </div>
  );
}

export default Header;
