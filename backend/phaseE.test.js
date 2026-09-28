process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const { app } = require('./server');
const store = require('./store');
const {
  PROFILES,
  SCHEMES,
  SUPPORTED_STATES,
  damageLevel,
  resolveProfile,
  getProfile,
  listProfiles,
  computeAmount
} = require('./eligibility');

console.log('--- Phase E: Relief/Disaster Expansion Unit & Integration Tests ---\n');

let server;
let baseUrl;

function req(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const clientReq = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch {
          parsed = data;
        }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });

    clientReq.on('error', reject);

    if (body) {
      clientReq.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    clientReq.end();
  });
}

// Role headers for testing RBAC
const GOVT_OFFICER = { 'x-role': 'Government Officer', 'x-user-name': 'Officer Kulkarni' };
const FARMER       = { 'x-role': 'Farmer', 'x-user-name': 'Ramesh Gowda' };
const GVO          = { 'x-role': 'Ground Verification Officer', 'x-user-name': 'Rajesh Kumar' };
const NGO          = { 'x-role': 'NGO/Community Verifier', 'x-user-name': 'Suresh Patil' };

function assertEqual(name, actual, expected) {
  assert.strictEqual(actual, expected, `[FAIL] ${name}: expected '${expected}', got '${actual}'`);
  console.log(`   ✓ ${name}`);
}

function assertTrue(name, condition, msg = '') {
  assert.ok(condition, `[FAIL] ${name}: ${msg}`);
  console.log(`   ✓ ${name}`);
}

