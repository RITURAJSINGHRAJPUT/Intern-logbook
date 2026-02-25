const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { verifyToken } = require('../middleware/auth');
const { verifyAdmin } = require('../middleware/adminAuth');
const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '../../pdf-format');

// All admin routes require auth + admin role
router.use(verifyToken);
router.use(verifyAdmin);

/**
 * GET /api/admin/stats
 * Dashboard statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const usersSnapshot = await db.collection('users').get();
        let total = 0, approved = 0, pending = 0;

        usersSnapshot.forEach(doc => {
            total++;
            const data = doc.data();
            if (data.approved) {
                approved++;
            } else {
                pending++;
            }
        });

        res.json({ total, approved, pending });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

/**
 * GET /api/admin/users
 * List all users with pagination, search, and filter
 * Query params: page, limit, search, filter (all|approved|pending)
 */
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = (req.query.search || '').toLowerCase();
        const filter = req.query.filter || 'all';

        let query = db.collection('users').orderBy('createdAt', 'desc');
        const snapshot = await query.get();

        let users = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            users.push({
                uid: doc.id,
                email: data.email || '',
                role: data.role || 'student',
                approved: data.approved || false,
                active: data.active !== false, // default true
                allowBulkFill: data.allowBulkFill || false,
                allowedTemplates: data.allowedTemplates || [],
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
                lastLogin: data.lastLogin ? data.lastLogin.toDate().toISOString() : null,
                displayName: data.displayName || ''
            });
        });

        // Apply search filter
        if (search) {
            users = users.filter(u =>
                u.email.toLowerCase().includes(search) ||
                u.displayName.toLowerCase().includes(search)
            );
        }

        // Apply status filter
        if (filter === 'approved') {
            users = users.filter(u => u.approved);
        } else if (filter === 'pending') {
            users = users.filter(u => !u.approved);
        }

        const totalFiltered = users.length;
        const totalPages = Math.ceil(totalFiltered / limit);
        const startIndex = (page - 1) * limit;
        const paginatedUsers = users.slice(startIndex, startIndex + limit);

        res.json({
            users: paginatedUsers,
            pagination: {
                page,
                limit,
                totalPages,
                totalUsers: totalFiltered
            }
        });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * POST /api/admin/users/:uid/approve
 */
router.post('/users/:uid/approve', async (req, res) => {
    try {
        const { uid } = req.params;
        await db.collection('users').doc(uid).update({
            approved: true
        });
        console.log(`✅ User ${uid} approved by admin ${req.user.uid}`);
        res.json({ success: true, message: 'User approved' });
    } catch (error) {
        console.error('Error approving user:', error);
        res.status(500).json({ error: 'Failed to approve user' });
    }
});

/**
 * POST /api/admin/users/:uid/reject
 */
router.post('/users/:uid/reject', async (req, res) => {
    try {
        const { uid } = req.params;
        await db.collection('users').doc(uid).update({
            approved: false
        });
        console.log(`❌ User ${uid} rejected by admin ${req.user.uid}`);
        res.json({ success: true, message: 'User rejected' });
    } catch (error) {
        console.error('Error rejecting user:', error);
        res.status(500).json({ error: 'Failed to reject user' });
    }
});

/**
 * POST /api/admin/users/:uid/toggle-active
 */
router.post('/users/:uid/toggle-active', async (req, res) => {
    try {
        const { uid } = req.params;
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentActive = userDoc.data().active !== false;
        await db.collection('users').doc(uid).update({
            active: !currentActive
        });

        console.log(`🔄 User ${uid} toggled to ${!currentActive ? 'active' : 'inactive'} by admin ${req.user.uid}`);
        res.json({ success: true, active: !currentActive });
    } catch (error) {
        console.error('Error toggling user:', error);
        res.status(500).json({ error: 'Failed to toggle user status' });
    }
});

/**
 * POST /api/admin/users/:uid/toggle-bulk
 */
router.post('/users/:uid/toggle-bulk', async (req, res) => {
    try {
        const { uid } = req.params;
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return res.status(404).json({ error: 'User not found' });
        }

        const currentBulkFill = userDoc.data().allowBulkFill || false;
        await db.collection('users').doc(uid).update({
            allowBulkFill: !currentBulkFill
        });

        console.log(`🗃️ User ${uid} bulk fill access toggled to ${!currentBulkFill} by admin ${req.user.uid}`);
        res.json({ success: true, allowBulkFill: !currentBulkFill });
    } catch (error) {
        console.error('Error toggling bulk fill access:', error);
        res.status(500).json({ error: 'Failed to toggle bulk fill access' });
    }
});

/**
 * PUT /api/admin/users/:uid/templates
 * Update allowed templates for a user
 * Body: { allowedTemplates: ["template1.pdf", "template2.pdf"] }
 */
router.put('/users/:uid/templates', async (req, res) => {
    try {
        const { uid } = req.params;
        const { allowedTemplates } = req.body;

        if (!Array.isArray(allowedTemplates)) {
            return res.status(400).json({ error: 'allowedTemplates must be an array' });
        }

        await db.collection('users').doc(uid).update({
            allowedTemplates: allowedTemplates
        });

        console.log(`📄 Templates updated for user ${uid} by admin ${req.user.uid}:`, allowedTemplates);
        res.json({ success: true, allowedTemplates });
    } catch (error) {
        console.error('Error updating templates:', error);
        res.status(500).json({ error: 'Failed to update templates' });
    }
});

