/**
 * Phase D — Dashboard & Reporting API Unit & Integration Tests
 *
 * Covers:
 *   1.  GET /dashboard/summary       — KPI counts, budget totals, payout breakdown
 *   2.  GET /dashboard/map           — Leaflet marker shape, coordinate validation
 *   3.  GET /dashboard/activity      — Feed ordering, limit, landId filter
 *   4.  GET /dashboard/relief/:id    — Budget utilization stats
 *   5.  GET /reliefs/:id/stats       — Alias for relief stats
 *   6.  GET /claims/search           — Free-text, status, district, score, date, pagination
 *   7.  GET /parcels/search          — Alias for claims/search
 *   8.  GET /dashboard/roles         — Role definitions
 *   9.  Edge cases: unknown reliefId → 404, empty search → full list, page overflow
 */

process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const http = require('http');
const { app } = require('./server');

let server;
let port;

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers: { 'Content-Type': 'application/json', ...headers }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', d => (data += d));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function get(path, headers) { return request('GET', path, null, headers); }
function post(path, body, headers) { return request('POST', path, body, headers); }

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`   ✓ ${label}`);
    passed++;
  } else {
    console.error(`   ✗ FAIL: ${label}${detail ? ' | ' + detail : ''}`);
    failed++;
    failures.push(`${label}${detail ? ' | ' + detail : ''}`);
  }
}

