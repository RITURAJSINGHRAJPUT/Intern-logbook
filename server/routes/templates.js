const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { db, auth } = require('../config/firebase');

const TEMPLATES_DIR = path.join(__dirname, '../../pdf-format');

const USERS_DIR = path.join(__dirname, '../../data/users');

// Helper to ensure user dir exists
function getUserDir(userId) {
    const userDir = path.join(USERS_DIR, userId);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
}

// GET /api/templates - List all available PDF templates
// Optionally checks user's allowed templates when Bearer token is provided
router.get('/', async (req, res) => {
    try {
        if (!fs.existsSync(TEMPLATES_DIR)) {
            return res.json({ templates: [] });
        }

        let files = fs.readdirSync(TEMPLATES_DIR)
            .filter(file => file.toLowerCase().endsWith('.pdf'))
            .map(file => ({
                name: file.replace('.pdf', ''),
                filename: file,
                url: `/templates/${encodeURIComponent(file)}`,
                hasSavedFields: true,
                allowed: true // default allowed, overridden below if user has restrictions
            }));

        // Check user's allowed templates if Bearer token present
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            try {
                const token = authHeader.split('Bearer ')[1];
                const decoded = await auth.verifyIdToken(token);
                const userDoc = await db.collection('users').doc(decoded.uid).get();

                if (userDoc.exists) {
                    const userData = userDoc.data();
                    const allowedTemplates = userData.allowedTemplates || [];

                    // Check if user is also an admin
                    const adminDoc = await db.collection('admins').doc(decoded.uid).get();
                    if (adminDoc.exists) {
                        // Admin: allow all templates (leave as is)
                    } else {
                        // Regular user: Filter strictly based on allowedTemplates
                        files.forEach(f => {
                            f.allowed = allowedTemplates.includes(f.filename);
                        });
                        // Actually remove the templates they don't have access to
                        files = files.filter(f => f.allowed);
                    }
                }
            } catch (tokenErr) {
                // Token invalid — restrict all templates
                console.warn('Template access check: token invalid, returning no templates');
                files = [];
            }
        } else {
            // No token — restrict all templates
            files = [];
        }

        res.json({ templates: files });
    } catch (error) {
        console.error('Error listing templates:', error);
        res.status(500).json({ error: 'Failed to list templates' });
    }
});

// GET /api/templates/check-access/:filename - Check if logged-in user can access a template
router.get('/check-access/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Auth token required' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decoded = await auth.verifyIdToken(token);
        const userDoc = await db.collection('users').doc(decoded.uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user is an admin
        const adminDoc = await db.collection('admins').doc(decoded.uid).get();
        if (adminDoc.exists) {
            return res.json({ allowed: true });
        }

        const userData = userDoc.data();

        // Check if user is approved
        if (!userData.approved) {
            return res.json({ allowed: false, reason: 'Account not approved' });
        }

        const allowedTemplates = userData.allowedTemplates || [];

        // If no templates are allowed, explicitly deny for non-admins
        if (allowedTemplates.length === 0) {
            return res.json({ allowed: false, reason: 'You have not been granted access to any templates.' });
        }

        const allowed = allowedTemplates.includes(filename);
        res.json({ allowed, reason: allowed ? null : 'Template not in your allowed list' });
    } catch (error) {
        console.error('Error checking template access:', error);
        res.status(500).json({ error: 'Failed to check access' });
    }
});

// GET /api/templates/:filename/fields - Get saved fields for a template
router.get('/:filename/fields', (req, res) => {
    try {
        const { filename } = req.params;
        const userId = req.headers['x-user-id'];

        if (!userId) {
            // If no user ID, return empty (or could return global defaults if we wanted)
            return res.json({ fields: [], saved: false });
        }

        const fieldsFile = filename.replace('.pdf', '.fields.json');
        const userFieldsPath = path.join(getUserDir(userId), fieldsFile);
        const globalFieldsPath = path.join(TEMPLATES_DIR, fieldsFile);

        // 1. Try user-specific path first
        if (fs.existsSync(userFieldsPath)) {
            const fieldsData = JSON.parse(fs.readFileSync(userFieldsPath, 'utf8'));
            return res.json({ fields: fieldsData.fields || [], saved: true });
        }

        // 2. Fallback to global path (legacy data)
        if (fs.existsSync(globalFieldsPath)) {
            const fieldsData = JSON.parse(fs.readFileSync(globalFieldsPath, 'utf8'));
            return res.json({ fields: fieldsData.fields || [], saved: true, isLegacy: true });
        }

        // 3. No data found
        return res.json({ fields: [], saved: false });
    } catch (error) {
        console.error('Error loading template fields:', error);
        res.status(500).json({ error: 'Failed to load template fields' });
    }
});

