const express = require('express');
const cors = require('cors');
const path = require('path');
const pdfRoutes = require('./routes/pdf');
const templateRoutes = require('./routes/templates');
const bulkFillRoutes = require('./routes/bulkFill');
const { startCleanupJob } = require('./utils/cleanup');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Serve PDF templates as static files
app.use('/templates', express.static(path.join(__dirname, '../pdf-format')));

// API routes
app.use('/api', pdfRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/bulk', bulkFillRoutes);


// Serve editor page for any session
app.get('/editor', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/editor.html'));
});

// Start cleanup job
startCleanupJob();

// Start server
app.listen(PORT, () => {
    console.log(`🚀 PDF Form Filler running at http://localhost:${PORT}`);
    console.log(`📁 Upload a PDF to get started!`);
});
