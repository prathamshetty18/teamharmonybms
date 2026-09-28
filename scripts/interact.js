const { ethers } = require('ethers');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const chain = require('./chain');
const { updateSubmissionIdempotent } = require('./deploy');

function sha256(data) {
  return '0x' + crypto.createHash('sha256').update(data).digest('hex');
}

async function main() {
  console.log('===============================================================');
  console.log('🌟 MST Blockchain Demo: Post-Disaster Land Rights & Relief');
  console.log('===============================================================\n');

  console.log('📋 Following Prescribed Demo Order:');
  console.log('  1. Register & Verify Claim A and Claim B');
  console.log('  2. Create Relief Scheme & Escrow Funds');
  console.log('  3. Assess & Approve Claim A -> Release Native MST Payout');
  console.log('  4. Assess & Dual-Officer Approve Claim B');
  console.log('  5. Dispute Claim B');
  console.log('  6. Prove freeze: release(B) reverts via staticCall\n');

  const provider = chain.provider;
  const adminSigner = chain.getSignerByRole('ADMIN');
  console.log(`Connected Admin Address: ${adminSigner.address}`);

  const claimantA = ethers.Wallet.createRandom().address;
  const claimantB = ethers.Wallet.createRandom().address;

  // 1. Create Claim A and Claim B
  console.log('\n--- Step 1: Registrar creates Claims A & B ---');
  const claimAData = {
    claimant: claimantA,
    ownerHash: sha256('ID_Family_A_Salt_101'),
    evidenceHash: sha256('BoundaryA_GroundPhotos_WitnessList'),
    lat: 12.971598,
    lon: 77.594562
  };
  const resA = await chain.createClaim(claimAData, 'REGISTRAR');
  const claimIdA = resA.claimId;
  console.log(`✅ Claim A Created: ID #${claimIdA} (Claimant: ${claimantA}) | Tx: ${resA.txHash}`);

  const claimBData = {
    claimant: claimantB,
    ownerHash: sha256('ID_Family_B_Salt_202'),
    evidenceHash: sha256('BoundaryB_GroundPhotos_WitnessList'),
    lat: 12.972100,
    lon: 77.595100
  };
  const resB = await chain.createClaim(claimBData, 'REGISTRAR');
  const claimIdB = resB.claimId;
  console.log(`✅ Claim B Created: ID #${claimIdB} (Claimant: ${claimantB}) | Tx: ${resB.txHash}`);

  // Attest Claim A (Neighbor1 +1, Leader1 +3, NGO1 +3 -> Score 7 -> Verified)
  console.log('\n--- Step 2: Attestation & Verification ---');
  console.log(`Attesting Claim A #${claimIdA}...`);
  await chain.attest(claimIdA, 'NEIGHBOR1');
  await chain.attest(claimIdA, 'LEADER1');
  const attestA = await chain.attest(claimIdA, 'NGO1');
  console.log(`✅ Claim A Verified! Score: ${attestA.newScore} | Status: ${attestA.newStatus}`);

  // Attest Claim B (Neighbor2 +1, Neighbor3 +1, Leader1 +3 -> Score 5 -> Verified)
  console.log(`Attesting Claim B #${claimIdB}...`);
  await chain.attest(claimIdB, 'NEIGHBOR2');
  await chain.attest(claimIdB, 'NEIGHBOR3');
  const attestB = await chain.attest(claimIdB, 'LEADER1');
  console.log(`✅ Claim B Verified! Score: ${attestB.newScore} | Status: ${attestB.newStatus}`);

  // 2. Create Disaster Relief Scheme
  console.log('\n--- Step 3: Government Declares Relief Scheme ---');
  const zoneHash = sha256('Cauvery_Flood_Zone_Polygon_GeoJSON');
  const expiresAt = Math.floor(Date.now() / 1000) + (7 * 86400); // 7 days
  const reliefRes = await chain.createRelief({
    zoneHash,
    maxPerClaimMST: '0.01',
    expiresAt,
    budgetMST: '0.05'
  }, 'ADMIN');
  const reliefId = reliefRes.reliefId;
  console.log(`✅ Relief Fund Event #${reliefId} Created | Escrow Budget: 0.05 MST | Tx: ${reliefRes.txHash}`);

  // 3. Assess & Dual-Approve Claim A -> Release Native MST
  console.log('\n--- Step 4: Assess, Approve & Release Claim A ---');
  const damageA = sha256('DamagePhotos_A_Level3');
  const assessA = await chain.assessDamage({
    claimId: claimIdA,
    reliefId,
    damageLevel: 3,
    damageEvidenceHash: damageA
  }, 'ASSESSOR');
  console.log(`Field Damage Assessed for Claim A: Level 3 | Tx: ${assessA.txHash}`);

  const payoutAmtA = '0.005';
  const approveA1 = await chain.approvePayout({
    claimId: claimIdA,
    reliefId,
    amountMST: payoutAmtA,
    beneficiary: claimantA
  }, 'OFFICER1');
  const approveA2 = await chain.approvePayout({
    claimId: claimIdA,
    reliefId,
    amountMST: payoutAmtA,
    beneficiary: claimantA
  }, 'OFFICER2');
  console.log(`Dual-Officer Approval Confirmed for Claim A (${payoutAmtA} MST).`);

  const releaseA = await chain.releasePayout({ claimId: claimIdA, reliefId }, 'ADMIN');
  console.log(`🎉 Claim A Payout Released directly to ${claimantA}! Tx: ${releaseA.txHash}`);

  // 4. Assess & Dual-Approve Claim B
  console.log('\n--- Step 5: Assess & Dual-Approve Claim B ---');
  const damageB = sha256('DamagePhotos_B_Level4');
  await chain.assessDamage({
    claimId: claimIdB,
    reliefId,
    damageLevel: 4,
    damageEvidenceHash: damageB
  }, 'ASSESSOR');

  const payoutAmtB = '0.008';
  await chain.approvePayout({
    claimId: claimIdB,
    reliefId,
    amountMST: payoutAmtB,
    beneficiary: claimantB
  }, 'OFFICER1');
  await chain.approvePayout({
    claimId: claimIdB,
    reliefId,
    amountMST: payoutAmtB,
    beneficiary: claimantB
  }, 'OFFICER2');
  console.log(`Dual-Officer Approval Confirmed for Claim B (${payoutAmtB} MST).`);

  // 5. Dispute Claim B
  console.log('\n--- Step 6: Dispute Claim B (Boundary Overlap Detected) ---');
  const disputeB = await chain.dispute(claimIdB, 'ARBITER');
  console.log(`⚠️ Claim B Disputed by Arbiter! Tx: ${disputeB.txHash}`);
  const statusB = await chain.statusOf(claimIdB);
  console.log(`Claim B Current Status on Chain: ${statusB.status}`);

  // 6. Demonstrate Payout Freeze via wouldRevert() (StaticCall)
  console.log('\n--- Step 7: Proof of Freeze (release(B) reverts without broadcast) ---');
  const reliefContract = chain.getReliefFundContract('ADMIN');
  const freezeCheck = await chain.wouldRevert(
    reliefContract.release.staticCall(claimIdB, reliefId)
  );

  console.log(`Result of calling release() on disputed Claim B:`);
  console.log(`  Reverts as expected: ${freezeCheck.reverts}`);
  console.log(`  Revert Reason:       "${freezeCheck.reason}"`);

  // 7. Resolve Dispute (restore = true)
  console.log('\n--- Step 8: Arbiter Resolves Dispute (restore=true) ---');
  const resolveRes = await chain.resolveDispute(claimIdB, true, 'ARBITER');
  console.log(`✅ Claim B Dispute Resolved & Restored to Verified! Tx: ${resolveRes.txHash}`);
  const statusBAfter = await chain.statusOf(claimIdB);
  console.log(`Claim B Status after Resolution: ${statusBAfter.status}`);

  // 8. Post-Unfreeze Release
  console.log('\n--- Step 9: Post-Unfreeze Release for Claim B ---');
  const releaseB = await chain.releasePayout({ claimId: claimIdB, reliefId }, 'ADMIN');
  console.log(`🎉 Claim B Payout Successfully Released after Unfreeze! Tx: ${releaseB.txHash}`);

  // Fetch block details for release A
  const releaseReceiptA = await provider.getTransactionReceipt(releaseA.txHash);
  const releaseBlockA = await provider.getBlock(releaseReceiptA.blockNumber);
  const releaseBlockTimestampA = new Date(releaseBlockA.timestamp * 1000).toISOString();

  console.log('\n===============================================================');
  console.log('📋 SUMMARY OF LIVE MST TESTNET EVIDENCE (FOR SUBMISSION.MD)');
  console.log('===============================================================');
  console.log(`createClaim tx hash (Claim A):   ${resA.txHash}`);
  console.log(`createRelief tx hash:            ${reliefRes.txHash}`);
  console.log(`assess tx hash (Claim A):        ${assessA.txHash}`);
  console.log(`approvePayout (officer1) tx:     ${approveA1.txHash}`);
  console.log(`approvePayout (officer2) tx:     ${approveA2.txHash}`);
  console.log(`release tx hash (Claim A):       ${releaseA.txHash}`);
  console.log(`release block number:            #${releaseReceiptA.blockNumber}`);
  console.log(`release block timestamp:         ${releaseBlockTimestampA}`);
  console.log(`dispute tx hash (Claim B):       ${disputeB.txHash}`);
  console.log(`freeze-revert proof:             staticCall, no hash (revert: "${freezeCheck.reason}")`);
  console.log(`resolveDispute tx hash:          ${resolveRes.txHash}`);
  console.log(`post-unfreeze release tx hash:   ${releaseB.txHash}`);
  console.log(`dispute-freeze revert reason:    "${freezeCheck.reason}"`);
  console.log('===============================================================\n');
}

main().catch((err) => {
  console.error('Demo interaction failed:', err);
  process.exit(1);
});
