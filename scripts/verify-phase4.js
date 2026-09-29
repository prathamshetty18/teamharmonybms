const puppeteer = require('puppeteer-core');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function verifyPhase4() {
  console.log('--- Launching Edge for Phase 4 Verification ---');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const consoleErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Browser Console Error]: ${msg.text()}`);
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log(`[Browser PageError]: ${err.message}`);
    consoleErrors.push(err.message);
  });

  // 1. Initial login & navigate to dashboard
  console.log('1. Setting up Government session & navigating to /dashboard...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    localStorage.setItem('bhoomi_setu_auth', JSON.stringify({
      name: 'Officer Kulkarni',
      username: 'Officer Kulkarni',
      role: 'GOVERNMENT',
      aadhaar: ''
    }));
  });
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle2' });

  console.log('2. Waiting 15 seconds with console open...');
  await new Promise(r => setTimeout(r, 15000));

  const textAfter15s = await page.evaluate(() => (document.querySelector('#root') || document.body).innerText);
  const isBlankInitial = textAfter15s.trim().length === 0;
  console.log(`Dashboard visible after 15s? ${!isBlankInitial} (Length: ${textAfter15s.length})`);

  // 3. Click through tabs: claims list -> relief tab -> audit log
  console.log('3. Clicking through tabs...');
  // Click Disaster Relief Tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button, div, span'));
    const reliefTab = tabs.find(el => el.innerText && el.innerText.includes('Disaster Relief'));
    if (reliefTab) reliefTab.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Click Audit Log Tab
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button, div, span'));
    const auditTab = tabs.find(el => el.innerText && el.innerText.includes('Audit Log'));
    if (auditTab) auditTab.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Click back to Overview / All Claims
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('button, div, span'));
    const allTab = tabs.find(el => el.innerText && (el.innerText.includes('All Claims') || el.innerText.includes('Overview')));
    if (allTab) allTab.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  console.log(`Console error count after click-through: ${consoleErrors.length}`);

  // 4. Reload dashboard 3 times in a row
  console.log('4. Testing 3 consecutive reloads...');
  let reloadSuccess = true;
  for (let i = 1; i <= 3; i++) {
    console.log(`  Reload #${i}...`);
    await page.reload({ waitUntil: 'networkidle2' });
    await new Promise(r => setTimeout(r, 2000));
    const content = await page.evaluate(() => (document.querySelector('#root') || document.body).innerText);
    const isBlank = content.trim().length === 0;
    console.log(`  Reload #${i} rendered: ${!isBlank}`);
    if (isBlank) reloadSuccess = false;
  }

  console.log(`Reload x3 result: ${reloadSuccess ? 'PASS' : 'FAIL'}`);

  await browser.close();
}

verifyPhase4().catch(err => {
  console.error('Phase 4 verification failed:', err);
  process.exit(1);
});
