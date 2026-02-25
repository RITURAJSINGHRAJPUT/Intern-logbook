/**
 * Bulk Fill Page Script
 * Handles CSV/JSON upload, field mapping, and bulk PDF generation
 */

import { checkAuth } from './auth.js';

// State
let selectedTemplate = null;
let templateFields = [];
let uploadedData = [];
let dataHeaders = [];
let fieldMapping = {};
let currentJobId = null;
let currentUser = null;
let currentCredits = 0;

// DOM Elements
const templateSelect = document.getElementById('templateSelect');
const templateInfo = document.getElementById('templateInfo');
const dataUploadZone = document.getElementById('dataUploadZone');
const dataFileInput = document.getElementById('dataFileInput');
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
const rowCount = document.getElementById('rowCount');
const dataPreviewTable = document.getElementById('dataPreviewTable');
const mappingRows = document.getElementById('mappingRows');
const previewBtn = document.getElementById('previewBtn');
const previewPanel = document.getElementById('previewPanel');
const previewFrame = document.getElementById('previewFrame');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressStatus = document.getElementById('progressStatus');
const mergeCheckbox = document.getElementById('mergeCheckbox');
const toast = document.getElementById('toast');

// Modal Elements
const creditsModal = document.getElementById('creditsModal');
const modalRequiredCredits = document.getElementById('modalRequiredCredits');
const modalCurrentCredits = document.getElementById('modalCurrentCredits');
const closeCreditsModalBtn = document.getElementById('closeCreditsModalBtn');
const buyCreditsBtn = document.getElementById('buyCreditsBtn');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check auth first
    checkAuth(true);

    // Wait for auth to initialize before loading templates
    // checkAuth executes asynchronously, so we can use window.getCurrentUserId which wraps the promise
    try {
        if (window.getCurrentUserId) {
            currentUser = await window.getCurrentUserId();
            console.log('Bulk Fill - User ID:', currentUser);
            await fetchUserCredits();
        }
    } catch (e) {
        console.error('Error getting user ID:', e);
    }

    await loadTemplates();
    setupEventListeners();
});

/**
 * Fetch and display user's current bulk fill credits
 */
async function fetchUserCredits() {
    try {
        const res = await fetch('/api/bulk/credits', {
            headers: await getAuthHeaders(currentUser)
        });
        const data = await res.json();

        if (res.ok) {
            currentCredits = data.bulkCredits || 0;
            const creditsBadge = document.getElementById('creditsCount');
            if (creditsBadge) {
                creditsBadge.textContent = currentCredits;
                // Add a little pop animation
                creditsBadge.parentElement.classList.add('scale-105', 'shadow-md');
                setTimeout(() => {
                    creditsBadge.parentElement.classList.remove('scale-105', 'shadow-md');
                }, 300);
            }
        }
    } catch (error) {
        console.error('Failed to fetch credits:', error);
    }
}

/**
 * Helper to get authentication headers including JWT token
 */
async function getAuthHeaders(userId, additionalHeaders = {}) {
    const headers = { ...additionalHeaders };
    if (userId) {
        headers['x-user-id'] = userId;
    }
    try {
        if (window.getFirebaseToken) {
            const token = await window.getFirebaseToken();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }
    } catch (e) {
        console.error('Error getting auth token:', e);
    }
    return headers;
}

/**
 * Load available templates
 */
