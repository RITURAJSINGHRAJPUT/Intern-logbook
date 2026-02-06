const fs = require('fs');
const path = require('path');

const TEMP_DIR = path.join(__dirname, '../../temp');
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_AGE = 30 * 60 * 1000; // 30 minutes

/**
 * Clean up old files from temp directory
 */
function cleanupOldFiles() {
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
        return;
    }

    const now = Date.now();
    const files = fs.readdirSync(TEMP_DIR);

    let cleanedCount = 0;

    files.forEach(file => {
        const filePath = path.join(TEMP_DIR, file);

        try {
            const stats = fs.statSync(filePath);
            const age = now - stats.mtimeMs;

            if (age > MAX_AGE) {
                fs.unlinkSync(filePath);
                cleanedCount++;
                console.log(`🧹 Cleaned up: ${file}`);
            }
        } catch (e) {
            console.error(`Error cleaning up ${file}:`, e.message);
        }
    });

    if (cleanedCount > 0) {
        console.log(`✨ Cleaned up ${cleanedCount} old file(s)`);
    }
}

/**
 * Delete specific session files
 */
function deleteSessionFiles(sessionId) {
    if (!fs.existsSync(TEMP_DIR)) return;

    const files = fs.readdirSync(TEMP_DIR);

    files.forEach(file => {
        if (file.startsWith(sessionId)) {
            const filePath = path.join(TEMP_DIR, file);
            try {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Deleted session file: ${file}`);
            } catch (e) {
                console.error(`Error deleting ${file}:`, e.message);
            }
        }
    });
}

/**
 * Start the cleanup job
 */
function startCleanupJob() {
    // Ensure temp directory exists
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // Run cleanup on startup
    cleanupOldFiles();

    // Schedule periodic cleanup
    setInterval(cleanupOldFiles, CLEANUP_INTERVAL);

    console.log('🔄 Cleanup job started (runs every 5 minutes)');
}

module.exports = { startCleanupJob, deleteSessionFiles, cleanupOldFiles };
