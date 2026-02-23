const { db } = require('../config/firebase');

/**
 * Middleware to verify admin role.
 * Must be used AFTER verifyToken middleware.
 * Checks admins/{uid} collection in Firestore.
 */
async function verifyAdmin(req, res, next) {
    if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const adminDoc = await db.collection('admins').doc(req.user.uid).get();

        if (!adminDoc.exists) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        req.isAdmin = true;
        next();
    } catch (error) {
        console.error('Admin verification failed:', error.message);
        return res.status(500).json({ error: 'Failed to verify admin status' });
    }
}

/**
 * Middleware to verify bulk fill access.
 * Must be used AFTER verifyToken middleware.
 * Checks if user is admin OR has allowBulkFill=true in their user document.
 */
async function verifyBulkAccess(req, res, next) {
    if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        // Check admin first
        const adminDoc = await db.collection('admins').doc(req.user.uid).get();
        if (adminDoc.exists) {
            req.isAdmin = true;
            return next();
        }

        // Check user bulk fill permission
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (userDoc.exists && userDoc.data().allowBulkFill) {
            return next();
        }

        return res.status(403).json({ error: 'Bulk Fill access required' });
    } catch (error) {
        console.error('Bulk access verification failed:', error.message);
        return res.status(500).json({ error: 'Failed to verify bulk fill status' });
    }
}

module.exports = { verifyAdmin, verifyBulkAccess };
