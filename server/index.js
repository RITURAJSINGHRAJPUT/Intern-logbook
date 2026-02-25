const express = require('express');
const cors = require('cors');
const path = require('path');
const pdfRoutes = require('./routes/pdf');
const templateRoutes = require('./routes/templates');
const bulkFillRoutes = require('./routes/bulkFill');
const { adminRouter, setupRouter } = require('./routes/admin');
const { verifyToken } = require('./middleware/auth');
const { verifyAdmin, verifyBulkAccess } = require('./middleware/adminAuth');
const { verifySessionCookie } = require('./middleware/sessionAuth');
const { startCleanupJob } = require('./utils/cleanup');
const cookieParser = require('cookie-parser');
const sessionRoutes = require('./routes/session');

// Initialize Firebase Admin SDK
require('./config/firebase');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Serve PDF templates as static files
app.use('/templates', express.static(path.join(__dirname, '../pdf-format')));

// API routes
app.use('/api', pdfRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/bulk', bulkFillRoutes);
app.use('/api', sessionRoutes);

// Admin routes (setupRouter first — it only requires auth, not admin role)
app.use('/api/admin', setupRouter);
app.use('/api/admin', adminRouter);

// Serve editor page for authenticated users
app.get('/editor', verifySessionCookie, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/editor.html'));
});

// Serve admin panel for authenticated users
app.get('/admin', verifySessionCookie, (req, res) => {
    res.sendFile(path.join(__dirname, '../public/user_management.html'));
});

// Start cleanup job
startCleanupJob();

// Start server
app.listen(PORT, () => {
    console.log(`🚀 PDF Form Filler running at http://localhost:${PORT}`);
    console.log(`📁 Upload a PDF to get started!`);
});