async function loadTemplates() {
    try {
        const userId = currentUser;
        const res = await fetch('/api/bulk/templates', {
            headers: await getAuthHeaders(userId)
        });
        const data = await res.json();

        templateSelect.innerHTML = '<option value="">-- Select a template --</option>';

        if (data.templates.length === 0) {
            templateSelect.innerHTML = '<option value="">No templates with saved fields found</option>';
            templateInfo.textContent = 'Create a template in the editor first and save the field definitions.';
            return;
        }

        data.templates.forEach(t => {
            const option = document.createElement('option');
            option.value = t.filename;
            option.textContent = `${t.name} (${t.fieldCount} fields)`;
            templateSelect.appendChild(option);
        });
    } catch (error) {
        showToast('Failed to load templates', 'error');
        console.error(error);
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Template selection
    templateSelect.addEventListener('change', handleTemplateSelect);

    // File upload
    dataUploadZone.addEventListener('click', () => dataFileInput.click());
    dataFileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    dataUploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dataUploadZone.classList.add('dragover');
    });

    dataUploadZone.addEventListener('dragleave', () => {
        dataUploadZone.classList.remove('dragover');
    });

    dataUploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dataUploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Preview
    previewBtn.addEventListener('click', generatePreview);

    // Generate
    generateBtn.addEventListener('click', startGeneration);

    // Download
    downloadBtn.addEventListener('click', downloadResults);

    // Modal buttons
    if (closeCreditsModalBtn) {
        closeCreditsModalBtn.addEventListener('click', () => {
            creditsModal.classList.add('opacity-0', 'pointer-events-none');
            creditsModal.firstElementChild.classList.remove('scale-100');
            creditsModal.firstElementChild.classList.add('scale-95');
        });
    }

    if (buyCreditsBtn) {
        buyCreditsBtn.addEventListener('click', () => {
            window.location.href = '/Buy-Credits.html';
        });
    }
}

/**
 * Handle template selection
 */
async function handleTemplateSelect() {
    const filename = templateSelect.value;

    if (!filename) {
        selectedTemplate = null;
        templateFields = [];
        templateInfo.textContent = 'Choose a template with saved field definitions';
        setStepEnabled(2, false);
        return;
    }

    try {
        const userId = currentUser;
        const res = await fetch(`/api/bulk/template/${encodeURIComponent(filename)}/fields`, {
            headers: await getAuthHeaders(userId)
        });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Failed to load template fields');
        }

        selectedTemplate = filename;
        templateFields = data.fields;
        templateInfo.textContent = `${templateFields.length} fillable fields available`;

        setStepEnabled(2, true);

        // If data already uploaded, re-map
        if (dataHeaders.length > 0) {
            await autoMapAndDisplay();
        }
    } catch (error) {
        showToast(error.message, 'error');
        console.error(error);
    }
}

/**
 * Handle file selection
 */
function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
}

/**
 * Handle uploaded file
 */
