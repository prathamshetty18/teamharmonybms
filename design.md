# Design Document: Post-Disaster Land Rights & Relief on MST Blockchain

> **Design goal:** Preserve community consensus and immutable land-claim evidence when physical records are lost, then use that verified proof to release government relief quickly and without fraud.
> *BMS College of Engineering 24-Hour Buildathon (September 28-29, 2026) | Team Harmony*

---

## 1. Problem & Design Goals

### Problem
Floods, fires, and earthquakes destroy paper deeds and registry offices. Two things go wrong at once:

1. **Land rights are lost.** Displaced families face eviction and land-grabbing when they cannot prove ownership.
2. **Relief is blocked.** Compensation schemes need proof of ownership of the affected land. Without records, payouts are slow, disputed, or lost to fraud and duplicate claims.

### Design goals
| # | Goal | How the design meets it |
|---|---|---|
| G1 | Preserve evidence of ownership without the chain deciding ownership | Trust-weighted community attestation; chain stores hashes and votes, not judgments |
| G2 | Protect privacy | No PII on-chain; only hashes, coordinates, scores, and payout state |
| G3 | Prevent conflicting or duplicate claims | Geospatial overlap detection routes conflicts to human dispute resolution |
| G4 | Make verification instant for third parties | Public QR page `/verify/:id` showing on-chain state and payout status |
| G5 | Turn verified land proof into fast, auditable compensation | Relief module: geofenced eligibility, assessed damage, two-officer approval, one-time release |
| G6 | Prevent payout fraud | Verified-only, dispute freeze, assessor role, one payout per claim per event, caps, budget ceiling |

> **Core philosophy:** Blockchain does not unilaterally decide who owns the land; it permanently preserves verifiable evidence of community consensus so no legitimate family is disenfranchised. Verified land proof is then the key that unlocks government relief.

---

## 2. System Architecture

Four tiers: a **React** frontend, a **Node.js/Express** backend (geospatial overlap detection and a relief eligibility engine), **MongoDB Atlas** for off-chain data, and smart contracts on the **MST Testnet**.

```mermaid
flowchart TD
    subgraph Frontend["Frontend (React)"]
        direction TB
        CF["Claim Form<br/><small>Map + GPS</small>"]
        MV["Map View<br/><small>Claim markers</small>"]
        GD["Gov Dashboard<br/><small>Reliefs + payouts</small>"]
        VP["Verify Page<br/><small>Public /verify/:id</small>"]
    end

    subgraph Backend["Backend (Express + Node.js)"]
        direction TB
        PC["POST /claims<br/><small>Create claim</small>"]
        PA["POST /attest<br/><small>Multi-sig vote</small>"]
        GC["GET /claims<br/><small>Query all claims</small>"]
        RL["POST /reliefs<br/><small>Declare relief event</small>"]
        EL["Eligibility engine<br/><small>Zone + Verified check</small>"]
        AS["POST /assess<br/><small>Damage level</small>"]
        AP["POST /approve-payout<br/><small>Officer approval</small>"]
        CJ["chain.js<br/><small>Contract layer</small>"]
        OD["Overlap detection<br/><small>Compare all coordinates</small>"]
        DR["Dispute resolver<br/><small>Flag for human review</small>"]
    end

    subgraph Mongo["MongoDB Atlas"]
        direction TB
        CL["claims + images<br/><small>Off-chain evidence</small>"]
        RP["reliefs + payouts<br/><small>Off-chain records</small>"]
    end

    subgraph Blockchain["Blockchain (MST Testnet)"]
        direction TB
        CC["createClaim()<br/><small>Proof of existence</small>"]
        AT["attest()<br/><small>Add signature</small>"]
        DP["dispute()<br/><small>Flag conflict</small>"]
        GT["getClaim()<br/><small>Read immutable</small>"]
        CR["createRelief()<br/><small>Fund a relief event</small>"]
        AC["assess() / approvePayout()<br/><small>Damage + 2 officers</small>"]
        RE["release()<br/><small>Pay once, if Verified</small>"]
        RPC["MST Blockchain Testnet: https://testnetrpc.mstblockchain.com"]
    end

    CF --> PC
    MV --> GC
    GD --> RL
    GD --> EL
    GD --> AS
    GD --> AP
    VP --> CJ

    PC --> OD
    OD --> CC
    PC --> CL
    PA --> AT
    DR --> DP
    CJ --> GT
    GC -.-> DR

    RL --> CR
    RL --> RP
    EL --> GT
    EL --> RP
    AS --> AC
    AP --> AC
    AC --> RE

    classDef fe fill:#133e68,stroke:#3b82f6,stroke-width:1px,color:#ffffff;
    classDef be fill:#0d5c46,stroke:#10b981,stroke-width:1px,color:#ffffff;
    classDef db fill:#3b1f6b,stroke:#a78bfa,stroke-width:1px,color:#ffffff;
    classDef bc fill:#6b3f0a,stroke:#f59e0b,stroke-width:1px,color:#ffffff;
    classDef rpc fill:#4a2800,stroke:#d97706,stroke-width:1px,color:#fbbf24;

    class CF,MV,GD,VP fe;
    class PC,PA,GC,RL,EL,AS,AP,CJ,OD,DR be;
    class CL,RP db;
    class CC,AT,DP,GT,CR,AC,RE bc;
    class RPC rpc;
```

