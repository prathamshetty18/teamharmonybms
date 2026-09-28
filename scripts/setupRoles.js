const { ethers } = require('ethers');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const ROLES_FILE = path.resolve(__dirname, '..', '.env.roles.json');

const ROLE_NAMES = [
  'ADMIN',
  'REGISTRAR',
  'ARBITER',
  'ASSESSOR',
  'OFFICER1',
  'OFFICER2',
  'NEIGHBOR1',
  'NEIGHBOR2',
  'NEIGHBOR3',
  'LEADER1',
  'NGO1'
];

async function loadOrGenerateRoles() {
  let roles = {};
  if (await fs.pathExists(ROLES_FILE)) {
    roles = await fs.readJSON(ROLES_FILE);
  }

  let generatedCount = 0;
  for (const name of ROLE_NAMES) {
    if (!roles[name] || !roles[name].privateKey) {
      // Use existing PRIVATE_KEY from .env for ADMIN if available
      if (name === 'ADMIN' && process.env.PRIVATE_KEY) {
        const adminWallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        roles[name] = {
          address: adminWallet.address,
          privateKey: adminWallet.privateKey
        };
      } else {
        const wallet = ethers.Wallet.createRandom();
        roles[name] = {
          address: wallet.address,
          privateKey: wallet.privateKey
        };
        generatedCount++;
      }
    }
  }

  await fs.writeJSON(ROLES_FILE, roles, { spaces: 2 });
  return { roles, generatedCount };
}

async function registerRolesOnChain(provider, adminWallet, landRegistryAddress, reliefFundAddress) {
  const LandRegistryArtifact = await fs.readJSON(path.resolve(__dirname, '..', 'build', 'LandRegistry.json'));
  const ReliefFundArtifact = await fs.readJSON(path.resolve(__dirname, '..', 'build', 'ReliefFund.json'));

  const landRegistry = new ethers.Contract(landRegistryAddress, LandRegistryArtifact.abi, adminWallet);
  const reliefFund = new ethers.Contract(reliefFundAddress, ReliefFundArtifact.abi, adminWallet);

  const { roles } = await loadOrGenerateRoles();

  console.log('📝 Registering roles on LandRegistry...');
  await (await landRegistry.setRegistrar(roles.REGISTRAR.address)).wait();
  await (await landRegistry.setArbiter(roles.ARBITER.address)).wait();

  // Roles in LandRegistry: 1 = Neighbor, 2 = Leader, 3 = NGO
  await (await landRegistry.setRole(roles.NEIGHBOR1.address, 1)).wait();
  await (await landRegistry.setRole(roles.NEIGHBOR2.address, 1)).wait();
  await (await landRegistry.setRole(roles.NEIGHBOR3.address, 1)).wait();
  await (await landRegistry.setRole(roles.LEADER1.address, 2)).wait();
  await (await landRegistry.setRole(roles.NGO1.address, 3)).wait();
  console.log('✅ Registered Registrar, Arbiter, Neighbors, Leader, NGO on LandRegistry');

  console.log('📝 Registering roles on ReliefFund...');
  await (await reliefFund.setOfficer(roles.OFFICER1.address, true)).wait();
  await (await reliefFund.setOfficer(roles.OFFICER2.address, true)).wait();
  await (await reliefFund.setAssessor(roles.ASSESSOR.address, true)).wait();
  console.log('✅ Registered Officer1, Officer2, and Assessor on ReliefFund');
}

async function main() {
  console.log('🔑 Role Management Setup (Multi-Wallet Architecture)');
  console.log('----------------------------------------------------');
  const { roles, generatedCount } = await loadOrGenerateRoles();
  console.log(`Loaded ${ROLE_NAMES.length} roles (${generatedCount} freshly generated).`);
  console.log(`Saved to .env.roles.json (git-ignored)`);
  console.log('\nConfigured Role Addresses:');
  for (const name of ROLE_NAMES) {
    console.log(`  ${name.padEnd(12)}: ${roles[name].address}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Role setup failed:', err);
    process.exit(1);
  });
}

module.exports = {
  loadOrGenerateRoles,
  registerRolesOnChain,
  ROLE_NAMES
};
