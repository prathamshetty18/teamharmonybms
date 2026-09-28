const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '..', 'backend', '.env') });

const RPC_URL = process.env.RPC_URL || 'https://testnetrpc.mstblockchain.com';
const LAND_REGISTRY_ADDRESS = process.env.CONTRACT_ADDRESS || '0x9A587a9a4b990bb14Cd00D6432487271f00c2A5c';
const RELIEF_FUND_ADDRESS = process.env.RELIEF_CONTRACT_ADDRESS || '0x41241011dE47C4eb30dFcc45097ceD1f73a7Bd25';

const ROLE_KEYS = [
  'REGISTRAR',
  'ARBITER',
  'ASSESSOR',
  'OFFICER1',
  'OFFICER2',
  'NEIGHBOR1',
  'NEIGHBOR2',
  'NEIGHBOR3',
  'LEADER',
  'NGO'
];

async function main() {
  console.log('================================================================');
  console.log('🚀 Harmony BMS - Auto-Fund & Role Registration on MST Testnet');
  console.log('================================================================');
  console.log(`RPC URL: ${RPC_URL}`);
  console.log(`LandRegistry: ${LAND_REGISTRY_ADDRESS}`);
  console.log(`ReliefFund:   ${RELIEF_FUND_ADDRESS}\n`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // 1. Resolve ADMIN wallet
  const adminKey = process.env.ADMIN_KEY || process.env.PRIVATE_KEY;
  if (!adminKey || !adminKey.trim()) {
    throw new Error('ADMIN_KEY (or PRIVATE_KEY) not found in .env. Please add it first.');
  }

  const adminWallet = new ethers.Wallet(adminKey.trim(), provider);
  const adminBalance = await provider.getBalance(adminWallet.address);
  console.log(`Admin Wallet Address: ${adminWallet.address}`);
  console.log(`Admin Balance:        ${ethers.formatEther(adminBalance)} MST\n`);

  if (adminBalance < ethers.parseEther('0.5')) {
    console.warn(`⚠️ Warning: Admin balance (${ethers.formatEther(adminBalance)} MST) is low.`);
  }

  // 2. Resolve or generate the 10 role wallets
  const wallets = {};
  const generatedKeys = {};
  const rootEnvPath = path.resolve(__dirname, '..', '.env');
  const backendEnvPath = path.resolve(__dirname, '..', 'backend', '.env');

  for (const role of ROLE_KEYS) {
    const envKey = `${role}_KEY`;
    let keyVal = process.env[envKey];
    if (keyVal && keyVal.trim()) {
      wallets[role] = new ethers.Wallet(keyVal.trim(), provider);
      console.log(`[Configured] ${role.padEnd(10)}: ${wallets[role].address}`);
    } else {
      const w = ethers.Wallet.createRandom().connect(provider);
      wallets[role] = w;
      generatedKeys[envKey] = w.privateKey;
      console.log(`[Generated]  ${role.padEnd(10)}: ${w.address}`);
    }
  }

  // 3. Fund each wallet with 0.05 MST if balance < 0.02 MST
  console.log('\n--- Funding Role Wallets for Gas ---');
  const fundAmount = ethers.parseEther('0.05');

  for (const role of ROLE_KEYS) {
    const w = wallets[role];
    const bal = await provider.getBalance(w.address);
    if (bal < ethers.parseEther('0.02')) {
      console.log(`Funding ${role} (${w.address}) with 0.05 MST...`);
      const tx = await adminWallet.sendTransaction({
        to: w.address,
        value: fundAmount
      });
      const receipt = await tx.wait();
      console.log(`  ✓ Funded ${role} (tx: ${receipt.hash}, block: #${receipt.blockNumber})`);
    } else {
      console.log(`  ✓ ${role} already has ${ethers.formatEther(bal)} MST`);
    }
  }

  // 4. Register roles on LandRegistry and ReliefFund
  console.log('\n--- Registering Roles On-Chain ---');

  // Load contract ABIs
  const LandRegistryArtifact = require('../build/LandRegistry.json');
  const ReliefFundArtifact = require('../build/ReliefFund.json');

  const lrAbi = [
    ...LandRegistryArtifact.abi,
    'function setRegistrar(address _registrar) external',
    'function setArbiter(address _arbiter) external'
  ];
  const rfAbi = [
    ...ReliefFundArtifact.abi,
    'function setOfficer(address user, bool allowed) external',
    'function setAssessor(address user, bool allowed) external'
  ];

  const landRegistry = new ethers.Contract(LAND_REGISTRY_ADDRESS, lrAbi, adminWallet);
  const reliefFund = new ethers.Contract(RELIEF_FUND_ADDRESS, rfAbi, adminWallet);

  // Set Registrar & Arbiter
  console.log('Setting Registrar on LandRegistry...');
  const txReg = await landRegistry.setRegistrar(wallets.REGISTRAR.address);
  const rReg = await txReg.wait();
  console.log(`  ✓ Registrar registered: ${wallets.REGISTRAR.address} (tx: ${rReg.hash})`);

  console.log('Setting Arbiter on LandRegistry...');
  const txArb = await landRegistry.setArbiter(wallets.ARBITER.address);
  const rArb = await txArb.wait();
  console.log(`  ✓ Arbiter registered:   ${wallets.ARBITER.address} (tx: ${rArb.hash})`);

  // Set Roles on LandRegistry: 1 = Neighbor, 2 = Leader, 3 = NGO
  console.log('Setting Neighbors, Leader, and NGO roles on LandRegistry...');
  const rN1 = await (await landRegistry.setRole(wallets.NEIGHBOR1.address, 1)).wait();
  console.log(`  ✓ Neighbor 1 (Role=1) registered (tx: ${rN1.hash})`);

  const rN2 = await (await landRegistry.setRole(wallets.NEIGHBOR2.address, 1)).wait();
  console.log(`  ✓ Neighbor 2 (Role=1) registered (tx: ${rN2.hash})`);

  const rN3 = await (await landRegistry.setRole(wallets.NEIGHBOR3.address, 1)).wait();
  console.log(`  ✓ Neighbor 3 (Role=1) registered (tx: ${rN3.hash})`);

  const rL = await (await landRegistry.setRole(wallets.LEADER.address, 2)).wait();
  console.log(`  ✓ Leader (Role=2) registered     (tx: ${rL.hash})`);

  const rNGO = await (await landRegistry.setRole(wallets.NGO.address, 3)).wait();
  console.log(`  ✓ NGO (Role=3) registered        (tx: ${rNGO.hash})`);

  // Set Officers and Assessor on ReliefFund
  console.log('Setting Officers and Assessor on ReliefFund...');
  const rO1 = await (await reliefFund.setOfficer(wallets.OFFICER1.address, true)).wait();
  console.log(`  ✓ Officer 1 registered           (tx: ${rO1.hash})`);

  const rO2 = await (await reliefFund.setOfficer(wallets.OFFICER2.address, true)).wait();
  console.log(`  ✓ Officer 2 registered           (tx: ${rO2.hash})`);

  const rAss = await (await reliefFund.setAssessor(wallets.ASSESSOR.address, true)).wait();
  console.log(`  ✓ Assessor registered            (tx: ${rAss.hash})`);

  // 5. Update .env files with generated keys if needed
  if (Object.keys(generatedKeys).length > 0) {
    console.log('\n--- Updating .env Configuration ---');
    const updateEnv = (filePath) => {
      if (!fs.existsSync(filePath)) return;
      let content = fs.readFileSync(filePath, 'utf8');
      for (const [k, v] of Object.entries(generatedKeys)) {
        const regex = new RegExp(`^${k}=.*$`, 'm');
        if (regex.test(content)) {
          content = content.replace(regex, `${k}=${v}`);
        } else {
          content += `\n${k}=${v}`;
        }
      }
      content = content.replace(/^CHAIN_MOCK=.*$/m, 'CHAIN_MOCK=0');
      fs.writeFileSync(filePath, content.trim() + '\n', 'utf8');
    };

    updateEnv(rootEnvPath);
    updateEnv(backendEnvPath);
    console.log('  ✓ Updated root .env and backend/.env with role keys');
  }

  console.log('\n================================================================');
  console.log('🎉 ALL 11 WALLET ROLES FUNDED & REGISTERED ON-CHAIN (100%)');
  console.log('================================================================\n');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n❌ Auto-Fund & Role Setup Failed:', err.message || err);
    process.exit(1);
  });
}

module.exports = { main };
