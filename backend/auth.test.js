process.env.NODE_ENV = 'test';
process.env.PORT = '5002';

const assert = require('assert');
const http = require('http');
const { app } = require('./server');
const auth = require('./auth');
const store = require('./store');

async function runAuthTests() {
  console.log('--- Starting Phase A Auth & RBAC Unit and Integration Tests ---\n');

  // =============================================================
  // 1. Role Normalization and Constants
  // =============================================================
  console.log('1. Testing Role Definitions & Normalization...');
  assert.strictEqual(auth.ROLES.FARMER, 'Farmer');
  assert.strictEqual(auth.ROLES.GROUND_VERIFICATION_OFFICER, 'Ground Verification Officer');
  assert.strictEqual(auth.ROLES.NGO_COMMUNITY_VERIFIER, 'NGO/Community Verifier');
  assert.strictEqual(auth.ROLES.GOVERNMENT_OFFICER, 'Government Officer');
  assert.strictEqual(auth.ALLOWED_ROLES.length, 4);

  // Normalization checks
  assert.strictEqual(auth.normalizeRole('farmer'), 'Farmer');
  assert.strictEqual(auth.normalizeRole('Ground Verification Officer'), 'Ground Verification Officer');
  assert.strictEqual(auth.normalizeRole('gvo'), 'Ground Verification Officer');
  assert.strictEqual(auth.normalizeRole('field assessor'), 'Ground Verification Officer');
  assert.strictEqual(auth.normalizeRole('ngo'), 'NGO/Community Verifier');
  assert.strictEqual(auth.normalizeRole('NGO/Community Verifier'), 'NGO/Community Verifier');
  assert.strictEqual(auth.normalizeRole('government officer'), 'Government Officer');
  assert.strictEqual(auth.normalizeRole('officer'), 'Government Officer');
  assert.strictEqual(auth.normalizeRole('invalid_role'), null);
  console.log('   ✓ 4 Canonical roles correctly configured and normalized');

  // =============================================================
  // 2. Cryptographic Security & JWT Verification
  // =============================================================
  console.log('2. Testing Password Hashing & JWT Token Lifecycle...');
  const testPw = 'SecurePass2026!';
  const hashed = await auth.hashPassword(testPw);
  assert(hashed.startsWith('$2'), 'Must be valid bcrypt hash');
  assert(await auth.comparePassword(testPw, hashed), 'Password must match hash');
  assert(!(await auth.comparePassword('WrongPassword', hashed)), 'Wrong password must fail');

  const mockUser = {
    id: 'user_test_99',
    role: auth.ROLES.FARMER,
    name: 'Somanna Gowda',
    contact: '+919845001122'
  };
  const token = auth.generateToken(mockUser);
  assert(typeof token === 'string' && token.split('.').length === 3, 'Valid JWT structure');

  const decoded = auth.verifyToken(token);
  assert.strictEqual(decoded.id, mockUser.id);
  assert.strictEqual(decoded.role, mockUser.role);
  assert.strictEqual(decoded.name, mockUser.name);
  console.log('   ✓ Bcrypt hashing and JWT signing/verification verified');

  // =============================================================
  // 3. HTTP Server Setup for API Integration
  // =============================================================
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(5002, resolve));
  const baseUrl = 'http://localhost:5002';

  try {
    // =============================================================
    // 4. GET /auth/roles
    // =============================================================
    console.log('3. Testing GET /auth/roles...');
    const rolesRes = await fetch(`${baseUrl}/auth/roles`);
    assert.strictEqual(rolesRes.status, 200);
    const rolesData = await rolesRes.json();
    assert.deepStrictEqual(rolesData.roles, auth.ALLOWED_ROLES);
    console.log('   ✓ GET /auth/roles returned 4 canonical roles');

    // =============================================================
    // 5. POST /auth/register for All 4 Roles
    // =============================================================
    console.log('4. Testing User Registration for 4 Roles...');

    // 5.1 Farmer Registration
    const regFarmerRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Devappa Naik',
        contact: '+919448001122',
        password: 'password123',
        role: 'Farmer',
        profile: {
          village: 'Mandya',
          district: 'Mandya',
          holdingAcres: 3.2
        }
      })
    });
    assert.strictEqual(regFarmerRes.status, 201);
    const farmerData = await regFarmerRes.json();
    assert(farmerData.token, 'Should return JWT token');
    assert.strictEqual(farmerData.user.role, 'Farmer');
    assert.strictEqual(farmerData.user.name, 'Devappa Naik');
    assert(!farmerData.user.password, 'Password must never leak');
    const farmerToken = farmerData.token;

    // 5.2 Ground Verification Officer Registration
    const regGvoRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sunil Verma',
        contact: '+919448003344',
        password: 'password123',
        role: 'Ground Verification Officer',
        profile: {
          officerBadge: 'GVO-BLR-882',
          circle: 'South Taluk'
        }
      })
    });
    assert.strictEqual(regGvoRes.status, 201);
    const gvoData = await regGvoRes.json();
    assert.strictEqual(gvoData.user.role, 'Ground Verification Officer');
    const gvoToken = gvoData.token;

    // 5.3 NGO/Community Verifier Registration
    const regNgoRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Anita Roy',
        contact: '+919448005566',
        password: 'password123',
        role: 'NGO/Community Verifier',
        profile: {
          ngoName: 'Community Land Trust Alliance',
          ngoRegistration: 'NGO-2020-0041'
        }
      })
    });
    assert.strictEqual(regNgoRes.status, 201);
    const ngoData = await regNgoRes.json();
    assert.strictEqual(ngoData.user.role, 'NGO/Community Verifier');
    const ngoToken = ngoData.token;

    // 5.4 Government Officer Registration
    const regGovRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Deputy Commissioner Mehra',
        contact: '+919448007788',
        password: 'password123',
        role: 'Government Officer',
        profile: {
          designation: 'Assistant Commissioner Revenue',
          officeId: 'GOV-KA-REV-10'
        }
      })
    });
    assert.strictEqual(regGovRes.status, 201);
    const govData = await regGovRes.json();
    assert.strictEqual(govData.user.role, 'Government Officer');
    const govToken = govData.token;

    // 5.5 Duplicate Contact Error Check
    const dupRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Duplicate Contact',
        contact: '+919448001122',
        password: 'password123',
        role: 'Farmer'
      })
    });
    assert.strictEqual(dupRes.status, 400);
    const dupErr = await dupRes.json();
    assert(dupErr.error.includes('already exists'));

    // 5.6 Invalid Role Rejection
    const invRoleRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Bad Role User',
        contact: '+919448009999',
        password: 'password123',
        role: 'Hacker'
      })
    });
    assert.strictEqual(invRoleRes.status, 400);
    console.log('   ✓ Registration flow verified across all 4 roles + validation errors');

    // =============================================================
    // 6. POST /auth/login Authentication
    // =============================================================
    console.log('5. Testing User Login...');
    const loginOkRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: '+919448001122',
        password: 'password123'
      })
    });
    assert.strictEqual(loginOkRes.status, 200);
    const loginOkData = await loginOkRes.json();
    assert(loginOkData.token);
    assert.strictEqual(loginOkData.user.role, 'Farmer');

    // Bad password
    const badPwRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: '+919448001122',
        password: 'wrong_password'
      })
    });
    assert.strictEqual(badPwRes.status, 401);

    // Unregistered contact
    const badContactRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: '+910000000000',
        password: 'password123'
      })
    });
    assert.strictEqual(badContactRes.status, 401);
    console.log('   ✓ Login endpoint authenticated valid users and rejected bad credentials');

    // =============================================================
    // 7. Mock OTP Auth Stub (Send & Verify)
    // =============================================================
    console.log('6. Testing Mock OTP Dispatch & Verification Stub...');
    const otpSendRes = await fetch(`${baseUrl}/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: '+919886001234' })
    });
    assert.strictEqual(otpSendRes.status, 200);
    const otpSendData = await otpSendRes.json();
    assert.strictEqual(otpSendData.otp, '123456');

    // Verify OTP and auto-login
    const otpVerifyRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: '+919886001234',
        otp: '123456',
        name: 'OTP Demo Farmer',
        role: 'Farmer'
      })
    });
    assert.strictEqual(otpVerifyRes.status, 200);
    const otpVerifyData = await otpVerifyRes.json();
    assert(otpVerifyData.token);
    assert.strictEqual(otpVerifyData.user.contact, '+919886001234');
    assert.strictEqual(otpVerifyData.user.role, 'Farmer');

    // Bad OTP check
    const badOtpRes = await fetch(`${baseUrl}/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: '+919886001234',
        otp: '999999'
      })
    });
    assert.strictEqual(badOtpRes.status, 400);
    console.log('   ✓ Mock OTP flow (send/verify) works for instant demo logins');

    // =============================================================
    // 8. GET /auth/me Protected Profile Route
    // =============================================================
    console.log('7. Testing Protected GET /auth/me...');
    const meRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${farmerToken}` }
    });
    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.user.role, 'Farmer');
    assert.strictEqual(meData.user.name, 'Devappa Naik');

    // Invalid token
    const badTokenRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: 'Bearer bad.token.here' }
    });
    assert.strictEqual(badTokenRes.status, 401);

    // Missing token with strict enforcement
    const noTokenRes = await fetch(`${baseUrl}/auth/me`, {
      headers: { 'x-enforce-auth': 'true' }
    });
    assert.strictEqual(noTokenRes.status, 401);
    console.log('   ✓ GET /auth/me successfully protected by requireAuth');

    // =============================================================
    // 9. RBAC Route Level Authorization Tests
    // =============================================================
    console.log('8. Testing Route-Level Role-Based Access Control (RBAC)...');

    // 9.1 Farmer CAN create a claim (Allowed)
    const validPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [77.5700, 12.9405],
          [77.5720, 12.9405],
          [77.5720, 12.9425],
          [77.5700, 12.9425],
          [77.5700, 12.9405]
        ]
      ]
    };
    const claimRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${farmerToken}`
      },
      body: JSON.stringify({
        ownerName: 'Devappa Naik',
        nationalId: 'IND-KA-560019-9182',
        polygon: validPolygon,
        parcelAreaAcres: 3.2
      })
    });
    assert.strictEqual(claimRes.status, 201);
    const createdClaim = await claimRes.json();
    const createdClaimId = createdClaim.claimId;
    console.log(`   ✓ Farmer role allowed to submit parcel claim (claimId: ${createdClaimId})`);

    // 9.2 Farmer CANNOT approve payout (Forbidden 403)
    const farmerApproveRes = await fetch(`${baseUrl}/claims/${createdClaimId}/approve-payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${farmerToken}`
      },
      body: JSON.stringify({
        reliefId: 'relief_flood_2026',
        officer: 'Farmer pretending to be officer'
      })
    });
    assert.strictEqual(farmerApproveRes.status, 403);
    const farmerApproveErr = await farmerApproveRes.json();
    assert(farmerApproveErr.error.includes('Forbidden'));
    console.log('   ✓ Farmer correctly blocked from approving payout (403 Forbidden)');

    // 9.3 NGO/Community Verifier CANNOT assess damage (Forbidden 403)
    const ngoAssessRes = await fetch(`${baseUrl}/claims/1/assess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ngoToken}`
      },
      body: JSON.stringify({
        reliefId: 'relief_flood_2026',
        answers: { depth: 'high', structure: 'major', duration: 'long', type: 'pucca', contents: 'all' }
      })
    });
    assert.strictEqual(ngoAssessRes.status, 403);
    console.log('   ✓ NGO Verifier correctly blocked from damage assessment (403 Forbidden)');

    // 9.4 Ground Verification Officer CAN assess damage (Allowed)
    const gvoAssessRes = await fetch(`${baseUrl}/claims/1/assess`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gvoToken}`
      },
      body: JSON.stringify({
        reliefId: 'relief_flood_2026',
        answers: { depth: 'high', structure: 'major', duration: 'long', type: 'pucca', contents: 'all' }
      })
    });
    assert.strictEqual(gvoAssessRes.status, 200);
    console.log('   ✓ Ground Verification Officer permitted to record damage assessment (200 OK)');

    // 9.5 NGO/Community Verifier CAN attest claim (Allowed)
    const ngoAttestRes = await fetch(`${baseUrl}/claims/2/attest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ngoToken}`
      },
      body: JSON.stringify({
        attesterName: 'Anita Roy',
        role: 'NGO'
      })
    });
    assert.strictEqual(ngoAttestRes.status, 200);
    console.log('   ✓ NGO/Community Verifier permitted to submit attestation (200 OK)');

    // 9.6 Government Officer CAN approve payout (Allowed)
    const govApproveRes = await fetch(`${baseUrl}/claims/1/approve-payout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${govToken}`
      },
      body: JSON.stringify({
        reliefId: 'relief_flood_2026',
        officer: 'Deputy Commissioner Mehra'
      })
    });
    assert.strictEqual(govApproveRes.status, 200);
    console.log('   ✓ Government Officer permitted to execute payout approval (200 OK)');

    // 9.7 Unauthenticated request with strict enforcement fails (401)
    const unauthStrictRes = await fetch(`${baseUrl}/claims`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-enforce-auth': 'true'
      },
      body: JSON.stringify({ polygon: validPolygon })
    });
    assert.strictEqual(unauthStrictRes.status, 401);
    console.log('   ✓ Strict unauthenticated request rejected with 401 Unauthorized');

  } finally {
    await new Promise(resolve => server.close(resolve));
  }

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE A AUTH & RBAC TESTS PASSED SUCCESSFULLY! (100%)');
  console.log('======================================================\n');
}

if (require.main === module) {
  runAuthTests()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Auth & RBAC Test Failed:', err);
      process.exit(1);
    });
}

module.exports = { runAuthTests };
