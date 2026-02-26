const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const MAX_EMAIL_SIZE = 18 * 1024 * 1024;
const COMPRESS_THRESHOLD = 15 * 1024 * 1024;

function compressToZip(filePath, filename) {
    return new Promise((resolve, reject) => {
        const zipPath = filePath + '.zip';
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 6 } });
        output.on('close', () => resolve(zipPath));
        archive.on('error', (err) => reject(err));
        archive.pipe(output);
        archive.file(filePath, { name: filename });
        archive.finalize();
    });
}

/**
 * Creates a nodemailer transporter.
 * Tries port 465 (SSL) first; if SMTP_PORT env var overrides to 587, uses STARTTLS.
 */
function createTransporter() {
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const secure = port === 465; // 465 = implicit SSL, 587 = STARTTLS
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port,
        secure,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
        tls: {
            // Accept self-signed certs and don't fail on certificate hostname mismatches
            rejectUnauthorized: false,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });
}

/**
 * Sends an email with the generated PDF attached.
 *
 * @param {string} toEmail - The recipient's email address
 * @param {string} pdfPath - The absolute path to the generated PDF file
 * @param {string} filename - The name to give the attached file
 * @returns {Promise<Object>}
 */
async function sendPdfEmail(toEmail, pdfPath, filename = 'filled-form.pdf') {
    if (!toEmail) throw new Error('Recipient email address is required');
    if (!fs.existsSync(pdfPath)) throw new Error('PDF file not found');

    const fileStats = fs.statSync(pdfPath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    let attachPath = pdfPath;
    let attachFilename = filename;
    let wasCompressed = false;

    if (fileStats.size > MAX_EMAIL_SIZE) {
        console.log(`[Email] File is ${fileSizeMB}MB, attempting ZIP compression...`);
        try {
            const zipPath = await compressToZip(pdfPath, filename);
            const zipStats = fs.statSync(zipPath);
            const zipSizeMB = (zipStats.size / (1024 * 1024)).toFixed(2);
            if (zipStats.size > MAX_EMAIL_SIZE) {
                fs.unlinkSync(zipPath);
                console.warn(`[Email] Skipped: ${fileSizeMB}MB (${zipSizeMB}MB zipped), too large.`);
                return { success: false, reason: 'File too large', sizeMB: fileSizeMB };
            }
            attachPath = zipPath;
            attachFilename = filename.replace(/\.[^.]+$/, '') + '.zip';
            wasCompressed = true;
            console.log(`[Email] Compressed ${fileSizeMB}MB → ${zipSizeMB}MB ZIP`);
        } catch (compErr) {
            console.error('[Email] Compression failed:', compErr.message);
            return { success: false, reason: 'Compression failed', sizeMB: fileSizeMB };
        }
    } else if (fileStats.size > COMPRESS_THRESHOLD) {
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

    const transporter = createTransporter();

    const mailOptions = {
        from: process.env.EMAIL_FROM || '"Intern Logbook" <noreply@internlogbook.com>',
        to: toEmail,
        subject: 'Your Completed PDF Document',
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
        attachments: [{ filename: attachFilename, path: attachPath }]
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${toEmail}. Message ID: ${info.messageId}`);
        if (wasCompressed && attachPath !== pdfPath) fs.unlink(attachPath, () => { });
        return { success: true, messageId: info.messageId };
    } catch (error) {
        if (wasCompressed && attachPath !== pdfPath) fs.unlink(attachPath, () => { });
        console.error('Error sending email:', error);
        throw new Error(`Failed to send email: ${error.message}`);
    }
}

module.exports = { sendPdfEmail };
