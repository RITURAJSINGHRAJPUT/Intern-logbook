require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const pdfRoutes = require('./routes/pdf');
const templateRoutes = require('./routes/templates');
const bulkFillRoutes = require('./routes/bulkFill');
const paymentRoutes = require('./routes/payments');
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
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../Assets')));

// Serve PDF templates as static files
app.use('/templates', express.static(path.join(__dirname, '../pdf-format')));

// Serve Payment Uploads securely
app.use('/uploads/payments', verifySessionCookie, verifyAdmin, express.static(path.join(__dirname, 'uploads/payments')));

// API routes
app.use('/api', pdfRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/bulk', bulkFillRoutes);
app.use('/api/payments', paymentRoutes);
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

// Serve robots.txt
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Sitemap: https://click2pdf.in/sitemap.xml`);
});

// Serve dynamic sitemap.xml
app.get('/sitemap.xml', (req, res) => {
    const urls = [
        '/',
        '/login.html',
        '/Buy-Credits.html'
    ];

    // Add other relevant public pages as needed

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls.map(url => `
    <url>
        <loc>https://click2pdf.in${url}</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>${url === '/' ? '1.0' : '0.8'}</priority>
    </url>
    `).join('')}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(sitemap.trim());
});

// Global API 404 handler
app.use('/api', (req, res) => {
    res.status(404).json({ error: `Not Found: ${req.method} ${req.originalUrl}` });
});

// Global API Error handler
app.use('/api', (err, req, res, next) => {
    console.error('API Error Detected:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// Start cleanup job
startCleanupJob();

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Click2PDF running at http://localhost:${PORT}`);
    console.log(`📁 Upload a PDF to get started!`);
});
