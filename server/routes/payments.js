const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('../config/firebase');
const { verifyToken } = require('../middleware/auth');
const { sendPaymentNotificationToAdmin } = require('../services/emailService');

// Make sure upload directory exists
const UPLOADS_DIR = path.join(__dirname, '../uploads/payments');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer config for screenshots
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        // Generate a random string to avoid filename collisions
        const randomString = crypto.randomBytes(8).toString('hex');
        const ext = path.extname(file.originalname).toLowerCase() || '.png';
        cb(null, `payment-${Date.now()}-${randomString}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        // Only allow images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for screenshots'));
        }
    }
});

// All payments routes require authentication
router.use(verifyToken);

/**
 * POST /api/payments/submit
 * Submit a new payment verification request
 */
router.post('/submit', upload.single('screenshot'), async (req, res) => {
    try {
        const { transactionId } = req.body;

        if (!transactionId) {
            return res.status(400).json({ error: 'Transaction ID is required' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Payment screenshot is required' });
        }

        // Fetch user info to store with the request
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};

        // Create the payment request document
        const requestData = {
            uid: req.user.uid,
            email: req.user.email || userData.email || '',
            displayName: userData.displayName || '',
            transactionId: transactionId,
            screenshotFilename: req.file.filename,
            status: 'pending',
            createdAt: new Date(),
        };

        const docRef = await db.collection('paymentRequests').add(requestData);

        console.log(`💳 Payment request ${docRef.id} submitted for user ${req.user.uid}`);

        // Send Email Notification to Admin asynchronously
        // We don't await this so it doesn't block the response to the user
        sendPaymentNotificationToAdmin(requestData, req.file)
            .catch(err => console.error('Failed to send admin payment notification:', err.message));

        res.status(200).json({
            success: true,
            message: 'Payment verification submitted successfully',
            requestId: docRef.id
        });
    } catch (error) {
        console.error('Error submitting payment:', error);
        res.status(500).json({ error: error.message || 'Failed to submit payment verification' });
    }
});

/**
 * GET /api/payments/history
 * Fetch the payment history for the authenticated user
 */
router.get('/history', async (req, res) => {
    try {
        const snapshot = await db.collection('paymentRequests')
            .where('uid', '==', req.user.uid)
            .get();

        let payments = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            payments.push({
                id: doc.id,
                transactionId: data.transactionId,
                status: data.status,
                creditsGranted: data.creditsGranted || 0,
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
            });
        });

        // Sort descending by date
        payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ success: true, payments });
    } catch (error) {
        console.error('Error fetching payment history:', error);
        res.status(500).json({ error: 'Failed to fetch payment history' });
    }
});

module.exports = router;
