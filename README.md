# Post-Disaster Land Rights & Relief on MST Blockchain

> **Preserving community consensus and immutable land claim evidence when physical records are lost, then using that verified proof to release government disaster relief quickly and without fraud.**  
> *Built for BMS College of Engineering 24-Hour Buildathon (September 28–29, 2026) | Team Harmony*

---

## 📌 Overview & Real-World Problem

When natural disasters (floods, fires, earthquakes) strike, physical land records, paper deeds, and local registry offices are frequently destroyed or rendered inaccessible. Two critical breakdowns occur:
1. **Land rights are lost:** Displaced families face eviction, predatory land-grabbing, and prolonged dispute battles.
2. **Relief is blocked:** Government compensation schemes require verified ownership of affected parcels. Without records, payouts stall or are drained by fraudulent claims.

This project delivers a **decentralized, community-attested land rights registry** coupled with an **automated disaster relief escrow** deployed on the **MST Blockchain Testnet**.

> **Core Philosophy:** *Blockchain does not unilaterally decide who owns the land; it permanently preserves verifiable evidence of community consensus so no legitimate family is disenfranchised. Verified land proof is then the key that unlocks government relief.*

---

## 🏛️ System Architecture & Flowchart

The system connects a **React** frontend, a **Node.js/Express** backend with geospatial overlap detection and relief eligibility engine, **MongoDB Atlas** for off-chain evidence, and smart contracts deployed on the **MST Testnet**.

### Architecture Diagram
![System Architecture Flowchart](assets/architecture.png)

### Complete Flowchart Breakdown (Mermaid)

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
    GD --> EL
    GD --> AS
    GD --> AP
    VP --> CJ

    %% Backend to Storage & Blockchain
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

---

## 🔒 Privacy Architecture: On-Chain vs. Off-Chain

To adhere to privacy standards and prevent storing personally identifiable information (PII) on a public ledger:

| On-Chain (`LandRegistry.sol`, `ReliefFund.sol`) | Off-Chain (MongoDB Atlas / Backend) |
|---|---|
| `ownerHash` = `SHA-256(NationalID + Salt)` | Owner full name, phone number, government ID |
| `evidenceHash` = `SHA-256(Photos + GeoJSON + Witnesses)` | Original deed photos, ground survey images |
| Reference Latitude & Longitude (`latE6`, `lonE6`) | Full polygon boundary coordinates |
| Community Trust Score & Status (`Pending` / `Verified` / `Disputed`) | Dispute notes, witness written statements |
| Attestation logs (Attester address, role, score) | Human-readable attester display profiles |
| **Relief event: zone hash, per-claim cap, budget** | **Full zone polygon, scheme description** |
| **Damage level and `damageEvidenceHash`** | **Field assessment photos and surveyor notes** |
| **Payout status, amount, beneficiary address, tx hash** | **Beneficiary contact and bank mapping** |

---

## ⭐ Key Features

1. **Proof of Existence on MST Testnet**
   - High-throughput, low-fee smart contract transactions on the MST network create tamper-evident claim timestamps.
2. **Trust-Weighted Multi-Party Attestation**
   - Consensus requires weighted scores from community actors:
     - **Neighbor:** `+1` weight
     - **Village Leader:** `+3` weight
     - **Accredited NGO:** `+3` weight
   - Claims transition automatically from `Pending` to **`Verified`** once reaching **Score ≥ 5**.
3. **Automated Geospatial Overlap Detection**
   - Backend compares candidate claim polygons using Turf.js. Conflicting submissions automatically route to the **Dispute Resolver** for human arbitration and the claim is frozen on-chain.
4. **Relief & Reimbursement Escrow (`ReliefFund.sol`)**
   - Enables governments to lock relief funds on-chain. 
   - Strict anti-fraud rules: payout requires prior claim verification, accredited damage assessment, and dual-officer consensus approval.
5. **Public QR Proof Certificate (`/verify/:id`)**
   - Generates a verifiable QR code linking directly to on-chain state, allowing emergency aid workers and insurers to confirm land rights and payout records immediately.

---

## ⚙️ Tech Stack

