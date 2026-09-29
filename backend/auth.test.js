process.env.NODE_ENV = 'test';
process.env.PORT = '5003';

const assert = require('assert');
const http = require('http');
const { app } = require('./server');
const { connectDB, getCollection } = require('./db');
const User = require('./models/User');
const authRoutes = require('./routes/auth');

async function makeRequest(port, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(dataString),
      ...headers
    };

    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: reqHeaders
    };

    const req = http.request(options, res => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(responseBody);
        } catch {
          json = responseBody;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('BhoomiSetu Citizen Auth & Zero-PII Security Test Suite');
  console.log('====================================================\n');

  // Initialize DB connection
  await connectDB();

  // Clean test artifacts
  const usersCol = getCollection('users');
  const saltsCol = getCollection('owner_salts');
  const auditCol = getCollection('audit_logs');

  const testNationalId = 'TEST-IND-KA-2026-9999';
  const testRateLimitId = 'TEST-IND-KA-2026-8888';

  if (usersCol) {
    await usersCol.deleteMany({ lookupHash: { $exists: true } });
  }
  if (saltsCol) {
    await saltsCol.deleteMany({});
  }
  User._clearMemory();
  authRoutes._resetRateLimits();

  const server = app.listen(0);
  const port = server.address().port;

  try {
    // -----------------------------------------------------------------
    // TEST 1: Signup success
    // -----------------------------------------------------------------
    console.log('TEST 1: Testing Signup Success...');
    const signupPayload = {
      name: 'Ravi Kumar',
      password: 'SecurePassword123!',
      nationalIdCode: testNationalId
    };

    const signupRes = await makeRequest(port, 'POST', '/api/auth/signup', signupPayload);
    assert.strictEqual(signupRes.status, 200, `Expected 200, got ${signupRes.status}`);
    assert(signupRes.body.jwt, 'Response must include JWT token');
    assert.strictEqual(signupRes.body.role, 'citizen', 'Role must be citizen');
    assert(signupRes.body.userId, 'Response must include userId');

    // Verify Mongo user document invariants
    let userDoc = null;
    if (usersCol) {
      userDoc = await usersCol.findOne({ userId: signupRes.body.userId });
    }
    if (!userDoc) {
      userDoc = await User.findByUserId(signupRes.body.userId);
    }

    assert(userDoc, 'User document must exist in database');
    assert(userDoc.passwordHash && userDoc.passwordHash.startsWith('$argon2'), 'passwordHash must start with $argon2');
    assert.strictEqual(userDoc.password, undefined, 'CRITICAL: user doc must NEVER have a password field');
    assert.strictEqual(userDoc.salt, undefined, 'CRITICAL: salt must NOT be inlined into user doc');
    assert(userDoc.salt_id, 'User doc must reference salt_id');

    // Check separate owner_salts collection
    const saltRecord = await User.getSalt(userDoc.salt_id);
    assert(saltRecord && saltRecord.salt, 'Salt must exist in separate owner_salts collection');

    console.log('   ✓ Status 200 returned with valid JWT');
    console.log('   ✓ User doc in Mongo with $argon2 passwordHash and NO password field');
    console.log('   ✓ Salt isolated in owner_salts collection (no inline salt)');
    console.log('   [PASS] Signup success\n');

    // -----------------------------------------------------------------
    // TEST 2: Duplicate signup
    // -----------------------------------------------------------------
    console.log('TEST 2: Testing Duplicate Signup Rejection...');
    let preCount = 0;
    if (usersCol) preCount = await usersCol.countDocuments();

    const dupRes = await makeRequest(port, 'POST', '/api/auth/signup', signupPayload);
    assert.strictEqual(dupRes.status, 409, `Expected 409, got ${dupRes.status}`);
    assert.strictEqual(dupRes.body.error, 'Account already exists. Please log in.');

    if (usersCol) {
      const postCount = await usersCol.countDocuments();
      assert.strictEqual(postCount, preCount, 'No new user doc must be created on duplicate signup');
    }
    console.log('   ✓ Status 409 returned with: "Account already exists. Please log in."');
    console.log('   ✓ Database user count unchanged');
    console.log('   [PASS] Duplicate signup blocked\n');

    // -----------------------------------------------------------------
    // TEST 3: Login wrong password
    // -----------------------------------------------------------------
    console.log('TEST 3: Testing Login with Wrong Password...');
    const wrongPwRes = await makeRequest(port, 'POST', '/api/auth/login', {
      nationalIdCode: testNationalId,
      password: 'IncorrectPassword999!'
    });
    assert.strictEqual(wrongPwRes.status, 401, `Expected 401, got ${wrongPwRes.status}`);
    assert.strictEqual(wrongPwRes.body.error, 'Invalid credentials.');
    console.log('   ✓ Status 401 returned with exact error: "Invalid credentials."');
    console.log('   [PASS] Login wrong password\n');

    // -----------------------------------------------------------------
    // TEST 4: Login unknown user
    // -----------------------------------------------------------------
    console.log('TEST 4: Testing Login with Unknown User...');
    const unknownUserRes = await makeRequest(port, 'POST', '/api/auth/login', {
      nationalIdCode: 'UNKNOWN-NONEXISTENT-CODE',
      password: 'SomePassword123!'
    });
    assert.strictEqual(unknownUserRes.status, 401, `Expected 401, got ${unknownUserRes.status}`);
    assert.strictEqual(
      unknownUserRes.body.error, 
      wrongPwRes.body.error, 
      'Error message for unknown user must match wrong password byte-for-byte (no enumeration)'
    );
    assert.strictEqual(unknownUserRes.body.error, 'Invalid credentials.');
    console.log('   ✓ Status 401 returned with identical byte-for-byte error: "Invalid credentials."');
    console.log('   ✓ Zero user enumeration vulnerability');
    console.log('   [PASS] Login unknown user\n');

    // -----------------------------------------------------------------
    // TEST 5: Rate limit
    // -----------------------------------------------------------------
    console.log('TEST 5: Testing Rate Limiting (6 failed attempts)...');
    // Ensure clean slate for rate limit ID
    authRoutes._resetRateLimits();

    for (let i = 1; i <= 5; i++) {
      const failRes = await makeRequest(port, 'POST', '/api/auth/login', {
        nationalIdCode: testRateLimitId,
        password: `WrongPwAttempt${i}`
      });
      assert.strictEqual(failRes.status, 401, `Attempt ${i} should return 401, got ${failRes.status}`);
    }

    // 6th attempt must be blocked by rate limiter with 429
    const sixthRes = await makeRequest(port, 'POST', '/api/auth/login', {
      nationalIdCode: testRateLimitId,
      password: 'WrongPwAttempt6'
    });
    assert.strictEqual(sixthRes.status, 429, `6th attempt must return 429, got ${sixthRes.status}`);
    assert.strictEqual(sixthRes.body.error, 'Too many attempts. Try again later.');
    console.log('   ✓ Attempts 1-5 returned 401');
    console.log('   ✓ 6th attempt blocked with status 429 and "Too many attempts. Try again later."');
    console.log('   [PASS] Rate limit\n');

    console.log('====================================================');
    console.log('ALL 5 TESTS PASSED SUCCESSFULLY');
    console.log('====================================================');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
