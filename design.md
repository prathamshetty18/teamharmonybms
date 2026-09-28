# design.md — Build Plan: Post-Disaster Land Rights on MST Blockchain

**Event:** BMS College of Engineering 24-hour buildathon, 28-29 Sept 2026
**Stack:** Node.js + Express (backend), React or plain HTML (frontend), Leaflet (map), Solidity on MST Testnet, BridgeKey wallet
**Goal:** a working demo where a family's land claim is attested by neighbors, a leader and an NGO, verified on MST Testnet, shown on a map with overlap detection, and proven with a QR certificate.

---

## 1. Team roles

| Member | Role | Owns | Does NOT touch |
|---|---|---|---|
| **A (Srujan)** | **Blockchain Lead (COMPLETE)** | Wallets and funding, `LandRegistry.sol`, compile and deploy on MST Testnet, `scripts/` module, BridgeKey integration, all tx hashes, `SUBMISSION.md` | UI styling, slides |
| **B** | Backend / API | Express server, database (JSON file or SQLite), REST endpoints, overlap detection, calling A's `chain.js` | Solidity, keys |
| **C** | Frontend | Claim form, map view (Leaflet), attestation screen, QR certificate page, dispute button | Backend logic, keys |
| **D** | Product, docs and demo | Problem statement, PDF, pitch deck, README, seed/demo data, demo script, testing checklist, GitHub repo hygiene | Code, except README and test data |

**Status: A's core work is complete.** Integration with B and C proceeds against the working scripts.

---

## 2. Architecture

```
[Frontend: C]  <-- HTTP -->  [Backend API: B]  --calls-->  [chain.js: B wraps A's scripts]  -->  MST Testnet
   map, forms,                 DB (parcels, photos,            Signer key in .env              LandRegistry.sol
   QR, dispute                 polygons, overlap check)         All tx hashes logged           (deployed, live)
```

**Rule:** personal data (name, ID number, photos) stays OFF-chain. On-chain we store only hashes, coordinates, scores and status. Blockchain preserves evidence of community consensus. It does not decide ownership.

---

## 3. What goes on-chain vs off-chain

| On-chain (`LandRegistry.sol`) | Off-chain (backend DB) |
|---|---|
| `ownerHash` = sha256(ID + salt) | Owner name, phone, real ID |
| `evidenceHash` = sha256(photos + GPS + polygon + witness list) | Photos, GeoJSON polygon, notes |
| Point lat/lon | Full boundary polygon |
| Trust score, status (Pending / Verified / Disputed) | Dispute reason text, adjudication notes |
| Attestation events (who, role, score) | Display names of attesters |

---

## 4. Features

**Core** ✅ **Blockchain foundation ready**
1. ✅ Generate and fund wallet  
2. ✅ Connect to MST Testnet  
3. ✅ Send native MST  
4. ✅ Compile Solidity contract  
5. ✅ Deploy LandRegistry.sol to testnet  
6. ✅ Call contract functions via encoded transactions  

**Standout** (In progress — B and C build against these)
7. **Trust-weighted attestation:** Neighbor = 1, Leader = 3, NGO = 3. Verified at score >= 5. Already in the contract.  
8. **Map view with automatic overlap detection:** when a new polygon overlaps an existing one, the backend flags it and the claim can be sent to dispute.  
9. **QR proof certificate:** a page showing claim ID, status, contract address and tx hash, with a QR code that links to a public verify page.  

**Agency view (impact story):** an `/verify/:id` page an NGO or insurer opens to check the claim against the ledger instead of a destroyed paper deed.

---

## 5. Implementation: Workflow Scripts (A — Complete)

All scripts are in `scripts/` and callable via npm:

### Setup & Wallet
```bash
npm run wallet        # generateWallet.js — create/import wallet, save to .env
npm run init          # init.js — verify signer identity, check block number
npm run balance       # balance.js — confirm wallet is funded
```

### Transactions
```bash
npm run send          # send.js — send 0.001 MST to BridgeKey recipient (test flow)
```

### Smart Contract Lifecycle
```bash
npm run compile       # compile.js — solc → build/LandRegistry.json (ABI + bytecode)
npm run deploy        # deploy.js — deploy contract, fetch address, log to .env + SUBMISSION.md
npm run demo          # interact.js — encode & call createClaim() on deployed contract
```