- **Smart Contracts:** Solidity `^0.8.20`, deployed on MST Testnet (`LandRegistry.sol`, `ReliefFund.sol`)
- **Blockchain Client:** `ethers.js` v6, `@mstblockchain/mst-sdk`, BridgeKey Wallet
- **Backend API:** Node.js, Express, `fs-extra`, `dotenv`, Turf.js (geospatial calculations)
- **Database:** MongoDB Atlas (`mongodb` driver)
- **Frontend:** React, Leaflet Maps, HTML5, CSS3

---

## 🔗 Network & Smart Contract Specifications

- **Network:** MST Blockchain Testnet
- **RPC URL:** `https://testnetrpc.mstblockchain.com`
- **Smart Contracts:**
  - `LandRegistry.sol`: Claims, attestations, trust scores, disputes
  - `ReliefFund.sol`: Escrowed budget, damage assessments, dual-officer signoff, payout release
- **Compiled Artifacts:** `build/LandRegistry.json`, `build/ReliefFund.json`
- **Implementation Guide:** See [IMPLEMENTATION.md](file:///d:/BMS_MST_hackathon/IMPLEMENTATION.md) for full technical breakdown.

---

## 🚀 Quickstart & Setup Guide

### 1. Installation
```bash
git clone https://github.com/prathamshetty18/teamharmonybms.git
cd teamharmonybms
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory (never commit this file):
```env
RPC_URL=https://testnetrpc.mstblockchain.com
PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
RECIPIENT=0xBRIDGEKEY_TEST_RECIPIENT_ADDRESS
CONTRACT_ADDRESS=
RELIEF_CONTRACT_ADDRESS=
PORT=5000
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/land_rights
```

### 3. Smart Contract Lifecycle Scripts
```bash
# 1. Generate or verify your wallet
npm run wallet

# 2. Check testnet connection and balance
npm run balance

# 3. Compile the Solidity contracts
npm run compile

# 4. Deploy LandRegistry to MST Testnet (auto-updates .env and SUBMISSION.md)
npm run deploy

# 5. Deploy ReliefFund (auto-updates .env and SUBMISSION.md)
npm run deploy:relief

# 6. Run end-to-end interactive demo
npm run demo
```

---

## 📡 REST API Reference

| Method | Endpoint | Description | On-Chain Interaction |
|---|---|---|---|
| `POST` | `/claims` | Submit a new parcel claim with boundary & owner hash | `createClaim()` |
| `GET` | `/claims` | List all registered parcels (for Leaflet map markers) | Off-chain DB / Cache |
| `GET` | `/claims/:id` | Fetch parcel details, attestation history, & state | `getClaim()` |
| `POST` | `/claims/:id/attest` | Submit community attestation (`{ role, name }`) | `attest()` |
| `POST` | `/claims/:id/dispute` | Flag parcel boundary dispute (`{ reason }`) | `dispute()` |
| `POST` | `/reliefs` | Declare relief event (zone, rate, cap, budget) | `createRelief()` |
| `POST` | `/claims/:id/assess` | Field damage assessment (`{ reliefId, damageLevel }`) | `assess()` |
| `POST` | `/claims/:id/approve-payout` | Government officer payout approval | `approvePayout()` |
| `POST` | `/claims/:id/release-payout` | Release approved compensation directly to claimant | `release()` |
| `GET` | `/verify/:id` | Public verification view linked via QR certificate | `getClaim()`, `getPayout()` |

---

## 👥 Team Harmony (BMSCE 2026)

| Member | Role | Key Responsibilities |
|---|---|---|
| **Srujan** | Blockchain Lead | Smart contracts (`LandRegistry.sol`, `ReliefFund.sol`), deployment, MST SDK, tx verification |
| **Team Member B** | Backend / API Lead | Express server, polygon overlap algorithm, relief eligibility engine, REST endpoints, `chain.js` |
| **Team Member C** | Frontend Lead | Leaflet map interface, claim creation workflow, attestation UI, QR certificate view, Gov dashboard |
| **Team Member D** | Product & Demo Lead | Problem statement, demo script, verification checklist, documentation |

---

## 📄 License & Hackathon Deliverables

- **Submission Log:** See [SUBMISSION.md](file:///d:/BMS_MST_hackathon/SUBMISSION.md) for live contract addresses, deployment transaction hashes, and proof receipts.
- **Implementation Guide:** Detailed roadmap in [IMPLEMENTATION.md](file:///d:/BMS_MST_hackathon/IMPLEMENTATION.md).
- **License:** MIT License. Built for social impact and disaster resilience.
