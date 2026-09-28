const { ethers } = require('ethers');
const chain = require('../chain.js');

async function runTestSuite() {
  const useMock = process.env.CHAIN_MOCK === '1';
  const modeStr = useMock ? 'MOCK' : 'REAL CHAIN';

  console.log('====================================================');
  console.log(`MODE: ${modeStr}`);
  console.log('====================================================\n');

  // Setup test wallets
  const testWallets = {};
  const names = ['admin', 'registrar', 'arbiter', 'assessor', 'officer1', 'officer2', 'neighbor1', 'neighbor2', 'neighbor3', 'leader', 'ngo', 'unauthorized'];
  
  for (const name of names) {
    if (process.env[`${name.toUpperCase()}_KEY`]) {
      try {
        testWallets[name] = new ethers.Wallet(process.env[`${name.toUpperCase()}_KEY`]);
      } catch (e) {
        testWallets[name] = ethers.Wallet.createRandom();
      }
    } else {
      testWallets[name] = ethers.Wallet.createRandom();
    }
    chain.registerSigner(name, testWallets[name]);
  }

  let passed = 0;
  let failed = 0;

  async function testStep(title, fn) {
    try {
      console.log(`Running: ${title}...`);
      const result = await fn();
      if (result && result.txHash) {
        console.log(`  -> txHash: ${result.txHash}`);
        if (!useMock && result.txHash.startsWith('0x')) {
          console.log(`  -> link: https://testnetrpc.mstblockchain.com/tx/${result.txHash}`);
        }
      }
      console.log(`[PASS] ${title}\n`);
      passed++;
      return result;
    } catch (err) {
      console.error(`[FAIL] ${title}`);
      console.error(`  -> Error: ${err.message || err}\n`);
      failed++;
    }
  }

  async function testExpectedFailure(title, fn) {
    try {
      console.log(`Testing failure path: ${title}...`);
      await fn();
      console.error(`[FAIL] ${title} - Expected transaction to revert, but it succeeded!`);
      failed++;
    } catch (err) {
      console.log(`  -> Caught expected error: ${err.message || err}`);
      console.log(`[PASS] ${title}\n`);
      passed++;
    }
  }

  // STEP 3 execution flow:
  // 1. getClaim read on claim 1 (expect 404 or catch 404)
  await testStep('1. Read non-existent claim 1 (catch 404)', async () => {
    try {
      await chain.getClaim(1);
    } catch (err) {
      if (err.status === 404 || err.message.includes('not found')) {
        return { txHash: 'N/A (Read 404 Verified)' };
      }
      throw err;
    }
  });

  // 2. createClaim
  const ownerHash = '0x1111111111111111111111111111111111111111111111111111111111111111';
  const evidenceHash = '0x2222222222222222222222222222222222222222222222222222222222222222';
  let createdClaimId = '1';

  await testStep('2. createClaim (lat=12.9716, lon=77.5946)', async () => {
    const res = await chain.createClaim(ownerHash, evidenceHash, 12.9716, 77.5946);
    if (res && res.claimId) createdClaimId = res.claimId;
    return res;
  });

  // 3. Attest with neighbor1 (+1), neighbor2 (+1), neighbor3 (+1), leader (+3) -> expect score=6, Verified
  await testStep('3a. Attest with neighbor1 (+1)', async () => {
    return chain.attest(createdClaimId, 'neighbor', 'neighbor1');
  });

  await testStep('3b. Attest with neighbor2 (+1)', async () => {
    return chain.attest(createdClaimId, 'neighbor', 'neighbor2');
  });

  await testStep('3c. Attest with neighbor3 (+1)', async () => {
    return chain.attest(createdClaimId, 'neighbor', 'neighbor3');
  });

  await testStep('3d. Attest with leader (+3)', async () => {
    return chain.attest(createdClaimId, 'leader', 'leader');
  });

  await testStep('3e. Verify claim status is Verified', async () => {
    const claim = await chain.getClaim(createdClaimId);
    if (claim.status !== 'Verified') {
      throw new Error(`Expected Verified, got ${claim.status}`);
    }
    console.log(`  -> Claim Status: ${claim.status}, Score: ${claim.score}`);
    return { txHash: 'N/A (Read Verified)' };
  });

  // 4. Dispute -> getClaim -> Disputed
  await testStep('4a. Dispute claim', async () => {
    return chain.dispute(createdClaimId, 'registrar');
  });

  await testStep('4b. Verify claim status is Disputed', async () => {
    const claim = await chain.getClaim(createdClaimId);
    if (claim.status !== 'Disputed') {
      throw new Error(`Expected Disputed, got ${claim.status}`);
    }
    console.log(`  -> Claim Status: ${claim.status}`);
    return { txHash: 'N/A (Read Disputed)' };
  });

  // 5. resolveDispute(restore=true) -> getClaim -> Verified
  await testStep('5a. Resolve dispute (restore = true)', async () => {
    return chain.resolveDispute(createdClaimId, true, 'arbiter');
  });

  await testStep('5b. Verify claim status restored to Verified', async () => {
    const claim = await chain.getClaim(createdClaimId);
    if (claim.status !== 'Verified') {
      throw new Error(`Expected Verified, got ${claim.status}`);
    }
    console.log(`  -> Claim Status: ${claim.status}`);
    return { txHash: 'N/A (Read Verified)' };
  });

  // 6. createRelief, assess, approvePayout officer1, approvePayout officer2, release, getPayout -> Paid
  const zoneHash = '0x3333333333333333333333333333333333333333333333333333333333333333';
  const damageEvHash = '0x4444444444444444444444444444444444444444444444444444444444444444';
  let createdReliefId = '1';
  const beneficiaryAddr = testWallets.neighbor1.address;
  const payoutAmount = '1000000000000000000'; // 1 ETH/MST wei
  const maxCap = '2000000000000000000'; // 2 ETH cap
  const budget = '10000000000000000000'; // 10 ETH budget

  await testStep('6a. createRelief', async () => {
    const res = await chain.createRelief(zoneHash, maxCap, budget, 0);
    if (res && res.reliefId) createdReliefId = res.reliefId;
    return res;
  });

  await testStep('6b. assess damage level 3', async () => {
    return chain.assess(createdClaimId, createdReliefId, 3, damageEvHash, 'assessor');
  });

  await testStep('6c. approvePayout (Officer 1)', async () => {
    return chain.approvePayout(createdClaimId, createdReliefId, payoutAmount, beneficiaryAddr, 'officer1');
  });

  await testStep('6d. approvePayout (Officer 2)', async () => {
    return chain.approvePayout(createdClaimId, createdReliefId, payoutAmount, beneficiaryAddr, 'officer2');
  });

  await testStep('6e. release payout', async () => {
    return chain.release(createdClaimId, createdReliefId, 'admin');
  });

  await testStep('6f. getPayout -> expect Paid', async () => {
    const payout = await chain.getPayout(createdClaimId, createdReliefId);
    if (payout.status !== 'Paid') {
      throw new Error(`Expected Paid status, got ${payout.status}`);
    }
    console.log(`  -> Payout Status: ${payout.status}, Amount: ${payout.amount}, Beneficiary: ${payout.beneficiary}`);
    return { txHash: 'N/A (Read Paid)' };
  });

  // 7. Failure Paths
  console.log('=== TESTING FAILURE PATHS ===\n');

  // Failure 1: release on a Disputed claim
  await testExpectedFailure('7a. Release payout on a Disputed claim', async () => {
    // Create new claim & relief for dispute test
    const cRes = await chain.createClaim(ownerHash, evidenceHash, 13.0, 77.6);
    const rRes = await chain.createRelief(zoneHash, maxCap, budget, 0);
    const cId = cRes.claimId || '2';
    const rId = rRes.reliefId || '2';

    await chain.attest(cId, 'leader', 'leader');
    await chain.attest(cId, 'leader', 'neighbor1'); // verified score >= 5
    await chain.assess(cId, rId, 2, damageEvHash, 'assessor');
    await chain.approvePayout(cId, rId, payoutAmount, beneficiaryAddr, 'officer1');
    await chain.approvePayout(cId, rId, payoutAmount, beneficiaryAddr, 'officer2');

    // Dispute claim before release
    await chain.dispute(cId, 'registrar');

    // Try to release - must revert
    await chain.release(cId, rId, 'admin');
  });

  // Failure 2: double release on already Paid claim
  await testExpectedFailure('7b. Double release on an already Paid claim', async () => {
    await chain.release(createdClaimId, createdReliefId, 'admin');
  });

  // Failure 3: same officer approving twice
  await testExpectedFailure('7c. Same officer approving payout twice', async () => {
    const cRes = await chain.createClaim(ownerHash, evidenceHash, 13.1, 77.7);
    const cId = cRes.claimId || '3';
    await chain.attest(cId, 'leader', 'leader');
    await chain.attest(cId, 'leader', 'neighbor1');
    await chain.assess(cId, createdReliefId, 1, damageEvHash, 'assessor');

    await chain.approvePayout(cId, createdReliefId, payoutAmount, beneficiaryAddr, 'officer1');
    // Officer 1 approves again -> should revert
    await chain.approvePayout(cId, createdReliefId, payoutAmount, beneficiaryAddr, 'officer1');
  });

  // Failure 4: over-cap amount
  await testExpectedFailure('7d. Approve payout with over-cap amount', async () => {
    const overCap = '5000000000000000000'; // 5 ETH > 2 ETH cap
    await chain.approvePayout(createdClaimId, createdReliefId, overCap, beneficiaryAddr, 'officer1');
  });

  // Failure 5: non-assessor assess call
  await testExpectedFailure('7e. Non-assessor calling assess()', async () => {
    await chain.assess(createdClaimId, createdReliefId, 2, damageEvHash, 'unauthorized');
  });

  console.log(`\nPASSED ${passed} / FAILED ${failed} (${modeStr})`);

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTestSuite();
}

module.exports = { runTestSuite };
