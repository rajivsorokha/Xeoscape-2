// api/auth-middleware.js
// Identifies which user is making each request (from the X-User-Id
// header the frontend now sends -- see assets/js/shared/api-client.js)
// and provides a requirePermission() gate for routes that should be
// restricted to specific roles/permissions.
//
// Trust model note: this is a local, single-terminal desktop POS app,
// not a multi-tenant web service -- there's no cryptographic session
// token, just a plain header identifying who's logged in on this
// machine right now. That's enough to prevent a cashier from
// accidentally landing on (or casually clicking into) admin-only
// screens and actions, which is the actual problem being solved here.
// It is not a defense against someone deliberately forging headers on
// their own machine to bypass their own app's UI.

const SqliteStore = require('../core/sqlite-store');

function buildAuthMiddleware({ dataDir }) {
  const usersDb = new SqliteStore(dataDir, 'users');

  return async function identifyCurrentUser(req, res, next) {
    const userId = req.headers['x-user-id'];
    req.currentUser = null;
    if (userId) {
      try {
        const user = await usersDb.findById(userId);
        if (user) {
          const { passwordHash, salt, ...safeUser } = user;
          req.currentUser = safeUser;
        }
      } catch (err) {
        // Unknown/stale id (e.g. a deleted user's session still open
        // in the browser) -- treat as not logged in rather than
        // failing the request.
      }
    }
    next();
  };
}

/**
 * Middleware factory: blocks the request unless the current user is
 * an admin (full access) or has the given permission key set true
 * (see PERMISSION_KEYS in api/users.js -- 'perm_products',
 * 'perm_categories', 'perm_transactions', 'perm_users',
 * 'perm_settings'). 401 if no user is identified at all, 403 if
 * they're identified but lack the permission.
 */
function requirePermission(permissionKey) {
  return (req, res, next) => {
    const user = req.currentUser;
    if (!user) {
      return res.status(401).json({ error: 'You must be logged in to do this.' });
    }
    const allowed = user.role === 'admin' || Boolean(user.permissions && user.permissions[permissionKey]);
    if (!allowed) {
      return res.status(403).json({ error: 'You do not have permission to do this. Ask an administrator.' });
    }
    next();
  };
}

module.exports = { buildAuthMiddleware, requirePermission };