async function handleFile(file) {
    const validTypes = ['text/csv', 'application/json', 'text/json', 'application/vnd.ms-excel', 'text/plain'];
    const isValid = validTypes.includes(file.type) ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.json');

    if (!isValid) {
        showToast('Please upload a CSV or JSON file', 'error');
        return;
    }

    const formData = new FormData();
    formData.append('dataFile', file);

    try {
        const res = await fetch('/api/bulk/upload-data', {
            method: 'POST',
            headers: await getAuthHeaders(currentUser),
            body: formData
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Failed to parse file');
        }

        // Store full server-parsed data directly (ensures consistent header keys with fieldMapping)
        uploadedData = data.data || data.preview || [];
        dataHeaders = data.headers || [];
        console.log('Using server-parsed data. Headers:', dataHeaders, 'Rows:', uploadedData.length);

        // Update UI
        dataUploadZone.classList.add('has-file');
        fileName.textContent = file.name;
        rowCount.textContent = `${data.rowCount} rows`;

        // Show preview table
        displayDataPreview(data.headers, data.preview);
        filePreview.classList.remove('hidden');

        // Auto-map fields
        await autoMapAndDisplay();

    } catch (error) {
        showToast(error.message, 'error');
        console.error(error);
    }
}

/**
 * Parse CSV line handling quoted values
 */
function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"' && !inQuotes) {
            inQuotes = true;
        } else if (char === '"' && inQuotes) {
            if (line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = false;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

/**
 * Display data preview table
 */
function displayDataPreview(headers, rows) {
    const thead = dataPreviewTable.querySelector('thead');
    const tbody = dataPreviewTable.querySelector('tbody');

    thead.innerHTML = '<tr>' + headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr>';
    tbody.innerHTML = rows.map(row =>
        '<tr>' + headers.map(h => `<td>${escapeHtml(String(row[h] || ''))}</td>`).join('') + '</tr>'
    ).join('');
}

/**
 * Auto-map fields and display mapping UI
 */
async function autoMapAndDisplay() {
    if (!selectedTemplate || dataHeaders.length === 0) return;

    try {
        const userId = window.getCurrentUserId ? await window.getCurrentUserId() : null;
        const res = await fetch('/api/bulk/auto-map', {
            method: 'POST',
            headers: await getAuthHeaders(userId, {
                'Content-Type': 'application/json'
            }),
            body: JSON.stringify({
                templateFilename: selectedTemplate,
                dataHeaders: dataHeaders
            })
        });

        const data = await res.json();
        fieldMapping = data.mapping || {};

        displayMappingUI();
        setStepEnabled(3, true);
        setStepEnabled(4, true);
        setStepEnabled(5, true);

    } catch (error) {
        console.error('Auto-map error:', error);
        // Still show mapping UI with empty mappings
        displayMappingUI();
        setStepEnabled(3, true);
    }
}

/**
 * Display field mapping UI
 */
function displayMappingUI() {
    mappingRows.innerHTML = '';

    dataHeaders.forEach(header => {
        const row = document.createElement('div');
        row.className = 'mapping-row bg-white rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between border-2 border-slate-100 shadow-sm gap-3';

        const mappedField = fieldMapping[header] || '';
        const selectOptions = templateFields.map(f =>
            `<option value="${escapeHtml(f.name)}" ${f.name === mappedField ? 'selected' : ''}>${escapeHtml(f.name)} (${f.type})</option>`
        ).join('');

        row.innerHTML = `
            <div><span class="data-key font-bold text-slate-700 flex items-center gap-2" style="word-break: break-all;">${escapeHtml(header)}</span></div>
            <div class="mapping-arrow material-symbols-outlined text-slate-300 hidden md:block">west</div>
            <div>
                <select class="mapping-select flex-1 w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2 font-bold text-slate-600 focus:border-vibrant-turquoise focus:ring-0 transition-colors ${mappedField ? 'mapped border-vibrant-turquoise bg-soft-turquoise/20 text-vibrant-turquoise' : ''}" data-header="${escapeHtml(header)}">
                    <option value="">-- Not mapped --</option>
                    ${selectOptions}
                </select>
            </div>
        `;

        mappingRows.appendChild(row);
    });

    // Add change listeners to update mapping
    mappingRows.querySelectorAll('.mapping-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const header = e.target.dataset.header;
            if (e.target.value) {
                fieldMapping[header] = e.target.value;
                e.target.classList.add('mapped', 'border-vibrant-turquoise', 'text-vibrant-turquoise');
                e.target.classList.remove('bg-slate-50');
                e.target.style.backgroundColor = 'rgba(224, 247, 250, 0.2)'; // bg-soft-turquoise/20
            } else {
                delete fieldMapping[header];
                e.target.classList.remove('mapped', 'border-vibrant-turquoise', 'text-vibrant-turquoise');
                e.target.classList.add('bg-slate-50');
                e.target.style.backgroundColor = '';
            }
        });
    });
}

/**
 * Generate preview for first record
 */
