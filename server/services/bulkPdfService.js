/**
 * Bulk PDF Service
 * Handles bulk PDF generation from CSV/JSON data
 */

const Papa = require('papaparse');
const archiver = require('archiver');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const { generateFilledPDF } = require('./pdfGenerator');

const TEMPLATES_DIR = path.join(__dirname, '../../pdf-format');
const TEMP_DIR = path.join(__dirname, '../../temp');

// In-memory job storage
const jobs = new Map();

/**
 * Parse data file (CSV or JSON)
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - File MIME type
 * @returns {Object} - { data: Array, headers: Array }
 */
function parseDataFile(buffer, mimeType) {
    const content = buffer.toString('utf-8');

    if (mimeType === 'application/json' || mimeType === 'text/json') {
        return parseJSON(content);
    } else {
        return parseCSV(content);
    }
}

/**
 * Parse CSV content
 */
function parseCSV(content) {
    const result = Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim()
    });

    if (result.errors.length > 0) {
        const errorMessages = result.errors
            .filter(e => e.type === 'Quotes' || e.type === 'FieldMismatch')
            .map(e => `Row ${e.row}: ${e.message}`)
            .slice(0, 5);

        if (errorMessages.length > 0) {
            throw new Error(`CSV parsing errors: ${errorMessages.join('; ')}`);
        }
    }

    return {
        data: result.data,
        headers: result.meta.fields || []
    };
}

/**
 * Parse JSON content
 */
function parseJSON(content) {
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
        throw new Error('JSON must be an array of objects');
    }

    if (parsed.length === 0) {
        throw new Error('JSON array is empty');
    }

    // Extract headers from first object
    const headers = Object.keys(parsed[0]);

    return {
        data: parsed,
        headers
    };
}

/**
 * Calculate string similarity using Levenshtein distance
 */
function stringSimilarity(a, b) {
    a = a.toLowerCase().replace(/[_\-\s]/g, '');
    b = b.toLowerCase().replace(/[_\-\s]/g, '');

    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;

    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }

    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1 : (maxLen - matrix[b.length][a.length]) / maxLen;
}

/**
 * Auto-map data headers to template fields
 * @param {Array} dataHeaders - Headers from CSV/JSON
 * @param {Array} templateFields - Template field definitions
 * @returns {Object} - Mapping { dataHeader: templateFieldName }
 */
function autoMapFields(dataHeaders, templateFields) {
    const mapping = {};
    const usedTemplateFields = new Set();

    for (const header of dataHeaders) {
        let bestMatch = null;
        let bestScore = 0;

        for (const field of templateFields) {
            if (usedTemplateFields.has(field.name)) continue;

            const score = stringSimilarity(header, field.name);

            if (score > bestScore && score >= 0.5) {
                bestScore = score;
                bestMatch = field.name;
            }
        }

        if (bestMatch) {
            mapping[header] = bestMatch;
            usedTemplateFields.add(bestMatch);
        }
    }

    return mapping;
}

/**
 * Get template fields from saved JSON
 * @param {string} templateFilename - Template PDF filename
 * @returns {Array|null} - Field definitions or null
 */
async function getTemplateFields(templateFilename) {
    const fieldsFile = templateFilename.replace('.pdf', '.fields.json');
    const fieldsPath = path.join(TEMPLATES_DIR, fieldsFile);

    try {
        const content = await fs.readFile(fieldsPath, 'utf-8');
        const data = JSON.parse(content);
        return data.fields || [];
    } catch (e) {
        return null;
    }
}

/**
 * Convert checkbox-like values to boolean
 */
function normalizeCheckboxValue(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;

    const str = String(value).toLowerCase().trim();
    return ['true', 'yes', '1', 'checked', 'on', 'x'].includes(str);
}

/**
 * Apply data row to template fields
 * @param {Array} templateFields - Template field definitions
 * @param {Object} dataRow - Data row object
 * @param {Object} fieldMapping - Data header to field name mapping
 * @returns {Array} - Fields with values filled
 */
function applyDataToFields(templateFields, dataRow, fieldMapping) {
    // Create deep copy of fields
    const filledFields = JSON.parse(JSON.stringify(templateFields));

    // Create reverse mapping (field name -> data header)
    const reverseMapping = {};
    for (const [dataKey, fieldName] of Object.entries(fieldMapping)) {
        reverseMapping[fieldName] = dataKey;
    }

    for (const field of filledFields) {
        const dataKey = reverseMapping[field.name];

        if (dataKey && dataRow[dataKey] !== undefined) {
            let value = dataRow[dataKey];

            // Skip empty values - keep template default (important for signature)
            if (value === '' || value === null) continue;

            // Handle checkbox fields
            if (field.type === 'checkbox') {
                value = normalizeCheckboxValue(value);
            }

            // Handle textarea fields - convert separators to newlines
            if (field.type === 'textarea' && typeof value === 'string') {
                // Support || as paragraph separator
                value = value.replace(/\|\|/g, '\n');
                // Support literal \n as newline
                value = value.replace(/\\n/g, '\n');
            }

            field.value = value;
        }
    }

    return filledFields;
}

