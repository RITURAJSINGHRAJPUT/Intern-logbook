const { auth } = require('../config/firebase');

/**
 * Middleware to verify Firebase session cookie.
 * Redirects to /login.html if unauthorized.
 * Used for protecting page routes.
 */
async function verifySessionCookie(req, res, next) {
    const sessionCookie = req.cookies.session || '';

    // Verify the session cookie
    try {
        const decodedClaims = await auth.verifySessionCookie(sessionCookie, true /** checkRevoked */);
        req.user = decodedClaims;
        next();
    } catch (error) {
        // Session cookie is unavailable or invalid. Force user to login.
        res.redirect('/login.html');
    }
}

/**
 * Middleware to verify Firebase session cookie for API routes.
 * Returns 401 if unauthorized instead of redirecting.
 */
async function verifySessionCookieApi(req, res, next) {
    const sessionCookie = req.cookies.session || '';

    // Verify the session cookie
    try {
        const decodedClaims = await auth.verifySessionCookie(sessionCookie, true /** checkRevoked */);
        req.user = decodedClaims;
        next();
    } catch (error) {
        // Session cookie is unavailable or invalid.
        return res.status(401).json({ error: 'Unauthorized or expired session' });
    }
}

module.exports = { verifySessionCookie, verifySessionCookieApi };
