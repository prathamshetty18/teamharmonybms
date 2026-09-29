// scripts/diagnose-tx.js
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const RPC = process.env.RPC_URL || 'https://testnetrpc.mstblockchain.com';
const EXPLORER = 'https://testnet.mstscan.com';

async function diagnoseHash(provider, hash) {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('HASH:', hash);
  console.log('Explorer:', `${EXPLORER}/tx/${hash}`);
  console.log('');

  let tx = null, receipt = null;
  try { tx = await provider.getTransaction(hash); } catch (e) {}
  try { receipt = await provider.getTransactionReceipt(hash); } catch (e) {}

  if (!tx && !receipt) {
    console.log('  tx:      NULL');
    console.log('  receipt: NULL');
    console.log('  VERDICT: NOT_FOUND');
    return { verdict: 'NOT_FOUND' };
  }
  if (tx && !receipt) {
    console.log('  from:   ', tx.from);
    console.log('  nonce:  ', tx.nonce);
    console.log('  gasPrice:', tx.gasPrice ? ethers.formatUnits(tx.gasPrice, 'gwei') + ' gwei' : 'n/a');
    console.log('  VERDICT: PENDING / STUCK');
    return { verdict: 'PENDING', from: tx.from, nonce: tx.nonce };
  }
  console.log('  from:   ', receipt.from);
  console.log('  to:     ', receipt.to);
  console.log('  block:  ', receipt.blockNumber);
  console.log('  status: ', receipt.status === 1 ? 'SUCCESS' : 'REVERTED');
  console.log('  VERDICT: MINED');
  return { verdict: receipt.status === 1 ? 'SUCCESS' : 'REVERTED', block: receipt.blockNumber };
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  console.log('RPC:', RPC, '| chainId:', (await provider.getNetwork()).chainId.toString());

  const hashes = process.argv.slice(2).filter(a => a.startsWith('0x'));
  if (hashes.length === 0) {
    console.error('Usage: node scripts/diagnose-tx.js 0xHASH1 0xHASH2');
    process.exit(1);
  }

  for (const h of hashes) await diagnoseHash(provider, h);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('WALLET NONCE CHECK');
  console.log('════════════════════════════════════════════════════════════════');
  const rolesPath = path.join(__dirname, '..', '.env.roles.json');
  if (fs.existsSync(rolesPath)) {
    const roles = JSON.parse(fs.readFileSync(rolesPath, 'utf8'));
    for (const [name, data] of Object.entries(roles)) {
      if (!data || !data.privateKey) continue;
      const w = new ethers.Wallet(data.privateKey, provider);
      const confirmed = await provider.getTransactionCount(w.address, 'latest');
      const pending   = await provider.getTransactionCount(w.address, 'pending');
      const bal       = await provider.getBalance(w.address);
      const stuck     = pending > confirmed ? `  ← STUCK (${pending - confirmed} pending)` : '';
      console.log(name.padEnd(10), w.address, '| conf:', confirmed, '| pend:', pending, '| bal:', ethers.formatEther(bal).slice(0,10), 'MST', stuck);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