// POST /api/templates/:filename/fields - Save fields for a template
router.post('/:filename/fields', express.json(), (req, res) => {
    try {
        const { filename } = req.params;
        const { fields, sessionId } = req.body;
        const userId = req.headers['x-user-id'];

        if (!filename || !filename.endsWith('.pdf')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        if (!userId) {
            return res.status(401).json({ error: 'User ID required to save fields' });
        }

        const userDir = getUserDir(userId);
        const fieldsFile = filename.replace('.pdf', '.fields.json');
        const userFieldsPath = path.join(userDir, fieldsFile);

        const fieldsData = {
            templateName: filename,
            userId: userId,
            savedAt: new Date().toISOString(),
            fields: fields || []
        };

        fs.writeFileSync(userFieldsPath, JSON.stringify(fieldsData, null, 2));

        // Also copy the PDF to user's directory if it doesn't exist there yet
        const userPdfPath = path.join(userDir, filename);
        if (!fs.existsSync(userPdfPath)) {
            // Try to copy from temp (uploaded PDF session)
            if (sessionId) {
                const tempPdfPath = path.join(__dirname, '../../temp', `${sessionId}.pdf`);
                if (fs.existsSync(tempPdfPath)) {
                    fs.copyFileSync(tempPdfPath, userPdfPath);
                    console.log(`📄 PDF copied to user directory: ${filename}`);
                }
            }
            // Also try from global templates directory
            const globalPdfPath = path.join(TEMPLATES_DIR, filename);
            if (!fs.existsSync(userPdfPath) && fs.existsSync(globalPdfPath)) {
                fs.copyFileSync(globalPdfPath, userPdfPath);
                console.log(`📄 PDF copied from global templates: ${filename}`);
            }
        }

        console.log(`✅ Template fields saved for user ${userId}: ${fieldsFile}`);
        res.json({ success: true, message: 'Template fields saved successfully' });
    } catch (error) {
        console.error('Error saving template fields:', error);
        res.status(500).json({ error: 'Failed to save template fields' });
    }
});

// GET /api/templates/user/:userId - List user's saved templates
router.get('/user/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        const userDir = path.join(USERS_DIR, userId);

        if (!fs.existsSync(userDir)) {
            return res.json({ templates: [] });
        }

        // Find all .fields.json files in user dir
        const fieldFiles = fs.readdirSync(userDir).filter(f => f.endsWith('.fields.json'));

        const templates = fieldFiles.map(fieldFile => {
            const pdfFilename = fieldFile.replace('.fields.json', '.pdf');
            const pdfPath = path.join(userDir, pdfFilename);
            const hasPdf = fs.existsSync(pdfPath);

            // Read fields data for metadata
            let savedAt = null;
            let fieldCount = 0;
            try {
                const data = JSON.parse(fs.readFileSync(path.join(userDir, fieldFile), 'utf8'));
                savedAt = data.savedAt;
                fieldCount = (data.fields || []).length;
            } catch (e) { /* ignore */ }

            return {
                name: pdfFilename.replace('.pdf', ''),
                filename: pdfFilename,
                url: hasPdf ? `/api/templates/user/${userId}/pdf/${encodeURIComponent(pdfFilename)}` : null,
                hasPdf,
                fieldCount,
                savedAt,
                isUserTemplate: true
            };
        }).filter(t => t.hasPdf); // Only show templates where the PDF exists

        res.json({ templates });
    } catch (error) {
        console.error('Error listing user templates:', error);
        res.status(500).json({ error: 'Failed to list user templates' });
    }
});

// GET /api/templates/user/:userId/pdf/:filename - Serve a user's saved PDF
router.get('/user/:userId/pdf/:filename', (req, res) => {
    const { userId, filename } = req.params;
    const pdfPath = path.join(USERS_DIR, userId, decodeURIComponent(filename));

    if (!fs.existsSync(pdfPath)) {
        return res.status(404).json({ error: 'PDF not found' });
    }

    res.sendFile(pdfPath);
});

// DELETE /api/templates/user/:userId/template/:filename - Delete a user's saved template
router.delete('/user/:userId/template/:filename', (req, res) => {
    try {
        const { userId, filename } = req.params;
        const decodedFilename = decodeURIComponent(filename);

        if (!decodedFilename.endsWith('.pdf')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        const userDir = path.join(USERS_DIR, userId);
        const pdfPath = path.join(userDir, decodedFilename);
        const fieldsPath = path.join(userDir, decodedFilename.replace('.pdf', '.fields.json'));

        let deleted = false;

        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
            deleted = true;
        }

        if (fs.existsSync(fieldsPath)) {
            fs.unlinkSync(fieldsPath);
            deleted = true;
        }

        if (deleted) {
            console.log(`🗑️ Template deleted for user ${userId}: ${decodedFilename}`);
            res.json({ success: true, message: 'Template deleted successfully' });
        } else {
            res.status(404).json({ error: 'Template not found' });
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

module.exports = router;