/**
 * Generate a single filled PDF
 */
async function generateSinglePDF(templatePath, fields, dataRow, fieldMapping) {
    const filledFields = applyDataToFields(fields, dataRow, fieldMapping);
    return await generateFilledPDF(templatePath, filledFields, true);
}

/**
 * Generate bulk PDFs
 * @param {string} jobId - Job identifier
 * @param {string} templateFilename - Template PDF filename
 * @param {Array} dataRows - Array of data objects
 * @param {Object} fieldMapping - Field mapping
 * @param {Object} options - Generation options
 */
async function generateBulkPDFs(jobId, templateFilename, dataRows, fieldMapping, options = {}) {
    const { merge = false, filenameField = null } = options;

    const job = {
        id: jobId,
        status: 'processing',
        total: dataRows.length,
        processed: 0,
        errors: [],
        createdAt: Date.now()
    };
    jobs.set(jobId, job);

    const templatePath = path.join(TEMPLATES_DIR, templateFilename);
    const templateFields = await getTemplateFields(templateFilename);

    if (!templateFields) {
        job.status = 'error';
        job.error = 'Template fields not found';
        return;
    }

    const pdfBuffers = [];
    const pdfNames = [];

    try {
        for (let i = 0; i < dataRows.length; i++) {
            try {
                const pdfBuffer = await generateSinglePDF(
                    templatePath,
                    templateFields,
                    dataRows[i],
                    fieldMapping
                );
                pdfBuffers.push(pdfBuffer);

                // Generate filename
                let filename = `filled_${i + 1}.pdf`;
                if (filenameField && dataRows[i][filenameField]) {
                    const safeName = String(dataRows[i][filenameField])
                        .replace(/[^a-zA-Z0-9_-]/g, '_')
                        .substring(0, 50);
                    filename = `${safeName}.pdf`;
                }
                pdfNames.push(filename);

                job.processed = i + 1;
            } catch (err) {
                job.errors.push({ row: i + 1, error: err.message });
            }
        }

        // Create output
        const outputPath = path.join(TEMP_DIR, `${jobId}_bulk`);

        if (merge) {
            // Merge all PDFs into one
            const mergedBuffer = await mergePDFs(pdfBuffers);
            await fs.writeFile(`${outputPath}.pdf`, mergedBuffer);
            job.outputFile = `${outputPath}.pdf`;
            job.outputType = 'pdf';
        } else {
            // Create ZIP archive
            await createZipArchive(pdfBuffers, pdfNames, `${outputPath}.zip`);
            job.outputFile = `${outputPath}.zip`;
            job.outputType = 'zip';
        }

        job.status = 'completed';
    } catch (err) {
        job.status = 'error';
        job.error = err.message;
    }
}

/**
 * Merge multiple PDFs into one
 */
async function mergePDFs(pdfBuffers) {
    const mergedPdf = await PDFDocument.create();

    for (const buffer of pdfBuffers) {
        const pdfDoc = await PDFDocument.load(buffer);
        const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
        pages.forEach(page => mergedPdf.addPage(page));
    }

    return Buffer.from(await mergedPdf.save());
}

/**
 * Create ZIP archive from PDF buffers
 */
function createZipArchive(pdfBuffers, pdfNames, outputPath) {
    return new Promise((resolve, reject) => {
        const output = fsSync.createWriteStream(outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', resolve);
        archive.on('error', reject);

        archive.pipe(output);

        for (let i = 0; i < pdfBuffers.length; i++) {
            archive.append(pdfBuffers[i], { name: pdfNames[i] });
        }

        archive.finalize();
    });
}

/**
 * Get job status
 */
function getJobStatus(jobId) {
    return jobs.get(jobId);
}

/**
 * Clean up job files
 */
async function cleanupJob(jobId) {
    const job = jobs.get(jobId);
    if (job && job.outputFile) {
        try {
            await fs.unlink(job.outputFile);
        } catch (e) {
            // Ignore cleanup errors
        }
    }
    jobs.delete(jobId);
}

module.exports = {
    parseDataFile,
    autoMapFields,
    getTemplateFields,
    applyDataToFields,
    generateBulkPDFs,
    mergePDFs,
    getJobStatus,
    cleanupJob
};