/**
 * GET /api/admin/templates
 * List all available template files (for admin template assignment UI)
 */
router.get('/templates', (req, res) => {
    try {
        if (!fs.existsSync(TEMPLATES_DIR)) {
            return res.json({ templates: [] });
        }

        const templates = fs.readdirSync(TEMPLATES_DIR)
            .filter(file => file.toLowerCase().endsWith('.pdf'))
            .map(file => ({
                filename: file,
                name: file.replace('.pdf', '')
            }));

        res.json({ templates });
    } catch (error) {
        console.error('Error listing templates:', error);
        res.status(500).json({ error: 'Failed to list templates' });
    }
});

/**
 * POST /api/admin/templates/upload
 * Upload a new global template
 */
const multer = require('multer');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(TEMPLATES_DIR)) {
            fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
        }
        cb(null, TEMPLATES_DIR);
    },
    filename: (req, file, cb) => {
        // use original name but ensure it's a pdf
        let filename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        if (!filename.toLowerCase().endsWith('.pdf')) {
            filename += '.pdf';
        }
        cb(null, filename);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

router.post('/templates/upload', upload.single('template'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No template file uploaded' });
        }

        console.log(`📄 New template uploaded by admin ${req.user.uid}: ${req.file.filename}`);
        res.json({
            success: true,
            template: {
                filename: req.file.filename,
                name: req.file.filename.replace('.pdf', '')
            }
        });
    } catch (error) {
        console.error('Error uploading template:', error);
        res.status(500).json({ error: error.message || 'Failed to upload template' });
    }
});

/**
 * DELETE /api/admin/templates/:filename
 * Delete a global template and its associated fields
 */
router.delete('/templates/:filename', (req, res) => {
    try {
        const { filename } = req.params;

        if (!filename.endsWith('.pdf')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        const pdfPath = path.join(TEMPLATES_DIR, filename);
        const fieldsPath = path.join(TEMPLATES_DIR, filename.replace('.pdf', '.fields.json'));

        let deleted = false;

        if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
            deleted = true;
        }

        if (fs.existsSync(fieldsPath)) {
            fs.unlinkSync(fieldsPath);
        }

        if (deleted) {
            console.log(`🗑️ Template deleted by admin ${req.user.uid}: ${filename}`);
            res.json({ success: true, message: 'Template deleted' });
        } else {
            res.status(404).json({ error: 'Template not found' });
        }
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

/**
 * POST /api/admin/templates/:filename/fields
 * Save global fields for a template
 */
router.post('/templates/:filename/fields', (req, res) => {
    try {
        const { filename } = req.params;
        const { fields } = req.body;

        if (!filename || !filename.endsWith('.pdf')) {
            return res.status(400).json({ error: 'Invalid filename' });
        }

        if (!fs.existsSync(TEMPLATES_DIR)) {
            fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
        }

        const fieldsFile = filename.replace('.pdf', '.fields.json');
        const globalFieldsPath = path.join(TEMPLATES_DIR, fieldsFile);

        const fieldsData = {
            templateName: filename,
            updatedBy: req.user.uid,
            savedAt: new Date().toISOString(),
            isGlobal: true,
            fields: fields || []
        };

        fs.writeFileSync(globalFieldsPath, JSON.stringify(fieldsData, null, 2));

        console.log(`✅ Global template fields saved by admin ${req.user.uid}: ${fieldsFile}`);
        res.json({ success: true, message: 'Global fields saved successfully' });
    } catch (error) {
        console.error('Error saving global template fields:', error);
        res.status(500).json({ error: 'Failed to save global template fields' });
    }
});

/**
 * POST /api/admin/setup-first-admin
 * One-time setup: creates admin doc for the authenticated user.
 * Only works if zero admins exist in the collection.
 */
router.post = router.post; // Keep existing post

// We need a special route WITHOUT verifyAdmin for first-time setup
// So we create a separate router
const setupRouter = express.Router();
setupRouter.use(verifyToken);

setupRouter.post('/setup-first-admin', async (req, res) => {
    try {
        const adminsSnapshot = await db.collection('admins').get();

        if (!adminsSnapshot.empty) {
            return res.status(400).json({ error: 'Admin already exists. Setup not allowed.' });
        }

        // Create admin doc
        await db.collection('admins').doc(req.user.uid).set({
            role: 'admin',
            email: req.user.email || '',
            createdAt: new Date()
        });

        // Also update user doc if it exists
        const userDoc = await db.collection('users').doc(req.user.uid).get();
        if (userDoc.exists) {
            await db.collection('users').doc(req.user.uid).update({
                role: 'admin',
                approved: true
            });
        }

        console.log(`👑 First admin created: ${req.user.uid} (${req.user.email})`);
        res.json({ success: true, message: 'You are now the admin!' });
    } catch (error) {
        console.error('Error setting up admin:', error);
        res.status(500).json({ error: 'Failed to setup admin' });
    }
});

module.exports = { adminRouter: router, setupRouter };