### Key Files Created by A

#### `.env` (do NOT commit)
```bash
PRIVATE_KEY=0x...             # Signer's private key (funded wallet)
RPC_URL=https://testnetrpc.mstblockchain.com
RECIPIENT=0x...               # BridgeKey public address (for testing send.js)
CONTRACT_ADDRESS=0x...        # Auto-appended by deploy.js
```

#### `contracts/LandRegistry.sol`
- **No constructor args** (simplified for hackathon).
- **Functions:**
  - `createClaim(bytes32 ownerHash, bytes32 evidenceHash, uint32 latE6, uint32 lonE6)` → emits `ClaimCreated` event.
  - `attest(uint256 claimId, uint8 role)` → adds attestation, updates score, may auto-verify.
  - `dispute(uint256 claimId)` → flags claim.
  - `resolveDispute(uint256 claimId, bool restore)` → admin only, resolves flag.
  - `setRole(address user, uint8 role)` → admin only, defines attester roles.
  - `getClaim(uint256 id)` → returns full claim struct.

#### `build/LandRegistry.json`
- Generated by `npm run compile`.
- Contains ABI and bytecode for all downstream interactions.

#### `SUBMISSION.md`
- Auto-updated after every deploy/interact.
- Records: contract address, deploy tx hash, interaction tx hashes, timestamps.
- **Final deliverable for judges.**

#### `package.json` (updated with npm scripts)
```json
{
  "scripts": {
    "wallet": "node scripts/generateWallet.js",
    "init": "node scripts/init.js",
    "balance": "node scripts/balance.js",
    "send": "node scripts/send.js",
    "compile": "node scripts/compile.js",
    "deploy": "node scripts/deploy.js",
    "demo": "node scripts/interact.js"
  },
  "dependencies": {
    "@mstblockchain/mst-sdk": "latest",
    "dotenv": "^16.0.0",
    "solc": "^0.8.0",
    "fs-extra": "^11.0.0",
    "ethers": "^6.0.0"
  }
}
```

---

## 6. Contract Call Interface (A built, B wraps)

A has proven that contract functions can be called via `ethers.Interface` + `sendTransaction`. B will wrap these into helper functions:

```javascript
// B's chain.js (wraps A's interaction pattern)

async function createClaim({ ownerHash, evidenceHash, latE6, lonE6 }) {
  // Encode function call
  // Sign and send via signer.sendTransaction
  // Wait for confirmation
  // Return { claimId, txHash }
}

async function attest(claimId, role) {
  // Call contract.attest()
  // Return { txHash, newScore, newStatus }
}

async function dispute(claimId) {
  // Call contract.dispute()
  // Return { txHash }
}

async function getClaim(claimId) {
  // Call contract.getClaim() (view, no gas)
  // Return { ownerHash, evidenceHash, latE6, lonE6, score, status }
}
```

---

## 7. REST API Skeleton (B to build, C to call)

| Endpoint | Purpose | Calls chain.js |
|---|---|---|
| `POST /claims` | Create claim (owner, lat/lon, polygon, photo). Runs overlap check, calls `createClaim` | ✅ Yes |
| `GET /claims` | List all claims with status (for the map) | View only |
| `GET /claims/:id` | Claim detail plus on-chain data | ✅ getClaim |
| `POST /claims/:id/attest` | Body: `{ role, name }`. Calls `attest` | ✅ Yes |
| `POST /claims/:id/dispute` | Body: `{ reason }` | ✅ Yes |
| `POST /claims/:id/resolve` | Admin only | ✅ Yes |
| `GET /verify/:id` | Public verify data (what the QR links to) | ✅ getClaim |

---

## 8. Frontend Requirements (C to build, calls B's API)

