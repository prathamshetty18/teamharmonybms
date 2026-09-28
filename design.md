# Post-Disaster Land Rights & Relief on MST Blockchain

> **Preserving community consensus and immutable land claim evidence when physical records are lost in crisis, and using that verified proof to release government relief fast and without fraud.**  
> *Built for BMS College of Engineering 24-Hour Buildathon (September 28–29, 2026)*

---

## 📌 Overview & Real-World Problem

When natural disasters (floods, fires, earthquakes) strike, physical land records, paper deeds, and local registry offices are frequently destroyed or rendered inaccessible. Displaced families face eviction, predatory land-grabbing, and prolonged bureaucratic delays when attempting to reclaim their property.

The same missing paperwork also blocks **government relief**. Compensation schemes need proof that a family owns the affected land, and without records, payouts are slow, disputed, or lost to fraud and duplicate claims.

This project delivers a **decentralized, community-attested land rights registry** deployed on the **MST Blockchain Testnet**, plus a **relief and reimbursement module** that turns verified land proof into transparent, auditable government compensation.

> **Core Philosophy:** *Blockchain does not unilaterally decide who owns the land; it permanently preserves verifiable evidence of community consensus so no legitimate family is disenfranchised. Verified land proof is then the key that unlocks government relief.*

---

## 🏛️ System Architecture & Flowchart

The system connects a lightweight **React** frontend, a **Node.js/Express** backend with geospatial overlap detection and a relief eligibility engine, a **MongoDB Atlas** database for off-chain data, and smart contracts deployed on the **MST Testnet**.

### Flowchart Breakdown (Mermaid)

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

    %% Frontend to Backend Flows
    CF --> PC
    MV --> GC
    GD --> RL
    GD --> AP
    VP --> CJ

    %% Backend processing and storage
    PC --> OD
    OD --> CC
    PC --> CL
    PA --> AT
    DR --> DP
    CJ --> GT
    GC -.-> DR

    %% Relief flow
    RL --> CR
    RL --> RP
    EL --> GT
    EL --> RP
    AS --> AC
    AP --> AC
    AC --> RE

    %% Styling to reflect architecture tiers
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

> The earlier `assets/architecture.png` no longer matches this design. Re-export it from the diagram above before submitting.

---

## 💸 Relief & Reimbursement Module

Government compensation is a core feature, not an add-on. Verified land proof decides who is eligible, and the ledger makes every payout public and auditable.

### Flow

1. **Declare relief event.** An authorized government admin creates a relief event: name, affected-zone polygon, compensation rule, per-claim cap, and a budget deposited into the `ReliefFund` contract.
2. **Automatic eligibility.** A claim is eligible when it is `Verified` (score ≥ 5), not `Disputed`, and its location falls inside the affected zone (Turf.js point-in-polygon).
3. **Damage assessment.** An accredited assessor (field officer or NGO) records a damage level with photo evidence. The evidence hash goes on-chain and the photos stay off-chain.
4. **Amount calculation.** `amount = parcel area × rate per acre × damage multiplier`, capped at the per-claim maximum.
5. **Two-officer approval.** Two government officers must approve the same amount and the same beneficiary before funds can move.
6. **Release.** `release()` pays the beneficiary once per claim per relief event and records the transaction hash. It re-checks that the claim is still `Verified` at the moment of payment.
7. **Public status.** The QR verify page shows the payout state (`Eligible` → `Assessed` → `Approved` → `Paid`), the amount, and the transaction hash.

### Anti-fraud rules

- Payouts only go to `Verified` claims, so they require weighted community consensus.
- Disputed claims are frozen. An approved payout cannot be released while its claim is `Disputed`, until `resolveDispute` restores it.
- Damage must be assessed by a verified assessor role, not self-reported.
- One payout per claim per relief event, with a per-claim cap and a budget ceiling.
- Every payout, approval, and assessment is emitted as an on-chain event.

### Testnet vs. real world

