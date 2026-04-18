# Artemis Test Cases

Instructions
- Each test case has: ID, Area, Title, Steps, Positive/Negative, Expected Outcome, Notes.

## Prerequisite checks (run first)
- PR-01: API availability
  - Steps: GET `/api/flows`, `/api/certificates`, `/api/certificate-sets`.
  - Expected: 200 responses; JSON body structure present.
  - Failure: Service not running or changed API shape.

- PR-02: UI availability
  - Steps: Visit `http://localhost:9090`, open Flow → Parameters.
  - Expected: Parameters panel visible and `How to pass variables into script and requests` help text present.

## Parameters Panel — Generators
- G-01 (Positive): Number generator in range
  - Steps: Add Generator → Type `number`, Min=10 Max=12, Mode=integer, Scope=global, Variable Name=`gNum`, Run flow.
  - Expected: `gNum` present in runtime, integer between 10 and 12.

- G-02 (Negative): Invalid min/max (min>max)
  - Steps: Add number generator Min=20 Max=10, Run validation
  - Expected: UI validation error or runtime shows failure; test must record error message.

- G-03 (Positive): UUID generator
  - Steps: Add Generator → Type `uuid`, Variable Name=`gUuid`, Run.
  - Expected: `gUuid` present, matches UUID regex.

- G-04 (Positive): Time generator with custom format
  - Steps: Type `time`, Custom format `YYYYMMDDHHmmss`, Variable Name=`gTime`.
  - Expected: `gTime` is 14-digit numeric string matching the pattern.

- G-05 (Positive): Text generator
  - Steps: Type `text`, MinLen=5 MaxLen=8, charset=alphanumeric, Variable Name=`gText`.
  - Expected: `gText` length between 5 and 8.

## Parameters Panel — Script
- S-01 (Positive): Script uses generator variable
  - Steps: Add Script param `scriptVar` with script `return String(vars.gNum||"") + "-" + helpers.randomInt(1,9);`.
  - Expected: `scriptVar` starts with `gNum` followed by `-` and a digit.

- S-02 (Negative): Script raises runtime error
  - Steps: Script `throw new Error('bad')`.
  - Expected: Script param shows error; flow runtime shows failed script and an informative message.

## Parameters Panel — File import
- F-01 (Positive): CSV import and pick index
  - Steps: Import CSV with rows `alpha,beta`; set Variable=`fileVar`, Pick Value=index Row Number=2.
  - Expected: `fileVar` = `beta`.

- F-02 (Negative): Unsupported file upload
  - Steps: Upload `invalid.json` into file param.
  - Expected: Toast or error `Unsupported file format`.

## Flow / Set Variable node
- V-01 (Positive): Combined variable with pipes
  - Steps: Set Variable node `combined` = `{{gNum}}|{{gUuid}}|{{gTime}}|{{gText}}|{{scriptVar}}|{{fileVar}}` and Run.
  - Expected: `combined` resolves with no `{{` tokens and contains 5 pipe separators.

## Export/Certificates
- E-01 (Positive): Export flow with certificate set
  - Steps: Open Flow toolbar, select non-empty certificate set, Export, download zip.
  - Expected: ZIP contains `flow.json` and `certificates.json`, referenced cert IDs present.

- E-02 (Negative): Export with missing certificate set
  - Steps: Attempt export when no certificate set selected.
  - Expected: UI blocks export or returns error; test records message.

## API / Request Executor
- API-01 (Positive): HTTP request execution
  - Steps: Send a test HTTP request via `/api/request/execute` (or UI run) to https://httpbin.org/get
  - Expected: statusCode 200, body valid JSON.

- API-02 (Positive): gRPC unary via request executor
  - Steps: Use proto content and call Greeter.SayHello via executor.
  - Expected: statusCode 200, body contains expected reply field.

- API-03 (Negative): gRPC with incorrect proto
  - Steps: Provide invalid proto content and execute.
  - Expected: executor returns error with parse failure.

## Security / mTLS (if applicable)
- SEC-01: Test mTLS connection to configured gRPC server (if test server available).
  - Steps: Run mtls-testserver and attempt a secured gRPC call using configured certs.
  - Expected: Secure handshake succeeds and call returns data.


## Test data and fixtures
- Provide minimal fixtures in `tests/fixtures/` (sample.csv, invalid.json).


## Reporting
- Each test case record must include timestamp, executor user, environment baseUrl, result (PASS/FAIL), and logs/screenshots (for UI failures).


---

Add new test cases as features are added. Each new feature must be validated in both positive and negative paths before release.
