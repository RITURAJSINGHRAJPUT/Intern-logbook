const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const upload = require('../middleware/upload');
const { parsePDF } = require('../services/pdfParser');
const { generateFilledPDF, saveGeneratedPDF } = require('../services/pdfGenerator');
const { deleteSessionFiles } = require('../utils/cleanup');
const { db } = require('../config/firebase');

const TEMP_DIR = path.join(__dirname, '../../temp');

// In-memory storage for session data
const sessions = new Map();

/**
 * Upload PDF
 * POST /api/upload
 */
router.post('/upload', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const sessionId = req.sessionId;
        const pdfPath = req.file.path;

        // Parse PDF and detect fields
        const pdfData = await parsePDF(pdfPath);

        // Store session data
        sessions.set(sessionId, {
            pdfPath,
            pdfData,
            fields: pdfData.fields,
            createdAt: Date.now()
        });

        res.json({
            success: true,
            sessionId,
            pageCount: pdfData.pageCount,
            pageInfo: pdfData.pageInfo,
            fields: pdfData.fields,
            hasExistingForm: pdfData.hasExistingForm
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to process PDF' });
    }
});

/**
 * Get PDF for viewing
 * GET /api/pdf/:sessionId
 */
router.get('/pdf/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const pdfPath = path.join(TEMP_DIR, `${sessionId}.pdf`);

    if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ error: 'PDF not found' });
    }

    res.sendFile(pdfPath);
});

/**
 * Get detected fields
 * GET /api/fields/:sessionId
 */
router.get('/fields/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
        fields: session.fields,
        pageInfo: session.pdfData.pageInfo
    });
});

/**
 * Update fields
 * PUT /api/fields/:sessionId
 */
router.put('/fields/:sessionId', express.json(), (req, res) => {
    const { sessionId } = req.params;
    const { fields } = req.body;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    session.fields = fields;
    sessions.set(sessionId, session);

    res.json({ success: true });
});

/**
 * Generate filled PDF
 * POST /api/generate/:sessionId
 */
