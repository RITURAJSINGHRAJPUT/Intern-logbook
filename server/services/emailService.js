const https = require('https');
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
        archive.on('error', reject);
        archive.pipe(output);
        archive.file(filePath, { name: filename });
        archive.finalize();
    });
}

/**
 * Calls the Brevo (Sendinblue) REST API to send an email.
 * Uses Node's built-in https module — no extra package needed.
 */
function brevoRequest(payload, apiKey) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const options = {
            hostname: 'api.brevo.com',
            path: '/v3/smtp/email',
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'accept': 'application/json',
                'api-key': apiKey,
                'content-length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data || '{}'));
                } else {
                    reject(new Error(`Brevo API error ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.write(body);
        req.end();
    });
}

/**
 * Sends a PDF email via Brevo's HTTP API.
 * Works on Render (no outbound SMTP required).
 * Free plan: 300 emails/day, send to any recipient once sender is verified.
 *
 * @param {string} toEmail - Recipient email
 * @param {string} pdfPath - Absolute path to the PDF
 * @param {string} filename - Attachment filename
 */
async function sendPdfEmail(toEmail, pdfPath, filename = 'filled-form.pdf') {
    if (!toEmail) throw new Error('Recipient email address is required');
    if (!fs.existsSync(pdfPath)) throw new Error('PDF file not found');

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error('BREVO_API_KEY environment variable is not set');

    const fromEmail = process.env.EMAIL_FROM || 'sparshnfc@gmail.com';
    const fromName = process.env.EMAIL_FROM_NAME || 'Intern Logbook';

    // File size / compression
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
            if (zipStats.size > MAX_EMAIL_SIZE) {
                fs.unlinkSync(zipPath);
                console.warn(`[Email] Skipped: file too large after compression.`);
                return { success: false, reason: 'File too large' };
            }
            attachPath = zipPath;
            attachFilename = filename.replace(/\.[^.]+$/, '') + '.zip';
            wasCompressed = true;
        } catch (compErr) {
            console.error('[Email] Compression failed:', compErr.message);
            return { success: false, reason: 'Compression failed' };
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

    const fileBuffer = fs.readFileSync(attachPath);
    const fileBase64 = fileBuffer.toString('base64');
    const mimeType = attachFilename.endsWith('.zip') ? 'application/zip' : 'application/pdf';

    const payload = {
        sender: { name: fromName, email: fromEmail },
        to: [{ email: toEmail }],
        subject: 'Your Completed PDF Document',
        htmlContent: `
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
        attachment: [
            {
                name: attachFilename,
                content: fileBase64,
            },
        ],
    };

    try {
        const result = await brevoRequest(payload, apiKey);
        console.log(`Email sent successfully to ${toEmail}. Message ID: ${result.messageId}`);
        if (wasCompressed && attachPath !== pdfPath) fs.unlink(attachPath, () => { });
        return { success: true, messageId: result.messageId };
    } catch (error) {
        if (wasCompressed && attachPath !== pdfPath) fs.unlink(attachPath, () => { });
        console.error('Error sending email:', error.message);
        throw new Error(`Failed to send email: ${error.message}`);
    }
}

module.exports = { sendPdfEmail };
