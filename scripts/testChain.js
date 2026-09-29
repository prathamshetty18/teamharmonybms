const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '..', 'backend', '.env') });
const { ethers } = require('ethers');
const chain = require('../chain.js');

async function runTestSuite() {
  const useMock = process.env.CHAIN_MOCK === '1';
  const modeStr = useMock ? 'MOCK' : 'REAL CHAIN';

  console.log('====================================================');
  console.log(`MODE: ${modeStr}`);
  console.log('====================================================\n');

  // Load .env.roles.json for real on-chain role wallets
  const fs = require('fs');
  const rolesPath = path.resolve(__dirname, '..', '.env.roles.json');
  let rolesData = {};
  if (fs.existsSync(rolesPath)) {
    rolesData = JSON.parse(fs.readFileSync(rolesPath, 'utf8'));
  }

  const roleKeyMap = {
    admin: rolesData.ADMIN,
    registrar: rolesData.REGISTRAR,
    arbiter: rolesData.ARBITER,
    assessor: rolesData.ASSESSOR,
    officer1: rolesData.OFFICER1,
    officer2: rolesData.OFFICER2,
    neighbor1: rolesData.NEIGHBOR1,
    neighbor2: rolesData.NEIGHBOR2,
    neighbor3: rolesData.NEIGHBOR3,
    leader: rolesData.LEADER1 || rolesData.LEADER,
    ngo: rolesData.NGO1 || rolesData.NGO
  };

  // Setup test wallets
  const testWallets = {};
  const names = ['admin', 'registrar', 'arbiter', 'assessor', 'officer1', 'officer2', 'neighbor1', 'neighbor2', 'neighbor3', 'leader', 'ngo', 'unauthorized'];
  
  for (const name of names) {
    if (roleKeyMap[name] && roleKeyMap[name].privateKey) {
      testWallets[name] = new ethers.Wallet(roleKeyMap[name].privateKey, chain.provider);
    } else if (process.env[`${name.toUpperCase()}_KEY`]) {
      try {
        testWallets[name] = new ethers.Wallet(process.env[`${name.toUpperCase()}_KEY`], chain.provider);
      } catch (e) {
        testWallets[name] = ethers.Wallet.createRandom(chain.provider);
      }
    } else {
      testWallets[name] = ethers.Wallet.createRandom(chain.provider);
    }
    chain.registerSigner(name, testWallets[name]);
  }

  // Create dedicated test wallet for citizen claimant/beneficiary
  const testWallet = ethers.Wallet.createRandom(chain.provider);

  // Fund the test wallets from the deployer (admin) before running
  if (!useMock && testWallets.admin) {
    try {
      const deployerBal = await chain.provider.getBalance(testWallets.admin.address);
      console.log(`Deployer balance: ${ethers.formatEther(deployerBal)} MST`);

      // Fund the citizen test wallet
      const twBal = await chain.provider.getBalance(testWallet.address);
      if (twBal < ethers.parseEther('0.005')) {
        console.log(`Funding test wallet ${testWallet.address} with 0.01 MST from deployer...`);
        const tx1 = await testWallets.admin.sendTransaction({
          to: testWallet.address,
          value: ethers.parseEther('0.01')
        });
        await tx1.wait();
        console.log(`  -> Funded test wallet: ${tx1.hash}`);
      }

      // Fund unauthorized wallet for test 7e
      const unauthBal = await chain.provider.getBalance(testWallets.unauthorized.address);
      if (unauthBal < ethers.parseEther('0.005')) {
        console.log(`Funding unauthorized wallet ${testWallets.unauthorized.address} with 0.01 MST from deployer...`);
        const tx2 = await testWallets.admin.sendTransaction({
          to: testWallets.unauthorized.address,
          value: ethers.parseEther('0.01')
        });
        await tx2.wait();
        console.log(`  -> Funded unauthorized wallet: ${tx2.hash}`);
      }
    } catch (fundErr) {
      console.warn(`[Warning] Could not fund test wallets: ${fundErr.message}`);
    }
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
          console.log(`  -> link: https://testnet.mstscan.com/tx/${result.txHash}`);
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

  async function testExpectedFailure(title, expectedReason, fn) {
    try {
      console.log(`Testing failure path: ${title}...`);
      await fn();
      console.error(`[FAIL] ${title} - Expected transaction to revert, but it succeeded!`);
      failed++;
    } catch (err) {
      const errMsg = err.reason || err.shortMessage || err.message || '';
      console.log(`  -> Caught error: ${errMsg}`);
      if (expectedReason && !errMsg.includes(expectedReason)) {
        console.error(`[FAIL] ${title} - Expected revert reason to contain "${expectedReason}", but got: "${errMsg}"\n`);
        failed++;
      } else {
        console.log(`  -> Successfully matched expected revert reason: "${expectedReason}"`);
        console.log(`[PASS] ${title}\n`);
        passed++;
      }
    }
  }

  // STEP 3 execution flow:
  // 1. getClaim read on non-existent claim (catch 404 or Invalid claimId)
  await testStep('1. Read non-existent claim (catch 404)', async () => {
    try {
      await chain.getClaim(999999);
      throw new Error('Expected claim 999999 to not exist');
    } catch (err) {
      if (err.status === 404 || err.message.includes('not found') || err.message.includes('Invalid claimId')) {
        return { txHash: 'N/A (Read 404 Verified)' };
      }
      throw err;
    }
  });

  // 2. createClaim
  const ownerHash = '0x1111111111111111111111111111111111111111111111111111111111111111';
  const evidenceHash = '0x2222222222222222222222222222222222222222222222222222222222222222';
  let createdClaimId = '1';
  const beneficiaryAddr = testWallet.address;

  await testStep('2. createClaim (lat=12.9716, lon=77.5946)', async () => {
    const res = await chain.createClaim(beneficiaryAddr, ownerHash, evidenceHash, 12.9716, 77.5946);
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
  const payoutAmount = ethers.parseEther('0.01').toString(); // 0.01 MST wei
  const maxCap = ethers.parseEther('0.02').toString(); // 0.02 MST cap
  const budget = ethers.parseEther('0.05').toString(); // 0.05 MST budget

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
  await testExpectedFailure('7a. Release payout on a Disputed claim', 'Claim is not Verified', async () => {
    // Create new claim & relief for dispute test
    const cRes = await chain.createClaim(beneficiaryAddr, ownerHash, evidenceHash, 13.0, 77.6);
    const rRes = await chain.createRelief(zoneHash, maxCap, budget, 0);
    const cId = cRes.claimId || '2';
    const rId = rRes.reliefId || '2';

    await chain.attest(cId, 'neighbor', 'neighbor1');
    await chain.attest(cId, 'neighbor', 'neighbor2');
    await chain.attest(cId, 'leader', 'leader'); // verified score >= 5
    await chain.assess(cId, rId, 2, damageEvHash, 'assessor');
    await chain.approvePayout(cId, rId, payoutAmount, beneficiaryAddr, 'officer1');
    await chain.approvePayout(cId, rId, payoutAmount, beneficiaryAddr, 'officer2');

    // Dispute claim before release
    await chain.dispute(cId, 'registrar');

    // Try to release - must revert with "Claim is not Verified"
    await chain.release(cId, rId, 'admin');
  });

  // Failure 2: double release on already Paid claim
  await testExpectedFailure('7b. Second release reverts (approvals cleared on release)', 'Payout not approved by two officers', async () => {
    await chain.release(createdClaimId, createdReliefId, 'admin');
  });

  // Failure 3: same officer approving twice
  await testExpectedFailure('7c. Same officer approving payout twice', 'Same officer cannot approve twice', async () => {
    const cRes = await chain.createClaim(beneficiaryAddr, ownerHash, evidenceHash, 13.1, 77.7);
    const cId = cRes.claimId || '3';
    await chain.attest(cId, 'neighbor', 'neighbor1');
    await chain.attest(cId, 'neighbor', 'neighbor2');
    await chain.attest(cId, 'leader', 'leader');
    await chain.assess(cId, createdReliefId, 1, damageEvHash, 'assessor');

    await chain.approvePayout(cId, createdReliefId, payoutAmount, beneficiaryAddr, 'officer1');
    // Officer 1 approves again -> should revert
    await chain.approvePayout(cId, createdReliefId, payoutAmount, beneficiaryAddr, 'officer1');
  });

  // Failure 4: over-cap amount
  await testExpectedFailure('7d. Approve payout with over-cap amount', 'Exceeds maxPerClaim ceiling', async () => {
    const cRes = await chain.createClaim(beneficiaryAddr, ownerHash, evidenceHash, 13.2, 77.8);
    const rRes = await chain.createRelief(zoneHash, maxCap, budget, 0);
    const cId = cRes.claimId;
    const rId = rRes.reliefId;

    await chain.attest(cId, 'neighbor', 'neighbor1');
    await chain.attest(cId, 'neighbor', 'neighbor2');
    await chain.attest(cId, 'leader', 'leader');
    await chain.assess(cId, rId, 2, damageEvHash, 'assessor');

    const overCap = ethers.parseEther('0.03').toString(); // 0.03 MST > 0.02 MST cap, but <= 0.05 MST budget
    await chain.approvePayout(cId, rId, overCap, beneficiaryAddr, 'officer1');
  });

  // Failure 5: non-assessor assess call
  await testExpectedFailure('7e. Non-assessor calling assess()', 'Only accredited assessor', async () => {
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
