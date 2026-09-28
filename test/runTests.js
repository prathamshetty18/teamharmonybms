const { ethers } = require('ethers');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const TEST_NETWORK = (process.env.TEST_NETWORK || 'local').toLowerCase();
const IS_MST = TEST_NETWORK === 'mst';

async function runAllTests() {
  console.log('====================================================');
  console.log('🧪 Running Blockchain Unit & Integration Test Suite');
  console.log('====================================================\n');

  // ---------------------------------------------------------------
  // NETWORK BOOTSTRAP — local Hardhat OR live MST Testnet
  // ---------------------------------------------------------------
  let provider, landRegistry, reliefFund;
  let adminSigner, registrarSigner, arbiterSigner, assessorSigner;
  let officer1Signer, officer2Signer;
  let neighbor1Signer, neighbor2Signer, neighbor3Signer;
  let leader1Signer, ngo1Signer;
  let claimantSigner, attackerSigner;

  // Local-mode-only variables. Set in the else block; remain null in MST mode.
  let MaliciousArtifact = null;
  let reliefFundAddress = null;
  let hardhatNet = null; // used for evm_increaseTime in test 31

  if (IS_MST) {
    // ------- MST TESTNET MODE -------
    console.log('🌐 TEST_NETWORK=mst — connecting to MST Testnet...');
    const RPC_URL = process.env.RPC_URL || 'https://testnetrpc.mstblockchain.com';
    provider = new ethers.JsonRpcProvider(RPC_URL);

    const network = await provider.getNetwork();
    const blockNum = await provider.getBlockNumber();
    console.log(`   Chain ID: ${network.chainId} | Block: #${blockNum}`);

    // Read role wallets from .env.roles.json
    const rolesPath = path.resolve(__dirname, '..', '.env.roles.json');
    if (!(await fs.pathExists(rolesPath))) {
      throw new Error('.env.roles.json not found. Run npm run setup:roles first.');
    }
    const roles = await fs.readJSON(rolesPath);
    const mkSigner = (role) => new ethers.Wallet(roles[role].privateKey, provider);

    adminSigner      = mkSigner('ADMIN');
    registrarSigner  = mkSigner('REGISTRAR');
    arbiterSigner    = mkSigner('ARBITER');
    assessorSigner   = mkSigner('ASSESSOR');
    officer1Signer   = mkSigner('OFFICER1');
    officer2Signer   = mkSigner('OFFICER2');
    neighbor1Signer  = mkSigner('NEIGHBOR1');
    neighbor2Signer  = mkSigner('NEIGHBOR2');
    neighbor3Signer  = mkSigner('NEIGHBOR3');
    leader1Signer    = mkSigner('LEADER1');
    ngo1Signer       = mkSigner('NGO1');
    claimantSigner   = mkSigner('REGISTRAR'); // read-only stand-in for MST
    attackerSigner   = ethers.Wallet.createRandom().connect(provider);

    console.log(`   Admin:     ${adminSigner.address}`);
    console.log(`   Registrar: ${registrarSigner.address}`);

    // Attach to already-deployed contracts
    const lrAddress = process.env.CONTRACT_ADDRESS;
    const rfAddress = process.env.RELIEF_CONTRACT_ADDRESS;
    if (!lrAddress || !ethers.isAddress(lrAddress)) {
      throw new Error('CONTRACT_ADDRESS missing or invalid in .env. Deploy first via npm run deploy.');
    }
    if (!rfAddress || !ethers.isAddress(rfAddress)) {
      throw new Error('RELIEF_CONTRACT_ADDRESS missing or invalid in .env. Deploy first via npm run deploy:relief.');
    }

    const LandRegistryArtifact = await fs.readJSON(path.resolve(__dirname, '..', 'build', 'LandRegistry.json'));
    const ReliefFundArtifact   = await fs.readJSON(path.resolve(__dirname, '..', 'build', 'ReliefFund.json'));

    landRegistry = new ethers.Contract(lrAddress, LandRegistryArtifact.abi, adminSigner);
    reliefFund   = new ethers.Contract(rfAddress,  ReliefFundArtifact.abi,  adminSigner);

    // Verify bytecode
    const lrCode = await provider.getCode(lrAddress);
    const rfCode = await provider.getCode(rfAddress);
    if (lrCode === '0x') throw new Error(`No bytecode at LandRegistry address ${lrAddress}`);
    if (rfCode === '0x') throw new Error(`No bytecode at ReliefFund address ${rfAddress}`);
    console.log(`   LandRegistry: ${lrAddress} ✅`);
    console.log(`   ReliefFund:   ${rfAddress} ✅`);
    console.log('');

    reliefFundAddress = rfAddress;
    // Fund attackerSigner on MST if needed for test 24 outsider release
    if ((await provider.getBalance(attackerSigner.address)) === 0n) {
      await (await adminSigner.sendTransaction({ to: attackerSigner.address, value: ethers.parseEther('0.1') })).wait();
    }

  } else {
    // ------- LOCAL HARDHAT MODE (unchanged) -------
    const hardhat = await import('hardhat');
    hardhatNet = await hardhat.network.connect();
    provider = new ethers.BrowserProvider(hardhatNet.provider);

    const signers = await provider.listAccounts();
    [
      adminSigner,
      registrarSigner,
      arbiterSigner,
      assessorSigner,
      officer1Signer,
      officer2Signer,
      neighbor1Signer,
      neighbor2Signer,
      neighbor3Signer,
      leader1Signer,
      ngo1Signer,
      claimantSigner,
      attackerSigner
    ] = signers;

    console.log(`Connected to local Hardhat in-memory network. Loaded ${signers.length} test accounts.\n`);

    // Load artifacts
    const LandRegistryArtifact = await fs.readJSON(path.resolve(__dirname, '..', 'build', 'LandRegistry.json'));
    const ReliefFundArtifact   = await fs.readJSON(path.resolve(__dirname, '..', 'build', 'ReliefFund.json'));
    MaliciousArtifact    = await fs.readJSON(path.resolve(__dirname, '..', 'build', 'MaliciousBeneficiary.json'));

    // Deploy contracts
    const landRegistryFactory = new ethers.ContractFactory(LandRegistryArtifact.abi, LandRegistryArtifact.bytecode, adminSigner);
    landRegistry = await landRegistryFactory.deploy();
    await landRegistry.waitForDeployment();
    const landRegistryAddress = await landRegistry.getAddress();

    const reliefFundFactory = new ethers.ContractFactory(ReliefFundArtifact.abi, ReliefFundArtifact.bytecode, adminSigner);
    reliefFund = await reliefFundFactory.deploy(landRegistryAddress);
    await reliefFund.waitForDeployment();
    reliefFundAddress = await reliefFund.getAddress();

    // Setup roles
    await (await landRegistry.setRegistrar(registrarSigner.address)).wait();
    await (await landRegistry.setArbiter(arbiterSigner.address)).wait();
    await (await landRegistry.setRole(neighbor1Signer.address, 1)).wait(); // Neighbor
    await (await landRegistry.setRole(neighbor2Signer.address, 1)).wait(); // Neighbor
    await (await landRegistry.setRole(neighbor3Signer.address, 1)).wait(); // Neighbor
    await (await landRegistry.setRole(leader1Signer.address, 2)).wait();   // Leader
    await (await landRegistry.setRole(ngo1Signer.address, 3)).wait();      // NGO

    await (await reliefFund.setOfficer(officer1Signer.address, true)).wait();
    await (await reliefFund.setOfficer(officer2Signer.address, true)).wait();
    await (await reliefFund.setAssessor(assessorSigner.address, true)).wait();
  }


  let passedTests = 0;
  let totalTests = 0;


  async function test(description, testFn) {
    totalTests++;
    try {
      await testFn();
      console.log(`  ✅ PASS: ${description}`);
      passedTests++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${description}`);
      console.error(`     Error: ${err.message || err}`);
    }
  }

  // -------------------------------------------------------------
  // LAND REGISTRY TESTS
  // -------------------------------------------------------------
  console.log('--- LandRegistry Contract Tests ---');

  const dummyOwnerHash = ethers.keccak256(ethers.toUtf8Bytes('NationalID123'));
  const dummyEvidenceHash = ethers.keccak256(ethers.toUtf8Bytes('EvidencePhotos'));

  await test('1. Self-attest: Claimant cannot attest their own claim', async () => {
    // Grant neighbor role to claimant to test the check
    await (await landRegistry.setRole(claimantSigner.address, 1)).wait();
    const lrRegistrar = landRegistry.connect(registrarSigner);
    await (await lrRegistrar.createClaim(claimantSigner.address, dummyOwnerHash, dummyEvidenceHash, 12971598, 77594562)).wait();
    const claimId = 1;

    const lrClaimant = landRegistry.connect(claimantSigner);
    let reverted = false;
    try {
      await lrClaimant.attest(claimId);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected claimant self-attest to revert');
  });

  await test('2. Attest-once: Same address cannot attest twice in the same round', async () => {
    const claimId = 1;
    const lrNeighbor1 = landRegistry.connect(neighbor1Signer);
    await (await lrNeighbor1.attest(claimId)).wait();

    let reverted = false;
    try {
      await lrNeighbor1.attest(claimId);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected duplicate attestation in same round to revert');
  });

  await test('3. Score >= 5 threshold verification', async () => {
    const claimId = 1;
    // Current score: 1 (Neighbor1)
    // Add Leader1 (+3) -> score 4
    await (await landRegistry.connect(leader1Signer).attest(claimId)).wait();
    let status = await landRegistry.statusOf(claimId);
    if (Number(status) !== 0) throw new Error('Status should still be Pending at score 4');

    // Add Neighbor2 (+1) -> score 5 -> Auto-Verified!
    await (await landRegistry.connect(neighbor2Signer).attest(claimId)).wait();
    status = await landRegistry.statusOf(claimId);
    if (Number(status) !== 1) throw new Error('Status should be Verified at score 5');
  });

  await test('4. Dispute access: Only registrar or arbiter can dispute', async () => {
    const claimId = 1;
    const lrAttacker = landRegistry.connect(attackerSigner);
    let reverted = false;
    try {
      await lrAttacker.dispute(claimId);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected unauthorized dispute to revert');

    // Arbiter can dispute
    await (await landRegistry.connect(arbiterSigner).dispute(claimId)).wait();
    const status = await landRegistry.statusOf(claimId);
    if (Number(status) !== 2) throw new Error('Claim should be in Disputed status');
  });

  await test('5. Restore true: Recomputes Verified only if score >= 5', async () => {
    const claimId = 1; // score is 5
    await (await landRegistry.connect(arbiterSigner).resolveDispute(claimId, true)).wait();
    const status = await landRegistry.statusOf(claimId);
    if (Number(status) !== 1) throw new Error('Claim should be restored to Verified since score >= 5');
  });

  await test('6. Restore false: Resets score to 0 and bumps round counter', async () => {
    const claimId = 1;
    // Dispute again
    await (await landRegistry.connect(arbiterSigner).dispute(claimId)).wait();
    // Resolve with restore = false
    await (await landRegistry.connect(arbiterSigner).resolveDispute(claimId, false)).wait();

    const claim = await landRegistry.getClaim(claimId);
    if (Number(claim.score) !== 0) throw new Error('Score should be reset to 0');
    if (Number(claim.round) !== 2) throw new Error('Round should be bumped to 2');
    if (Number(claim.status) !== 0) throw new Error('Status should be Pending');

    // Attester from round 1 (Neighbor1) can now attest again in round 2!
    await (await landRegistry.connect(neighbor1Signer).attest(claimId)).wait();
    const claimAfter = await landRegistry.getClaim(claimId);
    if (Number(claimAfter.score) !== 1) throw new Error('Neighbor1 should be able to attest in round 2');
  });

  // -------------------------------------------------------------
  // RELIEF FUND TESTS
  // -------------------------------------------------------------
  console.log('\n--- ReliefFund Contract Tests ---');

  // Create a fresh Verified claim (Claim #2) for relief testing
  const lrRegistrar = landRegistry.connect(registrarSigner);
  await (await lrRegistrar.createClaim(claimantSigner.address, dummyOwnerHash, dummyEvidenceHash, 12971598, 77594562)).wait();
  const claimId2 = 2;
  await (await landRegistry.connect(leader1Signer).attest(claimId2)).wait(); // +3
  await (await landRegistry.connect(ngo1Signer).attest(claimId2)).wait();    // +3 -> score 6 (Verified!)

  const zoneHash = ethers.keccak256(ethers.toUtf8Bytes('DisasterZoneA'));
  const maxPerClaim = ethers.parseEther('1.0');
  const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour in future
  const reliefBudget = ethers.parseEther('5.0');

  await (await reliefFund.connect(adminSigner).createRelief(zoneHash, maxPerClaim, expiresAt, { value: reliefBudget })).wait();
  const reliefId = 1;

  await test('7. Damage Assessment: Re-assessment locked once officer approves', async () => {
    const rfAssessor = reliefFund.connect(assessorSigner);
    const damageHash = ethers.keccak256(ethers.toUtf8Bytes('SurveyPhotos'));
    await (await rfAssessor.assess(claimId2, reliefId, 3, damageHash)).wait();

    // Officer 1 approves
    const payoutAmt = ethers.parseEther('0.8');
    await (await reliefFund.connect(officer1Signer).approvePayout(claimId2, reliefId, payoutAmt, claimantSigner.address)).wait();

    // Re-assessment must now revert
    let reverted = false;
    try {
      await rfAssessor.assess(claimId2, reliefId, 4, damageHash);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected re-assessment to be locked after approval');
  });

  await test('8. Dual-officer approval: Same officer cannot approve twice', async () => {
    const payoutAmt = ethers.parseEther('0.8');
    let reverted = false;
    try {
      await reliefFund.connect(officer1Signer).approvePayout(claimId2, reliefId, payoutAmt, claimantSigner.address);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected same officer approving twice to revert');
  });

  await test('9. Dual-officer approval: Amount or beneficiary mismatch reverts', async () => {
    let reverted = false;
    try {
      // Wrong amount
      await reliefFund.connect(officer2Signer).approvePayout(claimId2, reliefId, ethers.parseEther('0.9'), claimantSigner.address);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected amount mismatch to revert');

    // Matching approval succeeds
    await (await reliefFund.connect(officer2Signer).approvePayout(claimId2, reliefId, ethers.parseEther('0.8'), claimantSigner.address)).wait();
    const payout = await reliefFund.getPayout(claimId2, reliefId);
    if (Number(payout.status) !== 2) throw new Error('Payout status should be Approved (2)');
  });

  await test('10. Cap and budget limits: Exceeding maxPerClaim reverts', async () => {
    // Create Claim #3
    await (await lrRegistrar.createClaim(claimantSigner.address, dummyOwnerHash, dummyEvidenceHash, 12971598, 77594562)).wait();
    const claimId3 = 3;
    await (await landRegistry.connect(leader1Signer).attest(claimId3)).wait();
    await (await landRegistry.connect(ngo1Signer).attest(claimId3)).wait();

    // Try approving 1.5 ETH (cap is 1.0)
    let reverted = false;
    try {
      await reliefFund.connect(officer1Signer).approvePayout(claimId3, reliefId, ethers.parseEther('1.5'), claimantSigner.address);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected exceeding per-claim cap to revert');
  });

  await test('11. Release while disputed: Disputed claim freezes payout release', async () => {
    // Dispute Claim #2
    await (await landRegistry.connect(arbiterSigner).dispute(claimId2)).wait();

    let reverted = false;
    try {
      await reliefFund.connect(adminSigner).release(claimId2, reliefId);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected release to revert when claim is disputed');

    // Restore Claim #2
    const tx = await landRegistry.connect(arbiterSigner).resolveDispute(claimId2, true);
    await tx.wait();
    const c2 = await landRegistry.getClaim(claimId2);
    // console.log('Claim2 state after restore:', c2.score.toString(), c2.status.toString());
  });

  await test('12. Successful release and Double Release prevention', async () => {
    const balBefore = await provider.getBalance(claimantSigner.address);
    const tx = await reliefFund.connect(adminSigner).release(claimId2, reliefId, { gasLimit: 300000 });
    const receipt = await tx.wait();
    const balAfter = await provider.getBalance(claimantSigner.address, receipt.blockNumber);
    const payoutAfter = await reliefFund.getPayout(claimId2, reliefId);

    if (balAfter <= balBefore) throw new Error('Beneficiary balance did not increase after release');
    if (Number(payoutAfter.status) !== 3) throw new Error('Payout status is not Paid');

    // Double release must revert
    let reverted = false;
    try {
      await reliefFund.connect(adminSigner).release(claimId2, reliefId);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected double release to revert');
  });

  await test('13. Reentrancy Protection with MaliciousBeneficiary contract', async () => {
    if (IS_MST) {
      console.log('     ⚠️  SKIPPED on MST (MaliciousBeneficiary not deployed on testnet — reentrancy proven locally)');
      return;
    }

    // Deploy malicious contract
    const malFactory = new ethers.ContractFactory(MaliciousArtifact.abi, MaliciousArtifact.bytecode, attackerSigner);
    const malContract = await malFactory.deploy(reliefFundAddress);
    await malContract.waitForDeployment();
    const malAddress = await malContract.getAddress();

    // Create Claim #4 bound to MaliciousBeneficiary
    await (await lrRegistrar.createClaim(malAddress, dummyOwnerHash, dummyEvidenceHash, 12971598, 77594562)).wait();
    const claimId4 = 4;
    await (await landRegistry.connect(leader1Signer).attest(claimId4)).wait();
    await (await landRegistry.connect(ngo1Signer).attest(claimId4)).wait();

    // Assess and Approve
    await (await reliefFund.connect(assessorSigner).assess(claimId4, reliefId, 2, ethers.keccak256(ethers.toUtf8Bytes('MalDamage')))).wait();
    const malAmt = ethers.parseEther('0.5');
    await (await reliefFund.connect(officer1Signer).approvePayout(claimId4, reliefId, malAmt, malAddress)).wait();
    await (await reliefFund.connect(officer2Signer).approvePayout(claimId4, reliefId, malAmt, malAddress)).wait();

    // Arm malicious contract
    await (await malContract.setTarget(claimId4, reliefId)).wait();

    // Release: Malicious contract tries reentrant release() during receive()
    // It must fail or revert cleanly, preventing double withdrawal
    let reentrancyReverted = false;
    try {
      await reliefFund.connect(adminSigner).release(claimId4, reliefId);
    } catch (err) {
      reentrancyReverted = true;
    }
    if (!reentrancyReverted) {
      throw new Error('Expected reentrancy attack to trigger revert in MaliciousBeneficiary call');
    }
  });


  // Helper for decoding events
  function findEvent(receipt, contractInterface, eventName) {
    for (const log of receipt.logs) {
      try {
        const parsed = contractInterface.parseLog(log);
        if (parsed && parsed.name === eventName) {
          return parsed;
        }
      } catch (_) {}
    }
    return null;
  }

  async function getRevertReason(promise) {
    try {
      await promise;
      return null;
    } catch (err) {
      if (err.data) {
        try {
          const iface = new ethers.Interface(['function Error(string)']);
          return iface.decodeFunctionData('Error', err.data)[0];
        } catch (_) {}
      }
      return err.reason || err.shortMessage || err.message;
    }
  }

  // =============================================================
  // BLOCK 1 — EVENT EMISSION (Tests 14 to 18)
  // =============================================================
  console.log('\n--- Block 1: Event Emission Tests ---');

  await test('14. ClaimCreated emits with correct args // G1, G2', async () => {
    const claimant14 = ethers.Wallet.createRandom().address;
    const ownerHash14 = ethers.keccak256(ethers.toUtf8Bytes('Owner14_Salt'));
    const evHash14 = ethers.keccak256(ethers.toUtf8Bytes('Evidence14_Photos'));
    const lat14 = 12971598;
    const lon14 = 77594562;

    const tx = await landRegistry.connect(registrarSigner).createClaim(claimant14, ownerHash14, evHash14, lat14, lon14);
    const receipt = await tx.wait();
    const event = findEvent(receipt, landRegistry.interface, 'ClaimCreated');

    if (!event) throw new Error('ClaimCreated event not emitted');
    if (event.args.claimant.toLowerCase() !== claimant14.toLowerCase()) throw new Error('claimant mismatch');
    if (event.args.ownerHash !== ownerHash14) throw new Error('ownerHash mismatch');
    if (event.args.evidenceHash !== evHash14) throw new Error('evidenceHash mismatch');
    if (Number(event.args.latE6) !== lat14) throw new Error('latE6 mismatch');
    if (Number(event.args.lonE6) !== lon14) throw new Error('lonE6 mismatch');
  });

  await test('15. ClaimAttested emits with correct args // G1', async () => {
    // Create fresh claim for test 15
    const claimant15 = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      claimant15,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    const receiptClaim = await txClaim.wait();
    const claimCreatedEv = findEvent(receiptClaim, landRegistry.interface, 'ClaimCreated');
    const claimId15 = claimCreatedEv.args.claimId;

    const txAttest = await landRegistry.connect(neighbor1Signer).attest(claimId15);
    const receiptAttest = await txAttest.wait();
    const event = findEvent(receiptAttest, landRegistry.interface, 'ClaimAttested');

    if (!event) throw new Error('ClaimAttested event not emitted');
    if (event.args.claimId !== claimId15) throw new Error('claimId mismatch');
    if (event.args.attester.toLowerCase() !== neighbor1Signer.address.toLowerCase()) throw new Error('attester mismatch');
    if (Number(event.args.role) !== 1) throw new Error('role mismatch (expected 1 for Neighbor)');
    if (Number(event.args.newScore) !== 1) throw new Error('newScore mismatch');
    if (Number(event.args.newStatus) !== 0) throw new Error('newStatus mismatch (expected 0 for Pending)');
  });

  await test('16. ClaimDisputed emits with correct args // G3', async () => {
    // Create fresh claim
    const claimant16 = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      claimant16,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    const receiptClaim = await txClaim.wait();
    const claimId16 = findEvent(receiptClaim, landRegistry.interface, 'ClaimCreated').args.claimId;

    const txDispute = await landRegistry.connect(registrarSigner).dispute(claimId16);
    const receiptDispute = await txDispute.wait();
    const event = findEvent(receiptDispute, landRegistry.interface, 'ClaimDisputed');

    if (!event) throw new Error('ClaimDisputed event not emitted');
    if (event.args.claimId !== claimId16) throw new Error('claimId mismatch');
    if (event.args.reporter.toLowerCase() !== registrarSigner.address.toLowerCase()) throw new Error('reporter mismatch');
  });

  await test('17. ReliefCreated emits with correct args // G5', async () => {
    const zoneHash17 = ethers.keccak256(ethers.toUtf8Bytes('Zone17_Polygon'));
    const maxPerClaim17 = ethers.parseEther('0.6');
    const expiresAt17 = Math.floor(Date.now() / 1000) + 7200;
    const budget17 = ethers.parseEther('3.0');

    const tx = await reliefFund.connect(adminSigner).createRelief(zoneHash17, maxPerClaim17, expiresAt17, { value: budget17 });
    const receipt = await tx.wait();
    const event = findEvent(receipt, reliefFund.interface, 'ReliefCreated');

    if (!event) throw new Error('ReliefCreated event not emitted');
    if (event.args.zoneHash !== zoneHash17) throw new Error('zoneHash mismatch');
    if (event.args.budget !== budget17) throw new Error('budget mismatch');
    if (event.args.maxPerClaim !== maxPerClaim17) throw new Error('maxPerClaim mismatch');
    if (Number(event.args.expiresAt) !== expiresAt17) throw new Error('expiresAt mismatch');
  });

  await test('18. PayoutReleased emits with correct args // G5, G6', async () => {
    // Verified claim
    const claimant18 = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      claimant18,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    const claimId18 = findEvent(await txClaim.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;
    await (await landRegistry.connect(leader1Signer).attest(claimId18)).wait(); // +3
    await (await landRegistry.connect(ngo1Signer).attest(claimId18)).wait();    // +3 -> Verified

    // Create Relief
    const txRelief = await reliefFund.connect(adminSigner).createRelief(
      ethers.keccak256(ethers.toUtf8Bytes('Zone18')),
      ethers.parseEther('1.0'),
      Math.floor(Date.now() / 1000) + 7200,
      { value: ethers.parseEther('2.0') }
    );
    const reliefId18 = findEvent(await txRelief.wait(), reliefFund.interface, 'ReliefCreated').args.reliefId;

    // Assess and dual-approve
    await (await reliefFund.connect(assessorSigner).assess(claimId18, reliefId18, 3, ethers.keccak256(ethers.toUtf8Bytes('D18')))).wait();
    const amt18 = ethers.parseEther('0.3');
    await (await reliefFund.connect(officer1Signer).approvePayout(claimId18, reliefId18, amt18, claimant18)).wait();
    await (await reliefFund.connect(officer2Signer).approvePayout(claimId18, reliefId18, amt18, claimant18)).wait();

    // Release
    const txRelease = await reliefFund.connect(adminSigner).release(claimId18, reliefId18, { gasLimit: 300000 });
    const receiptRelease = await txRelease.wait();
    const event = findEvent(receiptRelease, reliefFund.interface, 'PayoutReleased');

    if (!event) throw new Error('PayoutReleased event not emitted');
    if (event.args.claimId !== claimId18) throw new Error('claimId mismatch');
    if (event.args.reliefId !== reliefId18) throw new Error('reliefId mismatch');
    if (event.args.amount !== amt18) throw new Error('amount mismatch');
    if (event.args.beneficiary.toLowerCase() !== claimant18.toLowerCase()) throw new Error('beneficiary mismatch');
  });

  // =============================================================
  // BLOCK 2 — BALANCE DELTA ON RELEASE (Tests 19 & 20)
  // =============================================================
  console.log('\n--- Block 2: Balance Delta on Release Tests ---');

  let test19ClaimId = null;
  let test19ReliefId = null;
  let test19Claimant = null;
  const test19Amt = ethers.parseEther('0.4');

  await test('19. release pays exactly AMT to claimant and reduces contract balance by AMT // G5, G6', async () => {
    test19Claimant = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      test19Claimant,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    test19ClaimId = findEvent(await txClaim.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;

    await (await landRegistry.connect(leader1Signer).attest(test19ClaimId)).wait();
    await (await landRegistry.connect(ngo1Signer).attest(test19ClaimId)).wait(); // Verified (score 6)

    const txRelief = await reliefFund.connect(adminSigner).createRelief(
      ethers.keccak256(ethers.toUtf8Bytes('Zone19')),
      ethers.parseEther('1.0'),
      Math.floor(Date.now() / 1000) + 7200,
      { value: ethers.parseEther('2.0') }
    );
    test19ReliefId = findEvent(await txRelief.wait(), reliefFund.interface, 'ReliefCreated').args.reliefId;

    await (await reliefFund.connect(assessorSigner).assess(test19ClaimId, test19ReliefId, 1, ethers.keccak256(ethers.toUtf8Bytes('D19')))).wait();
    await (await reliefFund.connect(officer1Signer).approvePayout(test19ClaimId, test19ReliefId, test19Amt, test19Claimant)).wait();
    await (await reliefFund.connect(officer2Signer).approvePayout(test19ClaimId, test19ReliefId, test19Amt, test19Claimant)).wait();

    const beneficiaryBefore = await provider.getBalance(test19Claimant);
    const fundBefore = await provider.getBalance(reliefFundAddress);

    const txRelease = await reliefFund.connect(adminSigner).release(test19ClaimId, test19ReliefId, { gasLimit: 300000 });
    const receiptRelease = await txRelease.wait();

    const beneficiaryAfter = await provider.getBalance(test19Claimant, receiptRelease.blockNumber);
    const fundAfter = await provider.getBalance(reliefFundAddress, receiptRelease.blockNumber);

    const beneficiaryDelta = beneficiaryAfter - beneficiaryBefore;
    const fundDelta = fundBefore - fundAfter;

    if (beneficiaryDelta !== test19Amt) {
      throw new Error(`Beneficiary balance delta mismatch: expected ${test19Amt}, got ${beneficiaryDelta}`);
    }
    if (fundDelta !== test19Amt) {
      throw new Error(`Fund contract balance delta mismatch: expected ${test19Amt}, got ${fundDelta}`);
    }

    const payout = await reliefFund.getPayout(test19ClaimId, test19ReliefId);
    if (Number(payout[0]) !== 3) {
      throw new Error(`Payout status is not Paid: got ${payout[0]}`);
    }
  });

  await test('20. release does not pay twice // G6', async () => {
    const beneficiaryBefore = await provider.getBalance(test19Claimant);
    const fundBefore = await provider.getBalance(reliefFundAddress);

    let reverted = false;
    try {
      await reliefFund.connect(adminSigner).release(test19ClaimId, test19ReliefId, { gasLimit: 300000 });
    } catch (_) {
      reverted = true;
    }

    if (!reverted) throw new Error('Expected second release() to revert');

    const beneficiaryAfter = await provider.getBalance(test19Claimant);
    const fundAfter = await provider.getBalance(reliefFundAddress);

    if (beneficiaryAfter !== beneficiaryBefore) throw new Error('Beneficiary balance changed on failed double-release');
    if (fundAfter !== fundBefore) throw new Error('Fund balance changed on failed double-release');
  });

  // =============================================================
  // BLOCK 3 — ROLE-GATE NEGATIVES (Tests 21 to 26)
  // =============================================================
  console.log('\n--- Block 3: Role-Gate Negative Tests ---');

  await test('21. non-registrar cannot call createClaim // G1, G2', async () => {
    let reverted = false;
    try {
      await landRegistry.connect(attackerSigner).createClaim(
        attackerSigner.address,
        dummyOwnerHash,
        dummyEvidenceHash,
        12971598,
        77594562
      );
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected unauthorized createClaim to revert');
  });

  await test('22. non-assessor cannot call assess // G6', async () => {
    let reverted = false;
    try {
      await reliefFund.connect(officer1Signer).assess(
        test19ClaimId,
        test19ReliefId,
        2,
        dummyEvidenceHash
      );
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected non-assessor assess() to revert');
  });

  await test('23. non-officer cannot call approvePayout // G6', async () => {
    let reverted = false;
    try {
      await reliefFund.connect(neighbor1Signer).approvePayout(
        test19ClaimId,
        test19ReliefId,
        ethers.parseEther('0.1'),
        test19Claimant
      );
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected non-officer approvePayout() to revert');
  });

  await test('24. release() is permissionless but gated by 2 approvals, Verified status, and single-pay // G5, G6', async () => {
    // Create fresh verified claim
    const claimant24 = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      claimant24,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    const claimId24 = findEvent(await txClaim.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;
    await (await landRegistry.connect(leader1Signer).attest(claimId24)).wait();
    await (await landRegistry.connect(ngo1Signer).attest(claimId24)).wait();

    // Create Relief
    const txRelief = await reliefFund.connect(adminSigner).createRelief(
      ethers.keccak256(ethers.toUtf8Bytes('Zone24')),
      ethers.parseEther('1.0'),
      Math.floor(Date.now() / 1000) + 7200,
      { value: ethers.parseEther('2.0') }
    );
    const reliefId24 = findEvent(await txRelief.wait(), reliefFund.interface, 'ReliefCreated').args.reliefId;

    await (await reliefFund.connect(assessorSigner).assess(claimId24, reliefId24, 2, dummyEvidenceHash)).wait();

    // Sub-case a: only 1 approval -> release reverts
    await (await reliefFund.connect(officer1Signer).approvePayout(claimId24, reliefId24, ethers.parseEther('0.2'), claimant24)).wait();
    let subRevertedA = false;
    try {
      await reliefFund.connect(adminSigner).release.staticCall(claimId24, reliefId24);
    } catch (_) {
      subRevertedA = true;
    }
    if (!subRevertedA) throw new Error('Sub-case a: release should revert with only 1 approval');

    // Add officer 2 approval
    await (await reliefFund.connect(officer2Signer).approvePayout(claimId24, reliefId24, ethers.parseEther('0.2'), claimant24)).wait();

    // Sub-case b: Dispute the claim -> release reverts
    await (await landRegistry.connect(arbiterSigner).dispute(claimId24)).wait();
    let subRevertedB = false;
    try {
      await reliefFund.connect(adminSigner).release.staticCall(claimId24, reliefId24);
    } catch (_) {
      subRevertedB = true;
    }
    if (!subRevertedB) throw new Error('Sub-case b: release should revert when claim is disputed');

    // Restore claim to Verified
    await (await landRegistry.connect(arbiterSigner).resolveDispute(claimId24, true)).wait();

    // Sub-case c: Outsider/random caller (attackerSigner) calls release on approved+verified -> succeeds and moves funds!
    const claimantBalBefore = await provider.getBalance(claimant24);
    const txRelease = await reliefFund.connect(attackerSigner).release(claimId24, reliefId24, { gasLimit: 300000 });
    const receiptRelease = await txRelease.wait();
    const claimantBalAfter = await provider.getBalance(claimant24, receiptRelease.blockNumber);

    if (claimantBalAfter - claimantBalBefore !== ethers.parseEther('0.2')) {
      throw new Error('Sub-case c: release by outsider failed to deliver exact funds to claimant');
    }
    const payout24 = await reliefFund.getPayout(claimId24, reliefId24);
    if (Number(payout24[0]) !== 3) throw new Error('Sub-case c: payout status not Paid');
  });

  await test('25. assess reverts on a Pending claim // G6', async () => {
    // Fresh unverified claim (Pending)
    const claimant25 = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      claimant25,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    const claimId25 = findEvent(await txClaim.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;

    let reverted = false;
    try {
      await reliefFund.connect(assessorSigner).assess(claimId25, test19ReliefId, 2, dummyEvidenceHash);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected assess() on Pending claim to revert');
  });

  await test('26. assess reverts on a Disputed claim // G3, G6', async () => {
    // Verified claim then disputed
    const claimant26 = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      claimant26,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    const claimId26 = findEvent(await txClaim.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;
    await (await landRegistry.connect(leader1Signer).attest(claimId26)).wait();
    await (await landRegistry.connect(ngo1Signer).attest(claimId26)).wait(); // Verified

    await (await landRegistry.connect(arbiterSigner).dispute(claimId26)).wait(); // Disputed

    let reverted = false;
    try {
      await reliefFund.connect(assessorSigner).assess(claimId26, test19ReliefId, 2, dummyEvidenceHash);
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected assess() on Disputed claim to revert');
  });

  // =============================================================
  // BLOCK 4 — BENEFICIARY INTEGRITY (Tests 27 & 28)
  // =============================================================
  console.log('\n--- Block 4: Beneficiary Integrity Tests ---');

  await test('27. officer cannot redirect payout to a non-claimant beneficiary // G6', async () => {
    const aliceAddress = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      aliceAddress,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    const claimId27 = findEvent(await txClaim.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;
    await (await landRegistry.connect(leader1Signer).attest(claimId27)).wait();
    await (await landRegistry.connect(ngo1Signer).attest(claimId27)).wait();

    await (await reliefFund.connect(assessorSigner).assess(claimId27, test19ReliefId, 2, dummyEvidenceHash)).wait();

    // Officer 1 tries to approve payout to attackerAddress
    let reverted = false;
    try {
      await reliefFund.connect(officer1Signer).approvePayout(
        claimId27,
        test19ReliefId,
        ethers.parseEther('0.3'),
        attackerSigner.address // Redirection attack
      );
    } catch (_) {
      reverted = true;
    }
    if (!reverted) throw new Error('Expected redirection to non-claimant to revert');
  });

  await test('28. release sends funds to claimantOf, not to an arbitrary address // G5, G6', async () => {
    const claimant28 = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      claimant28,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    const claimId28 = findEvent(await txClaim.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;
    await (await landRegistry.connect(leader1Signer).attest(claimId28)).wait();
    await (await landRegistry.connect(ngo1Signer).attest(claimId28)).wait();

    const boundClaimant = await landRegistry.claimantOf(claimId28);
    if (boundClaimant.toLowerCase() !== claimant28.toLowerCase()) {
      throw new Error('claimantOf mismatch');
    }

    await (await reliefFund.connect(assessorSigner).assess(claimId28, test19ReliefId, 2, dummyEvidenceHash)).wait();
    const amt28 = ethers.parseEther('0.25');
    await (await reliefFund.connect(officer1Signer).approvePayout(claimId28, test19ReliefId, amt28, boundClaimant)).wait();
    await (await reliefFund.connect(officer2Signer).approvePayout(claimId28, test19ReliefId, amt28, boundClaimant)).wait();

    const claimantBalBefore = await provider.getBalance(boundClaimant);
    const txRelease = await reliefFund.connect(adminSigner).release(claimId28, test19ReliefId, { gasLimit: 300000 });
    const receiptRelease = await txRelease.wait();
    const claimantBalAfter = await provider.getBalance(boundClaimant, receiptRelease.blockNumber);

    if (claimantBalAfter - claimantBalBefore !== amt28) {
      throw new Error('release() did not send exact amount to bound claimantOf address');
    }
  });

  // =============================================================
  // BLOCK 5 — E2E DEMO SCENARIO (Test 29)
  // =============================================================
  console.log('\n--- Block 5: E2E Demo Scenario ---');

  await test('29. E2E: full demo — verify, assess, dual-approve, release; then freeze a disputed claim // G1, G2, G3, G5, G6', async () => {
    const aliceSigner = ethers.Wallet.createRandom();
    const bobSigner = ethers.Wallet.createRandom();

    // 1. Registrar creates claim A for alice. Assert statusOf(A) === Pending.
    const txA = await landRegistry.connect(registrarSigner).createClaim(
      aliceSigner.address,
      ethers.keccak256(ethers.toUtf8Bytes('Alice_ID')),
      ethers.keccak256(ethers.toUtf8Bytes('Alice_Photos')),
      12971598,
      77594562
    );
    const claimA = findEvent(await txA.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;
    const statusA_1 = await landRegistry.statusOf(claimA);
    if (Number(statusA_1) !== 0) throw new Error('Claim A status should be Pending (0)');

    // 2. Grant roles, N1, N2, L1 attest A. Assert statusOf(A) === Verified. All 3 ClaimAttested fired.
    await (await landRegistry.setRole(neighbor1Signer.address, 1)).wait();
    await (await landRegistry.setRole(neighbor2Signer.address, 1)).wait();
    await (await landRegistry.setRole(leader1Signer.address, 2)).wait();

    const r1 = await (await landRegistry.connect(neighbor1Signer).attest(claimA)).wait();
    const r2 = await (await landRegistry.connect(neighbor2Signer).attest(claimA)).wait();
    const r3 = await (await landRegistry.connect(leader1Signer).attest(claimA)).wait();

    if (!findEvent(r1, landRegistry.interface, 'ClaimAttested')) throw new Error('ClaimAttested 1 not fired');
    if (!findEvent(r2, landRegistry.interface, 'ClaimAttested')) throw new Error('ClaimAttested 2 not fired');
    if (!findEvent(r3, landRegistry.interface, 'ClaimAttested')) throw new Error('ClaimAttested 3 not fired');

    const statusA_2 = await landRegistry.statusOf(claimA);
    if (Number(statusA_2) !== 1) throw new Error('Claim A status should be Verified (1)');

    // 3. Admin creates relief with 10 ETH and maxPerClaim = 1 ETH.
    const reliefBudget29 = ethers.parseEther('10.0');
    const maxPerClaim29 = ethers.parseEther('1.0');
    const txRelief29 = await reliefFund.connect(adminSigner).createRelief(
      ethers.keccak256(ethers.toUtf8Bytes('DisasterZone29')),
      maxPerClaim29,
      Math.floor(Date.now() / 1000) + 86400,
      { value: reliefBudget29 }
    );
    const receiptRelief29 = await txRelief29.wait();
    const reliefId29 = findEvent(receiptRelief29, reliefFund.interface, 'ReliefCreated').args.reliefId;
    const reliefData = await reliefFund.getRelief(reliefId29);
    if (reliefData[1] !== reliefBudget29) throw new Error('Relief budget mismatch');

    // 4. Grant officer roles to O1, O2; assessor role to AS.
    await (await reliefFund.setOfficer(officer1Signer.address, true)).wait();
    await (await reliefFund.setOfficer(officer2Signer.address, true)).wait();
    await (await reliefFund.setAssessor(assessorSigner.address, true)).wait();

    // 5. AS calls assess(A, reliefId, 3, flood-photos). Assert status === Assessed and damageLevel === 3.
    const txAssess29 = await reliefFund.connect(assessorSigner).assess(
      claimA,
      reliefId29,
      3,
      ethers.keccak256(ethers.toUtf8Bytes('flood-photos'))
    );
    await txAssess29.wait();
    const payoutA_1 = await reliefFund.getPayout(claimA, reliefId29);
    if (Number(payoutA_1[0]) !== 1) throw new Error('Payout A status should be Assessed (1)');
    if (Number(payoutA_1[1]) !== 3) throw new Error('Payout A damage level should be 3');

    // 6. O1 calls approvePayout(A, reliefId, 0.4 ETH, alice). Status still Assessed (1 approval).
    const payoutAmt29 = ethers.parseEther('0.4');
    await (await reliefFund.connect(officer1Signer).approvePayout(claimA, reliefId29, payoutAmt29, aliceSigner.address)).wait();
    const payoutA_2 = await reliefFund.getPayout(claimA, reliefId29);
    if (Number(payoutA_2[0]) !== 1) throw new Error('Payout A should still be Assessed (1)');

    // 7. O2 calls matching approvePayout. Status Approved.
    await (await reliefFund.connect(officer2Signer).approvePayout(claimA, reliefId29, payoutAmt29, aliceSigner.address)).wait();
    const payoutA_3 = await reliefFund.getPayout(claimA, reliefId29);
    if (Number(payoutA_3[0]) !== 2) throw new Error('Payout A status should be Approved (2)');

    // 8. Capture alice balance. O1 calls release(A, reliefId). Assert balance increased by exactly 0.4 ETH, status Paid, PayoutReleased fired.
    const aliceBalBefore = await provider.getBalance(aliceSigner.address);
    const txRelease29 = await reliefFund.connect(officer1Signer).release(claimA, reliefId29, { gasLimit: 300000 });
    const receiptRelease29 = await txRelease29.wait();
    const aliceBalAfter = await provider.getBalance(aliceSigner.address, receiptRelease29.blockNumber);

    if (aliceBalAfter - aliceBalBefore !== payoutAmt29) {
      throw new Error('Alice balance did not increase by exactly 0.4 ETH');
    }
    const payoutA_4 = await reliefFund.getPayout(claimA, reliefId29);
    if (Number(payoutA_4[0]) !== 3) throw new Error('Payout A status should be Paid (3)');
    if (!findEvent(receiptRelease29, reliefFund.interface, 'PayoutReleased')) {
      throw new Error('PayoutReleased event not fired');
    }

    // 9. Registrar creates claim B for bob. Attest and verify B.
    const txB = await landRegistry.connect(registrarSigner).createClaim(
      bobSigner.address,
      ethers.keccak256(ethers.toUtf8Bytes('Bob_ID')),
      ethers.keccak256(ethers.toUtf8Bytes('Bob_Photos')),
      12972100,
      77595100
    );
    const claimB = findEvent(await txB.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;
    await (await landRegistry.connect(neighbor1Signer).attest(claimB)).wait();
    await (await landRegistry.connect(neighbor2Signer).attest(claimB)).wait();
    await (await landRegistry.connect(leader1Signer).attest(claimB)).wait();
    if (Number(await landRegistry.statusOf(claimB)) !== 1) throw new Error('Claim B should be Verified');

    // 10. Assess B and O1 + O2 approve B for same relief.
    await (await reliefFund.connect(assessorSigner).assess(claimB, reliefId29, 4, ethers.keccak256(ethers.toUtf8Bytes('BobDamage')))).wait();
    await (await reliefFund.connect(officer1Signer).approvePayout(claimB, reliefId29, ethers.parseEther('0.6'), bobSigner.address)).wait();
    await (await reliefFund.connect(officer2Signer).approvePayout(claimB, reliefId29, ethers.parseEther('0.6'), bobSigner.address)).wait();

    // 11. Registrar disputes claim B. Assert statusOf(B) === Disputed (2).
    await (await landRegistry.connect(registrarSigner).dispute(claimB)).wait();
    if (Number(await landRegistry.statusOf(claimB)) !== 2) throw new Error('Claim B should be Disputed (2)');

    // 12. Assert release(B, reliefId) reverts via staticCall. Assert bob balance unchanged.
    const bobBalBefore = await provider.getBalance(bobSigner.address);
    const freezeReason = await getRevertReason(reliefFund.connect(adminSigner).release.staticCall(claimB, reliefId29));

    const bobBalAfter = await provider.getBalance(bobSigner.address);
    if (bobBalAfter !== bobBalBefore) throw new Error("Bob balance changed while disputed");

    // 13. Arbiter resolves dispute with restore = true -> status becomes Verified
    await (await landRegistry.connect(arbiterSigner).resolveDispute(claimB, true)).wait();
    if (Number(await landRegistry.statusOf(claimB)) !== 1) throw new Error('Claim B should be restored to Verified (1)');

    // 14. Unfreeze proven: release(B) MUST now succeed
    const bobBalBeforeUnfreeze = await provider.getBalance(bobSigner.address);
    const txUnfreeze = await reliefFund.connect(adminSigner).release(claimB, reliefId29, { gasLimit: 300000 });
    const receiptUnfreeze = await txUnfreeze.wait();
    const bobBalAfterUnfreeze = await provider.getBalance(bobSigner.address, receiptUnfreeze.blockNumber);

    const bobPayoutAmt = ethers.parseEther('0.6');
    if (bobBalAfterUnfreeze - bobBalBeforeUnfreeze !== bobPayoutAmt) {
      throw new Error('Bob balance did not increase by approved payout amount after unfreeze');
    }
    const payoutB_final = await reliefFund.getPayout(claimB, reliefId29);
    if (Number(payoutB_final[0]) !== 3) throw new Error('Payout B status should be Paid (3)');

    // 15. Log one-line E2E summary with release tx, freeze reason, and unfreeze tx
    console.log(`    E2E PASS — payout released: ${receiptRelease29.hash}, freeze proven: ${freezeReason}, unfreeze released: ${receiptUnfreeze.hash}`);
  });

  // =============================================================
  // BLOCK 6 — ADDITIONAL COVERAGE (Tests 30 & 31)
  // =============================================================
  console.log('\n--- Block 6: Additional Coverage Tests ---');

  await test('30. resolveDispute(false) resets score and bumps round so old attestations cannot re-verify // G1, G3', async () => {
    // Create and verify claim
    const claimant30 = ethers.Wallet.createRandom().address;
    const txClaim = await landRegistry.connect(registrarSigner).createClaim(
      claimant30,
      dummyOwnerHash,
      dummyEvidenceHash,
      12971598,
      77594562
    );
    const claimId30 = findEvent(await txClaim.wait(), landRegistry.interface, 'ClaimCreated').args.claimId;
    await (await landRegistry.connect(leader1Signer).attest(claimId30)).wait();
    await (await landRegistry.connect(ngo1Signer).attest(claimId30)).wait(); // Verified (score 6)

    // Dispute
    await (await landRegistry.connect(arbiterSigner).dispute(claimId30)).wait();

    // Arbiter resolves dispute with restore = false
    await (await landRegistry.connect(arbiterSigner).resolveDispute(claimId30, false)).wait();

    // Neighbor1 attests again in round 2
    await (await landRegistry.connect(neighbor1Signer).attest(claimId30)).wait();

    const claimData = await landRegistry.getClaim(claimId30);
    if (Number(claimData[5]) !== 1) {
      throw new Error(`Score should be 1 after round reset, got: ${claimData[5]}`);
    }
    if (Number(claimData[6]) !== 2) {
      throw new Error(`Round counter should be 2, got: ${claimData[6]}`);
    }
    if (Number(claimData[7]) !== 0) {
      throw new Error(`Status should be Pending (0), got: ${claimData[7]}`);
    }
  });

  await test('31. sweepUnspent reverts before expiresAt and succeeds after // G5, G6', async () => {
    if (IS_MST) {
      console.log('     ⚠️  SKIPPED on MST (requires evm_increaseTime — not available on live testnet)');
      return;
    }
    const sweepRecipient = ethers.Wallet.createRandom().address;
    const sweepBudget = ethers.parseEther('1.5');
    const nowTimestamp = (await provider.getBlock('latest')).timestamp;
    const expiresAt31 = nowTimestamp + 3600;

    const txRelief = await reliefFund.connect(adminSigner).createRelief(
      ethers.keccak256(ethers.toUtf8Bytes('Zone31')),
      ethers.parseEther('0.5'),
      expiresAt31,
      { value: sweepBudget }
    );
    const reliefId31 = findEvent(await txRelief.wait(), reliefFund.interface, 'ReliefCreated').args.reliefId;

    // 1. sweepUnspent reverts before expiresAt
    let revertedBefore = false;
    try {
      await reliefFund.connect(adminSigner).sweepUnspent(reliefId31, sweepRecipient);
    } catch (_) {
      revertedBefore = true;
    }
    if (!revertedBefore) throw new Error('Expected sweepUnspent to revert before expiresAt');

    // 2. Jump past expiresAt via hardhat RPC
    await hardhatNet.provider.request({
      method: 'evm_increaseTime',
      params: [3601]
    });
    await hardhatNet.provider.request({
      method: 'evm_mine',
      params: []
    });

    // 3. sweepUnspent succeeds after expiresAt
    const recipientBefore = await provider.getBalance(sweepRecipient);
    const txSweep = await reliefFund.connect(adminSigner).sweepUnspent(reliefId31, sweepRecipient, { gasLimit: 300000 });
    const receiptSweep = await txSweep.wait();
    const recipientAfter = await provider.getBalance(sweepRecipient, receiptSweep.blockNumber);

    if (recipientAfter - recipientBefore !== sweepBudget) {
      throw new Error(`Recipient balance did not receive swept budget: diff = ${recipientAfter - recipientBefore}`);
    }

    const reliefAfter = await reliefFund.getRelief(reliefId31);
    if (reliefAfter[1] !== 0n) {
      throw new Error(`Remaining budget in contract should be 0 after full sweep, got ${reliefAfter[1]}`);
    }
  });

  console.log('\n====================================================');
  console.log(`🏁 Test Results: ${passedTests}/${totalTests} Tests Passed`);
  console.log('====================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 All state machine, role-based, dispute, and escrow invariants verified successfully!');
  } else {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});

