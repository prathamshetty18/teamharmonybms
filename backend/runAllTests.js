/**
 * Harmony BMS - Master Test Suite Runner
 * Runs all 11 test suites sequentially with inherited stdio and error tracking.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const testFiles = [
  'eligibility.test.js',
  'overlap.test.js',
  'phase2.test.js',
  'relief.test.js',
  'auth.test.js',
  'documents.test.js',
  'verification.test.js',
  'dashboard.test.js',
  'phaseDExtended.test.js',
  'phaseE.test.js',
  'phaseF.test.js',
  'test.js'
];

console.log(`\n======================================================`);
console.log(`🚀 Starting Harmony BMS Test Suite (${testFiles.length} test files)`);
console.log(`======================================================\n`);

const startTime = Date.now();
let passedCount = 0;

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  console.log(`\n▶ [${passedCount + 1}/${testFiles.length}] Running ${file}...`);
  const suiteStart = Date.now();

  const result = spawnSync(process.execPath, [filePath], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test' }
  });

  const duration = ((Date.now() - suiteStart) / 1000).toFixed(2);

  if (result.status !== 0) {
    console.error(`\n❌ [FAIL] ${file} exited with code ${result.status} (${duration}s)`);
    process.exit(result.status || 1);
  }

  passedCount++;
  console.log(`✅ [PASS] ${file} completed successfully in ${duration}s.`);
}

const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
console.log('\n======================================================');
console.log(`🎉 ALL ${passedCount}/${testFiles.length} TEST SUITES PASSED CLEANLY in ${totalDuration}s! (100%)`);
console.log('======================================================\n');

process.exit(0);
