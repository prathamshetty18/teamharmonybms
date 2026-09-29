# Feature Implementation Sprint: OCR + GIS Frontend Integration

You are executing a **2-hour sprint** to integrate two existing backend features (OCR, GIS) into the frontend. Work in strict phase order. After **Phase 0** and **Phase 1**, stop and wait for my explicit **"continue"**. Do not skip the stop gates.

---

## Global rules (apply to every phase)

1. Never modify any file under `contracts/`. If a task seems to require it, stop and report.
2. Never modify `scripts/chain.js`, `test/runTests.js`, `backend/routes/`, or `backend/services/`.
3. Never remove `simulateOCR`. Real OCR is added alongside, not replaced.
4. Never auto-fill form fields from OCR. The user must click an "Apply" button.
5. Never add interactive polygon editing to the GIS overlay. Read-only display only.
6. Every feature sits behind a flag in `.env`, default **OFF** in `.env.example`.
7. Every change is its own commit with message `feat(<feature>): <what>` or `docs(<area>): <what>`.
8. After every commit, run `npm run test:chain` and `cd frontend && npm run build`. Paste the raw output tail. If the pass count drops below baseline OR the build fails, run `git revert HEAD` immediately, then report.
9. Never fabricate a value, hash, address, or output. If a command fails, paste the raw error.
10. Every phase result block ends with `contracts diff: <output of git diff --stat contracts/>` (must be empty).

> **Note on flags:** Vite only exposes env vars prefixed with `VITE_` to browser code. If the frontend reads a flag directly, mirror it as `VITE_FEATURE_REAL_OCR`, `VITE_FEATURE_GIS_BOUNDARY`, and `VITE_FEATURE_UNIT_CONVERTER` in `frontend/.env` and `.env.example` (all default `false`). Report the exact names you used.

---

## PHASE 0: Pre-flight (15 min) — STOP GATE

**Do not write any code in this phase.** Only run these commands and paste raw output.

### 0a. Establish baseline

```bash
git status
git log -1 --format="%H %s"
npm run test:chain 2>&1 | tee /tmp/baseline-chain.txt
grep -E "Passed|Failed|Skipped" /tmp/baseline-chain.txt
cd frontend && npm run build 2>&1 | tail -5 && cd ..
```

Report the exact baseline: `X passed / Y failed / Z skipped` and whether the frontend build succeeds.

### 0b. Verify the OCR backend actually works

Ask me for the path to the demo document, or use `./demo-docs/` if it exists. Then run:

```bash
curl -sS -X POST http://localhost:5000/api/documents/scan \
  -F "document=@<DEMO_DOC_PATH>" \
  -H "Authorization: Bearer <CITIZEN_JWT>" \
  | tee /tmp/ocr-response.json
```

Paste the raw JSON. If the endpoint requires different auth, report what is needed and stop.

Then evaluate each item as **PASS** or **FAIL**:

| Check | PASS condition |
|---|---|
| `confidence` | ≥ 0.7 |
| `extractedFields.surveyNo` | A real number/string, not garbage like `"7Z/3A"`, `null`, or `""` |
| `extractedFields.village` | Matches what is actually on the document |
| `docHash` | Valid `0x`-prefixed 64-hex string |

If any check is FAIL, **OCR integration is off the table**. Say so explicitly.

### 0c. Verify the GIS backend actually works

Use a claim ID you know exists on MST (check with `node scripts/inspect-db.js` if unsure):

```bash
curl -sS http://localhost:5000/api/gis/boundary/<CLAIM_ID> | tee /tmp/gis-boundary.json
curl -sS http://localhost:5000/api/gis/nearby/<CLAIM_ID> | tee /tmp/gis-nearby.json
```

Paste both raw JSON responses. Evaluate each as **PASS** or **FAIL**:

| Check | PASS condition |
|---|---|
| `/boundary` fields | `centroid`, `area_m2`, `area_acres`, `perimeter_m`, `bbox` are all real, non-null values |
| `/nearby` | Returns an array (empty is fine) |
| Response time | Under 500 ms |

If any check is FAIL, **GIS integration is off the table**.

### 0d. Verify the explorer URL

