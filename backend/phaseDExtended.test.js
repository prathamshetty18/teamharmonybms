/**
 * Phase D Extended — Land Classification, GIS, Valuation, Disputes Tests
 *
 * Tests:
 *  1. Land Classification  — 4-tier model, role gates, finalApproved workflow guard, history
 *  2. GIS                  — boundary, nearby, overlap-check, parcels-in-zone, stats
 *  3. Valuation            — CRUD, lookup scoring, for-parcel compute, filter, PATCH
 *  4. Disputes             — file, list, status advance, evidence, hearing, resolve
 *  5. API prefix checks
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

const get = (p, h) => request('GET', p, null, h);
const post = (p, b, h) => request('POST', p, b, h);
const patch = (p, b, h) => request('PATCH', p, b, h);

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

const GOVT_OFFICER = { 'x-role': 'Government Officer', 'x-user-name': 'Test Officer' };
const FARMER       = { 'x-role': 'Farmer', 'x-user-name': 'Test Farmer' };
const GVO          = { 'x-role': 'Ground Verification Officer', 'x-user-name': 'Test GVO' };
const NGO          = { 'x-role': 'NGO/Community Verifier', 'x-user-name': 'Test NGO' };

async function run() {
  console.log('--- Phase D Extended: Land Classification, GIS, Valuation, Disputes ---\n');

  await new Promise(resolve => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      console.log(`   Test server on port ${port}\n`);
      resolve();
    });
  });

  // ── SETUP ──────────────────────────────────────────────────────
  const claimA = await post('/claims', {
    ownerName: 'GIS Test Farmer',
    polygon: { type: 'Polygon', coordinates: [[[77.56, 12.93], [77.57, 12.93], [77.57, 12.94], [77.56, 12.94], [77.56, 12.93]]] },
    parcelAreaAcres: 4.2,
    state: 'Karnataka',
    district: 'Bangalore South',
    taluk: 'Bangalore South',
    village: 'Basavanagudi'
  }, FARMER);
  const idA = claimA.body && (claimA.body.claimId || claimA.body.landId);
  assert('Seed claim A created', claimA.status === 201 && idA, `status=${claimA.status} body=${JSON.stringify(claimA.body).substring(0,120)}`);

  const claimB = await post('/claims', {
    ownerName: 'Nearby Farmer B',
    polygon: { type: 'Polygon', coordinates: [[[77.565, 12.935], [77.575, 12.935], [77.575, 12.945], [77.565, 12.945], [77.565, 12.935]]] },
    parcelAreaAcres: 2.1,
    state: 'Karnataka',
    district: 'Bangalore South',
    village: 'Basavanagudi'
  }, FARMER);
  const idB = claimB.body && (claimB.body.claimId || claimB.body.landId);
  assert('Seed claim B created (nearby A)', claimB.status === 201 && idB, `status=${claimB.status}`);

  // ── 1. LAND CLASSIFICATION ─────────────────────────────────────
  console.log('\n1. Land Classification...');

  const typesResp = await get('/land-classification/types');
  assert('GET /land-classification/types → 200', typesResp.status === 200);
  assert('landUseTypes has 13 entries', typesResp.body.landUseTypes && typesResp.body.landUseTypes.length === 13);

  const lcGet = await get(`/land-classification/${idA}`);
  assert('GET /land-classification/:id → 200', lcGet.status === 200, `got ${lcGet.status}`);
  assert('classification has 4 tiers present', lcGet.body.classification && 'farmerDeclared' in lcGet.body.classification);
  assert('farmerDeclared is string or null (seeded from claim)', lcGet.body.classification.farmerDeclared === null || typeof lcGet.body.classification.farmerDeclared === 'string');

  const farmerPatch = await patch(`/land-classification/${idA}`, { farmerDeclared: 'Agricultural' }, FARMER);
  assert('Farmer sets farmerDeclared → 200', farmerPatch.status === 200, `got ${farmerPatch.status} | ${farmerPatch.body && farmerPatch.body.error}`);
  assert('farmerDeclared = Agricultural', farmerPatch.body.classification && farmerPatch.body.classification.farmerDeclared === 'Agricultural');

  const farmerGovt = await patch(`/land-classification/${idA}`, { govtRecord: 'Commercial' }, FARMER);
  assert('Farmer sets govtRecord → 403 (forbidden)', farmerGovt.status === 403, `got ${farmerGovt.status}`);

  const gvoPatch = await patch(`/land-classification/${idA}`, { govtRecord: 'Wet Agricultural', groundVerified: 'Wet Agricultural' }, GVO);
  assert('GVO sets govtRecord+groundVerified → 200', gvoPatch.status === 200, `got ${gvoPatch.status}`);
  assert('govtRecord = Wet Agricultural', gvoPatch.body.classification.govtRecord === 'Wet Agricultural');

  const gvoFinal = await patch(`/land-classification/${idA}`, { finalApproved: 'Wet Agricultural' }, GVO);
  assert('GVO sets finalApproved → 403', gvoFinal.status === 403, `got ${gvoFinal.status}`);

  const officerFinal = await patch(`/land-classification/${idA}`, { finalApproved: 'Wet Agricultural' }, GOVT_OFFICER);
  assert('Govt Officer sets finalApproved without GOVT_REVIEW → 400', officerFinal.status === 400, `got ${officerFinal.status}`);

  // Advance workflow to GOVERNMENT_REVIEW
  await post('/verification/transition', { claimId: idA, targetStatus: 'DOCUMENT_VERIFICATION' }, GOVT_OFFICER);
  await post('/verification/transition', { claimId: idA, targetStatus: 'GROUND_VERIFICATION' }, GVO);
  await post('/verification/transition', { claimId: idA, targetStatus: 'COMMUNITY/NGO_VERIFICATION' }, NGO);
  await post('/verification/transition', { claimId: idA, targetStatus: 'LAND_CLASSIFICATION' }, GVO);
  await post('/verification/transition', { claimId: idA, targetStatus: 'GOVERNMENT_REVIEW' }, GOVT_OFFICER);

  const finalPatch = await patch(`/land-classification/${idA}`, { finalApproved: 'Wet Agricultural' }, GOVT_OFFICER);
  assert('Govt Officer sets finalApproved after GOVT_REVIEW → 200', finalPatch.status === 200, `got ${finalPatch.status} | ${finalPatch.body && finalPatch.body.error}`);
  assert('finalApproved = Wet Agricultural', finalPatch.body.classification && finalPatch.body.classification.finalApproved === 'Wet Agricultural');

  const histResp = await get(`/land-classification/${idA}/history`);
  assert('GET /land-classification/:id/history → 200', histResp.status === 200);
  assert('history.total is number', typeof histResp.body.total === 'number');

  assert('Unknown claimId → 404', (await get('/land-classification/no_such_parcel_xyz')).status === 404);
  assert('Empty patch body → 400', (await patch(`/land-classification/${idA}`, {}, FARMER)).status === 400);

  // ── 2. GIS ────────────────────────────────────────────────────
  console.log('\n2. GIS...');

  const boundResp = await get(`/gis/boundary/${idA}`);
  assert('GET /gis/boundary/:id → 200', boundResp.status === 200);
  assert('boundary.type = Feature', boundResp.body.boundary && boundResp.body.boundary.type === 'Feature');
  assert('metrics.areaAcres is number', typeof boundResp.body.metrics.areaAcres === 'number');
  assert('metrics.perimeterKm is number', typeof boundResp.body.metrics.perimeterKm === 'number');
  assert('metrics.centroid is [lon,lat]', Array.isArray(boundResp.body.metrics.centroid) && boundResp.body.metrics.centroid.length === 2);
  assert('metrics.bbox is 4-element', Array.isArray(boundResp.body.metrics.bbox) && boundResp.body.metrics.bbox.length === 4);
  assert('GIS boundary unknown ID → 404', (await get('/gis/boundary/no_such_xyz')).status === 404);

  const nearbyResp = await get(`/gis/nearby/${idA}?radius=5`);
  assert('GET /gis/nearby/:id → 200', nearbyResp.status === 200);
  assert('nearby.count is number', typeof nearbyResp.body.count === 'number');
  assert('nearby.nearby is array', Array.isArray(nearbyResp.body.nearby));
  assert('claim B in nearby (within 5km)', nearbyResp.body.nearby && nearbyResp.body.nearby.some(p => String(p.claimId) === String(idB)));
  assert('nearby sorted by distanceKm asc', (() => {
    const dists = nearbyResp.body.nearby.map(n => n.distanceKm);
    for (let i = 1; i < dists.length; i++) if (dists[i] < dists[i - 1]) return false;
    return true;
  })());
  assert('radius=0.001 returns 0 results', (await get(`/gis/nearby/${idA}?radius=0.001`)).body.count === 0);

  const overlapResp = await post('/gis/overlap-check', {
    polygon: { type: 'Polygon', coordinates: [[[77.56, 12.93], [77.57, 12.93], [77.57, 12.94], [77.56, 12.94], [77.56, 12.93]]] }
  });
  assert('POST /gis/overlap-check → 200', overlapResp.status === 200);
  assert('hasConflict is boolean', typeof overlapResp.body.hasConflict === 'boolean');
  assert('conflicts is array', Array.isArray(overlapResp.body.conflicts));
  const excludedCheck = await post('/gis/overlap-check', {
    polygon: { type: 'Polygon', coordinates: [[[77.56, 12.93], [77.57, 12.93], [77.57, 12.94], [77.56, 12.94], [77.56, 12.93]]] },
    excludeClaimId: String(idA)
  });
  assert('excludeClaimId suppresses self from conflicts', excludedCheck.body.conflicts.every(c => String(c.claimId) !== String(idA)));
  assert('Null polygon → 400', (await post('/gis/overlap-check', { polygon: null })).status === 400);

  const inZoneResp = await get('/gis/parcels-in-zone/relief_flood_2026');
  assert('GET /gis/parcels-in-zone/:reliefId → 200', inZoneResp.status === 200);
  assert('inZone array present', Array.isArray(inZoneResp.body.inZone));
  assert('Unknown reliefId → 404', (await get('/gis/parcels-in-zone/no_relief_xyz')).status === 404);

  const gisStats = await get('/gis/stats');
  assert('GET /gis/stats → 200', gisStats.status === 200);
  assert('stats.totalParcels >= 3', gisStats.body.totalParcels >= 3, `got ${gisStats.body.totalParcels}`);
  assert('stats.totalCoverage.acres is number', typeof gisStats.body.totalCoverage.acres === 'number');
  assert('stats.coverageByStatus is object', typeof gisStats.body.coverageByStatus === 'object');

  // ── 3. VALUATION ──────────────────────────────────────────────
  console.log('\n3. Valuation...');

  const valCreate = await post('/valuation', {
    state: 'Karnataka', district: 'Bangalore South', taluk: 'Bangalore South', village: 'Basavanagudi',
    landType: 'Wet Agricultural', unit: 'acre',
    govtReferenceRate: '2500000', estimatedMarketRate: '4800000',
    currency: 'INR', effectiveDate: '2026-01-01',
    source: 'Karnataka Revenue Dept Circular 2026'
  }, GOVT_OFFICER);
  assert('POST /valuation → 201', valCreate.status === 201, `got ${valCreate.status} | ${valCreate.body && valCreate.body.error}`);
  assert('valuationId present', valCreate.body.valuation && valCreate.body.valuation.valuationId);
  assert('govtReferenceRatePerAcre = 2500000 (acre unit)', valCreate.body.valuation.govtReferenceRatePerAcre === 2500000);
  assert('estimatedMarketRatePerAcre = 4800000', valCreate.body.valuation.estimatedMarketRatePerAcre === 4800000);
  const valId = valCreate.body.valuation.valuationId;

  await post('/valuation', {
    state: 'Karnataka', district: 'Bangalore North',
    landType: 'Agricultural', unit: 'acre',
    govtReferenceRate: '1800000', currency: 'INR',
    effectiveDate: '2026-01-01', source: 'Sub-Registrar Bangalore North'
  }, GOVT_OFFICER);

  const valAll = await get('/valuation');
  assert('GET /valuation → 200', valAll.status === 200);
  assert('valuations.count >= 2', valAll.body.count >= 2, `count=${valAll.body.count}`);

  const valFiltered = await get('/valuation?landType=Wet+Agricultural');
  assert('GET /valuation?landType filter', valFiltered.body.count >= 1, `count=${valFiltered.body.count}`);

  const valSingle = await get(`/valuation/${valId}`);
  assert('GET /valuation/:id → 200', valSingle.status === 200);
  assert('govtReferenceRate correct', valSingle.body.govtReferenceRate === '2500000');

  assert('GET /valuation/unknown → 404', (await get('/valuation/val_no_such_xyz')).status === 404);

  const valLookup = await get('/valuation/lookup?state=Karnataka&district=Bangalore+South&landType=Wet+Agricultural');
  assert('GET /valuation/lookup → 200', valLookup.status === 200, `got ${valLookup.status} | ${valLookup.body && valLookup.body.error}`);
  assert('lookup.match found', valLookup.body.match && valLookup.body.match.valuationId);

  assert('Lookup missing district → 400', (await get('/valuation/lookup?state=Karnataka&landType=Agricultural')).status === 400);
  assert('Lookup no match → 404', (await get('/valuation/lookup?state=Rajasthan&district=Jaipur&landType=Plantation')).status === 404);

  const forParcel = await get(`/valuation/for-parcel/${idA}`);
  assert('GET /valuation/for-parcel/:id → 200 or 404', [200, 404].includes(forParcel.status), `got ${forParcel.status}`);
  if (forParcel.status === 200) {
    assert('computedEstimates.govtReferenceTotal is number', typeof forParcel.body.computedEstimates.govtReferenceTotal === 'number');
  }
  assert('for-parcel unknown claimId → 404', (await get('/valuation/for-parcel/no_claim_xyz')).status === 404);

  const valPatch = await patch(`/valuation/${valId}`, { estimatedMarketRate: '5100000', notes: 'Q3 2026 update' }, GOVT_OFFICER);
  assert('PATCH /valuation/:id → 200', valPatch.status === 200);
  assert('estimatedMarketRate updated', valPatch.body.valuation.estimatedMarketRate === '5100000');

  assert('POST /valuation missing fields → 400', (await post('/valuation', { state: 'Karnataka' }, GOVT_OFFICER)).status === 400);
  assert('POST /valuation bad unit → 400', (await post('/valuation', {
    state: 'KA', district: 'X', landType: 'Agricultural',
    govtReferenceRate: '100', effectiveDate: '2026-01-01', source: 's', unit: 'furlong'
  }, GOVT_OFFICER)).status === 400);

  // ── 4. DISPUTES ───────────────────────────────────────────────
  console.log('\n4. Disputes...');

  const dispCreate = await post('/disputes', {
    type: 'OWNERSHIP',
    description: 'Neighbour claims ownership of 0.5 acres via 1987 deed',
    parties: [
      { name: 'GIS Test Farmer', role: 'Claimant', claimId: String(idA) },
      { name: 'Rival Claimant', role: 'Respondent' }
    ],
    relatedClaims: [String(idA)],
    priority: 'HIGH',
    evidence: [{ type: 'document', description: 'Old Title Deed 1987', hash: '0xabc123' }]
  }, FARMER);
  assert('POST /disputes → 201', dispCreate.status === 201, `got ${dispCreate.status}`);
  assert('disputeId present', dispCreate.body.dispute && dispCreate.body.dispute.disputeId);
  assert('status = FILED', dispCreate.body.dispute.status === 'FILED');
  assert('priority = HIGH', dispCreate.body.dispute.priority === 'HIGH');
  assert('evidence has 1 entry', dispCreate.body.dispute.evidence.length === 1);
  const dispId = dispCreate.body.dispute.disputeId;

  const dispCreate2 = await post('/disputes', {
    type: 'BOUNDARY',
    description: 'Fence encroachment 2m into boundary',
    parties: [{ name: 'B', role: 'Claimant' }, { name: 'A', role: 'Respondent' }],
    relatedClaims: [String(idA), String(idB)],
    priority: 'URGENT'
  }, GVO);
  assert('Second dispute (BOUNDARY URGENT) → 201', dispCreate2.status === 201);
  const dispId2 = dispCreate2.body.dispute.disputeId;

  const dispAll = await get('/disputes');
  assert('GET /disputes → 200', dispAll.status === 200);
  assert('disputes.count >= 2', dispAll.body.count >= 2, `count=${dispAll.body.count}`);

  assert('Filter type=BOUNDARY correct', (await get('/disputes?type=BOUNDARY')).body.disputes.every(d => d.type === 'BOUNDARY'));
  assert('Filter status=FILED correct', (await get('/disputes?status=FILED')).body.disputes.every(d => d.status === 'FILED'));
  assert(`Filter claimId=${idA} correct`, (await get(`/disputes?claimId=${idA}`)).body.disputes.every(d => d.relatedClaims.includes(String(idA))));

  const dispSingle = await get(`/disputes/${dispId}`);
  assert('GET /disputes/:id → 200', dispSingle.status === 200);
  assert('type = OWNERSHIP', dispSingle.body.type === 'OWNERSHIP');
  assert('GET /disputes/unknown → 404', (await get('/disputes/dispute_no_such_xyz')).status === 404);

  const dispForParcel = await get(`/disputes/for-parcel/${idA}`);
  assert('GET /disputes/for-parcel/:id → 200', dispForParcel.status === 200);
  assert('totalDisputes >= 2', dispForParcel.body.totalDisputes >= 2, `total=${dispForParcel.body.totalDisputes}`);

  const advStatus = await patch(`/disputes/${dispId}/status`, { status: 'UNDER_REVIEW', notes: 'Case assigned' }, GOVT_OFFICER);
  assert('Advance status → UNDER_REVIEW (200)', advStatus.status === 200, `got ${advStatus.status}`);
  assert('status is UNDER_REVIEW', advStatus.body.dispute.status === 'UNDER_REVIEW');
  assert('statusHistory has 2 entries', advStatus.body.dispute.statusHistory.length === 2);

  const regressStatus = await patch(`/disputes/${dispId}/status`, { status: 'FILED' }, GOVT_OFFICER);
  assert('Status regression → 400', regressStatus.status === 400, `got ${regressStatus.status}`);

  const medStatus = await patch(`/disputes/${dispId}/status`, { status: 'MEDIATION' }, GOVT_OFFICER);
  assert('Advance → MEDIATION (200)', medStatus.status === 200);

  const badResolveViaStatus = await patch(`/disputes/${dispId}/status`, { status: 'RESOLVED' }, GOVT_OFFICER);
  assert('Cannot RESOLVE via /status endpoint → 400', badResolveViaStatus.status === 400);

  const addEv = await post(`/disputes/${dispId}/evidence`, { type: 'photo', description: 'GPS boundary photo', hash: '0xdead1234' }, GVO);
  assert('POST /disputes/:id/evidence → 201', addEv.status === 201);
  assert('evidence array has 2 items', addEv.body.dispute.evidence.length === 2);
  assert('Evidence missing description → 400', (await post(`/disputes/${dispId}/evidence`, { type: 'photo' }, GVO)).status === 400);

  const addHearing = await post(`/disputes/${dispId}/hearing`, {
    date: '2026-10-15', venue: 'Taluk Office Bangalore South',
    notes: 'Both parties presented docs', attendees: ['Farmer', 'Rival', 'Inspector']
  }, GOVT_OFFICER);
  assert('POST /disputes/:id/hearing → 201', addHearing.status === 201);
  assert('hearings has 1 entry', addHearing.body.dispute.hearings.length === 1);
  assert('Hearing missing date → 400', (await post(`/disputes/${dispId}/hearing`, { venue: 'Office' }, GOVT_OFFICER)).status === 400);

  const resolveResp = await post(`/disputes/${dispId}/resolve`, {
    outcome: 'RESOLVED', notes: 'Boundary confirmed for claimant', orderId: 'ORD-2026-9912'
  }, GOVT_OFFICER);
  assert('POST /disputes/:id/resolve → 200', resolveResp.status === 200, `got ${resolveResp.status}`);
  assert('status = RESOLVED', resolveResp.body.dispute.status === 'RESOLVED');
  assert('resolution.orderId present', resolveResp.body.dispute.resolution.orderId === 'ORD-2026-9912');

  assert('Re-resolve RESOLVED dispute → 400', (await post(`/disputes/${dispId}/resolve`, { outcome: 'RESOLVED' }, GOVT_OFFICER)).status === 400);
  assert('Add evidence to RESOLVED → 400', (await post(`/disputes/${dispId}/evidence`, { description: 'Late' }, GVO)).status === 400);
  assert('Invalid dispute type → 400', (await post('/disputes', { type: 'ALIENS', description: 'd', parties: [{}, {}] }, FARMER)).status === 400);
  assert('Only 1 party → 400', (await post('/disputes', { type: 'BOUNDARY', description: 'd', parties: [{ name: 'A' }] }, FARMER)).status === 400);
  assert('Unknown relatedClaim → 400', (await post('/disputes', {
    type: 'OWNERSHIP', description: 'd',
    parties: [{ name: 'A' }, { name: 'B' }], relatedClaims: ['no_claim_99999']
  }, FARMER)).status === 400);

  const dismissResp = await post(`/disputes/${dispId2}/resolve`, { outcome: 'DISMISSED', notes: 'Parties reconciled' }, GOVT_OFFICER);
  assert('Dismiss BOUNDARY dispute → 200', dismissResp.status === 200);
  assert('status = DISMISSED', dismissResp.body.dispute.status === 'DISMISSED');

  // ── 5. API PREFIX ─────────────────────────────────────────────
  console.log('\n5. API prefix checks...');
  assert('GET /api/land-classification/:id → 200', (await get(`/api/land-classification/${idA}`)).status === 200);
  assert('GET /api/gis/stats → 200', (await get('/api/gis/stats')).status === 200);
  assert('GET /api/valuation → 200', (await get('/api/valuation')).status === 200);
  assert('GET /api/disputes → 200', (await get('/api/disputes')).status === 200);

  // ── REPORT ────────────────────────────────────────────────────
  await new Promise(resolve => server.close(resolve));

  console.log('\n======================================================');
  if (failed === 0) {
    console.log(`🎉 ALL PHASE D EXTENDED TESTS PASSED! (${passed}/${passed + failed})`);
    console.log('======================================================\n');
    process.exit(0);
  } else {
    console.error(`❌ ${failed} FAILED out of ${passed + failed}`);
    failures.forEach(f => console.error(`   • ${f}`));
    process.exit(1);
  }
  console.log('======================================================\n');
}

run().catch(err => {
  console.error('[Fatal]', err.message || err);
  process.exit(1);
});
