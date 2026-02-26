const sgMail = require('@sendgrid/mail');
const fs = require('fs');
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
 * Sends a PDF email via SendGrid's HTTP API.
 * Works on Render (no outbound SMTP required).
 *
 * @param {string} toEmail - Recipient email
 * @param {string} pdfPath - Absolute path to the PDF
 * @param {string} filename - Attachment filename
 */
async function sendPdfEmail(toEmail, pdfPath, filename = 'filled-form.pdf') {
    if (!toEmail) throw new Error('Recipient email address is required');
    if (!fs.existsSync(pdfPath)) throw new Error('PDF file not found');

    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) throw new Error('SENDGRID_API_KEY environment variable is not set');

    sgMail.setApiKey(apiKey);

    // File size check / compression
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
            attachPath = zipPath;
            attachFilename = filename.replace(/\.[^.]+$/, '') + '.zip';
            wasCompressed = true;
        } catch (compErr) {
            console.log('[Email] Compression failed, sending uncompressed.');
        }
    }

    // Read file as base64 for attachment
    const fileBuffer = fs.readFileSync(attachPath);
    const fileBase64 = fileBuffer.toString('base64');
    const mimeType = attachFilename.endsWith('.zip') ? 'application/zip' : 'application/pdf';

    const fromAddress = process.env.EMAIL_FROM || 'sparshnfc@gmail.com';

    const msg = {
        to: toEmail,
        from: fromAddress,
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
        attachments: [
            {
                content: fileBase64,
                filename: attachFilename,
                type: mimeType,
                disposition: 'attachment',
            },
        ],
    };

    try {
        await sgMail.send(msg);
        console.log(`Email sent successfully to ${toEmail}`);
        if (wasCompressed && attachPath !== pdfPath) fs.unlink(attachPath, () => { });
        return { success: true };
    } catch (error) {
        if (wasCompressed && attachPath !== pdfPath) fs.unlink(attachPath, () => { });
        const detail = error.response ? JSON.stringify(error.response.body) : error.message;
        console.error('Error sending email:', detail);
        throw new Error(`Failed to send email: ${detail}`);
    }
}

module.exports = { sendPdfEmail };
