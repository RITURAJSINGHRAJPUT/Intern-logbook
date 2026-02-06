const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const upload = require('../middleware/upload');
const { parsePDF } = require('../services/pdfParser');
const { generateFilledPDF, saveGeneratedPDF } = require('../services/pdfGenerator');
const { deleteSessionFiles } = require('../utils/cleanup');

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
    const { fields, flatten = false } = req.body;
    const session = sessions.get(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }

    try {
        const fieldsToUse = fields || session.fields;
        const pdfBuffer = await generateFilledPDF(session.pdfPath, fieldsToUse, flatten);
        const filledPath = await saveGeneratedPDF(sessionId, pdfBuffer);

        session.filledPath = filledPath;
        sessions.set(sessionId, session);

        res.json({ success: true, downloadReady: true });
    } catch (error) {
        console.error('Generate error:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

/**
 * Download filled PDF
 * GET /api/download/:sessionId
 */
router.get('/download/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    const filledPath = path.join(TEMP_DIR, `${sessionId}_filled.pdf`);

    if (!fs.existsSync(filledPath)) {
        return res.status(404).json({ error: 'Filled PDF not found. Please generate first.' });
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
