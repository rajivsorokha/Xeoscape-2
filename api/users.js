// api/users.js
// User/staff account management with granular per-feature permissions
// (perm_products, perm_categories, perm_transactions, perm_users,
// perm_settings), matching PharmaSpot's real permission model, plus a
// role field kept for convenience/back-compat with role-based defaults.

const express = require('express');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const SqliteStore = require('../core/sqlite-store');
const { requirePermission } = require('./auth-middleware');

const PERMISSION_KEYS = ['perm_products', 'perm_categories', 'perm_transactions', 'perm_users', 'perm_settings'];

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function normalizePermissions(input = {}) {
  const perms = {};
  PERMISSION_KEYS.forEach((key) => { perms[key] = Boolean(input[key]); });
  return perms;
}

/**
 * Ensures a default admin/admin account exists. Exported standalone so
 * server.js can call it once at boot -- login is required to use the
 * app at all, so a fresh install must always have a way in.
 */
async function ensureDefaultAdmin(dataDir) {
  const db = new SqliteStore(dataDir, 'users');
  const users = await db.readAll();
  if (users.length > 0) return;
  const salt = crypto.randomBytes(16).toString('hex');
  await db.insert({
    id: randomUUID(),
    username: 'admin',
    displayName: 'Administrator',
    role: 'admin',
    permissions: normalizePermissions({
      perm_products: true, perm_categories: true, perm_transactions: true, perm_users: true, perm_settings: true
    }),
    passwordHash: hashPassword('admin', salt),
    salt,
    createdAt: new Date().toISOString()
  });
}

function buildUsersRouter({ dataDir, storeConfig }) {
  const router = express.Router();
  const db = new SqliteStore(dataDir, 'users');

  // GET /api/users/check -- bootstraps a default admin/admin account on
  // first run, matching PharmaSpot's real first-launch behavior.
  router.get('/check', async (req, res) => {
    await ensureDefaultAdmin(dataDir);
    res.json({ ok: true });
  });

  router.get('/', async (req, res) => {
    const users = (await db.readAll()).map(({ passwordHash, salt, ...safe }) => safe);
    res.json(users);
  });

  router.post('/', requirePermission('perm_users'), async (req, res) => {
    const { username, password, role = 'cashier', displayName = '', permissions } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    const existing = (await db.readAll()).find((u) => u.username === username);
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    const user = await db.insert({
      id: randomUUID(),
      username,
      displayName,
      role,
      permissions: normalizePermissions(permissions),
      passwordHash,
      salt,
      createdAt: new Date().toISOString()
    });
    const { passwordHash: _, salt: __, ...safeUser } = user;
    res.status(201).json(safeUser);
  });

  router.put('/:id', async (req, res) => {
    const isSelf = req.currentUser && req.currentUser.id === req.params.id;
    const hasUsersPermission = req.currentUser && (req.currentUser.role === 'admin' || req.currentUser.permissions?.perm_users);

    // Anyone can edit their own basic account info (display name,
    // username, password) -- that's ordinary self-service, not an
    // admin action. Editing someone ELSE's account, or changing
    // role/permissions (even your own), requires perm_users --
    // otherwise a cashier could edit "themselves" to grant admin
    // rights.
    if (!isSelf && !hasUsersPermission) {
      return res.status(403).json({ error: 'You do not have permission to do this. Ask an administrator.' });
    }

    const { displayName, role, permissions, username, password } = req.body;
    const patch = {};
    if (displayName !== undefined) patch.displayName = displayName;

    if (role !== undefined) {
      if (!hasUsersPermission) return res.status(403).json({ error: 'Only an administrator can change roles.' });
      patch.role = role;
    }
    if (permissions !== undefined) {
      if (!hasUsersPermission) return res.status(403).json({ error: 'Only an administrator can change permissions.' });
      patch.permissions = normalizePermissions(permissions);
    }

    if (username !== undefined && username !== '') {
      const existing = (await db.readAll()).find((u) => u.username === username && u.id !== req.params.id);
      if (existing) return res.status(409).json({ error: 'Username already exists' });
      patch.username = username;
    }

    if (password) {
      const salt = crypto.randomBytes(16).toString('hex');
      patch.salt = salt;
      patch.passwordHash = hashPassword(password, salt);
    }

    const updated = await db.update(req.params.id, patch);
    if (!updated) return res.status(404).json({ error: 'User not found' });
    const { passwordHash, salt, ...safeUser } = updated;
    res.json(safeUser);
  });

  router.post('/authenticate', async (req, res) => {
    const { username, password } = req.body;
    const user = (await db.readAll()).find((u) => u.username === username);
    if (!user || hashPassword(password, user.salt) !== user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const { passwordHash, salt, ...safeUser } = user;
    res.json({ ...safeUser, rolePermissions: storeConfig.getRolePermissions(user.role) });
  });

  router.delete('/:id', requirePermission('perm_users'), async (req, res) => {
    const removed = await db.remove(req.params.id);
    if (!removed) return res.status(404).json({ error: 'User not found' });
    res.status(204).send();
  });

  return router;
}

module.exports = buildUsersRouter;
module.exports.ensureDefaultAdmin = ensureDefaultAdmin;
