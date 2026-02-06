const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '../../pdf-format');

// GET /api/templates - List all available PDF templates
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(TEMPLATES_DIR)) {
            return res.json({ templates: [] });
        }

        const files = fs.readdirSync(TEMPLATES_DIR)
            .filter(file => file.toLowerCase().endsWith('.pdf'))
            .map(file => {
                const fieldsFile = file.replace('.pdf', '.fields.json');
                const hasFields = fs.existsSync(path.join(TEMPLATES_DIR, fieldsFile));
                return {
                    name: file.replace('.pdf', ''),
                    filename: file,
                    url: `/templates/${encodeURIComponent(file)}`,
                    hasSavedFields: hasFields
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
        const fieldsFile = filename.replace('.pdf', '.fields.json');
        const fieldsPath = path.join(TEMPLATES_DIR, fieldsFile);

        if (!fs.existsSync(fieldsPath)) {
            return res.json({ fields: [], saved: false });
        }

        const fieldsData = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));
        res.json({ fields: fieldsData.fields || [], saved: true });
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

        if (!filename || !filename.endsWith('.pdf')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        const fieldsFile = filename.replace('.pdf', '.fields.json');
        const fieldsPath = path.join(TEMPLATES_DIR, fieldsFile);

        const fieldsData = {
            templateName: filename,
            savedAt: new Date().toISOString(),
            fields: fields || []
        };

        fs.writeFileSync(fieldsPath, JSON.stringify(fieldsData, null, 2));

        console.log(`✅ Template fields saved: ${fieldsFile}`);
        res.json({ success: true, message: 'Template fields saved successfully' });
    } catch (error) {
        console.error('Error saving template fields:', error);
        res.status(500).json({ error: 'Failed to save template fields' });
    }
});

module.exports = router;

