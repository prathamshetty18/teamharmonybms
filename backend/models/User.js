const { getCollection, isDbConnected } = require('../db');

// In-memory fallback stores for high resilience and in-memory test environments
const memUsers = new Map();
const memSalts = new Map();
const memAuditLogs = [];

const User = {
  /**
   * Look up user by sha256(nationalIdCode + PEPPER)
   * @param {string} lookupHash 
   */
  async findByLookupHash(lookupHash) {
    if (!lookupHash) return null;
    const col = getCollection('users');
    if (isDbConnected() && col) {
      try {
        const doc = await col.findOne({ lookupHash }, { projection: { _id: 0 } });
        if (doc) return doc;
      } catch (err) {
        console.warn('[User Model] MongoDB lookup failed:', err.message);
      }
    }
    return memUsers.get(lookupHash) || null;
  },

  /**
   * Look up user by name (case-insensitive)
   * @param {string} name
   */
  async findByName(name) {
    if (!name || typeof name !== 'string' || !name.trim()) return null;
    const col = getCollection('users');
    const cleanName = name.trim();
    if (isDbConnected() && col) {
      try {
        const doc = await col.findOne(
          { name: { $regex: new RegExp(`^${cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
          { projection: { _id: 0 } }
        );
        if (doc) return doc;
      } catch (err) {
        console.warn('[User Model] MongoDB findByName failed:', err.message);
      }
    }
    for (const u of memUsers.values()) {
      if (u.name && u.name.toLowerCase() === cleanName.toLowerCase()) return u;
    }
    return null;
  },

  /**
   * Look up user by userId
   * @param {string} userId 
   */
  async findByUserId(userId) {
    if (!userId) return null;
    const col = getCollection('users');
    if (isDbConnected() && col) {
      try {
        const doc = await col.findOne({ userId }, { projection: { _id: 0 } });
        if (doc) return doc;
      } catch (err) {
        console.warn('[User Model] MongoDB findByUserId failed:', err.message);
      }
    }
    for (const u of memUsers.values()) {
      if (u.userId === userId) return u;
    }
    return null;
  },

  /**
   * Create user document in users collection
   * User document schema: { userId, name, passwordHash, nationalIdHash, salt_id, lookupHash, role, createdAt }
   * Note: No password field, no inline salt
   */
  async create(userDoc) {
    const doc = {
      userId: userDoc.userId,
      name: userDoc.name,
      passwordHash: userDoc.passwordHash,
      nationalIdHash: userDoc.nationalIdHash,
      salt_id: userDoc.salt_id,
      lookupHash: userDoc.lookupHash,
      role: userDoc.role || 'citizen',
      createdAt: userDoc.createdAt || new Date()
    };

    const col = getCollection('users');
    if (isDbConnected() && col) {
      try {
        await col.insertOne({ ...doc });
      } catch (err) {
        console.warn('[User Model] MongoDB insert failed:', err.message);
      }
    }
    memUsers.set(doc.lookupHash, { ...doc });
    return doc;
  },

  /**
   * Store salt_id + salt in a separate collection owner_salts
   * (Do not inline salt into the user doc)
   */
  async saveSalt(salt_id, salt) {
    const saltDoc = {
      salt_id,
      salt,
      createdAt: new Date()
    };

    const col = getCollection('owner_salts');
    if (isDbConnected() && col) {
      try {
        await col.insertOne({ ...saltDoc });
      } catch (err) {
        console.warn('[User Model] MongoDB saveSalt failed:', err.message);
      }
    }
    memSalts.set(salt_id, saltDoc);
    return saltDoc;
  },

  /**
   * Retrieve salt by salt_id from owner_salts collection
   */
  async getSalt(salt_id) {
    if (!salt_id) return null;
    const col = getCollection('owner_salts');
    if (isDbConnected() && col) {
      try {
        const doc = await col.findOne({ salt_id }, { projection: { _id: 0 } });
        if (doc) return doc;
      } catch (err) {
        console.warn('[User Model] MongoDB getSalt failed:', err.message);
      }
    }
    return memSalts.get(salt_id) || null;
  },

  /**
   * Audit log entry for signup:
   * { action: "USER_SIGNUP", userId, role: "citizen", at }
   * Never includes name, password, passwordHash, nationalIdCode, or nationalIdHash
   */
  async recordSignupAudit(userId, role = 'citizen') {
    const auditEntry = {
      action: 'USER_SIGNUP',
      userId,
      role,
      at: new Date()
    };

    const col = getCollection('audit_logs');
    if (isDbConnected() && col) {
      try {
        await col.insertOne({ ...auditEntry });
      } catch (err) {
        console.warn('[User Model] MongoDB audit log failed:', err.message);
      }
    }
    memAuditLogs.push(auditEntry);
    return auditEntry;
  },

  // Test helpers to clear memory stores
  _clearMemory() {
    memUsers.clear();
    memSalts.clear();
    memAuditLogs.length = 0;
  }
};

module.exports = User;