On the testnet, payouts are released as native MST from the `ReliefFund` contract, which simulates the disbursement. In production, governments pay through bank transfer (for example India's Direct Benefit Transfer), and the chain would record the payment reference as the audit trail. The chain makes officer actions visible and permanent, but it does not make them automatically correct.

---

## 🔒 Privacy Architecture: On-Chain vs. Off-Chain

To adhere to privacy standards and avoid storing sensitive personally identifiable information (PII) on a public ledger:

| On-Chain (`LandRegistry.sol`, `ReliefFund.sol`) | Off-Chain (MongoDB Atlas / Secure Backend) |
|---|---|
| `ownerHash` = `SHA-256(NationalID + Salt)` | Owner full name, phone number, government ID |
| `evidenceHash` = `SHA-256(Photos + GeoJSON + Witnesses)` | Original deed photos, ground survey images (stored in Atlas) |
| Reference Latitude & Longitude (`latE6`, `lonE6`) | Full polygon boundary coordinates |
| Community Trust Score & Status (`Pending` / `Verified` / `Disputed`) | Dispute notes, witness written statements |
| Attestation logs (Attester address, role, score) | Human-readable attester display profiles |
| Relief event: zone hash, per-claim cap, budget | Full zone polygon, scheme description |
| Damage level and `damageEvidenceHash` | Damage assessment photos and notes |
| Payout status, amount, beneficiary address, approvals, tx hash | Bank or account details, beneficiary contact info |

The beneficiary wallet address is public on-chain. Do not store names or ID numbers next to it.

---

## ⭐ Key Features

1. **Proof of Existence on MST Testnet**
   - High-throughput, low-fee smart contract transactions on the MST network create tamper-evident claim timestamps.
2. **Trust-Weighted Multi-Party Attestation**
   - Consensus requires weighted scores from diverse community actors:
     - **Neighbor:** `+1` weight
     - **Village Leader:** `+3` weight
     - **Accredited NGO:** `+3` weight
   - Claims transition automatically from `Pending` to **`Verified`** once reaching **Score ≥ 5**.
3. **Automated Geospatial Overlap Detection**
   - Backend compares candidate claim polygons against verified registries using coordinate intersection algorithms.
   - Conflicting submissions automatically route to the **Dispute Resolver** for human arbitration.
4. **Public QR Proof Certificate (`/verify/:id`)**
   - Generates a cryptographically verifiable QR code linking directly to on-chain state, allowing emergency aid workers, relief agencies, and insurers to confirm land rights immediately.
5. **Government Relief & Reimbursement**
   - Relief events with a geofenced zone and a funded on-chain budget.
   - Automatic eligibility from verified claims, damage assessment by accredited assessors, two-officer approval, and one-time release with a public audit trail.
6. **Government Dashboard**
   - Officers see eligible claims, budget remaining, and payout status, and can assess, approve, and release payouts.
7. **Tamper-Evident Evidence in MongoDB Atlas**
   - Photos and claim data live off-chain in Atlas. The verify page re-hashes the stored evidence and compares it to the on-chain `evidenceHash`.

---

## ⚙️ Tech Stack

- **Smart Contracts:** Solidity `^0.8.0`, deployed on MST Testnet (`LandRegistry.sol`, `ReliefFund.sol`)
- **Blockchain Client & SDK:** `@mstblockchain/mst-sdk`, `ethers.js` v6, BridgeKey Wallet
- **Backend API:** Node.js, Express, `dotenv`, `fs-extra`, Turf.js (geospatial calculations and zone checks), `multer` (uploads)
- **Database:** MongoDB Atlas (`mongodb` driver) for claims, images, reliefs, and payouts
- **Frontend:** React, Leaflet Maps (interactive boundary drawing & GPS), HTML5, CSS3

---

## 🔗 Network & Smart Contract Specifications

- **Network:** MST Blockchain Testnet
- **RPC URL:** `https://testnetrpc.mstblockchain.com`
- **Smart Contracts:** `contracts/LandRegistry.sol`, `contracts/ReliefFund.sol` *(relief contract in progress)*
- **Compiled Artifacts:** `build/LandRegistry.json`, `build/ReliefFund.json`

### Smart Contract Methods (`LandRegistry.sol`)

| Function | Signature | Description |
|---|---|---|
| `createClaim` | `(bytes32 ownerHash, bytes32 evidenceHash, uint32 latE6, uint32 lonE6)` | Initializes a land record on-chain and emits `ClaimCreated`. |
| `attest` | `(uint256 claimId, uint8 role)` | Registers role-weighted signature and triggers status update. |
| `dispute` | `(uint256 claimId)` | Flags a conflicting claim for manual mediation. |
| `resolveDispute` | `(uint256 claimId, bool restore)` | Authorized admin/arbiter resolves disputed claims. |
| `setRole` | `(address user, uint8 role)` | Admin only. Defines attester roles. |
| `getClaim` | `(uint256 claimId)` | Gasless `view` method returning claim hashes, coordinates, score, and status. |

### Smart Contract Methods (`ReliefFund.sol`, planned)

`ReliefFund` reads claim status from `LandRegistry` and holds the relief budget in escrow.

| Function | Signature | Description |
|---|---|---|
| `createRelief` | `(bytes32 zoneHash, uint256 maxPerClaim) payable` | Government declares a relief event and deposits its budget. Emits `ReliefCreated`. |
| `fundRelief` | `(uint256 reliefId) payable` | Tops up a relief event's budget. |
| `setOfficer` / `setAssessor` | `(address user, bool allowed)` | Admin only. Grants the government officer or assessor role. |
| `assess` | `(uint256 claimId, uint256 reliefId, uint8 damageLevel, bytes32 damageEvidenceHash)` | Assessor records damage. Requires the claim to be `Verified`. |
| `approvePayout` | `(uint256 claimId, uint256 reliefId, uint256 amount, address payable beneficiary)` | Officer approval. Two officers must submit the same amount and beneficiary. Amount must not exceed the cap or remaining budget. |
| `release` | `(uint256 claimId, uint256 reliefId)` | Pays the beneficiary once. Reverts if the claim is `Disputed` or already paid. Emits `PayoutReleased`. |
| `getPayout` | `(uint256 claimId, uint256 reliefId)` | View: payout status, amount, beneficiary, approvals. |

Payout status values: `None`, `Assessed`, `Approved`, `Paid`.

---

## 🚀 Quickstart & Setup Guide

### 1. Prerequisites
- Node.js (v18.x or v20.x recommended)
- Git
- Funded MST Testnet account (via MST Faucet)
- A free MongoDB Atlas cluster (M0), a database user, and a connection string

### 2. Installation
```bash
git clone https://github.com/prathamshetty18/teamharmonybms.git
cd teamharmonybms
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (never commit this file):
```env
RPC_URL=https://testnetrpc.mstblockchain.com
PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
RECIPIENT=0xBRIDGEKEY_TEST_RECIPIENT_ADDRESS
CONTRACT_ADDRESS=0xAUTO_POPULATED_AFTER_DEPLOY
RELIEF_CONTRACT_ADDRESS=0xAUTO_POPULATED_AFTER_RELIEF_DEPLOY
MONGO_URI=mongodb+srv://USER:PASSWORD@YOUR_CLUSTER.mongodb.net/
PORT=5000
```

### 4. Smart Contract Lifecycle Scripts
```bash
# 1. Generate or verify your wallet
npm run wallet

# 2. Check testnet connection and balance
npm run balance

# 3. Compile the Solidity contracts
npm run compile

# 4. Deploy LandRegistry to MST Testnet (auto-updates .env and SUBMISSION.md)
npm run deploy

# 5. Run end-to-end claim interaction demo
npm run demo

# 6. (planned) Deploy ReliefFund, pointing at the deployed LandRegistry
npm run deploy:relief
```

---

## 📡 REST API Reference

| Method | Endpoint | Description | On-Chain Interaction |
|---|---|---|---|
| `POST` | `/claims` | Submit a new parcel claim with boundary, photos & owner hash | `createClaim()` |
| `GET` | `/claims` | List all registered parcels (for Leaflet map markers) | Off-chain DB / Cache |
| `GET` | `/claims/:id` | Fetch parcel details, attestation history, & state | `getClaim()` |
| `POST` | `/claims/:id/attest` | Submit community attestation (`{ role, name }`) | `attest()` |
| `POST` | `/claims/:id/dispute` | Flag parcel boundary dispute (`{ reason }`) | `dispute()` |
| `POST` | `/claims/:id/resolve` | Admin resolves a dispute | `resolveDispute()` |
| `GET` | `/verify/:id` | Public verification view linked via QR certificate, including payout status | `getClaim()`, `getPayout()` |
| `POST` | `/reliefs` | Government declares a relief event (zone, rate, cap, budget) | `createRelief()` |
| `GET` | `/reliefs` | List relief events | Off-chain DB |
| `GET` | `/reliefs/:id/eligible` | Claims that are Verified, undisputed, and inside the zone, with computed amounts | `getClaim()` |
| `POST` | `/claims/:id/assess` | Assessor records damage (`{ reliefId, damageLevel }` + photos) | `assess()` |
| `POST` | `/claims/:id/approve-payout` | Officer approves (`{ reliefId }`) | `approvePayout()` |
| `POST` | `/claims/:id/release-payout` | Releases an approved payout (`{ reliefId }`) | `release()` |
| `GET` | `/claims/:id/payout` | Payout status, amount, and tx hash for a claim | `getPayout()` |

---

## 👥 Team Harmony (BMSCE 2026)

| Member | Role | Key Responsibilities |
|---|---|---|
| **Srujan** | Blockchain Lead | Smart contracts (`LandRegistry.sol`, `ReliefFund.sol`), deployment, MST SDK integration, tx verification |
| **Team Member B** | Backend / API Lead | Express server, MongoDB Atlas, polygon overlap algorithm, relief eligibility engine, REST endpoints, `chain.js` contract layer |
| **Team Member C** | Frontend Lead | Leaflet map interface, claim creation workflow, attestation UI, QR certificate view, government dashboard, payout status badge |
| **Team Member D** | Product & Demo Lead | Problem statement, demo script, seeded relief event, verification checklist, documentation |

---

## 📄 License & Hackathon Deliverables

- **Submission Log:** See `SUBMISSION.md` for live contract addresses, deployment transaction hashes, and proof-of-claim and payout execution receipts.
- **License:** MIT License. Built for social impact and disaster resilience.