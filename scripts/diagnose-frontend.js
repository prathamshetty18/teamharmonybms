const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function main() {
  console.log('Launching headless Edge...');
  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  const consoleMessages = [];
  const errors = [];
  const failedRequests = [];

  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    consoleMessages.push({ type, text, location: msg.location() });
    if (type === 'error') {
      console.log(`[Browser Console Error]: ${text}`);
    }
  });

  page.on('pageerror', err => {
    console.log(`[Browser PageError]: ${err.message}`);
    console.log(`[Stack]:\n${err.stack}`);
    errors.push({
      message: err.message,
      stack: err.stack
    });
  });

  page.on('response', response => {
    const status = response.status();
    const url = response.url();
    if (status >= 400) {
      failedRequests.push({ url, status, method: response.request().method() });
      console.log(`[Failed Request]: ${response.request().method()} ${url} -> ${status}`);
    }
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  console.log('Setting Government session in localStorage...');
  await page.evaluate(() => {
    localStorage.setItem('bhoomi_setu_auth', JSON.stringify({
      name: 'Officer Kulkarni',
      username: 'Officer Kulkarni',
      role: 'GOVERNMENT',
      aadhaar: ''
    }));
  });

  console.log('Navigating to http://localhost:3000/dashboard...');
  await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle2' });

  console.log('Waiting 10 seconds for re-renders and data arrival...');
  await new Promise(r => setTimeout(r, 10000));

  const content = await page.content();
  console.log(`Page content length: ${content.length}`);
  const isBlank = await page.evaluate(() => {
    const root = document.querySelector('#root') || document.body;
    return root.innerText.trim().length === 0;
  });
  console.log(`Is root blank? ${isBlank}`);
  const pageTextSnippet = await page.evaluate(() => (document.querySelector('#root') || document.body).innerText.slice(0, 300));
  console.log(`Rendered text snippet:\n${pageTextSnippet}\n`);

  console.log('\n=== DIAGNOSIS SUMMARY ===');
  console.log(`Errors count: ${errors.length}`);
  if (errors.length > 0) {
    console.log('First PageError:');
    console.log(errors[0].message);
    console.log(errors[0].stack);
  }

  const redConsoleErrors = consoleMessages.filter(m => m.type === 'error');
  console.log(`\nRed console errors count: ${redConsoleErrors.length}`);
  redConsoleErrors.forEach((err, i) => {
    console.log(`\n--- Red Error #${i + 1} ---`);
    console.log(`Text: ${err.text}`);
    if (err.location) console.log(`Location: ${err.location.url}:${err.location.lineNumber}:${err.location.columnNumber}`);
  });

  console.log(`\nFailed requests: ${failedRequests.length}`);
  failedRequests.forEach(req => {
    console.log(`  ${req.method} ${req.url} -> ${req.status}`);
  });

  await browser.close();
}

main().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
