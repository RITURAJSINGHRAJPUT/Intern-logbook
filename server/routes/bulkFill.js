/**
 * Bulk Fill Routes
 * API endpoints for bulk PDF auto-filling
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const {
    parseDataFile,
    autoMapFields,
    getTemplateFields,
    applyDataToFields,
    generateBulkPDFs,
    getJobStatus,
    cleanupJob
} = require('../services/bulkPdfService');
const { generateFilledPDF } = require('../services/pdfGenerator');
const { verifyBulkAccess } = require('../middleware/adminAuth');
const { verifyToken } = require('../middleware/auth');
const { db } = require('../config/firebase');

// Apply auth - all authenticated users can access bulk fill features
// Credits are checked at generation time, not at route level
router.use((req, res, next) => {
    if (req.path.startsWith('/preview-file/') || req.path.startsWith('/download/')) {
        return next();
    }
    verifyToken(req, res, next);
});

const TEMPLATES_DIR = path.join(__dirname, '../../pdf-format');
const TEMP_DIR = path.join(__dirname, '../../temp');
const USERS_DIR = path.join(__dirname, '../../data/users');

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const allowed = [
            'text/csv',
            'application/json',
            'text/json',
            'application/vnd.ms-excel',
            'text/plain'
        ];
        if (allowed.includes(file.mimetype) ||
            file.originalname.endsWith('.csv') ||
            file.originalname.endsWith('.json')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV and JSON files are allowed'));
        }
    }
});

/**
 * GET /api/bulk/templates
 * List templates that have saved fields
 */
// Helper to get user directory (copied from templates.js or similar)
function getUserDir(userId) {
    return path.join(USERS_DIR, userId);
}

/**
 * GET /api/bulk/templates
 * List templates that have saved fields (user-specific or global)
 */
router.get('/templates', (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || (req.user && req.user.uid);
        console.log(`[Bulk] Listing templates for UserID: ${userId || 'Global'}`);

        let files = [];

        // 1. Scan global templates (pdf-format directory)
        if (fs.existsSync(TEMPLATES_DIR)) {
            const globalFiles = fs.readdirSync(TEMPLATES_DIR)
                .filter(file => file.toLowerCase().endsWith('.pdf'))
                .map(file => {
                    let fieldCount = 0;
                    let hasFields = false;

                    // Check user-specific fields first
                    if (userId) {
                        const userDir = getUserDir(userId);
                        const userFieldsPath = path.join(userDir, file.replace('.pdf', '.fields.json'));
                        if (fs.existsSync(userFieldsPath)) {
                            try {
                                const data = JSON.parse(fs.readFileSync(userFieldsPath, 'utf8'));
                                fieldCount = data.fields ? data.fields.length : 0;
                                hasFields = true;
                            } catch (e) { }
                        }
                    }

                    // Fallback to global fields
                    if (!hasFields) {
                        const fieldsPath = path.join(TEMPLATES_DIR, file.replace('.pdf', '.fields.json'));
                        if (fs.existsSync(fieldsPath)) {
                            try {
                                const data = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
                                fieldCount = data.fields ? data.fields.length : 0;
                                hasFields = true;
                            } catch (e) { }
                        }
                    }

                    if (!hasFields) return null;

                    return {
                        name: file.replace('.pdf', ''),
                        filename: file,
                        url: `/templates/${encodeURIComponent(file)}`,
                        fieldCount
                    };
                })
                .filter(t => t !== null);

            files = globalFiles;
        }

        // 2. Also scan user's own saved templates
        if (userId) {
            const userDir = path.join(USERS_DIR, userId);
            if (fs.existsSync(userDir)) {
                const userFieldFiles = fs.readdirSync(userDir).filter(f => f.endsWith('.fields.json'));

                userFieldFiles.forEach(fieldFile => {
                    const pdfFilename = fieldFile.replace('.fields.json', '.pdf');

                    // Skip if already listed from global templates
                    if (files.some(f => f.filename === pdfFilename)) return;

                    const userPdfPath = path.join(userDir, pdfFilename);
                    if (!fs.existsSync(userPdfPath)) return;

                    let fieldCount = 0;
                    try {
                        const data = JSON.parse(fs.readFileSync(path.join(userDir, fieldFile), 'utf8'));
                        fieldCount = data.fields ? data.fields.length : 0;
                    } catch (e) { }

                    files.push({
                        name: pdfFilename.replace('.pdf', '') + ' (My Template)',
                        filename: pdfFilename,
                        url: `/api/templates/user/${userId}/pdf/${encodeURIComponent(pdfFilename)}`,
                        fieldCount,
                        isUserTemplate: true
                    });
                });
            }
        }

        res.json({ templates: files });
    } catch (error) {
        console.error('Error listing bulk templates:', error);
        res.status(500).json({ error: 'Failed to list templates' });
    }
});

