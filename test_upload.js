const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Create a dummy PDF if none exists
const dummyPdfPath = path.join(__dirname, 'dummy.pdf');
if (!fs.existsSync(dummyPdfPath)) {
    // Just a tiny blank PDF stream
    fs.writeFileSync(dummyPdfPath, Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000213 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n264\n%%EOF'));
}

(async () => {
    console.log('Starting diagnostic test...');
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
    page.on('pageerror', error => console.error('BROWSER ERROR:', error.message));
    page.on('requestfailed', request => {
        const errText = request.failure() ? request.failure().errorText : 'Unknown';
        console.error(`NETWORK ERROR: ${request.url()} - ${errText}`);
    });

    try {
        console.log('Navigating to app.html...');
        await page.goto('http://localhost:3000/app.html', { waitUntil: 'networkidle0' });

        console.log('Waiting for elements...');
        await page.waitForSelector('#fileInput');

        console.log('Uploading PDF...');
        const fileInput = await page.$('#fileInput');
        await fileInput.uploadFile(dummyPdfPath);

        console.log('Waiting 5s for navigation or errors...');
        await new Promise(r => setTimeout(r, 5000));

        console.log('Current URL:', page.url());

        // Let's also test the editor direct load if the upload failed
        if (page.url().includes('app.html')) {
            console.log('Upload seems to have failed to navigate.');
        } else {
            console.log('Navigate success. Checking editor canvas...');
            const hasCanvas = await page.$('canvas#pdfCanvas');
            console.log('Canvas found:', !!hasCanvas);
        }

    } catch (err) {
        console.error('TEST ERROR:', err.message);
    } finally {
        await browser.close();
        if (fs.existsSync(dummyPdfPath)) {
            fs.unlinkSync(dummyPdfPath);
        }
    }
})();
