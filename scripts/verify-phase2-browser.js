const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const jwt = require(path.resolve(__dirname, '../backend/node_modules/jsonwebtoken'));
require('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'harmony-bms-auth-secret-key-production-2026';
const token = jwt.sign(
  { userId: 'usr_gov_test', name: 'Officer Sharma', role: 'Government Officer' },
  JWT_SECRET,
  { expiresIn: '1d' }
);

async function runBrowserTest() {
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const edge = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--user-data-dir=' + path.resolve(__dirname, '../edge-test-profile'),
    'http://localhost:3000'
  ]);

  // Wait 2s for edge to start
  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await fetch('http://127.0.0.1:9222/json/list');
    const tabs = await listRes.json();
    const tab = tabs.find(t => t.type === 'page') || tabs[0];
    if (!tab) throw new Error('No browser tab found');

    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        const handler = (data) => {
          const msg = JSON.parse(data);
          if (msg.id === msgId) {
            ws.off('message', handler);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    const consoleErrors = [];
    const networkResponses = [];

    ws.on('message', async (data) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        if (msg.params.type === 'error') {
          consoleErrors.push(msg.params.args.map(a => a.value || a.description).join(' '));
        }
      }
      if (msg.method === 'Network.responseReceived') {
        const url = msg.params.response.url;
        const status = msg.params.response.status;
        const requestId = msg.params.requestId;
        if (url.includes('/approve') || url.includes('/claims/')) {
          networkResponses.push({ url, status, requestId });
        }
      }
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');

    // Set auth in localStorage
    await send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('bhoomi_setu_auth', JSON.stringify({
          token: '${token}',
          jwt: '${token}',
          userId: 'usr_gov_test',
          role: 'GOVERNMENT',
          name: 'Officer Sharma'
        }));
        localStorage.setItem('bhoomi_setu_token', '${token}');
        localStorage.setItem('token', '${token}');
        window.location.href = 'http://localhost:3000/dashboard';
      `
    });

    // Wait 4s for dashboard to render and fetch claims
    await new Promise(r => setTimeout(r, 4000));

    // Check DOM for Score and Parcel details
    const domCheck = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const text = document.body.innerText;
          const scoreMatch = text.match(/Score:\\s*([0-9—]+)\\s*\\/\\s*5/);
          const hasScore6 = text.includes('Score: 6/5') || text.includes('6/5');
          const hasVerified = text.includes('Verified') || text.includes('VERIFIED');
          return {
            hasScore6,
            scoreMatch: scoreMatch ? scoreMatch[0] : null,
            textPreview: text.slice(0, 1000)
          };
        })()
      `,
      returnByValue: true
    });

    console.log('DOM Check Result:', JSON.stringify(domCheck.result.value, null, 2));

    // Now open modal or trigger approval through API from the page context
    const approveResult = await send('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/claims/2/approve', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
              },
              body: JSON.stringify({
                finalClassification: 'Agricultural',
                officerName: 'Officer Sharma (Revenue Magistrate)'
              })
            });
            const body = await res.json();
            return { status: res.status, body };
          } catch (err) {
            return { error: err.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    console.log('Approve Network Call Result:', JSON.stringify(approveResult.result.value, null, 2));
    console.log('Console Errors Count:', consoleErrors.length);
    if (consoleErrors.length > 0) {
      console.log('Errors:', consoleErrors);
    }

    ws.close();
  } finally {
    edge.kill();
  }
}

runBrowserTest().catch(console.error);