### Component responsibilities
| Tier | Component | Responsibility |
|---|---|---|
| Frontend | Claim Form / Map View | Draw boundary, capture GPS, upload photos, show claim markers |
| Frontend | **Gov Dashboard** | Declare relief events; see eligible claims, budget remaining, and payout status; assess, approve, release |
| Frontend | Verify Page | Public QR target; on-chain state, evidence re-hash check, payout status |
| Backend | Overlap detection | Compare a candidate polygon against existing claims (Turf.js); route conflicts to dispute |
| Backend | **Eligibility engine** | A claim is eligible when Verified, not Disputed, and inside the relief zone (point-in-polygon) |
| Backend | `chain.js` | Single contract layer for both `LandRegistry` and `ReliefFund` |
| Database | Atlas | Claims, images, reliefs, payouts (all off-chain data) |
| Chain | `LandRegistry` | Claim hashes, attestations, scores, status |
| Chain | **`ReliefFund`** | Escrowed budget, assessments, approvals, one-time release |

---

## 3. Data Design: On-Chain vs. Off-Chain

No PII goes on a public ledger.

| On-Chain (`LandRegistry.sol`, `ReliefFund.sol`) | Off-Chain (MongoDB Atlas / secure backend) |
|---|---|
| `ownerHash` = `SHA-256(NationalID + Salt)` | Owner full name, phone number, government ID |
| `evidenceHash` = `SHA-256(Photos + GeoJSON + Witnesses)` | Original deed photos, ground survey images (stored in Atlas) |
| Reference latitude and longitude (`latE6`, `lonE6`) | Full polygon boundary coordinates |
| Community trust score and status (`Pending` / `Verified` / `Disputed`) | Dispute notes, witness written statements |
| Attestation logs (attester address, role, score) | Human-readable attester display profiles |
| **Relief event: zone hash, per-claim cap, budget** | **Full zone polygon, scheme description** |
| **Damage level and `damageEvidenceHash`** | **Damage assessment photos and notes** |
| **Payout status, amount, beneficiary address, approvals, tx hash** | **Bank or account details, beneficiary contact info** |

**Privacy note:** the beneficiary wallet address is public on-chain. Never store names or ID numbers next to it.

**Tamper evidence:** the verify page re-hashes the evidence stored in Atlas and compares it to the on-chain `evidenceHash`. If they differ, the page flags the record.

---

## 4. Land Claim Design (Core Registry)

### 4.1 Trust-weighted attestation
| Attester role | Weight |
|---|---|
| Neighbor | +1 |
| Village Leader | +3 |
| Accredited NGO | +3 |

A claim moves `Pending` to **`Verified`** when score is **>= 5**.

### 4.2 Claim state machine
```
Pending --(score >= 5)--> Verified
Pending/Verified --(dispute)--> Disputed
Disputed --(resolveDispute: restore = true)--> Verified
Disputed --(resolveDispute: restore = false)--> Pending
```

### 4.3 Geospatial overlap detection
On `POST /claims`, the backend compares the candidate polygon to existing claims. Overlaps are flagged and routed to the Dispute Resolver for human arbitration; the chain records the flag via `dispute()`.

### 4.4 Public QR certificate
`/verify/:id` shows claim status, score, attesters, evidence-hash match, and (new) the **payout status** for any relief event linked to the claim.

---

## 5. Relief & Reimbursement Module (New)

Government compensation is a core feature. Verified land proof decides who is eligible, and the ledger makes every payout public and auditable.

### 5.1 Actors
| Actor | Capability |
|---|---|
| Government admin | Declares relief events, deposits budget, grants officer and assessor roles |
| Assessor (field officer or NGO) | Records damage level with photo evidence |
| Government officer (x2) | Approves payout amount and beneficiary |
| Claimant | Receives payout; sees status on the verify page |
| Public / aid workers | Read payout state and tx hash on the verify page |