### Pages
1. **`/` (Home)** — Create claim form: owner name, GPS (map picker), polygon (draw on map), photo upload.
2. **`/claims` (Map View)** — Leaflet map with all claims. Color by status (Pending=yellow, Verified=green, Disputed=red). Click marker → detail panel.
3. **`/claims/:id` (Claim Detail)** — Status, attestations, score. Buttons: [Attest as Neighbor] [Attest as Leader] [Attest as NGO] [Dispute].
4. **`/claims/:id/dispute` (Dispute Form)** — Reason text, flag to admin.
5. **`/claims/:id/certificate` (QR Certificate)** — Show claim ID, status, contract address, deploy tx hash, create tx hash. QR links to `/verify/:id`.
6. **`/verify/:id` (Public Verify)** — Shows read-only claim + on-chain proof. For aid agencies / insurance.

### Overlap Detection Alert
When a new polygon overlaps an existing one (detected server-side in `/claims` POST), return:
```json
{
  "warning": "Overlaps existing claim #42",
  "action": "Mark as disputed?"
}
```

---

## 9. Timeline (24 hours) — Updated Status

| Hours | A: Blockchain | B: Backend | C: Frontend | D: Docs / demo |
|---|---|---|---|---|
| **0-1** | ✅ **DONE:** Wallet, faucet, init, balance, send test | Create Express skeleton | Create app skeleton | Create GitHub repo, README skeleton |
| **1-2** | ✅ **DONE:** Mock chain.js ready, all script templates | Build endpoints against mock | Build claim form | Draft problem statement |
| **2-5** | ✅ **DONE:** Compile + deploy LandRegistry.sol. Contract live on testnet. | Add DB, hashing helpers, overlap detection | Map view with Leaflet | Write real-world gap (Haiti 2010, Indian floods) |
| **5-8** | ✅ **DONE:** `interact.js` proves contract calls work. All tx hashes in SUBMISSION.md. | Wire API to real chain.js (in `/scripts`) | Attestation screen, status badges | Seed demo data (5-6 sample parcels) |
| **8-12** | 🔄 **NOW:** Polish error handling, retry logic. BridgeKey connect button (optional, can use env key) | Overlap flagging to dispute flow. Test with A's contract. | Dispute UI, overlap warning on map | Draft system design and requirements PDF |
| **12-16** | 🔄 **Integration testing with whole team.** Fix any chain bugs from B/C's calls | Fix API bugs from frontend calls | QR certificate and `/verify/:id` page | Draft pitch deck (Problem, Solution, Demo, Impact) |
| **16-20** | ✅ Contract frozen. Final review of all hashes. | Freeze API | Polish UI, QR rendering | Finish PDF, README with MST details, rehearse demo |
| **20-22** | **Backup:** pre-create demo claims if testnet is slow | Bug fixes only | Bug fixes only | Record backup demo video |
| **22-24** | **Final check:** All hashes in SUBMISSION.md. .env not committed. | Push | Push | Submit, present |

**Current Status:** A is **complete with all blockchain fundamentals.** B and C can now integrate and test in parallel.

---

## 10. Submission Checklist (Track Requirements)

- [x] Wallet generated and funded (**A complete**)
- [x] Connected to MST Testnet via RPC (**A complete**)
- [x] Sent native MST transaction (**A complete**)
- [x] Compiled LandRegistry.sol (**A complete**)
- [x] **Contract deployed on MST Testnet** ✅ (**A complete**)
- [x] Contract address recorded in `.env` and `SUBMISSION.md` (**A complete**)
- [x] **Deploy tx hash recorded** (**A complete**)
- [x] Contract functions callable via encoded transactions (**A complete, proven in interact.js**)
- [ ] Backend API built and wired to chain.js (B in progress)
- [ ] Frontend map, forms, attestation UI (C in progress)
- [ ] BridgeKey wallet integration shown (optional but recommended)
- [ ] Working app or demo link (B + C to deliver)
- [ ] Public GitHub repo with contracts, frontend, backend, README with MST details (RPC, network, address, tx hashes) (**D to finalize**)
- [ ] No private keys committed (`.env` in `.gitignore` verified) ✅
- [ ] PDF: problem statement, real-world gap, system design, requirements (**D to deliver**)

---

## 11. Known Implementation Details

### Wallet & Funding
- Wallet generated via `generateWallet.js` → MST Testnet faucet (manual or auto).
- Minimum balance: ~0.01 MST for deploy + multiple contract calls.
- Private key stored in `.env`, **never committed to Git.**