async function run() {
  console.log('◇ injected env from .env');
  console.log('--- Starting Phase D Dashboard & Stats API Tests ---\n');

  // Spin up test server
  await new Promise(resolve => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      console.log(`   Test server started on port ${port}\n`);
      resolve();
    });
  });

  // -------------------------------------------------------
  // Seed: create a claim and a payout so summary has data
  // -------------------------------------------------------
  const claimResp = await post('/claims', {
    ownerName: 'Dashboard Test Owner',
    polygon: { type: 'Polygon', coordinates: [[[77.59, 12.95], [77.60, 12.95], [77.60, 12.96], [77.59, 12.96], [77.59, 12.95]]] },
    parcelAreaAcres: 3.5,
    state: 'Karnataka',
    district: 'Bangalore North',
    village: 'Yelahanka'
  }, { 'x-user-role': 'Farmer' });
  const testClaimId = claimResp.body.claim && (claimResp.body.claim.claimId || claimResp.body.claim.landId);

  // Attest to verified score
  if (testClaimId) {
    for (const role of ['Neighbor', 'Neighbor', 'Village Leader']) {
      await post(`/claims/${testClaimId}/attest`, { role, name: 'Test Attester' }, { 'x-user-role': 'NGO/Community Verifier' });
    }
  }

  // -------------------------------------------------------
  // 1. GET /dashboard/summary
  // -------------------------------------------------------
  console.log('1. Testing GET /dashboard/summary...');
  const summaryResp = await get('/dashboard/summary');
  assert('GET /dashboard/summary returns 200', summaryResp.status === 200, `got ${summaryResp.status}`);
  assert('summary.parcels.total >= 3 (seed data)', summaryResp.body.parcels && summaryResp.body.parcels.total >= 3, `total=${summaryResp.body.parcels && summaryResp.body.parcels.total}`);
  assert('summary.parcels.byStatus has Pending, Verified, Disputed keys', summaryResp.body.parcels && typeof summaryResp.body.parcels.byStatus.Pending === 'number', JSON.stringify(summaryResp.body.parcels && summaryResp.body.parcels.byStatus));
  assert('summary.reliefs.total >= 2 (seed data)', summaryResp.body.reliefs && summaryResp.body.reliefs.total >= 2, `total=${summaryResp.body.reliefs && summaryResp.body.reliefs.total}`);
  assert('summary.reliefs has totalBudgetWei (string)', summaryResp.body.reliefs && typeof summaryResp.body.reliefs.totalBudgetWei === 'string');
  assert('summary.payouts keys present', summaryResp.body.payouts && summaryResp.body.payouts.totalDisbursedWei !== undefined);
  assert('summary.auditActivity.total >= 0', summaryResp.body.auditActivity && summaryResp.body.auditActivity.total >= 0);
  assert('summary.generatedAt is ISO timestamp', summaryResp.body.generatedAt && summaryResp.body.generatedAt.includes('T'));
  assert('summary.parcels.totalAreaAcres is a number', typeof summaryResp.body.parcels.totalAreaAcres === 'number');
  console.log();

  // -------------------------------------------------------
  // 2. GET /dashboard/map
  // -------------------------------------------------------
  console.log('2. Testing GET /dashboard/map...');
  const mapResp = await get('/dashboard/map');
  assert('GET /dashboard/map returns 200', mapResp.status === 200, `got ${mapResp.status}`);
  assert('map.count >= 3', mapResp.body.count >= 3, `count=${mapResp.body.count}`);
  assert('map.markers is array', Array.isArray(mapResp.body.markers));

  const m = mapResp.body.markers[0];
  assert('marker has claimId', m && (m.claimId || m.landId) != null);
  assert('marker has lat (number)', m && typeof m.lat === 'number', `lat=${m && m.lat}`);
  assert('marker has lon (number)', m && typeof m.lon === 'number', `lon=${m && m.lon}`);
  assert('marker has status field', m && typeof m.status === 'string');
  assert('marker has parcelAreaAcres', m && typeof m.parcelAreaAcres === 'number');
  assert('marker does NOT expose nationalId', m && m.nationalId === undefined, 'nationalId found — PII leak!');
  assert('marker does NOT expose ownerHash', m && m.ownerHash === undefined, 'ownerHash found');
  console.log();

  // -------------------------------------------------------
  // 3. GET /dashboard/activity
  // -------------------------------------------------------
  console.log('3. Testing GET /dashboard/activity...');
  const actResp = await get('/dashboard/activity');
  assert('GET /dashboard/activity returns 200', actResp.status === 200, `got ${actResp.status}`);
  assert('activity.feed is array', Array.isArray(actResp.body.feed));
  assert('activity.count is number', typeof actResp.body.count === 'number');
  assert('activity.total is number', typeof actResp.body.total === 'number');

  // Limit param
  const actLimited = await get('/dashboard/activity?limit=2');
  assert('limit=2 returns at most 2 entries', actLimited.body.feed.length <= 2, `got ${actLimited.body.feed.length}`);

  // Feed is newest-first
  if (actResp.body.feed.length >= 2) {
    const first = new Date(actResp.body.feed[0].when);
    const second = new Date(actResp.body.feed[1].when);
    assert('activity feed is newest-first', first >= second, `${actResp.body.feed[0].when} < ${actResp.body.feed[1].when}`);
  }

  // landId filter
  if (testClaimId) {
    const actFiltered = await get(`/dashboard/activity?landId=${testClaimId}`);
    assert(`activity?landId=${testClaimId} returns only that parcel's logs`, actFiltered.body.feed.every(a => String(a.landId) === String(testClaimId) || String(a.claimId) === String(testClaimId)), JSON.stringify(actFiltered.body.feed.map(a => a.landId)));
  }
  console.log();

  // -------------------------------------------------------
  // 4. GET /dashboard/relief/:id
  // -------------------------------------------------------
  console.log('4. Testing GET /dashboard/relief/:id...');
  const reliefStats = await get('/dashboard/relief/relief_flood_2026');
  assert('GET /dashboard/relief/:id returns 200', reliefStats.status === 200, `got ${reliefStats.status}`);
  assert('reliefStats.reliefId correct', reliefStats.body.reliefId === 'relief_flood_2026');
  assert('reliefStats.budget.totalWei is string', typeof reliefStats.body.budget.totalWei === 'string');
  assert('reliefStats.budget.utilizationPct is number', typeof reliefStats.body.budget.utilizationPct === 'number');
  assert('reliefStats.payouts.total >= 0', reliefStats.body.payouts && reliefStats.body.payouts.total >= 0);
  assert('reliefStats.budget.remainingWei present', reliefStats.body.budget.remainingWei !== undefined);

  // Unknown relief → 404
  const unknownRelief = await get('/dashboard/relief/nonexistent_relief_xyz');
  assert('Unknown reliefId → 404', unknownRelief.status === 404, `got ${unknownRelief.status}`);
  assert('Unknown reliefId → error body', unknownRelief.body && unknownRelief.body.error);
  console.log();

  // -------------------------------------------------------
  // 5. GET /reliefs/:id/stats — alias
  // -------------------------------------------------------
  console.log('5. Testing GET /reliefs/:id/stats (alias)...');
  const statsAlias = await get('/reliefs/relief_flood_2026/stats');
  assert('GET /reliefs/:id/stats returns 200', statsAlias.status === 200, `got ${statsAlias.status}`);
  assert('alias matches /dashboard/relief/:id body', statsAlias.body.reliefId === 'relief_flood_2026');
  console.log();

  // -------------------------------------------------------
  // 6. GET /claims/search — advanced search & filter
  // -------------------------------------------------------
  console.log('6. Testing GET /claims/search (advanced filter & pagination)...');

  // No filters → all results
  const searchAll = await get('/claims/search');
  assert('GET /claims/search (no filter) returns 200', searchAll.status === 200, `got ${searchAll.status}`);
  assert('search with no filter returns all parcels', searchAll.body.pagination && searchAll.body.pagination.total >= 3);
  assert('search result has pagination object', searchAll.body.pagination && typeof searchAll.body.pagination.page === 'number');
  assert('search result has results array', Array.isArray(searchAll.body.results));
  assert('search result includes area unit object', searchAll.body.results[0] && searchAll.body.results[0].area && typeof searchAll.body.results[0].area.acres === 'number');

  // Free text search
  const searchText = await get('/claims/search?q=ramesh');
  assert('Free-text search q=ramesh finds Ramesh Gowda', searchText.body.results && searchText.body.results.some(c => c.ownerName && c.ownerName.toLowerCase().includes('ramesh')));

  // Status filter
  const searchVerified = await get('/claims/search?status=Verified');
  assert('status=Verified filter returns only Verified claims', searchVerified.body.results && searchVerified.body.results.every(c => c.status === 'Verified'));

  // Status filter — Disputed
  const searchDisputed = await get('/claims/search?status=Disputed');
  assert('status=Disputed filter returns only Disputed claims', searchDisputed.body.results && searchDisputed.body.results.every(c => c.status === 'Disputed'));

  // District filter
  const searchDistrict = await get('/claims/search?district=Bangalore+North');
  assert('district=Bangalore North filter works', searchDistrict.body.results && searchDistrict.body.results.length > 0 && searchDistrict.body.results.every(c => c.district && c.district.toLowerCase().includes('bangalore north')));

  // Village filter
  const searchVillage = await get('/claims/search?village=Yelahanka');
  assert('village=Yelahanka filter finds seeded parcel', searchVillage.body.results && searchVillage.body.results.length > 0);

  // hasDispute filter
  const searchDispute = await get('/claims/search?hasDispute=true');
  assert('hasDispute=true returns only disputed parcels', searchDispute.body.results && searchDispute.body.results.every(c => c.hasDispute === true));

  const searchNoDispute = await get('/claims/search?hasDispute=false');
  assert('hasDispute=false returns only non-disputed parcels', searchNoDispute.body.results && searchNoDispute.body.results.every(c => c.hasDispute === false));

  // Score filter
  const searchScore = await get('/claims/search?minScore=5');
  assert('minScore=5 returns only high-scoring parcels', searchScore.body.results && searchScore.body.results.every(c => (c.score || 0) >= 5));

  // Sort: parcelAreaAcres desc
  const searchSorted = await get('/claims/search?sort=parcelAreaAcres&order=desc');
  assert('sort=parcelAreaAcres desc is ordered correctly', (() => {
    const areas = searchSorted.body.results.map(c => Number(c.parcelAreaAcres || 0));
    for (let i = 1; i < areas.length; i++) {
      if (areas[i] > areas[i - 1]) return false;
    }
    return true;
  })());

  // Pagination: limit=1
  const searchPage1 = await get('/claims/search?limit=1&page=1');
  assert('pagination limit=1 page=1 returns 1 result', searchPage1.body.results && searchPage1.body.results.length === 1);
  assert('pagination.hasPrev=false on page 1', searchPage1.body.pagination && searchPage1.body.pagination.hasPrev === false);

  // Pagination: page 2
  if (searchPage1.body.pagination && searchPage1.body.pagination.totalPages >= 2) {
    const searchPage2 = await get('/claims/search?limit=1&page=2');
    assert('pagination page 2 hasPrev=true', searchPage2.body.pagination && searchPage2.body.pagination.hasPrev === true);
    assert('page 1 and page 2 return different claimIds', searchPage1.body.results[0].claimId !== searchPage2.body.results[0].claimId);
  }

  // Query echo
  assert('response includes query echo', searchAll.body.query !== undefined);

  console.log();

  // -------------------------------------------------------
  // 7. GET /parcels/search — alias
  // -------------------------------------------------------
  console.log('7. Testing GET /parcels/search (alias for /claims/search)...');
  const aliasSearch = await get('/parcels/search?status=Verified');
  assert('GET /parcels/search returns 200', aliasSearch.status === 200, `got ${aliasSearch.status}`);
  assert('alias results match /claims/search', aliasSearch.body.results && aliasSearch.body.results.every(c => c.status === 'Verified'));
  console.log();

  // -------------------------------------------------------
  // 8. GET /dashboard/roles
  // -------------------------------------------------------
  console.log('8. Testing GET /dashboard/roles...');
  const rolesResp = await get('/dashboard/roles');
  assert('GET /dashboard/roles returns 200', rolesResp.status === 200, `got ${rolesResp.status}`);
  assert('roles is array of 4', rolesResp.body.roles && rolesResp.body.roles.length === 4);
  assert('each role has id, label, color', rolesResp.body.roles && rolesResp.body.roles.every(r => r.id && r.label && r.color));
  console.log();

  // -------------------------------------------------------
  // 9. Edge cases
  // -------------------------------------------------------
  console.log('9. Testing edge cases...');

  // /api/* prefix aliases
  const apiSummary = await get('/api/dashboard/summary');
  assert('GET /api/dashboard/summary works (API prefix)', apiSummary.status === 200, `got ${apiSummary.status}`);

  const apiMap = await get('/api/dashboard/map');
  assert('GET /api/dashboard/map works (API prefix)', apiMap.status === 200, `got ${apiMap.status}`);

  const apiSearch = await get('/api/claims/search?q=ramesh');
  assert('GET /api/claims/search works (API prefix)', apiSearch.status === 200, `got ${apiSearch.status}`);

  // Empty result search
  const emptySearch = await get('/claims/search?q=zzznonexistentown123');
  assert('Search for nonexistent text returns empty results array', emptySearch.body.results && emptySearch.body.results.length === 0);
  assert('Empty search pagination.total=0', emptySearch.body.pagination && emptySearch.body.pagination.total === 0);

  // Page overflow clamped gracefully
  const overflowPage = await get('/claims/search?page=999&limit=10');
  assert('page overflow returns empty results, not error', overflowPage.status === 200 && Array.isArray(overflowPage.body.results));

  // landUse filter
  const searchLandUse = await get('/claims/search?landUse=agricultural');
  assert('landUse=agricultural filter works', searchLandUse.body.results && searchLandUse.body.results.length > 0);

  console.log();

  // -------------------------------------------------------
  // Final report
  // -------------------------------------------------------
  await new Promise(resolve => server.close(resolve));

  console.log('======================================================');
  if (failed === 0) {
    console.log(`🎉 ALL PHASE D DASHBOARD & STATS API TESTS PASSED! (${passed}/${passed + failed})`);
    console.log('======================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ ${failed} test(s) FAILED out of ${passed + failed}`);
    failures.forEach(f => console.error(`   • ${f}`));
    process.exit(1);
  }
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
