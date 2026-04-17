import React, { useState, useRef, useEffect } from 'react';
import { useCertificates } from '../context/CertificateContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import './CertificateManager.css';

const API_BASE = `${window.location.origin}/api`;

function CertificateManager({ isOpen, onClose }) {
  const { 
    certificates, 
    certificateSets, 
    setCertificates, 
    setCertificateSets, 
    addCertificate, 
    addCertificateSet,
    removeCertificate,
    removeCertificateSet,
  } = useCertificates();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('upload');
  const fileInputRef = useRef(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadType, setUploadType] = useState('certificate');
  const [uploadTags, setUploadTags] = useState('');
  const [setName, setSetName] = useState('');
  const [setDescription, setSetDescription] = useState('');
  const [selectedCertId, setSelectedCertId] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [selectedCACertId, setSelectedCACertId] = useState('');
  const [selectedJksId, setSelectedJksId] = useState('');
  const [jksPassword, setJksPassword] = useState('');
  const [jksValidationStatus, setJksValidationStatus] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null);

  // Load certificates and certificate sets on mount
  useEffect(() => {
    if (isOpen) {
      loadCertificates();
      loadCertificateSets();
    }
  }, [isOpen]);

  const loadCertificates = async () => {
    try {
      const response = await fetch(`${API_BASE}/certificates`);
      if (response.ok) {
        const data = await response.json();
        setCertificates(data || []);
      }
    } catch (error) {
      showToast(`Failed to load certificates: ${error.message}`, 'error');
    }
  };

  const loadCertificateSets = async () => {
    try {
      const response = await fetch(`${API_BASE}/certificate-sets`);
      if (response.ok) {
        const data = await response.json();
        setCertificateSets(data || []);
      }
    } catch (error) {
      showToast(`Failed to load certificate sets: ${error.message}`, 'error');
    }
  };

  const validateCertificate = (fileContent, type) => {
    // fileContent is now an ArrayBuffer
    if (fileContent.byteLength === 0) {
      return { valid: false, error: 'File is empty' };
    }
    
    if (type === 'jks') {
      // JKS files are binary, no additional validation needed
      return { valid: true };
    }
    
    // For PEM files, try to detect BEGIN/END markers
    try {
      const uint8Array = new Uint8Array(fileContent);
      const textDecoder = new TextDecoder('utf-8', { fatal: false });
      const text = textDecoder.decode(uint8Array);
      
      if (!text.includes('-----BEGIN') || !text.includes('-----END')) {
        return { 
          valid: false, 
          error: 'Invalid certificate format. Must be PEM format with BEGIN/END markers.' 
        };
      }
      return { valid: true };
    } catch (err) {
      // If can't decode as text, it might be binary - let backend validate
      return { valid: true };
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result;
          
          // Store ArrayBuffer, we'll encode it properly in handleSaveAndTest
          setSelectedFile(file);
          setFileContent(arrayBuffer); // Store as ArrayBuffer
          setValidationStatus(null);

          // Auto-fill name if empty
          if (!uploadName) {
            setUploadName(file.name.replace(/\.[^.]+$/, ''));
          }

          showToast(`File "${file.name}" selected. Click "Save & Test" to validate and upload.`, 'info');
        } catch (error) {
          showToast(`Failed to process file: ${error.message}`, 'error');
          setSelectedFile(null);
          setFileContent('');
        }
      };
      
      reader.onerror = () => {
        showToast(`Failed to read file: ${reader.error}`, 'error');
        setSelectedFile(null);
        setFileContent('');
      };
      
      // Read file as ArrayBuffer (works for both text and binary)
      reader.readAsArrayBuffer(file);
    } catch (error) {
      showToast(`Failed to read file: ${error.message}`, 'error');
      setSelectedFile(null);
      setFileContent('');
    }
  };

  const arrayBufferToBase64 = (arrayBuffer) => {
    const uint8Array = new Uint8Array(arrayBuffer);
    const binaryString = String.fromCharCode.apply(null, uint8Array);
    return btoa(binaryString);
  };

  const handleSaveAndTest = async () => {
    if (!selectedFile || !fileContent) {
      showToast('Please select a file first', 'warning');
      return;
    }

    if (!uploadName.trim()) {
      showToast('Please enter a certificate name', 'warning');
      return;
    }

    setIsValidating(true);
    setValidationStatus(null);

    try {
      // Validate certificate format
      const validation = validateCertificate(fileContent, uploadType);
      
      if (!validation.valid) {
        setValidationStatus({ valid: false, error: validation.error });
        showToast(`Validation failed: ${validation.error}`, 'error');
        setIsValidating(false);
        return;
      }

      setValidationStatus({ valid: true, message: 'Certificate format validated ✓' });

      // Test backend connection
      const testResponse = await fetch(`${API_BASE}/certificates`, {
        method: 'OPTIONS',
      }).catch(() => ({ ok: false }));

      if (!testResponse.ok) {
        setValidationStatus({ 
          valid: false, 
          error: 'Backend connection failed. Server may be offline.' 
        });
        showToast('Backend connection failed', 'error');
        setIsValidating(false);
        return;
      }

      // Encode and upload
      const base64Content = arrayBufferToBase64(fileContent);

      const response = await fetch(`${API_BASE}/certificates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: uploadName.trim(),
          type: uploadType,
          content: base64Content,
          filename: selectedFile.name,
          tags: uploadTags.split(',').map(t => t.trim()).filter(t => t),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const cert = await response.json();
      addCertificate(cert);
      
      setValidationStatus({ 
        valid: true, 
        message: `✓ Certificate "${uploadName}" uploaded successfully!` 
      });
      showToast(`Certificate "${uploadName}" uploaded successfully`, 'success');

      // Reset form
      setUploadName('');
      setUploadTags('');
      setSelectedFile(null);
      setFileContent('');
      fileInputRef.current.value = '';
      
      // Clear validation message after 2 seconds
      setTimeout(() => setValidationStatus(null), 2000);
    } catch (error) {
      setValidationStatus({ valid: false, error: error.message });
      showToast(`Upload failed: ${error.message}`, 'error');
    } finally {
      setIsValidating(false);
    }
  };

  const handleDeleteCertificate = async (id) => {
    if (!confirm('Are you sure you want to delete this certificate?')) return;

    try {
      const response = await fetch(`${API_BASE}/certificates/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete certificate');

      removeCertificate(id);
      showToast('Certificate deleted', 'success');
    } catch (error) {
      showToast(`Delete failed: ${error.message}`, 'error');
    }
  };

  const testCertificateSet = async () => {
    if (!setName.trim()) {
      showToast('Please enter a certificate set name', 'warning');
      return false;
    }

    if (selectedJksId && !jksPassword.trim()) {
      setJksValidationStatus({ valid: false, message: 'JKS password is required' });
      showToast('Please provide the JKS password to test this certificate set', 'warning');
      return false;
    }

    // For JKS-enabled sets, validate the JKS certificate can be loaded from backend
    // before saving the set.
    if (selectedJksId) {
      try {
        setJksValidationStatus({ valid: null, message: 'Validating JKS password...' });
        const testResult = await api.certificates.testJksPassword(selectedJksId, jksPassword);
        if (!testResult?.valid) {
          setJksValidationStatus({ valid: false, message: testResult?.error || 'JKS password validation failed' });
          showToast(testResult?.error || 'JKS password validation failed', 'error');
          return false;
        }
        setJksValidationStatus({ valid: true, message: 'JKS password verified successfully' });
      } catch (error) {
        setJksValidationStatus({ valid: false, message: error.message });
        showToast(`JKS test failed: ${error.message}`, 'error');
        return false;
      }
    }

    showToast('Certificate set validation passed', 'success');
    return true;
  };

  const handleTestAndCreateSet = async () => {
    const isValid = await testCertificateSet();
    if (!isValid) {
      return;
    }

    if (!setName.trim()) {
      showToast('Please enter a certificate set name', 'warning');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/certificate-sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: setName,
          description: setDescription,
          certificateId: selectedCertId || null,
          keyId: selectedKeyId || null,
          caCertId: selectedCACertId || null,
          jksId: selectedJksId || null,
          jksPassword,
          tags: [],
        }),
      });

      if (!response.ok) throw new Error('Failed to create certificate set');

      const newSet = await response.json();
      addCertificateSet(newSet);
      showToast(`Certificate set "${setName}" created successfully`, 'success');

      // Reset form
      setSetName('');
      setSetDescription('');
      setSelectedCertId('');
      setSelectedKeyId('');
      setSelectedCACertId('');
      setSelectedJksId('');
      setJksPassword('');
      setJksValidationStatus(null);
    } catch (error) {
      showToast(`Creation failed: ${error.message}`, 'error');
    }
  };

  const handleDeleteSet = async (id) => {
    if (!confirm('Are you sure you want to delete this certificate set?')) return;

    try {
      const response = await fetch(`${API_BASE}/certificate-sets/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete certificate set');

      removeCertificateSet(id);
      showToast('Certificate set deleted', 'success');
    } catch (error) {
      showToast(`Delete failed: ${error.message}`, 'error');
    }
  };

  if (!isOpen) return null;

  const certsByType = {
    certificate: certificates.filter(c => c.type === 'certificate'),
    privatekey: certificates.filter(c => c.type === 'privatekey'),
    ca: certificates.filter(c => c.type === 'ca'),
    jks: certificates.filter(c => c.type === 'jks'),
  };

  return (
    <div className="certificate-manager-overlay">
      <div className="certificate-manager">
        <div className="cm-header">
          <h2>Certificate Manager</h2>
          <button className="cm-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="cm-tabs">
          <button 
            className={`cm-tab ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            Upload Certificates
          </button>
          <button 
            className={`cm-tab ${activeTab === 'sets' ? 'active' : ''}`}
            onClick={() => setActiveTab('sets')}
          >
            Certificate Sets
          </button>
        </div>

        <div className="cm-content">
          {activeTab === 'upload' && (
            <div className="cm-upload-tab">
              <div className="cm-upload-form">
                <div className="cm-form-group">
                  <label>Certificate Name:</label>
                  <input
                    type="text"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="e.g., localhost, test-cert"
                  />
                </div>

                <div className="cm-form-group">
                  <label>Certificate Type:</label>
                  <select value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
                    <option value="certificate">Public Certificate (.pem, .crt)</option>
                    <option value="privatekey">Private Key (.key, .pem)</option>
                    <option value="ca">CA Certificate (.crt, .pem)</option>
                    <option value="jks">Java KeyStore (.jks)</option>
                  </select>
                </div>

                <div className="cm-form-group">
                  <label>Tags (comma-separated):</label>
                  <input
                    type="text"
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    placeholder="e.g., http, grpc, localhost:8443"
                  />
                </div>

                <div className="cm-form-group">
                  <label>Select File:</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileSelect}
                    accept=".pem,.crt,.key,.jks"
                    disabled={isValidating}
                  />
                </div>

                {selectedFile && (
                  <div className="cm-file-selected">
                    <div className="cm-file-info">
                      <span className="cm-file-name">📄 {selectedFile.name}</span>
                      <span className="cm-file-size">({(selectedFile.size / 1024).toFixed(2)} KB)</span>
                    </div>
                    <button
                      className="cm-save-test-btn"
                      onClick={handleSaveAndTest}
                      disabled={isValidating}
                    >
                      {isValidating ? '⏳ Validating...' : '✓ Save & Test'}
                    </button>
                  </div>
                )}

                {validationStatus && (
                  <div className={`cm-validation-status ${validationStatus.valid ? 'valid' : 'invalid'}`}>
                    <span className="cm-validation-icon">
                      {validationStatus.valid ? '✓' : '✗'}
                    </span>
                    <span className="cm-validation-message">
                      {validationStatus.message || validationStatus.error}
                    </span>
                  </div>
                )}
              </div>

              <div className="cm-certificates-list">
                <h3>Uploaded Certificates ({certificates.length})</h3>
                {certificates.length === 0 ? (
                  <p className="cm-empty">No certificates uploaded yet</p>
                ) : (
                  <div className="cm-cert-items">
                    {Object.entries(certsByType).map(([type, certs]) => certs.length > 0 && (
                      <div key={type} className="cm-cert-type">
                        <h4>{type === 'certificate' ? 'Public Certificates' : 
                             type === 'privatekey' ? 'Private Keys' : 
                             type === 'ca' ? 'CA Certificates' : 'Java KeyStores'}</h4>
                        {certs.map(cert => (
                          <div key={cert.id} className="cm-cert-item">
                            <div className="cm-cert-info">
                              <div className="cm-cert-name">{cert.name}</div>
                              <div className="cm-cert-details">
                                {cert.filename && <span>{cert.filename}</span>}
                                {cert.tags?.length > 0 && (
                                  <div className="cm-cert-tags">
                                    {cert.tags.map((tag, i) => (
                                      <span key={i} className="cm-tag">{tag}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <button
                              className="cm-delete-btn"
                              onClick={() => handleDeleteCertificate(cert.id)}
                              title="Delete certificate"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sets' && (
            <div className="cm-sets-tab">
              <div className="cm-create-set">
                <h3>Create Certificate Set</h3>
                <div className="cm-form-group">
                  <label>Set Name:</label>
                  <input
                    type="text"
                    value={setName}
                    onChange={(e) => setSetName(e.target.value)}
                    placeholder="e.g., LocalHost mTLS, Production Certs"
                  />
                </div>

                <div className="cm-form-group">
                  <label>Description:</label>
                  <input
                    type="text"
                    value={setDescription}
                    onChange={(e) => setSetDescription(e.target.value)}
                    placeholder="e.g., Certificates for localhost:8443"
                  />
                </div>

                <div className="cm-form-group">
                  <label>Public Certificate:</label>
                  <select value={selectedCertId} onChange={(e) => setSelectedCertId(e.target.value)}>
                    <option value="">None</option>
                    {certsByType.certificate.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="cm-form-group">
                  <label>Private Key:</label>
                  <select value={selectedKeyId} onChange={(e) => setSelectedKeyId(e.target.value)}>
                    <option value="">None</option>
                    {certsByType.privatekey.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="cm-form-group">
                  <label>CA Certificate:</label>
                  <select value={selectedCACertId} onChange={(e) => setSelectedCACertId(e.target.value)}>
                    <option value="">None</option>
                    {certsByType.ca.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="cm-form-group">
                  <label>Java KeyStore (JKS):</label>
                  <select
                    value={selectedJksId}
                    onChange={(e) => {
                      setSelectedJksId(e.target.value);
                      setJksValidationStatus(null);
                    }}
                  >
                    <option value="">None</option>
                    {certsByType.jks.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {selectedJksId && (
                  <div className="cm-form-group">
                    <label>JKS Password:</label>
                    <input
                      type="password"
                      value={jksPassword}
                      onChange={(e) => {
                        setJksPassword(e.target.value);
                        setJksValidationStatus(null);
                      }}
                      placeholder="Enter JKS password"
                    />
                    {jksValidationStatus && (
                      <div
                        className={`cm-inline-validation ${jksValidationStatus.valid === null ? 'testing' : jksValidationStatus.valid ? 'valid' : 'invalid'}`}
                      >
                        {jksValidationStatus.valid === null ? '⏳' : jksValidationStatus.valid ? '✓' : '✗'} {jksValidationStatus.message}
                      </div>
                    )}
                  </div>
                )}

                <button className="cm-create-btn" onClick={handleTestAndCreateSet}>
                  Test & Save Certificate Set
                </button>
              </div>

              <div className="cm-sets-list">
                <h3>Existing Certificate Sets ({certificateSets.length})</h3>
                {certificateSets.length === 0 ? (
                  <p className="cm-empty">No certificate sets created yet</p>
                ) : (
                  <div className="cm-set-items">
                    {certificateSets.map(set => {
                      const cert = set.certificateId ? certificates.find(c => c.id === set.certificateId) : null;
                      const key = set.keyId ? certificates.find(c => c.id === set.keyId) : null;
                      const caCert = set.caCertId ? certificates.find(c => c.id === set.caCertId) : null;
                      const jks = set.jksId ? certificates.find(c => c.id === set.jksId) : null;

                      return (
                        <div key={set.id} className="cm-set-item">
                          <div className="cm-set-info">
                            <div className="cm-set-name">{set.name}</div>
                            {set.description && <div className="cm-set-desc">{set.description}</div>}
                            <div className="cm-set-contents">
                              {cert && (
                                <div className="cm-set-cert">
                                  <span className="cm-badge">Cert</span>
                                  <span className="cm-cert-name">{cert.name}</span>
                                </div>
                              )}
                              {key && (
                                <div className="cm-set-cert">
                                  <span className="cm-badge">Key</span>
                                  <span className="cm-cert-name">{key.name}</span>
                                </div>
                              )}
                              {caCert && (
                                <div className="cm-set-cert">
                                  <span className="cm-badge">CA</span>
                                  <span className="cm-cert-name">{caCert.name}</span>
                                </div>
                              )}
                              {jks && (
                                <div className="cm-set-cert">
                                  <span className="cm-badge">JKS</span>
                                  <span className="cm-cert-name">{jks.name}</span>
                                </div>
                              )}
                              {!cert && !key && !caCert && !jks && (
                                <span className="cm-empty-text">No certificates assigned</span>
                              )}
                            </div>
                          </div>
                          <button
                            className="cm-delete-btn"
                            onClick={() => handleDeleteSet(set.id)}
                            title="Delete certificate set"
                          >
                            Delete
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CertificateManager;