async function runPhaseETests() {
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`   Test server running on port ${port}\n`);

  try {
    // =========================================================
    // 1. PROFILES Configuration & Calculator Extension
    // =========================================================
    console.log('1. Testing Relief Calc Config & Extended PROFILES...');

    // 1.1 PROFILES structure
    assertTrue('PROFILES has standard flood and earthquake', PROFILES.flood && PROFILES.earthquake);
    assertTrue('PROFILES has cyclone, drought, landslide', PROFILES.cyclone && PROFILES.drought && PROFILES.landslide);
    assertTrue('PROFILES keyed by state: karnataka', Boolean(PROFILES.karnataka && PROFILES.karnataka.sdrf));
    assertTrue('PROFILES keyed by state: kerala', Boolean(PROFILES.kerala && PROFILES.kerala.sdrf));
    assertTrue('PROFILES keyed by state: odisha', Boolean(PROFILES.odisha && PROFILES.odisha.sdrf));
    assertTrue('PROFILES keyed by composite key: karnataka:sdrf:flood', Boolean(PROFILES['karnataka:sdrf:flood']));
    assertTrue('SCHEMES includes SDRF, NDRF, PMFBY, CMRF', SCHEMES.includes('SDRF') && SCHEMES.includes('PMFBY'));

    // 1.2 resolveProfile and getProfile
    const kaFloodProfile = getProfile({ state: 'Karnataka', scheme: 'SDRF', disasterType: 'flood' });
    assertTrue('getProfile resolves Karnataka SDRF flood', kaFloodProfile && kaFloodProfile.ratesByLandType);
    assertEqual('Karnataka SDRF agricultural rate is 1.5 MST', kaFloodProfile.ratesByLandType.Agricultural, '1500000000000000000');

    const defaultProfile = resolveProfile('flood');
    assertTrue('resolveProfile fallback to default flood', defaultProfile && defaultProfile.disasterType === 'flood');

    // 1.3 damageLevel with extended profiles
    // Cyclone: wind severe(2) + surge major(3) + roof partial(2) + crop_loss complete(2) = 9 -> level 4
    const cycloneAnswers = { wind: 'severe', surge: 'major', roof: 'partial_loss', crop_loss: 'complete' };
    const cycloneLvl = damageLevel('cyclone', cycloneAnswers);
    assertEqual('Cyclone assessment computed level 4', cycloneLvl, 4);

    // Drought: rainfall_deficit severe(2) + dry_spell prolonged(2) + crop_wilted partial(2) + groundwater depleted(1) = 7 -> level 3
    const droughtAnswers = { rainfall_deficit: 'severe', dry_spell_weeks: 'prolonged', crop_wilted: 'partial', groundwater: 'depleted' };
    const droughtLvl = damageLevel('drought', droughtAnswers);
    assertEqual('Drought assessment computed level 3', droughtLvl, 3);

    // State/Scheme options support in damageLevel
    const floodAnswers = { depth: 'medium', structure: 'partial', type: 'kutcha', duration: 'medium', contents: 'some' };
    const floodLvlWithOptions = damageLevel('flood', floodAnswers, { state: 'Karnataka', scheme: 'SDRF' });
    assertEqual('damageLevel with state/scheme option returns level 3', floodLvlWithOptions, 3);

    // 1.4 GET /relief/profiles endpoints
    const profilesRes = await req('GET', '/relief/profiles');
    assertEqual('GET /relief/profiles returns 200', profilesRes.status, 200);
    assertTrue('GET /relief/profiles returns disasterTypes', Array.isArray(profilesRes.body.disasterTypes));
    assertTrue('GET /relief/profiles returns schemes', profilesRes.body.schemes.includes('SDRF'));
    assertTrue('GET /relief/profiles returns states', profilesRes.body.states.includes('Karnataka'));

    const floodProfRes = await req('GET', '/relief/profiles/flood?state=Karnataka&scheme=SDRF');
    assertEqual('GET /relief/profiles/flood returns 200', floodProfRes.status, 200);
    assertEqual('GET /relief/profiles/flood returns correct disasterType', floodProfRes.body.disasterType, 'flood');
    assertTrue('Profile includes ratesByLandType', Boolean(floodProfRes.body.profile.ratesByLandType));

    // =========================================================
    // 2. Disaster Events Collection (/disasters)
    // =========================================================
    console.log('\n2. Testing Disaster Events Collection (/disasters)...');

    // 2.1 Metadata endpoint
    const typesRes = await req('GET', '/disasters/types');
    assertEqual('GET /disasters/types returns 200', typesRes.status, 200);
    assertTrue('Includes severities', typesRes.body.severities.includes('SEVERE'));

    // 2.2 RBAC: Farmer cannot create disaster event
    const farmerCreate = await req('POST', '/disasters', {
      type: 'flood',
      severity: 'HIGH'
    }, FARMER);
    assertEqual('Farmer cannot POST /disasters (403)', farmerCreate.status, 403);

    // 2.3 Validation errors
    const missingType = await req('POST', '/disasters', { severity: 'HIGH' }, GOVT_OFFICER);
    assertEqual('Missing type returns 400', missingType.status, 400);

    const missingSeverity = await req('POST', '/disasters', { type: 'flood' }, GOVT_OFFICER);
    assertEqual('Missing severity returns 400', missingSeverity.status, 400);

    // 2.4 Create new Disaster Event
    const newDisasterPayload = {
      id: 'disaster_cyclone_odisha_2026',
      name: 'Cyclone Sagar Super Storm 2026',
      type: 'cyclone',
      date: '2026-09-10T04:00:00.000Z',
      state: 'Odisha',
      district: 'Puri',
      taluk: 'Puri Sadar',
      affectedVillages: ['Krushnaprasad', 'Brahmagiri', 'Satyabadi'],
      severity: 'CATASTROPHIC',
      description: 'Severe cyclonic storm making landfall along Odisha coastal belt',
      applicableSchemes: ['NDRF', 'SDRF'],
      gisArea: {
        type: 'Polygon',
        coordinates: [
          [
            [85.7000, 19.7000],
            [85.9500, 19.7000],
            [85.9500, 19.9000],
            [85.7000, 19.9000],
            [85.7000, 19.7000]
          ]
        ]
      }
    };

    const createRes = await req('POST', '/disasters', newDisasterPayload, GOVT_OFFICER);
    assertEqual('POST /disasters returns 201', createRes.status, 201);
    assertTrue('Created disaster has id', Boolean(createRes.body.disaster && createRes.body.disaster.id));
    assertEqual('Disaster severity is CATASTROPHIC', createRes.body.disaster.severity, 'CATASTROPHIC');
    assertTrue('GIS area acres computed', createRes.body.disaster.gisAreaAcres > 0);
    assertTrue('GIS area sq km computed', createRes.body.disaster.gisAreaSqKm > 0);
    assertTrue('Affected villages stored as array', Array.isArray(createRes.body.disaster.affectedVillages));

    // 2.5 GET /disasters list & filtering
    const listRes = await req('GET', '/disasters');
    assertEqual('GET /disasters returns 200', listRes.status, 200);
    assertTrue('List contains disasters array', Array.isArray(listRes.body.disasters));
    assertTrue('Total disasters >= 3', listRes.body.total >= 3);

    const filterTypeRes = await req('GET', '/disasters?type=cyclone');
    assertEqual('Filter by type=cyclone returns 200', filterTypeRes.status, 200);
    assertTrue('Filtered count >= 1', filterTypeRes.body.count >= 1);
    assertEqual('Filtered disaster type is cyclone', filterTypeRes.body.disasters[0].type, 'cyclone');

    const filterSevRes = await req('GET', '/disasters?severity=CATASTROPHIC');
    assertEqual('Filter by severity=CATASTROPHIC returns 200', filterSevRes.status, 200);
    assertTrue('Found catastrophic disaster', filterSevRes.body.disasters.some(d => d.id === 'disaster_cyclone_odisha_2026'));

    const searchRes = await req('GET', '/disasters?q=Bangalore');
    assertEqual('Search q=Bangalore returns 200', searchRes.status, 200);
    assertTrue('Found Bangalore disaster', searchRes.body.disasters.length >= 1);

    // 2.6 GET /disasters/:id
    const singleRes = await req('GET', `/disasters/${newDisasterPayload.id}`);
    assertEqual('GET /disasters/:id returns 200', singleRes.status, 200);
    assertEqual('Single disaster matches ID', singleRes.body.id, newDisasterPayload.id);

    const notFoundDisaster = await req('GET', '/disasters/non_existent_disaster_999');
    assertEqual('Non-existent disaster returns 404', notFoundDisaster.status, 404);

    // 2.7 PATCH /disasters/:id
    const patchRes = await req('PATCH', `/disasters/${newDisasterPayload.id}`, {
      status: 'CONTAINED',
      severity: 'SEVERE'
    }, GOVT_OFFICER);
    assertEqual('PATCH /disasters/:id returns 200', patchRes.status, 200);
    assertEqual('Status updated to CONTAINED', patchRes.body.disaster.status, 'CONTAINED');
    assertEqual('Severity updated to SEVERE', patchRes.body.disaster.severity, 'SEVERE');

    // 2.8 GET /disasters/:id/affected-parcels
    const affectedRes = await req('GET', '/disasters/disaster_flood_blr_2026/affected-parcels');
    assertEqual('GET /disasters/:id/affected-parcels returns 200', affectedRes.status, 200);
    assertTrue('affectedParcels array present', Array.isArray(affectedRes.body.affectedParcels));

    // =========================================================
    // 3. Disaster Assessments (/disaster-assessments)
    // =========================================================
    console.log('\n3. Testing Disaster Assessments (/disaster-assessments)...');

    // 3.1 Role restriction: Farmer cannot submit assessment
    const farmerAssess = await req('POST', '/disaster-assessments', {
      claimId: '1',
      disasterId: 'disaster_flood_blr_2026'
    }, FARMER);
    assertEqual('Farmer cannot POST /disaster-assessments (403)', farmerAssess.status, 403);

    // 3.2 Validation
    const missingClaimAssess = await req('POST', '/disaster-assessments', {
      disasterId: 'disaster_flood_blr_2026'
    }, GVO);
    assertEqual('Missing claimId returns 400', missingClaimAssess.status, 400);

    const nonExistentClaimAssess = await req('POST', '/disaster-assessments', {
      claimId: 'non_existent_parcel_888',
      answers: floodAnswers
    }, GVO);
    assertEqual('Non-existent claimId returns 404', nonExistentClaimAssess.status, 404);

    // 3.3 Create assessment linked to damageLevel() output
    const assessmentPayload = {
      claimId: '1',
      disasterId: 'disaster_flood_blr_2026',
      reliefId: 'relief_flood_2026',
      answers: {
        depth: 'high',
        structure: 'major',
        duration: 'long',
        type: 'pucca',
        contents: 'all'
      },
      confirmedAreaAcres: 2.5,
      damageNotes: 'Severe inundation across main parcel acreage, topsoil eroded',
      officer: 'Officer Rajesh GVO',
      officerName: 'Rajesh Kumar',
      officerRole: 'Ground Verification Officer',
      timestamp: '2026-09-28T16:00:00.000Z'
    };

    const assessRes = await req('POST', '/disaster-assessments', assessmentPayload, GVO);
    assertEqual('POST /disaster-assessments returns 201', assessRes.status, 201);
    assertTrue('Assessment has assessmentId', Boolean(assessRes.body.assessment && assessRes.body.assessment.assessmentId));
    assertEqual('Linked damageLevel is 4', assessRes.body.assessment.damageLevel, 4);
    assertEqual('Damage percent is 100', assessRes.body.assessment.damagePercent, 100);
    assertEqual('Officer stored in assessment', assessRes.body.assessment.officer, 'Officer Rajesh GVO');
    assertEqual('Timestamp stored in assessment', assessRes.body.assessment.timestamp, '2026-09-28T16:00:00.000Z');
    assertTrue('Calculated amount is wei string > 0', BigInt(assessRes.body.assessment.calculatedAmount) > 0n);

    const createdAssessmentId = assessRes.body.assessment.id;

    // 3.4 GET /disaster-assessments list
    const assessList = await req('GET', '/disaster-assessments');
    assertEqual('GET /disaster-assessments returns 200', assessList.status, 200);
    assertTrue('Assessments total >= 3', assessList.body.total >= 3);

    // 3.5 GET /disaster-assessments/for-claim/:claimId
    const claimAssessments = await req('GET', '/disaster-assessments/for-claim/1');
    assertEqual('GET /disaster-assessments/for-claim/1 returns 200', claimAssessments.status, 200);
    assertTrue('Assessments found for claim 1', claimAssessments.body.count >= 1);

    // 3.6 GET /disaster-assessments/:id
    const singleAssess = await req('GET', `/disaster-assessments/${createdAssessmentId}`);
    assertEqual('GET /disaster-assessments/:id returns 200', singleAssess.status, 200);
    assertEqual('Assessment damageLevel is 4', singleAssess.body.damageLevel, 4);

    // 3.7 PATCH /disaster-assessments/:id
    const patchAssess = await req('PATCH', `/disaster-assessments/${createdAssessmentId}`, {
      remarks: 'Verified by Taluk Tahsildar inspection team',
      status: 'VERIFIED'
    }, GOVT_OFFICER);
    assertEqual('PATCH /disaster-assessments/:id returns 200', patchAssess.status, 200);
    assertEqual('Status updated to VERIFIED', patchAssess.body.assessment.status, 'VERIFIED');

    // =========================================================
    // 4. Extended Relief Flow: Separate Calculated & Sanctioned Amounts
    // =========================================================
    console.log('\n4. Testing Separate Calculated/Estimated Amount & Officially Sanctioned Amount...');

    // 4.1 Check payout initial state for claim 1: has calculatedAmount
    const payout1 = await req('GET', '/claims/1/payout');
    assertEqual('GET /claims/1/payout returns 200', payout1.status, 200);
    assertTrue('Payout has calculatedAmount', Boolean(payout1.body.calculatedAmount));
    assertTrue('Payout has estimatedAmount', Boolean(payout1.body.estimatedAmount));
    console.log(`   ✓ Initial calculatedAmount: ${payout1.body.calculatedAmount} wei`);

    // 4.2 Check claim 2 payout initial state: calculated amount present, officiallySanctionedAmount is null
    const payout2Initial = await req('GET', '/claims/2/payout');
    assertEqual('GET /claims/2/payout returns 200', payout2Initial.status, 200);
    assertEqual('Claim 2 officiallySanctionedAmount is initially null', payout2Initial.body.officiallySanctionedAmount, null);
    assertTrue('Claim 2 has calculatedAmount', Boolean(payout2Initial.body.calculatedAmount));

    // 4.3 Government Officer officially sanctions amount for claim 2
    // Calculated: 900000000000000000 (0.9 MST); Officer sanctions: 800000000000000000 (0.8 MST)
    const sanctionPayload = {
      officiallySanctionedAmount: '800000000000000000',
      officer: 'Tahsildar Kulkarni',
      notes: 'Approved under SDRF statutory norms after physical inspection review'
    };

    // RBAC: Farmer cannot sanction
    const farmerSanction = await req('POST', '/claims/2/sanction', sanctionPayload, FARMER);
    assertEqual('Farmer cannot sanction amount (403)', farmerSanction.status, 403);

    // GVO cannot sanction (only Government Officer)
    const gvoSanction = await req('POST', '/claims/2/sanction', sanctionPayload, GVO);
    assertEqual('GVO cannot sanction amount (403)', gvoSanction.status, 403);

    // Government Officer sanctions
    const govtSanction = await req('POST', '/claims/2/sanction', sanctionPayload, GOVT_OFFICER);
    assertEqual('Govt Officer POST /claims/2/sanction returns 200', govtSanction.status, 200);
    assertEqual('Officially sanctioned amount is 800000000000000000', govtSanction.body.payout.officiallySanctionedAmount, '800000000000000000');
    assertEqual('Calculated amount remains unchanged', govtSanction.body.payout.calculatedAmount, '900000000000000000');

    // 4.4 Verify GET /claims/2/payout returns both fields separate
    const payout2After = await req('GET', '/claims/2/payout');
    assertEqual('GET /claims/2/payout returns 200', payout2After.status, 200);
    assertEqual('payout.calculatedAmount preserved', payout2After.body.calculatedAmount, '900000000000000000');
    assertEqual('payout.officiallySanctionedAmount updated', payout2After.body.officiallySanctionedAmount, '800000000000000000');
    console.log(`   ✓ Calculated Amount: ${payout2After.body.calculatedAmount} wei vs Sanctioned: ${payout2After.body.officiallySanctionedAmount} wei`);

    // 4.5 Test /relief/sanction/:claimId endpoint alias
    const reliefSanctionAlias = await req('POST', '/relief/sanction/2', {
      officiallySanctionedAmount: '850000000000000000',
      notes: 'Updated sanction with additional crop factor'
    }, GOVT_OFFICER);
    assertEqual('POST /relief/sanction/2 alias returns 200', reliefSanctionAlias.status, 200);
    assertEqual('Sanctioned amount updated via alias', reliefSanctionAlias.body.payout.officiallySanctionedAmount, '850000000000000000');

    // 4.6 Verify GET /reliefs/:id/eligible returns both calculated & sanctioned amounts
    const eligibleRes = await req('GET', '/reliefs/relief_flood_2026/eligible');
    assertEqual('GET /reliefs/:id/eligible returns 200', eligibleRes.status, 200);
    assertTrue('Eligible claims returned', Array.isArray(eligibleRes.body.claims));
    const claim1Eligible = eligibleRes.body.claims.find(c => c.claimId === '1');
    assertTrue('Claim 1 in eligible list', Boolean(claim1Eligible));
    assertTrue('Claim 1 has calculatedAmount', Boolean(claim1Eligible.calculatedAmount));
    assertTrue('Claim 1 has officiallySanctionedAmount', Boolean(claim1Eligible.officiallySanctionedAmount));

    // 4.7 Test /relief aliases (/relief, /relief/:id, /relief/:id/eligible)
    const reliefList = await req('GET', '/relief');
    assertEqual('GET /relief returns 200', reliefList.status, 200);
    assertTrue('Reliefs array returned', Array.isArray(reliefList.body));

    const singleRelief = await req('GET', '/relief/relief_flood_2026');
    assertEqual('GET /relief/:id returns 200', singleRelief.status, 200);
    assertEqual('Relief ID matches', singleRelief.body.reliefId, 'relief_flood_2026');

    const reliefEligible = await req('GET', '/relief/relief_flood_2026/eligible');
    assertEqual('GET /relief/:id/eligible returns 200', reliefEligible.status, 200);
    assertTrue('Relief eligible contains claims', Array.isArray(reliefEligible.body.claims));

    // =========================================================
    // 5. API Prefix Checks (/api/disasters, /api/disaster-assessments, /api/relief)
    // =========================================================
    console.log('\n5. Testing /api/ prefix endpoints...');

    const apiDisasters = await req('GET', '/api/disasters');
    assertEqual('GET /api/disasters returns 200', apiDisasters.status, 200);

    const apiAssess = await req('GET', '/api/disaster-assessments');
    assertEqual('GET /api/disaster-assessments returns 200', apiAssess.status, 200);

    const apiRelief = await req('GET', '/api/relief');
    assertEqual('GET /api/relief returns 200', apiRelief.status, 200);

    const apiProfiles = await req('GET', '/api/relief/profiles');
    assertEqual('GET /api/relief/profiles returns 200', apiProfiles.status, 200);

    console.log('\n======================================================');
    console.log('🎉 ALL PHASE E RELIEF/DISASTER TESTS PASSED! (100%)');
    console.log('======================================================');
    process.exit(0);
  } finally {
    if (server) {
      server.close();
    }
  }
}

runPhaseETests().catch(err => {
  console.error('\n[FATAL ERROR in Phase E tests]:', err);
  process.exit(1);
});
