const express = require('express');
const router = express.Router();
const { auth } = require('../config/firebase');

/**
 * POST /api/sessionLogin
 * Exchange ID token for a session cookie
 */
router.post('/sessionLogin', async (req, res) => {
    const idToken = req.body.idToken;

    // Set session expiration to 5 days.
    const expiresIn = 1000 * 60 * 60 * 24 * 5;

    try {
        const decodedToken = await auth.verifyIdToken(idToken);

        // Only allow creating a session if they recently signed in
        if (new Date().getTime() / 1000 - decodedToken.auth_time < 5 * 60) {
            // Create the session cookie
            const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn });

            // Set cookie options
            const options = {
                maxAge: expiresIn,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            };

            res.cookie('session', sessionCookie, options);
            res.json({ success: true, message: 'Session created' });
        } else {
            // A user that was not recently signed in is trying to set a session cookie.
            res.status(401).send('Recent sign in required!');
        }
    } catch (error) {
        console.error('Session login error:', error);
        res.status(401).send('UNAUTHORIZED REQUEST!');
    }
});

/**
 * POST /api/sessionLogout
 * Clear the session cookie
 */
router.post('/sessionLogout', (req, res) => {
    res.clearCookie('session');
    res.json({ success: true, message: 'Session closed' });
});

module.exports = router;
