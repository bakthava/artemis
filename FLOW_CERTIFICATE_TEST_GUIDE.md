# Flow Certificate Save Fix - Manual Testing Guide

**Date**: April 20, 2026
**Feature**: Global and Individual Flow Certificate Selection Persistence

---

## Overview
This guide verifies that:
1. Global flow-level certificate selections are saved and restored
2. Individual step-level certificate selections work independently  
3. Both levels persist across page reloads and flow switches

---

## Prerequisites
- [ ] Application is running (artemis.exe)
- [ ] At least one certificate set is created
- [ ] Multiple flows exist OR you can create them during testing

---

## Test 1: Global Certificate Save & Restore

### Setup
1. Open the application
2. Navigate to Flow Builder
3. Create a new flow (or select an existing one)
4. Go to Flow → CertificateSelector dropdown (top section)

### Test Steps
1. **Select Global Certificate**
   - Click the Certificate Set dropdown
   - Select a certificate set (e.g., "My-Cert-Set")
   - Verify dropdown shows the selected certificate
   
2. **Save Flow**
   - Click the "Save" button
   - Verify toast: "Flow saved ✓"
   - Verify flow ID is generated (flow has been saved to DB)

3. **Reload Page**
   - Press F5 to refresh the browser
   - Wait for application to load
   - Verify Flow is still selected
   - **Expected**: Certificate Set dropdown still shows "My-Cert-Set"
   - **If Failed**: Certificate reverted to "No Certificate"

4. **Switch to Different Flow & Back**
   - From Flow Discovery panel (left side)
   - Click on a different saved flow
   - Verify its certificate loads (should be different or "No Certificate")
   - Click back on the original flow
   - **Expected**: Original certificate selection is restored
   - **If Failed**: Certificate not restored on re-selection

**Pass Criteria**: 
- ✅ Certificate persists after save
- ✅ Certificate restored after page refresh
- ✅ Certificate restored when re-selecting flow

---

## Test 2: Individual Step Certificate Save & Restore

### Setup
1. Open the application
2. Navigate to Flow Builder
3. Create or select a flow with at least 2 HTTP request steps

### Test Steps
1. **Configure Step 1 with Certificate**
   - Click on first HTTP Request step in canvas
   - In Step Editor (right panel), find "mTLS Certificate"
   - Select a certificate from dropdown (e.g., "Cert-A")
   - Verify dropdown shows selection

2. **Configure Step 2 with Different Certificate**
   - Click on second HTTP Request step
   - Select a different certificate (e.g., "Cert-B")
   - Verify dropdown shows correct selection

3. **Save Flow**
   - Click "Save" button
   - Verify toast: "Flow saved ✓"

4. **Reload Page**
   - Press F5
   - Wait for application to load
   - Click on Step 1
   - **Expected**: Step Editor shows "Cert-A"
   - Click on Step 2
   - **Expected**: Step Editor shows "Cert-B"
   - **If Failed**: Certificates show "No Certificate" or wrong values

5. **Switch Flow & Back**
   - Go to Flow Discovery
   - Click different flow
   - Return to original flow
   - Click Step 1 → **Expected**: "Cert-A"
   - Click Step 2 → **Expected**: "Cert-B"

**Pass Criteria**:
- ✅ Each step's certificate persists independently
- ✅ Step certificates restored after page reload
- ✅ Step certificates restored when re-selecting flow

---

## Test 3: Global + Individual Certificate Interaction

### Setup
1. Create a flow with 2 HTTP request steps
2. Set a global certificate on the flow

### Test Steps
1. **Set Global Certificate**
   - From Flow CertificateSelector: "Global-Cert"

2. **Override on Step 1**
   - Click Step 1
   - Set its certificate to "Step-Override"
   - Click Step 2
   - Leave certificate as empty (use global)

3. **Save & Verify**
   - Save flow
   - Check browser DevTools Console (F12) for errors
   - **Expected**: No errors
   
4. **Test Execution (Optional)**
   - Run the flow
   - Both steps should use certificates:
     - Step 1: "Step-Override"
     - Step 2: "Global-Cert" (fallback)
   - Check flow execution logs

5. **Reload & Verify**
   - Refresh page (F5)
   - Click Step 1: **Expected**: "Step-Override"
   - Click Step 2: **Expected**: Empty (uses global)
   - Verify Flow selector shows "Global-Cert"

**Pass Criteria**:
- ✅ Global certificate applies when step has no override
- ✅ Step override takes precedence
- ✅ Both levels persist correctly
- ✅ No console errors during save/load

---

## Test 4: Certificate Data Integrity

