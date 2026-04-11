import React from 'react';

function Header({ onSave, onSettings }) {
  return (
    <div className="header">
      <div className="header-logo">HTTPx</div>
      <div className="header-title">Modern HTTP Client</div>
      <div className="header-buttons">
        <button className="header-button" onClick={onSave} title="Save request (Ctrl+S)">
          💾 Save
        </button>
        <button className="header-button" onClick={onSettings} title="Request settings">
          ⚙️ Settings
        </button>
      </div>
    </div>
  );
}

export default Header;
