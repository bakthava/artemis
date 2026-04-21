/**
 * Flow Export/Import Utilities
 * Handles ZIP creation/extraction for flow exports with certificates and data files
 */

// Simple ZIP creator using base64 encoding
// For production, consider using a proper ZIP library like JSZip

export async function createFlowZip(flowData, certificatesData = {}, dataFiles = {}) {
  try {
    // Convert to JSON string
    const flowJson = JSON.stringify(flowData, null, 2);
    const certificatesJson = JSON.stringify(certificatesData, null, 2);
    
    // Create a FormData to send to backend for ZIP creation
    const formData = new FormData();
    formData.append('flow', new Blob([flowJson], { type: 'application/json' }), 'flow.json');
    formData.append('certificates', new Blob([certificatesJson], { type: 'application/json' }), 'certificates.json');
    
    // Add data files
    Object.entries(dataFiles).forEach(([name, content]) => {
      formData.append('dataFiles', new Blob([content], { type: 'text/plain' }), `data/${name}`);
    });
    
    // Send to backend for ZIP creation
    const response = await fetch('/api/flows/export/zip', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flow-${flowData.name || 'export'}-${Date.now()}.zip`;
    link.click();
    URL.revokeObjectURL(url);
    
  } catch (err) {
    throw new Error(`Failed to create ZIP: ${err.message}`);
  }
}

export async function parseFlowZip(zipFile) {
  try {
    // For now, send the ZIP to backend for parsing
    const formData = new FormData();
    formData.append('zipFile', zipFile);
    
    const response = await fetch('/api/flows/import/zip', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data; // { flow, certificates, dataFiles }
  } catch (err) {
    throw new Error(`Failed to parse ZIP: ${err.message}`);
  }
}

export function validateFlowJson(flowData) {
  const errors = [];
  
  // Check required fields
  if (!flowData || typeof flowData !== 'object') {
    errors.push('Flow data must be a valid JSON object');
    return errors;
  }
  
  if (!flowData.name || typeof flowData.name !== 'string') {
    errors.push('Flow must have a valid "name" field');
  }
  
  if (!Array.isArray(flowData.steps)) {
    errors.push('Flow must have a "steps" array');
  } else {
    if (flowData.steps.length === 0) {
      errors.push('Flow must have at least one step (start node)');
    }
    
    // Validate step structure
    flowData.steps.forEach((step, idx) => {
      if (!step.id || !step.type) {
        errors.push(`Step ${idx}: missing required fields (id, type)`);
      }
      if (!['start', 'request', 'grpc', 'condition', 'loop', 'delay', 'set_variable', 'assert', 'end'].includes(step.type)) {
        errors.push(`Step ${idx}: unknown step type "${step.type}"`);
      }
    });
  }
  
  if (!Array.isArray(flowData.edges)) {
    errors.push('Flow must have an "edges" array');
  }
  
  if (!flowData.variables || typeof flowData.variables !== 'object') {
    errors.push('Flow must have a "variables" object');
  }
  
  return errors;
}

export function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `export-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function readJSONFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        resolve(json);
      } catch (err) {
        reject(new Error(`Invalid JSON file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export async function readZipFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target.result);
    };
    reader.onerror = () => reject(new Error('Failed to read ZIP file'));
    reader.readAsArrayBuffer(file);
  });
}
