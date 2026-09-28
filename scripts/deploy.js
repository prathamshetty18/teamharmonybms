const { ethers } = require('ethers');
const fs = require('fs-extra');
const path = require('path');
require('dotenv').config();

const { compileContracts } = require('./compile');
const { loadOrGenerateRoles } = require('./setupRoles');

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

async function updateSubmissionIdempotent(sectionKey, newContent) {
  const subPath = path.resolve(__dirname, '..', 'SUBMISSION.md');
  const startTag = `<!-- START_${sectionKey} -->`;
  const endTag = `<!-- END_${sectionKey} -->`;

  let content = (await fs.pathExists(subPath))
    ? await fs.readFile(subPath, 'utf8')
    : '# Hackathon Submission Ledger\n\n';

  const sectionBlock = `${startTag}\n${newContent}\n${endTag}`;

  if (content.includes(startTag) && content.includes(endTag)) {
    const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'g');
    content = content.replace(regex, sectionBlock);
  } else {
    content += `\n${sectionBlock}\n`;
  }

  await fs.writeFile(subPath, content.trim() + '\n', 'utf8');
}

async function main() {
  console.log('🚀 Deploying LandRegistry.sol to MST Testnet...');

  const rpcUrl = process.env.RPC_URL || 'https://testnetrpc.mstblockchain.com';
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const { roles } = await loadOrGenerateRoles();
  const adminKey = process.env.PRIVATE_KEY || roles.ADMIN.privateKey;
  if (!adminKey) {
    console.error('❌ No private key available for ADMIN.');
    process.exit(1);
  }

  const wallet = new ethers.Wallet(adminKey, provider);
  console.log(`Deployer Account: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`Current Balance:  ${ethers.formatEther(balance)} MST`);
  if (balance === 0n) {
    console.error('❌ Error: Deployer account has 0 MST. Fund via faucet first.');
    process.exit(1);
  }

  const artifactPath = path.resolve(__dirname, '..', 'build', 'LandRegistry.json');
  if (!(await fs.pathExists(artifactPath))) {
    await compileContracts();
  }
  const artifact = await fs.readJSON(artifactPath);

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  console.log('📦 Broadcasting LandRegistry deployment transaction...');
  const contract = await factory.deploy();
  const deployTx = contract.deploymentTransaction();
  console.log(`📡 Deploy Tx Hash: ${deployTx.hash}`);

  const receipt = await deployTx.wait();
  const deployedAddress = await contract.getAddress();
  console.log(`✅ LandRegistry mined at: ${deployedAddress} in block #${receipt.blockNumber}`);

  // Verification 1: Code check
  const code = await provider.getCode(deployedAddress);
  if (code === '0x') {
    throw new Error('Deployment failed: No bytecode at deployed address');
  }

  // Verification 2: Read view function
  const totalClaims = await contract.totalClaims();
  console.log(`🔍 Verified on-chain state: totalClaims = ${totalClaims.toString()}`);

  // Fetch block timestamp directly from receipt's block
  const block = await provider.getBlock(receipt.blockNumber);
  const blockTimestamp = new Date(block.timestamp * 1000).toISOString();

  await updateEnvFile('CONTRACT_ADDRESS', deployedAddress);

  await updateSubmissionIdempotent('LAND_REGISTRY', `
### Deployment: LandRegistry
- **Contract Address:** \`${deployedAddress}\`
- **Deployment Tx Hash:** \`${deployTx.hash}\`
- **Block Number:** \`#${receipt.blockNumber}\`
- **Block Timestamp:** \`${blockTimestamp}\`
- **Gas Used:** \`${receipt.gasUsed.toString()}\`
- **Deployer:** \`${wallet.address}\`
`);

  console.log('💾 Successfully updated .env and SUBMISSION.md');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Deploy LandRegistry error:', err);
    process.exit(1);
  });
}

module.exports = { updateSubmissionIdempotent };