### Contract Deployment
- ABI + bytecode extracted by `compile.js` into `build/LandRegistry.json`.
- Deployment via `deploy.js` → `client.signer.deploy()` → waits for confirmation → logs contract address.
- Deploy tx hash recorded and added to SUBMISSION.md and `.env`.

### Contract Calls
- A proved via `interact.js` that `ethers.Interface` can encode contract function calls.
- Data passed to `client.signer.sendTransaction()` for signing and broadcast.
- Each call returns a tx hash (on-chain proof).

### Versioning & Git
- `.env` in `.gitignore` (credentials safe).
- `build/` generated, should be in `.gitignore` (regenerate on `npm run compile`).
- `SUBMISSION.md` committed (judges need to see final tx hashes).
- `contracts/` and `scripts/` committed.

---

## 12. Integration Points (B & C reference)

### B (Backend) receives from A:
```
scripts/deploy.js        → contract address
scripts/interact.js      → proven contract call method
build/LandRegistry.json  → ABI + bytecode for function encoding
.env template            → RPC_URL, PRIVATE_KEY structure
```

### B builds:
```
Express server + REST API
Database (claims, attestations, parcels)
Overlap detection logic
chain.js wrapper (calls A's scripts or embeds the logic directly)
```

### C (Frontend) receives from B:
```
REST API endpoints (POST /claims, GET /claims/:id, POST /claims/:id/attest, etc.)
Claim objects with on-chain data (ownerHash, evidenceHash, score, status, txHash)
```

### C builds:
```
Claim form + Leaflet map
Attestation UI
Dispute flow
QR certificate + verify page
```

---

## 13. Stretch Ideas (if ahead of schedule)

- Per-attester wallets (each neighbor/leader signs their own `attest` from BridgeKey).
- Volunteer credential verification during a crisis (prove a stranger is a licensed nurse or engineer).
- SMS or WhatsApp claim entry for low-connectivity areas.
- Insurance or aid payout simulation that references the ledger.
- Multi-language UI (English + local language).

---

## 14. Demo Script (3 minutes)

1. **Story:** a family loses its deed in a flood. Nobody can prove the land is theirs.
2. Open the map and create the claim (photo, GPS, boundary drawn).
3. Two neighbors, a village leader and an NGO worker attest. The score climbs and the status changes to **Verified**.
4. Show the **contract address and tx hashes on MST Testnet** (via SUBMISSION.md or block explorer).
5. A second person submits an overlapping claim. The map flags it and it goes to **dispute** for human adjudication.
6. An aid agency opens the QR certificate and verifies the claim in seconds (the `/verify/:id` page).
7. Close: "Blockchain doesn't decide who owns the land. It preserves community consensus so no one is left out."

---

## 15. Risks & Mitigations

| Risk | Mitigation | Status |
|---|---|---|
| Unknown SDK contract-call method | A investigated and proved it works via `ethers.Interface` + `sendTransaction` | ✅ **Resolved** |
| Testnet slow or down at demo time | Pre-create claims (hour 20-22), backup video | Plan in place |
| Faucet funds run out | Keep sends tiny (0.001 MST), batch operations | A monitored |
| Laptop overheating | Close extra tabs, one dev server at a time | Team aware |
| Private key leaked | `.env` in `.gitignore`, check before every push | ✅ **Verified** |
| B and C blocked waiting for A | A shipped working scripts early; B and C can mock/test in parallel | ✅ **Unblocked** |

---

## 16. What's Next (Immediate Actions)

1. **B:** Clone the scripts, understand `chain.js` wrapper pattern. Start building Express API with mock data first.
2. **C:** Clone the scripts, create React/HTML app scaffold. Start with claim form + mock API response.
3. **A:** Monitor contract on testnet. Fix any unforeseen contract call issues. Prepare BridgeKey integration snippet.
4. **D:** Create GitHub repo with this design.md. Draft problem statement and system design PDF.

---

**Last Updated:** 28 Sept 2026, after contract deployment & proof of contract calls.  
**Contract Address:** See `SUBMISSION.md` and `.env`.  
**Next Review:** After B completes REST API (hour 8-10).
