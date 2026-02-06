const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

/**
 * Generate filled PDF with user data
 * @param {string} pdfPath - Path to original PDF
 * @param {Array} fields - Array of field data with values
 * @param {boolean} flatten - Whether to flatten the PDF
 * @returns {Promise<Buffer>} - Generated PDF bytes
 */
async function generateFilledPDF(pdfPath, fields, flatten = false) {
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (const field of fields) {
        if (!field.value && field.type !== 'checkbox') continue;

        // Debug logging
        if (field.type === 'textarea') {
            console.log('Processing textarea field:', JSON.stringify(field, null, 2));
        }

        const pageIndex = (field.page || 1) - 1;
        if (pageIndex < 0 || pageIndex >= pages.length) continue;

        const page = pages[pageIndex];
        const { height: pageHeight } = page.getSize();

        // Convert coordinates (PDF origin is bottom-left)
        const x = field.x;
        const y = field.y;

        switch (field.type) {
            case 'text':
            case 'number':
            case 'date':
            case 'day':
                drawTextField(page, field, x, y, helveticaFont);
                break;

            case 'time':
                // Format time to 12-hour AM/PM
                const timeValue = formatTime(field.value);
                drawTextField(page, { ...field, value: timeValue }, x, y, helveticaFont);
                break;

            case 'textarea':
                drawMultilineText(page, field, x, y, helveticaFont);
                break;

            case 'checkbox':
                drawCheckbox(page, field, x, y);
                break;

            case 'signature':
                await drawSignature(pdfDoc, page, field, x, y);
                break;

            case 'dropdown':
                drawTextField(page, field, x, y, helveticaFont);
                break;
        }
    }

    // Flatten if requested (removes form interactivity)
    if (flatten) {
        try {
            const form = pdfDoc.getForm();
            form.flatten();
        } catch (e) {
            // No form to flatten
        }
    }

    const filledPdfBytes = await pdfDoc.save();
    return Buffer.from(filledPdfBytes);
}

/**
 * Draw text field value
 */
function drawTextField(page, field, x, y, font) {
    const fontSize = Math.min(field.height * 0.7, 12);
    const text = String(field.value || '');

    page.drawText(text, {
        x: x + 2,
        y: y + (field.height - fontSize) / 2,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0)
    });
}

/**
 * Convert HTML to plain text with basic formatting
 */
function htmlToText(html) {
    if (!html) return '';

    let text = html;

    // Replace block elements with newlines
    text = text.replace(/<\/p>/g, '\n');
    text = text.replace(/<\/div>/g, '\n');
    text = text.replace(/<br\s*\/?>/g, '\n');
    text = text.replace(/<li>/g, '• ');
    text = text.replace(/<\/li>/g, '\n');
    text = text.replace(/<\/ul>/g, '\n');
    text = text.replace(/<\/ol>/g, '\n');

    // Allow bold/italic/underline but unformatted in PDF (pdf-lib limitation for simple text)
    text = text.replace(/<[^>]*>/g, '');

    // Decode common entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');

    return text.trim();
}

/**
 * Draw multiline text for textarea
 */
function drawMultilineText(page, field, x, y, font) {
    const fontSize = 10;
    const lineHeight = 14;
    const text = htmlToText(String(field.value || ''));

    page.drawText(text, {
        x: x + 2,
        y: y + field.height - fontSize - 2, // Top-aligned
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0),
        maxWidth: field.width - 4,
        lineHeight: lineHeight
    });
}

/**
 * Format time string (HH:mm) to 12-hour format (h:mm AM/PM)
 */
function formatTime(timeStr) {
    if (!timeStr) return '';

    // Check if it's already in AM/PM format
    if (timeStr.toLowerCase().includes('m')) return timeStr;

    const [hours, minutes] = timeStr.split(':');
    if (!hours || !minutes) return timeStr; // Return original if parse fails

    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;

    return `${h12}:${minutes} ${ampm}`;
}

/**
 * Draw checkbox
 */
function drawCheckbox(page, field, x, y) {
    if (field.value === true || field.value === 'true' || field.value === 'checked') {
        const size = Math.min(field.width, field.height);
        const padding = size * 0.2;

        // Draw checkmark
        page.drawLine({
            start: { x: x + padding, y: y + size / 2 },
            end: { x: x + size / 2, y: y + padding },
            thickness: 2,
            color: rgb(0, 0, 0)
        });

        page.drawLine({
            start: { x: x + size / 2, y: y + padding },
            end: { x: x + size - padding, y: y + size - padding },
            thickness: 2,
            color: rgb(0, 0, 0)
        });
    }
}

/**
 * Draw signature from base64 image
 */
async function drawSignature(pdfDoc, page, field, x, y) {
    if (!field.value || !field.value.startsWith('data:image')) return;

    try {
        // Extract base64 data
        const base64Data = field.value.split(',')[1];
        const imageBytes = Buffer.from(base64Data, 'base64');

        // Embed image (try PNG first, then JPEG)
        let image;
        try {
            image = await pdfDoc.embedPng(imageBytes);
        } catch (e) {
            image = await pdfDoc.embedJpg(imageBytes);
        }

        // Scale to fit field
        const scale = Math.min(
            field.width / image.width,
            field.height / image.height
        );

        const scaledWidth = image.width * scale;
        const scaledHeight = image.height * scale;

        page.drawImage(image, {
            x: x + (field.width - scaledWidth) / 2,
            y: y + (field.height - scaledHeight) / 2,
            width: scaledWidth,
            height: scaledHeight
        });
    } catch (e) {
        console.error('Error embedding signature:', e.message);
    }
}

/**
 * Save generated PDF to temp directory
 */
async function saveGeneratedPDF(sessionId, pdfBuffer) {
    const tempDir = path.join(__dirname, '../../temp');
    const filledPath = path.join(tempDir, `${sessionId}_filled.pdf`);
    await fs.writeFile(filledPath, pdfBuffer);
    return filledPath;
}

module.exports = { generateFilledPDF, saveGeneratedPDF };
