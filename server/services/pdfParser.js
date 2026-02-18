const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;

/**
 * Parse PDF and detect form fields
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<Object>} - Parsed PDF data with fields
 */
async function parsePDF(pdfPath) {
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    const pages = pdfDoc.getPages();
    const pageCount = pages.length;
    const fields = [];

    // Get page dimensions
    const pageInfo = pages.map((page, index) => {
        const { width, height } = page.getSize();
        return { pageNumber: index + 1, width, height };
    });

    // Try to extract existing form fields
    try {
        const form = pdfDoc.getForm();
        const formFields = form.getFields();

        formFields.forEach((field, index) => {
            const name = field.getName();
            const fieldType = getFieldType(field);
            const widgets = field.acroField.getWidgets();

            widgets.forEach((widget) => {
                const rect = widget.getRectangle();
                const pageRef = widget.P();
                let pageIndex = 0;

                // Find page index
                if (pageRef) {
                    pageIndex = pages.findIndex(p => p.ref === pageRef);
                    if (pageIndex === -1) pageIndex = 0;
                }

                fields.push({
                    id: `field_${index}_${fields.length}`,
                    name: name || `Field ${fields.length + 1}`,
                    type: fieldType,
                    page: pageIndex + 1,
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    value: '',
                    required: false,
                    detected: true
                });
            });
        });
    } catch (e) {
        // No form fields or error parsing - will use detection
        console.log('No existing form fields found, using detection');
    }

    // If no fields found, generate suggested fields based on common patterns
    if (fields.length === 0) {
        const suggestedFields = generateSuggestedFields(pageInfo);
        fields.push(...suggestedFields);
    }

    return {
        pageCount,
        pageInfo,
        fields,
        hasExistingForm: fields.some(f => f.detected)
    };
}

/**
 * Get field type from PDF form field
 */
function getFieldType(field) {
    const constructor = field.constructor.name;

    switch (constructor) {
        case 'PDFTextField':
            return 'text';
        case 'PDFCheckBox':
            return 'checkbox';
        case 'PDFRadioGroup':
            return 'radio';
        case 'PDFDropdown':
            return 'dropdown';
        case 'PDFSignature':
            return 'signature';
        default:
            return 'text';
    }
}

/**
 * Generate suggested fields for common form patterns
 */
function generateSuggestedFields(pageInfo) {
    const fields = [];
    const firstPage = pageInfo[0];

    if (!firstPage) return fields;

    const { width, height } = firstPage;
    const margin = 50;
    const fieldHeight = 20;
    const fieldWidth = 200;

    // Common field suggestions for first page
    const commonFields = [
        { name: 'Full Name', type: 'text', yOffset: 0.15 },
        { name: 'Date', type: 'date', yOffset: 0.22 },
        { name: 'Email', type: 'text', yOffset: 0.29 },
        { name: 'Phone', type: 'text', yOffset: 0.36 },
        { name: 'Signature', type: 'signature', yOffset: 0.85 }
    ];

    commonFields.forEach((field, index) => {
        fields.push({
            id: `suggested_${index}`,
            name: field.name,
            type: field.type,
            page: 1,
            x: margin + 100,
            y: height - (height * field.yOffset),
            width: field.type === 'signature' ? 250 : fieldWidth,
            height: field.type === 'signature' ? 50 : fieldHeight,
            value: '',
            required: false,
            detected: false,
            suggested: true
        });
    });

    return fields;
}

module.exports = { parsePDF };
