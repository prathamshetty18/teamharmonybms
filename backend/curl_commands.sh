#!/usr/bin/env bash
# ==============================================================================
# Harmony BMS - Complete cURL Collection for All 14 REST API Endpoints
# Base URL: http://localhost:5000
# ==============================================================================

BASE_URL="http://localhost:5000"

echo "=== 1. POST /claims (Create Non-Overlapping Parcel Claim) ==="
curl -X POST "${BASE_URL}/claims" \
  -H "Content-Type: application/json" \
  -d '{
    "ownerName": "Ramesh Gowda",
    "nationalId": "IND-KA-560019-1088",
    "parcelAreaAcres": 2.0,
    "beneficiaryAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "notes": "Ancestral paddy farmland in Basavanagudi area",
    "polygon": {
      "type": "Polygon",
      "coordinates": [
        [
          [77.5610, 12.9405],
          [77.5630, 12.9405],
          [77.5630, 12.9425],
          [77.5610, 12.9425],
          [77.5610, 12.9405]
        ]
      ]
    }
  }'
echo -e "\n\n"

echo "=== 1.1 POST /claims (Create Overlapping Parcel -> Auto-Dispute Demo) ==="
curl -X POST "${BASE_URL}/claims" \
  -H "Content-Type: application/json" \
  -d '{
    "ownerName": "Anand Kumar",
    "nationalId": "IND-KA-560019-3389",
    "parcelAreaAcres": 2.0,
    "beneficiaryAddress": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "notes": "Overlaps Ramesh Gowda plot by 42%",
    "polygon": {
      "type": "Polygon",
      "coordinates": [
        [
          [77.5620, 12.9410],
          [77.5640, 12.9410],
          [77.5640, 12.9430],
          [77.5620, 12.9430],
          [77.5620, 12.9410]
        ]
      ]
    }
  }'
echo -e "\n\n"

echo "=== 2. GET /claims (List All Registered Land Parcels) ==="
curl -X GET "${BASE_URL}/claims"
echo -e "\n\n"

echo "=== 3. GET /claims/:id (Fetch Parcel Details & Attestation History) ==="
curl -X GET "${BASE_URL}/claims/1"
echo -e "\n\n"

echo "=== 4. POST /claims/:id/attest (Submit Role-Weighted Community Attestation) ==="
curl -X POST "${BASE_URL}/claims/1/attest" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "Village Leader",
    "attesterName": "Gram Panchayat Head V. Reddy",
    "attesterAddress": "0x9965507D1a55bcC2695C58ba16FB37d819B0A4df",
    "notes": "Verified against Panchayat revenue register patta records"
  }'
echo -e "\n\n"

echo "=== 5. POST /claims/:id/dispute (Flag Boundary Conflict) ==="
curl -X POST "${BASE_URL}/claims/1/dispute" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Overlaps ancestral southern perimeter fence by 15 meters",
    "disputerName": "Anand Kumar",
    "disputerAddress": "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
    "overlappingClaimId": "3"
  }'
echo -e "\n\n"

echo "=== 6. POST /claims/:id/resolve (Admin Arbiter Resolves Dispute) ==="
curl -X POST "${BASE_URL}/claims/1/resolve" \
  -H "Content-Type: application/json" \
  -d '{
    "restore": true,
    "resolutionNotes": "Joint field inspection conducted with Tehsildar; boundary stones restored.",
    "arbiterAddress": "0x2546BcD3c84621e976D8185a91A922aE77ECEc30"
  }'
echo -e "\n\n"

echo "=== 7. GET /verify/:id (Public QR Certificate Verification with Evidence Re-Hash) ==="
curl -X GET "${BASE_URL}/verify/1"
echo -e "\n\n"

echo "=== 8. POST /reliefs (Declare Disaster Relief Event Scheme) ==="
curl -X POST "${BASE_URL}/reliefs" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Karnataka State SDRF Flood Relief Scheme 2026",
    "description": "Emergency rehabilitation compensation for Cauvery South flood zone",
    "disasterType": "flood",
    "ratePerAcre": "1000000000000000000",
    "maxPerClaim": "5000000000000000000",
    "budget": "100000000000000000000",
    "zone": {
      "type": "Polygon",
      "coordinates": [
        [
          [77.5500, 12.9300],
          [77.5800, 12.9300],
          [77.5800, 12.9600],
          [77.5500, 12.9600],
          [77.5500, 12.9300]
        ]
      ]
    }
  }'
echo -e "\n\n"

echo "=== 9. GET /reliefs (List All Relief Schemes) ==="
curl -X GET "${BASE_URL}/reliefs"
echo -e "\n\n"

echo "=== 10. GET /reliefs/:id/eligible (Eligible Claims, Damage Scoring, & Budget Scaling) ==="
curl -X GET "${BASE_URL}/reliefs/relief_flood_2026/eligible"
echo -e "\n\n"

echo "=== 11. POST /claims/:id/assess (Field Assessor Records Damage Criteria) ==="
curl -X POST "${BASE_URL}/claims/1/assess" \
  -H "Content-Type: application/json" \
  -d '{
    "reliefId": "relief_flood_2026",
    "answers": {
      "depth": "high",
      "structure": "major",
      "duration": "long",
      "type": "pucca",
      "contents": "all"
    },
    "confirmedAreaAcres": 2.0,
    "damageNotes": "Field inspection confirmed Level 4 catastrophic flood damage.",
    "assessorAddress": "0x2546BcD3c84621e976D8185a91A922aE77ECEc30"
  }'
echo -e "\n\n"

echo "=== 12. POST /claims/:id/approve-payout (Dual-Officer Approval) ==="
curl -X POST "${BASE_URL}/claims/1/approve-payout" \
  -H "Content-Type: application/json" \
  -d '{
    "reliefId": "relief_flood_2026",
    "officer": "Officer_Deshmukh_KA204"
  }'
echo -e "\n\n"

echo "=== 13. POST /claims/:id/release-payout (Release Approved Compensation on MST Testnet) ==="
curl -X POST "${BASE_URL}/claims/1/release-payout" \
  -H "Content-Type: application/json" \
  -d '{
    "reliefId": "relief_flood_2026"
  }'
echo -e "\n\n"

echo "=== 14. GET /claims/:id/payout (View Payout Status & Wei Amount) ==="
curl -X GET "${BASE_URL}/claims/1/payout"
echo -e "\n\n"

echo "=== (Bonus) POST /claims/check-overlap (Interactive Leaflet Map Pre-Flight Check) ==="
curl -X POST "${BASE_URL}/claims/check-overlap" \
  -H "Content-Type: application/json" \
  -d '{
    "polygon": {
      "type": "Polygon",
      "coordinates": [
        [
          [77.5620, 12.9410],
          [77.5640, 12.9410],
          [77.5640, 12.9430],
          [77.5620, 12.9430],
          [77.5620, 12.9410]
        ]
      ]
    }
  }'
echo -e "\n\n"

echo "=== (Bonus) GET /disputes (List All Active Disputed Claims for Arbiter Dashboard) ==="
curl -X GET "${BASE_URL}/disputes"
echo -e "\n\n"
