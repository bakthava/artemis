import React, { useState, useEffect, useRef } from 'react';

function Header({ onSave, onSaveAs, onSettings, onFlow, onCertificates, flowActive }) {
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

  return (
    <div className="header">
      <div className="header-logo">ARTEMIS</div>
      <div className="header-title">HTTP Client</div>
      <div className="header-buttons">
        <button className="header-button" onClick={onSave} title="Save request (Ctrl+S)">
          💾 Save
        </button>
        <button className="header-button" onClick={onSaveAs} title="Save as new request">
          💾+ Save As
        </button>
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