/**
 * GET /api/bulk/credits
 * Get the current user's bulk fill credits
 */
router.get('/credits', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'];
        if (!userId) {
            return res.status(401).json({ error: 'User ID missing' });
        }

        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = userDoc.data();
        res.json({ bulkCredits: userData.bulkCredits || 0 });
    } catch (error) {
        console.error('Error fetching credits:', error);
        res.status(500).json({ error: 'Failed to fetch credits' });
    }
});

/**
 * GET /api/bulk/template/:filename/fields
 * Get template field names for mapping
 */
router.get('/template/:filename/fields', async (req, res) => {
    try {
        const { filename } = req.params;
        const userId = req.headers['x-user-id'] || (req.user && req.user.uid);
        const fields = await getTemplateFields(filename, userId);

        if (!fields) {
            return res.status(404).json({ error: 'Template fields not found' });
        }

        // Return simplified field info for mapping UI
        const fieldInfo = fields.map(f => ({
            name: f.name,
            type: f.type,
            required: f.required || false
        }));

        res.json({ fields: fieldInfo });
    } catch (error) {
        console.error('Error getting template fields:', error);
        res.status(500).json({ error: 'Failed to get template fields' });
    }
});

/**
 * GET /api/bulk/template-csv/:filename
 * Download a CSV template for bulk fill
 */
router.get('/template-csv/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const userId = req.headers['x-user-id'];

        const fields = await getTemplateFields(filename, userId);

        if (!fields || fields.length === 0) {
            return res.status(404).json({ error: 'No fields found for this template. Please save fields first.' });
        }

        // Extract unique field names for headers
        const headers = [...new Set(fields.map(f => f.name).filter(n => n))];

        // Create CSV content (headers only)
        // Add a BOM for Excel compatibility with UTF-8
        const csvContent = '\uFEFF' + headers.join(',') + '\n';

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename.replace('.pdf', '')}_bulk_template.csv"`);
        res.send(csvContent);

    } catch (error) {
        console.error('Error generating CSV template:', error);
        res.status(500).json({ error: 'Failed to generate CSV template' });
    }
});

/**
 * POST /api/bulk/upload-data
 * Parse and validate uploaded CSV/JSON data
 */
router.post('/upload-data', upload.single('dataFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No data file uploaded' });
        }

        const mimeType = req.file.mimetype ||
            (req.file.originalname.endsWith('.json') ? 'application/json' : 'text/csv');

        const { data, headers } = parseDataFile(req.file.buffer, mimeType);

        // Validate row count
        const maxRows = 100;
        if (data.length > maxRows) {
            return res.status(400).json({
                error: `Too many rows. Maximum allowed is ${maxRows}, but file has ${data.length} rows.`
            });
        }

        if (data.length === 0) {
            return res.status(400).json({ error: 'No data rows found in file' });
        }

        res.json({
            success: true,
            rowCount: data.length,
            headers,
            data: data, // Full parsed data for generation
            preview: data.slice(0, 5) // First 5 rows for preview
        });
    } catch (error) {
        console.error('Error parsing data file:', error);
        res.status(400).json({ error: error.message || 'Failed to parse data file' });
    }
});

/**
 * POST /api/bulk/auto-map
 * Auto-map data headers to template fields
 */
router.post('/auto-map', express.json(), async (req, res) => {
    try {
        const { templateFilename, dataHeaders } = req.body;
        const userId = req.headers['x-user-id'];

        if (!templateFilename || !dataHeaders) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        const fields = await getTemplateFields(templateFilename, userId);
        if (!fields) {
            return res.status(404).json({ error: 'Template fields not found' });
        }

        const mapping = autoMapFields(dataHeaders, fields);

        res.json({ mapping });
    } catch (error) {
        console.error('Error auto-mapping fields:', error);
        res.status(500).json({ error: 'Failed to auto-map fields' });
    }
});

/**
 * POST /api/bulk/preview/:filename
 * Generate preview for first record
 */
router.post('/preview/:filename', express.json(), async (req, res) => {
    try {
        const { filename } = req.params;
        const { dataRow, fieldMapping } = req.body;
        const userId = req.headers['x-user-id'] || (req.user && req.user.uid);

        if (!dataRow || !fieldMapping) {
            return res.status(400).json({ error: 'Missing data row or field mapping' });
        }

        let templatePath = path.join(TEMPLATES_DIR, filename);
        if (!fs.existsSync(templatePath)) {
            if (userId) {
                // Try user's personal templates folder
                const userTemplatePath = path.join(__dirname, '../../data/users', userId, filename);
                if (fs.existsSync(userTemplatePath)) {
                    templatePath = userTemplatePath;
                } else {
                    return res.status(404).json({ error: 'Template not found' });
                }
            } else {
                return res.status(404).json({ error: 'Template not found' });
            }
        }

        const fields = await getTemplateFields(filename, userId);
        if (!fields) {
            return res.status(404).json({ error: 'Template fields not found' });
        }

        // Apply data to fields
        const filledFields = applyDataToFields(fields, dataRow, fieldMapping);

        // Generate preview PDF
        const pdfBuffer = await generateFilledPDF(templatePath, filledFields, true);

        // Save to temp and return URL
        const previewId = uuidv4();
        const previewPath = path.join(TEMP_DIR, `${previewId}_preview.pdf`);
        fs.writeFileSync(previewPath, pdfBuffer);

        res.json({
            success: true,
            previewUrl: `/api/bulk/preview-file/${previewId}`
        });
    } catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).json({ error: 'Failed to generate preview' });
    }
});

