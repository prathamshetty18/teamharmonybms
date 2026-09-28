const fs = require('fs-extra');
const path = require('path');
const solc = require('solc');

async function compileContracts() {
  console.log('🔨 Compiling Solidity Smart Contracts (evmVersion: paris)...');

  const contractsDir = path.resolve(__dirname, '..', 'contracts');
  const buildDir = path.resolve(__dirname, '..', 'build');
  await fs.ensureDir(buildDir);

  const landRegistrySource = await fs.readFile(
    path.join(contractsDir, 'LandRegistry.sol'),
    'utf8'
  );
  const reliefFundSource = await fs.readFile(
    path.join(contractsDir, 'ReliefFund.sol'),
    'utf8'
  );

  const maliciousPath = path.join(contractsDir, 'test', 'MaliciousBeneficiary.sol');
  let maliciousSource = null;
  const sources = {
    'LandRegistry.sol': { content: landRegistrySource },
    'ReliefFund.sol': { content: reliefFundSource }
  };
  if (await fs.pathExists(maliciousPath)) {
    maliciousSource = await fs.readFile(maliciousPath, 'utf8');
    sources['MaliciousBeneficiary.sol'] = { content: maliciousSource };
  }

  const input = {
    language: 'Solidity',
    sources,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      evmVersion: 'paris', // Avoid PUSH0 opcode incompatibility on older/custom EVM nodes
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    let hasError = false;
    for (const err of output.errors) {
      if (err.severity === 'error') {
        console.error('❌ Compilation error:', err.formattedMessage);
        hasError = true;
      } else {
        console.warn('⚠️ Warning:', err.formattedMessage);
      }
    }
    if (hasError) {
      process.exit(1);
    }
  }

  // Save LandRegistry artifact
  const landRegistry = output.contracts['LandRegistry.sol']['LandRegistry'];
  const landRegistryArtifact = {
    contractName: 'LandRegistry',
    abi: landRegistry.abi,
    bytecode: landRegistry.evm.bytecode.object
  };
  await fs.writeJSON(
    path.join(buildDir, 'LandRegistry.json'),
    landRegistryArtifact,
    { spaces: 2 }
  );
  console.log('✅ Generated build/LandRegistry.json');

  // Save ReliefFund artifact
  const reliefFund = output.contracts['ReliefFund.sol']['ReliefFund'];
  const reliefFundArtifact = {
    contractName: 'ReliefFund',
    abi: reliefFund.abi,
    bytecode: reliefFund.evm.bytecode.object
  };
  await fs.writeJSON(
    path.join(buildDir, 'ReliefFund.json'),
    reliefFundArtifact,
    { spaces: 2 }
  );
  console.log('✅ Generated build/ReliefFund.json');

  if (sources['MaliciousBeneficiary.sol']) {
    const malicious = output.contracts['MaliciousBeneficiary.sol']['MaliciousBeneficiary'];
    await fs.writeJSON(
      path.join(buildDir, 'MaliciousBeneficiary.json'),
      {
        contractName: 'MaliciousBeneficiary',
        abi: malicious.abi,
        bytecode: malicious.evm.bytecode.object
      },
      { spaces: 2 }
    );
    console.log('✅ Generated build/MaliciousBeneficiary.json');
  }
  console.log('🎉 Smart contracts compiled successfully with evmVersion: paris!');
}

if (require.main === module) {
  compileContracts().catch((err) => {
    console.error('Compilation failed:', err);
    process.exit(1);
  });
}

module.exports = { compileContracts };
