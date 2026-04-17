import React from 'react';
import { useCertificates } from '../context/CertificateContext';
import './CertificateSelector.css';

function CertificateSelector({ selectedSetId, onSelect }) {
  const { certificateSets } = useCertificates();

  return (
    <div className="certificate-selector">
      <label>Certificate Set:</label>
      <select
        value={selectedSetId || ''}
        onChange={(e) => onSelect(e.target.value || null)}
        title="Select a certificate set for this request (optional)"
      >
        <option value="">No Certificate</option>
        {certificateSets.map(set => (
          <option key={set.id} value={set.id}>
            {set.name}
            {set.description && ` - ${set.description}`}
          </option>
        ))}
      </select>
    </div>
  );
}

export default CertificateSelector;