/**
 * GET /api/bulk/preview-file/:previewId
 * Serve preview PDF file
 */
router.get('/preview-file/:previewId', (req, res) => {
    const { previewId } = req.params;
    const previewPath = path.join(TEMP_DIR, `${previewId}_preview.pdf`);

    if (!fs.existsSync(previewPath)) {
        return res.status(404).json({ error: 'Preview not found' });
    }

    res.sendFile(previewPath);
});

/**
 * POST /api/bulk/generate/:filename
 * Generate all PDFs from data
 */
router.post('/generate/:filename', express.json(), async (req, res) => {
    try {
        const { filename } = req.params;
        const { data, fieldMapping, options = {} } = req.body;
        const userId = req.headers['x-user-id'] || (req.user && req.user.uid);

        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ error: 'Invalid data array' });
        }

        if (!fieldMapping || Object.keys(fieldMapping).length === 0) {
            return res.status(400).json({ error: 'Field mapping is required' });
        }

        let templatePath = path.join(TEMPLATES_DIR, filename);
        console.log(`[Bulk Gen] Trying global path: ${templatePath}`);
        if (!fs.existsSync(templatePath)) {
            console.log(`[Bulk Gen] Global path not found.`);
            if (userId) {
                // Try user's personal templates folder
                const userTemplatePath = path.join(__dirname, '../../data/users', userId, filename);
                console.log(`[Bulk Gen] Trying user path: ${userTemplatePath}`);
                if (fs.existsSync(userTemplatePath)) {
                    console.log(`[Bulk Gen] User path FOUND.`);
                    templatePath = userTemplatePath;
                } else {
                    console.log(`[Bulk Gen] User path NOT found. Returning 404.`);
                    return res.status(404).json({ error: 'Template not found' });
                }
            } else {
                console.log(`[Bulk Gen] No userId provided, returning 404.`);
                return res.status(404).json({ error: 'Template not found' });
            }
        } else {
            console.log(`[Bulk Gen] Global path FOUND.`);
        }

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized: User ID missing' });
        }

        // Check user bulk credits
        const userDoc = await db.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userData = userDoc.data();
        const requiredCredits = data.length;
        const currentCredits = userData.bulkCredits || 0;

        if (currentCredits < requiredCredits) {
            return res.status(402).json({
                error: `Insufficient credits. You need ${requiredCredits} credits but only have ${currentCredits}. Please contact an admin.`
            });
        }

        // Deduct credits
        await db.collection('users').doc(userId).update({
            bulkCredits: currentCredits - requiredCredits
        });

        // Start async job
        const jobId = uuidv4();

        // Pass userId to options for generateBulkPDFs
        const jobOptions = { ...options, userId };

        // Launch generation in background
        generateBulkPDFs(jobId, filename, data, fieldMapping, jobOptions)
            .catch(err => console.error('Bulk generation error:', err));

        res.json({
            success: true,
            jobId,
            message: 'Bulk generation started'
        });
    } catch (error) {
        console.error('Error starting bulk generation:', error);
        res.status(500).json({ error: 'Failed to start bulk generation' });
    }
});

/**
 * GET /api/bulk/status/:jobId
 * Get job status
 */
router.get('/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = getJobStatus(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
        status: job.status,
        total: job.total,
        processed: job.processed,
        errors: job.errors,
        outputType: job.outputType,
        error: job.error
    });
});

/**
 * GET /api/bulk/download/:jobId
 * Download generated files
 */
router.get('/download/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = getJobStatus(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'completed') {
        return res.status(400).json({ error: 'Job not completed yet' });
    }

    if (!job.outputFile || !fs.existsSync(job.outputFile)) {
        return res.status(404).json({ error: 'Output file not found' });
    }

    const filename = job.outputType === 'zip' ? 'filled-forms.zip' : 'filled-forms-merged.pdf';

    res.download(job.outputFile, filename, (err) => {
        if (!err) {
            // Cleanup after download
            setTimeout(() => {
                cleanupJob(jobId);
            }, 30000);
        }
    });
});

module.exports = router;