router.post('/generate/:sessionId', express.json(), async (req, res) => {
    const { sessionId } = req.params;
    const { fields, instances, flatten = false } = req.body;
    const session = sessions.get(sessionId);
    const userId = req.headers['x-user-id'];

    console.log(`[Generate] Request received for session: ${sessionId}, has-session: ${!!session}, cookie: ${!!(req.cookies && req.cookies.session)}`);

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        // --- Credit Check ---
        if (userId) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                const requiredCredits = (instances && instances.length > 1) ? instances.length : 1;
                const currentCredits = userData.bulkCredits || 0;

                if (currentCredits < requiredCredits) {
                    return res.status(402).json({
                        error: `Insufficient credits. You need ${requiredCredits} credit(s) but only have ${currentCredits}. Please purchase more credits.`,
                        creditsNeeded: requiredCredits,
                        creditsAvailable: currentCredits
                    });
                }

                // Deduct credits
                await db.collection('users').doc(userId).update({
                    bulkCredits: currentCredits - requiredCredits
                });
                console.log(`[Generate] Deducted ${requiredCredits} credit(s) from user ${userId}. Remaining: ${currentCredits - requiredCredits}`);
            }
        }

        let pdfBuffer;

        // Check if we have multiple instances
        if (instances && instances.length > 1) {
            // Generate a PDF for each instance and merge them
            const { PDFDocument, StandardFonts } = require('pdf-lib');
            const { fillPdfPages } = require('../services/pdfGenerator');

            const mergedPdf = await PDFDocument.create();

            // Read template once
            const templateBytes = await fs.promises.readFile(session.pdfPath);
            const templatePdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
            const templatePageIndices = templatePdf.getPageIndices();

            // Embed fonts once
            const helveticaFont = await mergedPdf.embedFont(StandardFonts.Helvetica);
            const helveticaBold = await mergedPdf.embedFont(StandardFonts.HelveticaBold);

            for (const instance of instances) {
                const copiedPages = await mergedPdf.copyPages(templatePdf, templatePageIndices);
                copiedPages.forEach(page => mergedPdf.addPage(page));
                await fillPdfPages(mergedPdf, copiedPages, instance.fields, helveticaFont, helveticaBold);
            }

            // Flatten if requested (removes form interactivity)
            if (flatten) {
                try {
                    const form = mergedPdf.getForm();
                    form.flatten();
                } catch (e) {
                    // No form to flatten
                }
            }

            pdfBuffer = Buffer.from(await mergedPdf.save());
        } else {
            // Single instance - use fields directly
            const fieldsToUse = fields || (instances && instances[0]?.fields) || session.fields;
            pdfBuffer = await generateFilledPDF(session.pdfPath, fieldsToUse, flatten);
        }

        const filledPath = await saveGeneratedPDF(sessionId, pdfBuffer);

        session.filledPath = filledPath;
        sessions.set(sessionId, session);

        // --- Auto-Email Feature ---
        let emailSent = false;
        const sessionCookie = req.cookies && req.cookies.session ? req.cookies.session : '';
        if (sessionCookie) {
            try {
                const admin = require('firebase-admin');
                const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);

                // Get the user's email either from claims or by fetching the user record
                let userEmail = decodedClaims.email;
                if (!userEmail && decodedClaims.uid) {
                    const userRecord = await admin.auth().getUser(decodedClaims.uid);
                    userEmail = userRecord.email;
                }

                if (userEmail) {
                    const { sendPdfEmail } = require('../services/emailService');
                    // Await the email so we can tell the frontend if it succeeded
                    try {
                        await sendPdfEmail(userEmail, filledPath, 'filled-form.pdf');
                        emailSent = true;
                    } catch (err) {
                        console.error(`Failed to auto-email ${userEmail}:`, err);
                    }
                }
            } catch (authErr) {
                console.error('Auto-email error (verifying session cookie):', authErr);
                // We swallow the error so the PDF download still succeeds even if email fails
            }
        }

        res.json({ success: true, downloadReady: true, emailSent });
    } catch (error) {
        console.error('Generate error:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

/**
 * Download filled PDF
 * GET /api/download/:sessionId
 */
router.get('/download/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    const filledPath = path.join(TEMP_DIR, `${sessionId}_filled.pdf`);

    console.log(`[Download] Request for session: ${sessionId}, file-exists: ${fs.existsSync(filledPath)}, cookie: ${!!(req.cookies && req.cookies.session)}`);

    if (!fs.existsSync(filledPath)) {
        return res.status(404).json({ error: 'Filled PDF not found. Please generate first.' });
    }

    // Trigger auto-email in background (don't block the download)
    const sessionCookie = req.cookies && req.cookies.session ? req.cookies.session : '';
    if (sessionCookie) {
        (async () => {
            try {
                const admin = require('firebase-admin');
                const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
                let userEmail = decodedClaims.email;
                if (!userEmail && decodedClaims.uid) {
                    const userRecord = await admin.auth().getUser(decodedClaims.uid);
                    userEmail = userRecord.email;
                }
                if (userEmail) {
                    console.log(`[Download] Auto-emailing PDF to: ${userEmail}`);
                    const { sendPdfEmail } = require('../services/emailService');
                    await sendPdfEmail(userEmail, filledPath, 'filled-form.pdf');
                    console.log(`[Download] Email sent successfully to: ${userEmail}`);
                }
            } catch (err) {
                console.error('[Download] Auto-email error:', err.message);
            }
        })();
    }

    res.download(filledPath, 'filled-form.pdf', (err) => {
        if (!err) {
            // Clean up after successful download
            setTimeout(() => {
                deleteSessionFiles(sessionId);
                sessions.delete(sessionId);
            }, 5000);
        }
    });
});

/**
 * Email filled PDF
 * POST /api/email/:sessionId
 */
router.post('/email/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    const { email } = req.body;
    const session = sessions.get(sessionId);

    if (!email) {
        return res.status(400).json({ error: 'Email address is required' });
    }

    const filledPath = path.join(TEMP_DIR, `${sessionId}_filled.pdf`);

    if (!fs.existsSync(filledPath)) {
        return res.status(404).json({ error: 'Filled PDF not found. Please generate first.' });
    }

    try {
        const { sendPdfEmail } = require('../services/emailService');
        await sendPdfEmail(email, filledPath, 'filled-form.pdf');

        // Optionally clean up session after email
        setTimeout(() => {
            deleteSessionFiles(sessionId);
            sessions.delete(sessionId);
        }, 300000); // Wait 5 minutes before cleanup, or based on your needs

        res.json({ success: true, message: 'Email sent successfully!' });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send email. Ensure SMTP is configured correctly.' });
    }
});

/**
 * Get session info
 * GET /api/session/:sessionId
 */
router.get('/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Session not found or expired' });
    }

    res.json({
        exists: true,
        pageCount: session.pdfData.pageCount,
        pageInfo: session.pdfData.pageInfo,
        fieldCount: session.fields.length
    });
});

module.exports = router;