async function generatePreview() {
    if (!selectedTemplate || uploadedData.length === 0) {
        showToast('Please select a template and upload data first', 'error');
        return;
    }

    if (Object.keys(fieldMapping).length === 0) {
        showToast('Please map at least one field', 'error');
        return;
    }

    previewBtn.disabled = true;
    previewBtn.textContent = 'Generating...';

    try {
        const userId = window.getCurrentUserId ? await window.getCurrentUserId() : null;
        const res = await fetch(`/api/bulk/preview/${encodeURIComponent(selectedTemplate)}`, {
            method: 'POST',
            headers: await getAuthHeaders(userId, {
                'Content-Type': 'application/json'
            }),
            body: JSON.stringify({
                dataRow: uploadedData[0],
                fieldMapping: fieldMapping
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Failed to generate preview');
        }

        previewFrame.src = data.previewUrl;
        previewPanel.classList.remove('hidden');
        showToast('Preview generated successfully', 'success');

    } catch (error) {
        showToast(error.message, 'error');
        console.error(error);
    } finally {
        previewBtn.disabled = false;
        previewBtn.innerHTML = `
            <span class="material-symbols-outlined">visibility</span>
            Generate Preview
        `;
    }
}

/**
 * Start bulk generation
 */
async function startGeneration() {
    if (!selectedTemplate || uploadedData.length === 0) {
        showToast('Please select a template and upload data first', 'error');
        return;
    }

    if (Object.keys(fieldMapping).length === 0) {
        showToast('Please map at least one field', 'error');
        return;
    }

    const requiredCredits = uploadedData.length;
    if (requiredCredits > currentCredits) {
        if (modalRequiredCredits) modalRequiredCredits.textContent = requiredCredits;
        if (modalCurrentCredits) modalCurrentCredits.textContent = currentCredits;
        if (creditsModal) {
            creditsModal.classList.remove('opacity-0', 'pointer-events-none');
            creditsModal.firstElementChild.classList.remove('scale-95');
            creditsModal.firstElementChild.classList.add('scale-100');
        } else {
            showToast(`Insufficient Credits! You need ${requiredCredits} but only have ${currentCredits}.`, 'error');
        }
        return;
    }

    generateBtn.disabled = true;
    downloadBtn.classList.add('hidden');
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    progressStatus.textContent = 'Starting generation...';

    try {
        const userId = window.getCurrentUserId ? await window.getCurrentUserId() : null;
        const res = await fetch(`/api/bulk/generate/${encodeURIComponent(selectedTemplate)}`, {
            method: 'POST',
            headers: await getAuthHeaders(userId, {
                'Content-Type': 'application/json'
            }),
            body: JSON.stringify({
                data: uploadedData,
                fieldMapping: fieldMapping,
                options: {
                    merge: mergeCheckbox.checked
                }
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Failed to start generation');
        }

        currentJobId = data.jobId;
        pollJobStatus();

    } catch (error) {
        showToast(error.message, 'error');
        console.error(error);
        generateBtn.disabled = false;
        progressContainer.classList.add('hidden');
    }
}

/**
 * Poll job status
 */
async function pollJobStatus() {
    try {
        const res = await fetch(`/api/bulk/status/${currentJobId}`, {
            headers: await getAuthHeaders(currentUser)
        });
        const job = await res.json();

        if (!res.ok) {
            throw new Error(job.error || 'Failed to get job status');
        }

        const percent = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
        progressBar.style.width = `${percent}%`;
        progressBar.textContent = `${percent}%`;
        progressStatus.textContent = `Processing ${job.processed} of ${job.total}...`;

        if (job.status === 'completed') {
            progressBar.style.width = '100%';
            progressBar.textContent = '100%';
            progressStatus.textContent = `Complete! Generated ${job.processed} PDFs.`;

            if (job.errors && job.errors.length > 0) {
                progressStatus.textContent += ` (${job.errors.length} errors)`;
            }

            downloadBtn.classList.remove('hidden');
            generateBtn.disabled = false;

            // Refresh credit count
            await fetchUserCredits();

            showToast('Bulk generation complete!', 'success');

        } else if (job.status === 'error') {
            throw new Error(job.error || 'Generation failed');

        } else {
            // Still processing
            setTimeout(pollJobStatus, 500);
        }

    } catch (error) {
        showToast(error.message, 'error');
        console.error(error);
        generateBtn.disabled = false;
        progressContainer.classList.add('hidden');
    }
}

/**
 * Download results
 */
function downloadResults() {
    if (!currentJobId) return;
    window.location.href = `/api/bulk/download/${currentJobId}`;
}



/**
 * Set step enabled/disabled
 */
function setStepEnabled(stepNum, enabled) {
    const step = document.getElementById(`step${stepNum}`);
    if (step) {
        if (enabled) {
            step.classList.remove('disabled');
        } else {
            step.classList.add('disabled');
        }
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast show ${type}`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