### 5.2 End-to-end flow
1. **Declare relief event.** Name, affected-zone polygon, compensation rule, per-claim cap, and budget deposited into `ReliefFund`.
2. **Automatic eligibility.** Claim is `Verified` (score >= 5), not `Disputed`, and inside the zone (Turf.js point-in-polygon).
3. **Damage assessment.** Accredited assessor records a damage level with photos. The evidence hash goes on-chain; photos stay off-chain.
4. **Amount calculation.** `amount = parcel area x rate per acre x damage multiplier`, capped at the per-claim maximum.
5. **Two-officer approval.** Two officers must approve the same amount and the same beneficiary.
6. **Release.** `release()` pays once per claim per relief event and records the tx hash. It re-checks that the claim is still `Verified` at payment time.
7. **Public status.** The verify page shows `Eligible` -> `Assessed` -> `Approved` -> `Paid`, the amount, and the tx hash.

### 5.3 Payout state machine
```
None --(assess)--> Assessed --(2 matching approvals)--> Approved --(release)--> Paid
```
`release()` reverts if the claim is `Disputed` or the payout is already `Paid`.

### 5.4 Anti-fraud rules
| Rule | Enforced by |
|---|---|
| Payouts only to `Verified` claims | `assess()` and `release()` check `LandRegistry` |
| Disputed claims are frozen | `release()` reverts until `resolveDispute` restores the claim |
| Damage not self-reported | `assess()` restricted to assessor role |
| No duplicate payouts | One payout per claim per relief event |
| Bounded spend | Per-claim cap and budget ceiling checked in `approvePayout()` |
| No single-officer approval | Two officers must submit identical amount and beneficiary |
| Full audit trail | Every payout, approval, and assessment emitted as an on-chain event |