### Test Steps
1. **Create New Flow with Multiple Certs**
   - Global: "Cert-A"
   - Step 1: "Cert-B"
   - Step 2: "Cert-C" 
   - Step 3: (empty - uses global)

2. **Save & Export Flow**
   - Save the flow
   - Export the flow to JSON (if export feature exists)
   - Open exported JSON file
   - Verify JSON contains:
     ```json
     {
       "selectedCertificateSetId": "Cert-A",
       "steps": [
         {"id": "...", "selectedCertificateSetId": "Cert-B"},
         {"id": "...", "selectedCertificateSetId": "Cert-C"},
         {"id": "...", "name": "Step 3"}  // No certificate field
       ]
     }
     ```

3. **Import & Verify**
   - If import flow exists, test importing the JSON
   - Verify all certificates are restored

**Pass Criteria**:
- ✅ JSON contains `selectedCertificateSetId` fields
- ✅ Global certificate in root object
- ✅ Step certificates in respective step objects
- ✅ Empty certificates omitted from JSON (omitempty)

---

## Test 5: Network Request Validation

### Setup
1. Create a flow with HTTPS endpoint
2. Set a valid certificate (if available)

### Test Steps
1. **Verify Certificate in Request**
   - Open Browser DevTools (F12)
   - Go to Network tab
   - Run the flow
   - Inspect HTTPS request details
   - Verify certificate is being used (check TLS settings)

2. **Test Without Certificate**
   - Remove certificate selection
   - Set it to "No Certificate"
   - Save
   - Refresh
   - Verify certificate still removed

3. **Test with Certificate**
   - Re-select certificate
   - Save
   - Refresh
   - Run flow
   - Verify request uses certificate

**Pass Criteria**:
- ✅ Certificate persists in request configuration
- ✅ Certificate transmitted to backend correctly
- ✅ No errors in network requests

---

## Test 6: Edge Cases

### Test 6a: Empty Certificate Selection
- Create flow with global certificate
- Change to "No Certificate"
- Save & reload
- **Expected**: Dropdown shows "No Certificate"

### Test 6b: Non-Existent Certificate ID
- Manually set certificate to ID that doesn't exist
- Load flow
- **Expected**: Dropdown shows "No Certificate" gracefully
- **No crashes or errors**

### Test 6c: Multiple Flows Same Certificate
- Create Flow A with "Cert-X"
- Create Flow B with "Cert-X"
- Save both
- Switch between them
- **Expected**: Both correctly show "Cert-X"

### Test 6d: Clear All Certificates
- Set global + all steps to different certs
- Set everything to "No Certificate"
- Save & reload
- **Expected**: Everything empty, no errors

---

## Browser DevTools Checks (F12)

### Console Tab
- [ ] No red errors after save
- [ ] No red errors after load
- [ ] No warnings related to certificate

### Network Tab
- [ ] API call `/api/flows` (create/update) includes certificate ID
- [ ] Response includes certificate ID in JSON
- [ ] No 400/500 errors

### Application Tab (Storage)
- [ ] localStorage contains flow state with certificate ID
- [ ] SessionStorage shows correct context

### Example Console Commands
```javascript
// Check if certificate is in flow state
console.log(localStorage.getItem('artemis.flowBuilder.lastState.v1'))

// Should show: {..., "selectedCertificateSetId": "cert-id"}
```

---

## Failure Symptoms & Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Certificate reverts to "No Certificate" after save | Frontend not including cert in payload | Check saveFlow() includes `activeCertificateSetId` |
| Certificate shows wrong value after reload | selectFlow() not restoring cert | Check selectFlow() sets `selectedFlowCertificateSetId` |
| Step certificates save but not global | Payload issue in saveFlow() | Verify both lines: global AND step certs included |
| Console errors on save | Model missing field | Verify `SelectedCertificateSetID` in Go Flow struct |
| API returns error 400 | JSON unmarshaling fails | Check field name matches: `selectedCertificateSetId` (camelCase) |

---

## Sign-Off Checklist

- [ ] Test 1 (Global Save/Restore) - PASSED
- [ ] Test 2 (Individual Step) - PASSED  
- [ ] Test 3 (Global + Individual) - PASSED
- [ ] Test 4 (Data Integrity) - PASSED
- [ ] Test 5 (Network Validation) - PASSED
- [ ] Test 6 (Edge Cases) - PASSED
- [ ] DevTools checks - PASSED
- [ ] No console errors
- [ ] No network errors

**Overall Status**: ✅ READY FOR PRODUCTION / ❌ NEEDS FIXES

**Notes**:
```
[Space for tester notes]
```

**Tested By**: ________________  
**Date**: ________________  
**Build Version**: ________________
