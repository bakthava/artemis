# Artemis Release Test Plan

Purpose
- Provide a repeatable test-suite to validate features before a release.
- Identify missing or new functionality before running tests.

Scope
- Frontend: Parameters panel (Generators, Script, File), Flow builder, Run/Vars, Export.
- Backend/API: /api/flows, /api/certificates, /api/certificate-sets, request executor endpoints.
- gRPC: Basic unary and streaming behavior through the request executor.
- Certificates/export flow.
- Integration: End-to-end flow execution with variables and runtime checks.

Test Phases
1. Prerequisite discovery: detect new/missing functionality and required services.
2. Smoke tests: fast end-to-end sanity (UI + runtime variables).
3. Functional tests: detailed positive & negative cases per feature.
4. Integration tests: mixed-protocol flows, export, certificate packages.
5. Report generation and defect capture.

Test Environment
- App running at `http://localhost:9090` (default). Adjust via runner.
- Playwright available via `npm install` in `frontend` (scripts use `playwright-core`).
- PowerShell for the provided runner scripts (Windows). Node.js for JS scripts.

Entry points
- Prereq check: `tests/run-prereqs.ps1`
- Full test run: `tests/run-all.ps1`

Acceptance criteria
- All required checks in `tests/TEST_CASES.md` must pass for a release.
- Any failing test must be triaged; missing/new features documented as suggestions.