### 5.5 Testnet vs. real world
- **Testnet:** payouts are released as native MST from `ReliefFund`, simulating the disbursement.
- **Production:** governments pay through bank transfer (for example India's Direct Benefit Transfer); the chain records the payment reference as the audit trail.
- **Limit of the design:** the chain makes officer actions visible and permanent, but does not make them automatically correct.

---

## 6. Smart Contract Interfaces

### 6.1 `LandRegistry.sol`
| Function | Signature | Description |
|---|---|---|
| `createClaim` | `(bytes32 ownerHash, bytes32 evidenceHash, uint32 latE6, uint32 lonE6)` | Creates a claim; emits `ClaimCreated` |
| `attest` | `(uint256 claimId)` | Adds a role-weighted signature (role resolved on-chain); updates status |
| `dispute` | `(uint256 claimId)` | Flags a conflicting claim |
| `resolveDispute` | `(uint256 claimId, bool restore)` | Arbiter resolves a dispute |
| `setRole` | `(address user, uint8 role)` | Admin only; defines attester roles |
| `getClaim` | `(uint256 claimId)` | View: hashes, coordinates, score, status |

### 6.2 `ReliefFund.sol` (planned)
Reads claim status from `LandRegistry` and holds the relief budget in escrow.

| Function | Signature | Description |
|---|---|---|
| `createRelief` | `(bytes32 zoneHash, uint256 maxPerClaim) payable` | Declares a relief event and deposits budget; emits `ReliefCreated` |
| `fundRelief` | `(uint256 reliefId) payable` | Tops up a relief budget |
| `setOfficer` / `setAssessor` | `(address user, bool allowed)` | Admin only; grants officer or assessor role |
| `assess` | `(uint256 claimId, uint256 reliefId, uint8 damageLevel, bytes32 damageEvidenceHash)` | Assessor records damage; claim must be `Verified` |
| `approvePayout` | `(uint256 claimId, uint256 reliefId, uint256 amount, address payable beneficiary)` | Officer approval; two matching approvals required; within cap and budget |
| `release` | `(uint256 claimId, uint256 reliefId)` | Pays once; reverts if `Disputed` or already paid; emits `PayoutReleased` |
| `getPayout` | `(uint256 claimId, uint256 reliefId)` | View: status, amount, beneficiary, approvals |

Payout status values: `None`, `Assessed`, `Approved`, `Paid`.

**Network:** MST Blockchain Testnet, RPC `https://testnetrpc.mstblockchain.com`.
**Artifacts:** `build/LandRegistry.json`, `build/ReliefFund.json`.

---

## 7. REST API Design

| Method | Endpoint | Description | On-Chain Call |
|---|---|---|---|
| `POST` | `/claims` | Submit a claim with boundary, photos, owner hash | `createClaim()` |
| `GET` | `/claims` | List all parcels (map markers) | Off-chain DB |
| `GET` | `/claims/:id` | Parcel details, attestation history, state | `getClaim()` |
| `POST` | `/claims/:id/attest` | Community attestation (`{ role, name }`) | `attest()` |
| `POST` | `/claims/:id/dispute` | Flag a boundary dispute (`{ reason }`) | `dispute()` |
| `POST` | `/claims/:id/resolve` | Admin resolves a dispute | `resolveDispute()` |
| `GET` | `/verify/:id` | Public verification view, includes payout status | `getClaim()`, `getPayout()` |
| `POST` | `/reliefs` | Declare relief event (zone, rate, cap, budget) | `createRelief()` |
| `GET` | `/reliefs` | List relief events | Off-chain DB |
| `GET` | `/reliefs/:id/eligible` | Verified, undisputed, in-zone claims with computed amounts | `getClaim()` |
| `POST` | `/claims/:id/assess` | Assessor records damage (`{ reliefId, damageLevel }` + photos) | `assess()` |
| `POST` | `/claims/:id/approve-payout` | Officer approval (`{ reliefId }`) | `approvePayout()` |
| `POST` | `/claims/:id/release-payout` | Release an approved payout (`{ reliefId }`) | `release()` |
| `GET` | `/claims/:id/payout` | Payout status, amount, tx hash | `getPayout()` |

---

## 8. Technology Choices

| Layer | Choice | Reason |
|---|---|---|
| Contracts | Solidity `^0.8.0` on MST Testnet | Low-fee, fast confirmation; tamper-evident timestamps |
| Chain client | `@mstblockchain/mst-sdk`, `ethers.js` v6, BridgeKey Wallet | Official SDK plus standard EVM tooling |
| Backend | Node.js, Express, `dotenv`, `fs-extra`, `multer` | Fast to build; handles photo uploads |
| Geospatial | Turf.js | Overlap detection and zone point-in-polygon in one library |
| Database | MongoDB Atlas (`mongodb` driver) | Flexible documents for claims, images, reliefs, payouts |
| Frontend | React, Leaflet, HTML5, CSS3 | Interactive boundary drawing and GPS capture |

---

## 9. Environment & Deployment

```env
RPC_URL=https://testnetrpc.mstblockchain.com
PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
RECIPIENT=0xBRIDGEKEY_TEST_RECIPIENT_ADDRESS
CONTRACT_ADDRESS=0xAUTO_POPULATED_AFTER_DEPLOY
RELIEF_CONTRACT_ADDRESS=0xAUTO_POPULATED_AFTER_RELIEF_DEPLOY
MONGO_URI=mongodb+srv://USER:PASSWORD@YOUR_CLUSTER.mongodb.net/
PORT=5000
```

Deployment order: `npm run compile` -> `npm run deploy` (LandRegistry) -> `npm run deploy:relief` (ReliefFund, pointed at the deployed LandRegistry) -> `npm run demo`.

Never commit `.env`.

---

## 10. Demo Scenario

1. Three neighbors and a village leader attest a claim until it reaches score >= 5 (`Verified`).
2. A conflicting overlapping claim is submitted and routed to dispute.
3. Government admin declares a flood relief event with a zone that covers the verified claim.
4. The dashboard lists the claim as eligible, with a computed amount.
5. An assessor records damage; two officers approve; `release()` pays out.
6. Scanning the QR code shows `Paid`, the amount, and the tx hash.
7. Trying to release a payout on the disputed claim fails, showing the freeze.

---

## 11. Team & Ownership

| Member | Role | Design areas owned |
|---|---|---|
| **Srujan** | Blockchain Lead | `LandRegistry.sol`, `ReliefFund.sol`, deployment, MST SDK, tx verification |
| **Team Member B** | Backend / API Lead | Express, Atlas, overlap algorithm, relief eligibility engine, REST endpoints, `chain.js` |
| **Team Member C** | Frontend Lead | Leaflet map, claim workflow, attestation UI, QR view, government dashboard, payout status badge |
| **Team Member D** | Product & Demo Lead | Problem statement, demo script, seeded relief event, verification checklist, docs |

---

## 12. Open Items

- `ReliefFund.sol` and `deploy:relief` are still in progress.
- Record deployed addresses, tx hashes, and payout receipts in `SUBMISSION.md`.
- Add screenshots or a re-exported diagram from the Mermaid source if a static image is needed for submission.