Load both and report which works (HTTP 200 with a title):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://testnet.mstscan.com
curl -sS -o /dev/null -w "%{http_code}\n" https://testnetscan.mstblockchain.com
```

### PHASE 0 RESULT

Print:

```text
Baseline:       <X> passed / <Y> failed / <Z> skipped
Frontend build: PASS/FAIL
OCR backend:    PASS/FAIL — confidence=<n>, fields valid=<yes/no>
GIS backend:    PASS/FAIL — /boundary fields valid=<yes/no>, /nearby valid=<yes/no>
Explorer URL:   <which one returns 200>
contracts diff: <empty>
```

**Then stop. Wait for "continue".**

---

## PHASE 1: Text fixes (15 min) — STOP GATE

These are worth more than either feature. Do not skip them.

### 1a. Find every occurrence

```bash
grep -rn "Aadhaar\|aadhaar" --include="*.md" --include="*.jsx" --include="*.js" . | grep -v node_modules
grep -rn "5/5\|≥ 5/5\|>= 5/5" --include="*.md" --include="*.jsx" --include="*.js" . | grep -v node_modules
grep -rn "attest(claimId, role)\|attest(uint256, uint8)\|attest(claimId, uint8)" --include="*.md" . | grep -v node_modules
```

### 1b. Replace in every hit

| Find | Replace with |
|---|---|
| `Aadhaar` | `record ID` (preserve surrounding grammar; "neighbour's Aadhaar" → "neighbour's record ID") |
| `5/5` and `≥ 5/5` | `Score N (≥5 required)` |
| `attest(claimId, role)` and `attest(uint256, uint8)` | `attest(uint256 claimId)` |

### 1c. Scope limits

Do not change code files under `contracts/`, `backend/`, or `scripts/`. Only docs (`.md`), and UI strings in `.jsx` files if the string is user-facing.

**Commit:** `docs: correct Aadhaar references, consensus notation, attest signature`

### PHASE 1 RESULT

Print:

```text
Files changed: <list>
Occurrences fixed: <count> Aadhaar, <count> 5/5, <count> attest signature
contracts diff: <empty>
```

**Then stop. Wait for "continue".**

---

## PHASE 2: Conditional feature implementation

Branch based on Phase 0 results:

| OCR result | GIS result | What to do |
|---|---|---|
| PASS | PASS | Do 2A and 2B |
| PASS | FAIL | Do 2A only, then 2C as filler |
| FAIL | PASS | Do 2B only, then 2C as filler |
| FAIL | FAIL | Skip 2A and 2B entirely. Do 2C only |

**Time budget:** 2A gets 45 min max, 2B gets 30 min, 2C gets 30 min. If a slot exceeds its budget, `git revert HEAD` for that feature and move on. Do not debug past the budget.

---

### 2A: OCR frontend integration (only if the OCR backend PASSED)

**Feature flag:** `FEATURE_REAL_OCR=true` in `.env`; default `false` in `.env.example`.

**Modify `frontend/src/components/CitizenPortalView.jsx` only.**

- Add a file input accepting `.pdf`, `.png`, `.jpg`, `.jpeg` with a max of 10 MB. Label it **"Scan Document (OCR)"**.
- On file select, POST multipart to `/api/documents/scan` with the file and the citizen's JWT.
- While uploading, show a spinner and the text `Extracting…`.
- On success, render a card below the input:

```text
┌─ Document Scan ────────────────────────┐
│  Confidence: 94.2%  [Preview Mode]     │
│  Survey No: 72/3A                      │
│  Plot No:   145                        │
│  Area:      2.50 Acres                 │
│  Village:   Harohalli                  │
│  District:  Ramanagara                 │
│  SHA-256:   0x3f8a...c21  [Copy]       │
│  [ Apply to Form ]   [ Dismiss ]       │
└────────────────────────────────────────┘
```

- Show the amber badge **`Preview Mode — verify fields manually`** if `response.mock === true` OR `confidence < 0.7`.
- **"Apply to Form" is the only way fields populate.** Do not auto-fill.
- On error, silently fall back to the existing `simulateOCR` path. Do not show a red error to the user.
- If `FEATURE_REAL_OCR` is false, render the old `simulateOCR` UI unchanged.

**Verify locally:**

1. Upload the demo document. Confirm the card renders with real fields.
2. Set `FEATURE_REAL_OCR=false`, restart Vite. Confirm the mock path renders unchanged.
3. `cd frontend && npm run build` — must succeed.
4. `npm run test:chain` — pass count must not drop.

**Commit:** `feat(ocr): real scan wiring behind flag, simulateOCR preserved`

---

### 2B: GIS read-only overlay (only if the GIS backend PASSED)

**Feature flag:** `FEATURE_GIS_BOUNDARY=true` in `.env`; default `false` in `.env.example`.

**Modify `frontend/src/components/MapView.jsx` only.**

- Accept new props: `showGisOverlay` (bool, default `false`), `claimId` (string/number).
- When `showGisOverlay === true` and `claimId` is set:
  - Fetch `/api/gis/boundary/:claimId`.
  - Draw the polygon on the existing Leaflet map (solid outline, light fill).
  - Place a marker at the centroid with popup: `Area: <acres> acres · Perimeter: <m> m`.
  - Fetch `/api/gis/nearby/:claimId`. If the array is non-empty, draw each nearby parcel with a dashed outline and a tooltip showing overlap %.
- **Do NOT** add vertex drag handles, add/remove vertex buttons, edit mode, or any interactive geometry editing. Display only.
- On fetch failure, render the map without the overlay and `console.warn` once. Do not throw.
- If `FEATURE_GIS_BOUNDARY` is false, `MapView` behaves exactly as today.

**Verify locally:**

1. Load a claim detail view with the overlay enabled. Confirm the polygon draws and matches the parcel coordinates.
2. Toggle the flag off. Confirm the map renders identically to before.
3. `cd frontend && npm run build` — must succeed.
4. `npm run test:chain` — pass count must not drop.

**Commit:** `feat(gis): read-only boundary + nearby overlay`

---

### 2C: Unit converter (fallback if either 2A or 2B was skipped)

**Feature flag:** `FEATURE_UNIT_CONVERTER=true` in `.env`; default `false` in `.env.example`.

Create `frontend/src/components/UnitConverter.jsx`. Client-side only. No new dependencies. No backend calls.

**Six inputs:** Acres, Guntas, Hectares, Square Metres, Square Feet, Cents.

**Conversion factors from 1 Acre:**

| Unit | Value |
|---|---|
| Guntas | 40 |
| Hectares | 0.404686 |
| Square metres | 4046.86 |
| Square feet | 43560 |
| Cents | 100 |

**Behavior:**

- Typing in any field updates all others.
- Display 4 decimals, strip trailing zeros.
- Empty input clears all fields.
- Invalid input shows a red border and does not update others.

Add to `CitizenPortalView.jsx` below the area input as a collapsible panel labeled **"Convert units"**.

**Verify:**

- Type `1` in Acres → Guntas 40, Hectares 0.4047, m² 4046.86, sq ft 43560, Cents 100.
- Type `100` in Cents → Acres 1.
- Clear a field → all clear.

**Commit:** `feat(units): client-side area converter`

---

### PHASE 2 RESULT

Print:

```text
2A OCR:             DONE / SKIPPED / REVERTED — reason
2B GIS:             DONE / SKIPPED / REVERTED — reason
2C Unit Converter:  DONE / SKIPPED / REVERTED — reason
Frontend build:     PASS / FAIL
Chain tests:        <X> passed / <Y> failed / <Z> skipped (baseline was <X0>/<Y0>/<Z0>)
contracts diff:     <empty>
```

---

## PHASE 3: Freeze, tag, smoke test (15 min)

### 3a. Final test + build

```bash
npm run test:chain
cd frontend && npm run build && cd ..
```

Both must succeed. If the chain test count dropped below baseline, revert the last feature commit.

### 3b. Commit and tag

```bash
git add -A
git commit -m "chore: demo-ready snapshot with OCR + GIS behind flags" || echo "nothing to commit"
git tag demo-$(date +%Y%m%d-%H%M)
```

### 3c. Open these five screens in the browser and confirm each renders without console errors

1. Citizen portal, with the OCR card visible (if 2A done)
2. Government portal, claim detail
3. GIS overlay map (if 2B done)
4. Public verify page
5. QR certificate modal

Report each as **PASS** or **FAIL** with the specific error if FAIL.

### 3d. Print the tag name and the exact feature flag values in `.env` at time of demo.

### PHASE 3 RESULT

Print:

```text
Chain tests:    <X>/<Y>/<Z>
Frontend build: PASS/FAIL
Screens OK:     Citizen=PASS, Gov=PASS, GIS=<PASS|N/A>, Verify=PASS, QR=PASS
Tag:            <tag name>
Active flags:   FEATURE_REAL_OCR=<val>, FEATURE_GIS_BOUNDARY=<val>, FEATURE_UNIT_CONVERTER=<val>
contracts diff: <empty>
```

---

## FINAL REPORT

One table with all phases:

| Phase | Status | Evidence |
|---|---|---|
| 0. Pre-flight | PASS/FAIL | baseline + curl outputs |
| 1. Text fixes | DONE/NO | grep before/after counts |
| 2A. OCR | DONE/SKIPPED/REVERTED | — |
| 2B. GIS | DONE/SKIPPED/REVERTED | — |
| 2C. Unit converter | DONE/SKIPPED/REVERTED | — |
| 3. Freeze + tag | DONE | tag name |

Then list anything still broken or unverified, in priority order.

**Do not claim success on a phase you did not verify with the exact commands above.**
