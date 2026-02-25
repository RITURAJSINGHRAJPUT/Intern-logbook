const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const MAX_EMAIL_SIZE = 18 * 1024 * 1024; // ~18 MB raw = ~25 MB after base64 encoding (Gmail limit)
const COMPRESS_THRESHOLD = 15 * 1024 * 1024; // Compress if over 15 MB

/**
 * Compresses a file into a ZIP archive.
 * @param {string} filePath - Path to the file to compress
 * @param {string} filename - Name for the file inside the ZIP
 * @returns {Promise<string>} - Path to the created ZIP file
 */
function compressToZip(filePath, filename) {
    return new Promise((resolve, reject) => {
        const zipPath = filePath + '.zip';
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } }); // Max compression

        output.on('close', () => resolve(zipPath));
        archive.on('error', (err) => reject(err));

        archive.pipe(output);
        archive.file(filePath, { name: filename });
        archive.finalize();
    });
}

/**
 * Sends an email with the generated PDF attached.
 * If the file is over 20MB, it will be compressed into a ZIP first.
 * If the file (or ZIP) is over 25MB, the email is skipped.
 * 
 * @param {string} toEmail - The recipient's email address
 * @param {string} pdfPath - The absolute path to the generated PDF file
 * @param {string} filename - The name to give the attached file
 * @returns {Promise<Object>} - The result of the send operation
 */
async function sendPdfEmail(toEmail, pdfPath, filename = 'filled-form.pdf') {
    if (!toEmail) {
        throw new Error('Recipient email address is required');
    }

    if (!fs.existsSync(pdfPath)) {
        throw new Error('PDF file not found');
    }

    // Check file size
    const fileStats = fs.statSync(pdfPath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    let attachPath = pdfPath;
    let attachFilename = filename;
    let wasCompressed = false;

    if (fileStats.size > MAX_EMAIL_SIZE) {
        // Try compressing first
        console.log(`[Email] File is ${fileSizeMB}MB, attempting ZIP compression...`);
        try {
            const zipPath = await compressToZip(pdfPath, filename);
            const zipStats = fs.statSync(zipPath);
            const zipSizeMB = (zipStats.size / (1024 * 1024)).toFixed(2);

            if (zipStats.size > MAX_EMAIL_SIZE) {
                // Still too large even after compression — clean up and skip
                fs.unlinkSync(zipPath);
                console.warn(`[Email] Skipped: file is ${fileSizeMB}MB (${zipSizeMB}MB zipped), exceeds 25MB Gmail limit.`);
                return { success: false, reason: 'File too large', sizeMB: fileSizeMB };
            }

            // Use the compressed ZIP instead
            attachPath = zipPath;
            attachFilename = filename.replace(/\.[^.]+$/, '') + '.zip';
            wasCompressed = true;
            console.log(`[Email] Compressed ${fileSizeMB}MB → ${zipSizeMB}MB ZIP`);
        } catch (compErr) {
            console.error('[Email] Compression failed:', compErr.message);
            console.warn(`[Email] Skipped: file is ${fileSizeMB}MB and compression failed.`);
            return { success: false, reason: 'Compression failed', sizeMB: fileSizeMB };
        }
    } else if (fileStats.size > COMPRESS_THRESHOLD) {
        // Between 20-25 MB — compress to be safe (email overhead eats some space)
        console.log(`[Email] File is ${fileSizeMB}MB, compressing to stay under limit...`);
        try {
            const zipPath = await compressToZip(pdfPath, filename);
            const zipStats = fs.statSync(zipPath);
            const zipSizeMB = (zipStats.size / (1024 * 1024)).toFixed(2);
            attachPath = zipPath;
            attachFilename = filename.replace(/\.[^.]+$/, '') + '.zip';
            wasCompressed = true;
            console.log(`[Email] Compressed ${fileSizeMB}MB → ${zipSizeMB}MB ZIP`);
        } catch (compErr) {
            console.log('[Email] Compression failed, sending uncompressed.');
        }
    }

    // Create transporter (reads env vars at call time)
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_FROM || '"Intern Logbook" <noreply@internlogbook.com>',
        to: toEmail,
        subject: 'Your Completed PDF Document',
        text: 'Hello,\n\nYour filled PDF document is attached to this email.\n\nThank you for using our service!',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4a5568;">Your Document is Ready!</h2>
                <p>Hello,</p>
                <p>Your filled PDF document has been generated and is attached to this email.</p>
                ${wasCompressed ? '<p><em>Note: The file was compressed into a ZIP archive to fit email size limits.</em></p>' : ''}
                <p>If you have any questions or need further assistance, please let us know.</p>
                <br/>
                <p style="color: #718096; font-size: 14px;">Thank you for using our service!</p>
            </div>
        `,
        attachments: [
            {
                filename: attachFilename,
                path: attachPath,
            }
        ]
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${toEmail}. Message ID: ${info.messageId}`);

        // Clean up temp ZIP if we created one
        if (wasCompressed && attachPath !== pdfPath) {
            fs.unlink(attachPath, () => { });
        }

        return { success: true, messageId: info.messageId };
    } catch (error) {
        // Clean up temp ZIP on error too
        if (wasCompressed && attachPath !== pdfPath) {
            fs.unlink(attachPath, () => { });
        }
        console.error('Error sending email:', error);
        throw new Error(`Failed to send email: ${error.message}`);
    }
}

module.exports = {
    sendPdfEmail
};
