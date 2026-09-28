const { ethers } = require('ethers');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const { compileContracts } = require('./compile');
const { loadOrGenerateRoles, registerRolesOnChain } = require('./setupRoles');
const { updateSubmissionIdempotent } = require('./deploy');

async function updateEnvFile(key, value) {
  const envPath = path.resolve(__dirname, '..', '.env');
  let content = (await fs.pathExists(envPath)) ? await fs.readFile(envPath, 'utf8') : '';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}\n`;
  }
  await fs.writeFile(envPath, content.trim() + '\n', 'utf8');
}

async function main() {
  console.log('🚀 Deploying ReliefFund.sol to MST Testnet...');

  const rpcUrl = process.env.RPC_URL || 'https://testnetrpc.mstblockchain.com';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const landRegistryAddress = process.env.CONTRACT_ADDRESS;
  if (!landRegistryAddress || !ethers.isAddress(landRegistryAddress)) {
    console.error('❌ LandRegistry address missing. Deploy LandRegistry first via npm run deploy.');
    process.exit(1);
  }

  const { roles } = await loadOrGenerateRoles();
  const adminKey = process.env.PRIVATE_KEY || roles.ADMIN.privateKey;
  const wallet = new ethers.Wallet(adminKey, provider);

  const artifactPath = path.resolve(__dirname, '..', 'build', 'ReliefFund.json');
  if (!(await fs.pathExists(artifactPath))) {
    await compileContracts();
  }
  const artifact = await fs.readJSON(artifactPath);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log('📦 Broadcasting ReliefFund deployment transaction...');
  const contract = await factory.deploy(landRegistryAddress);
  const deployTx = contract.deploymentTransaction();
  console.log(`📡 Deploy Tx Hash: ${deployTx.hash}`);

  const receipt = await deployTx.wait();
  const deployedAddress = await contract.getAddress();
  console.log(`✅ ReliefFund mined at: ${deployedAddress} in block #${receipt.blockNumber}`);

  // Verification 1: Code check
  const code = await provider.getCode(deployedAddress);
  if (code === '0x') {
    throw new Error('Deployment failed: No bytecode at deployed address');
  }

  // Verification 2: Read view function
  const linkedRegistry = await contract.landRegistry();
  console.log(`🔍 Verified linked LandRegistry: ${linkedRegistry}`);

  // Fetch block timestamp directly from receipt's block
  const block = await provider.getBlock(receipt.blockNumber);
  const blockTimestamp = new Date(block.timestamp * 1000).toISOString();

  await updateEnvFile('RELIEF_CONTRACT_ADDRESS', deployedAddress);

  // Register roles on-chain
  console.log('\n⚙️ Configuring on-chain permissions across contracts...');
  await registerRolesOnChain(provider, wallet, landRegistryAddress, deployedAddress);

  await updateSubmissionIdempotent('RELIEF_FUND', `
### Deployment: ReliefFund
- **Contract Address:** \`${deployedAddress}\`
- **Linked LandRegistry:** \`${landRegistryAddress}\`
- **Deployment Tx Hash:** \`${deployTx.hash}\`
- **Block Number:** \`#${receipt.blockNumber}\`
- **Block Timestamp:** \`${blockTimestamp}\`
- **Gas Used:** \`${receipt.gasUsed.toString()}\`
- **Deployer:** \`${wallet.address}\`
`);

  console.log('💾 Successfully updated .env and SUBMISSION.md');
}

main().catch((err) => {
  console.error('Deploy ReliefFund error:', err);
  process.exit(1);
});
