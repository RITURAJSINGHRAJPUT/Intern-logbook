const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

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
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(TEMPLATES_DIR)) {
            return res.json({ templates: [] });
        }

        const files = fs.readdirSync(TEMPLATES_DIR)
            .filter(file => file.toLowerCase().endsWith('.pdf'))
            .map(file => {
                // We don't check for hasSavedFields here anymore as it's user specific
                // and expensive to check for all users on list
                return {
                    name: file.replace('.pdf', ''),
                    filename: file,
                    url: `/templates/${encodeURIComponent(file)}`,
                    hasSavedFields: true // Assume true or handled by client
                };
            });

        res.json({ templates: files });
    } catch (error) {
        console.error('Error listing templates:', error);
        res.status(500).json({ error: 'Failed to list templates' });
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
        const { fields } = req.body;
        const userId = req.headers['x-user-id'];

        if (!filename || !filename.endsWith('.pdf')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        if (!userId) {
            return res.status(401).json({ error: 'User ID required to save fields' });
        }

        const fieldsFile = filename.replace('.pdf', '.fields.json');
        const userFieldsPath = path.join(getUserDir(userId), fieldsFile);

        const fieldsData = {
            templateName: filename,
            userId: userId,
            savedAt: new Date().toISOString(),
            fields: fields || []
        };

        fs.writeFileSync(userFieldsPath, JSON.stringify(fieldsData, null, 2));

        console.log(`✅ Template fields saved for user ${userId}: ${fieldsFile}`);
        res.json({ success: true, message: 'Template fields saved successfully' });
    } catch (error) {
        console.error('Error saving template fields:', error);
        res.status(500).json({ error: 'Failed to save template fields' });
    }
});

module.exports = router;

