const express = require('express');
const router = express.Router();
const store = require('../store');

/**
 * 1. GET /notifications - List notification records with filtering
 */
router.get('/', async (req, res, next) => {
  try {
    let all = await store.notifications.getAll();

    // Sort newest first
    all.sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));

    const { landId, claimId, role, userId, read, unreadOnly, limit } = req.query;

    if (landId || claimId) {
      const targetId = String(landId || claimId);
      all = all.filter(n => String(n.landId) === targetId || String(n.claimId) === targetId);
    }

    if (userId) {
      all = all.filter(n => String(n.userId) === String(userId));
    }

    if (role && role.toUpperCase() !== 'ALL') {
      const r = role.toLowerCase();
      all = all.filter(n => !n.role || n.role.toUpperCase() === 'ALL' || n.role.toLowerCase() === r);
    }

    if (read !== undefined) {
      const isRead = read === 'true';
      all = all.filter(n => Boolean(n.read) === isRead);
    }

    if (unreadOnly === 'true') {
      all = all.filter(n => !n.read);
    }

    if (limit) {
      const lim = parseInt(limit, 10);
      if (!isNaN(lim) && lim > 0) {
        all = all.slice(0, lim);
      }
    }

    res.json(all);
  } catch (err) {
    next(err);
  }
});

/**
 * 2. GET /notifications/unread-count - Get count of unread notifications
 */
router.get('/unread-count', async (req, res, next) => {
  try {
    let all = await store.notifications.getAll();
    const { landId, role, userId } = req.query;

    if (landId) {
      all = all.filter(n => String(n.landId) === String(landId) || String(n.claimId) === String(landId));
    }
    if (userId) {
      all = all.filter(n => String(n.userId) === String(userId));
    }
    if (role && role.toUpperCase() !== 'ALL') {
      const r = role.toLowerCase();
      all = all.filter(n => !n.role || n.role.toUpperCase() === 'ALL' || n.role.toLowerCase() === r);
    }

    const unreadCount = all.filter(n => !n.read).length;
    res.json({ unreadCount, totalCount: all.length });
  } catch (err) {
    next(err);
  }
});

/**
 * 3. POST /notifications/mark-all-read - Bulk mark notifications as read
 */
router.post('/mark-all-read', async (req, res, next) => {
  try {
    const { landId, role, userId } = req.body || {};
    const updatedCount = await store.notifications.markAllRead({ landId, role, userId });
    res.json({
      success: true,
      message: `Marked ${updatedCount} notification(s) as read`,
      updatedCount
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 4. GET /notifications/:id - Get single notification
 */
router.get('/:id', async (req, res, next) => {
  try {
    const notif = await store.notifications.getById(req.params.id);
    if (!notif) {
      return res.status(404).json({ error: `Notification #${req.params.id} not found` });
    }
    res.json(notif);
  } catch (err) {
    next(err);
  }
});

/**
 * 5. PATCH /notifications/:id/read - Mark notification as read
 */
router.patch('/:id/read', async (req, res, next) => {
  try {
    const updated = await store.notifications.markRead(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: `Notification #${req.params.id} not found` });
    }
    res.json({
      success: true,
      message: 'Notification marked as read',
      notification: updated
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 6. POST /notifications/:id/read - Alias for marking as read
 */
router.post('/:id/read', async (req, res, next) => {
  try {
    const updated = await store.notifications.markRead(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: `Notification #${req.params.id} not found` });
    }
    res.json({
      success: true,
      message: 'Notification marked as read',
      notification: updated
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 7. POST /notifications - Manually create a stub notification record
 */
router.post('/', async (req, res, next) => {
  try {
    const { userId, role, landId, type, title, message, prevStatus, newStatus, channel, metadata } = req.body;
    if (!title && !message) {
      return res.status(400).json({ error: 'title or message is required to create a notification' });
    }

    const created = await store.recordNotification({
      userId,
      role: role || 'ALL',
      landId,
      type: type || 'SYSTEM_ALERT',
      title: title || 'System Notification',
      message: message || title,
      prevStatus,
      newStatus,
      channel: channel || 'IN_APP',
      metadata
    });

    res.status(201).json({
      success: true,
      message: 'Notification record created',
      notification: created
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 8. DELETE /notifications/:id - Delete a notification record
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await store.notifications.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: `Notification #${req.params.id} not found` });
    }
    res.json({
      success: true,
      message: `Notification #${req.params.id} deleted`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
