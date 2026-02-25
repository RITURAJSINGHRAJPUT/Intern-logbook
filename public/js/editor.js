/**
 * Editor page main script
 */

// Store template filename for saving
let currentTemplateFilename = null;

// Page instance tracking - stores field values for each copy
let pageInstances = [];
let currentInstanceIndex = 0;
let templateFields = []; // Store the template field definitions

document.addEventListener('DOMContentLoaded', async () => {
    // Get session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    const templateFile = urlParams.get('template');
    const isAdminMode = urlParams.get('adminMode') === 'true';
    const isUserTemplate = urlParams.get('isUserTemplate') !== 'false'; // Default to true if missing (uploaded file)

    // A template is read-only if it's not an admin mode AND it's not the user's template
    const isReadOnly = !isAdminMode && !isUserTemplate;

    // Store template filename if provided
    if (templateFile) {
        currentTemplateFilename = decodeURIComponent(templateFile);
    }

    if (!sessionId && !isAdminMode) {
        showToast('No session found. Please upload a PDF first.', 'error');
        setTimeout(() => {
            window.location.href = '/app.html';
        }, 2000);
        return;
    }

    if (isAdminMode && !templateFile) {
        showToast('No template specified to edit.', 'error');
        setTimeout(() => {
            window.location.href = '/templates.html';
        }, 2000);
        return;
    }

    // Initialize components
    showLoading('Loading PDF...');

    try {
        if (sessionId) {
            // Verify session exists
            const sessionRes = await fetch(`/api/session/${sessionId}`);
            if (!sessionRes.ok) {
                throw new Error('Session expired or not found');
            }
        }

        // Initialize PDF Viewer
        window.pdfViewer = new PDFViewer('pdfViewer', 'pdfCanvas');
        if (sessionId) {
            await window.pdfViewer.loadPDF(`/api/pdf/${sessionId}`);
        } else {
            await window.pdfViewer.loadPDF(`/templates/${encodeURIComponent(currentTemplateFilename)}`);
        }

        // Initialize Field Manager
        window.fieldManager = new FieldManager('fieldsOverlay', window.pdfViewer);

        // Apply read-only UI changes if necessary
        if (isReadOnly) {
            // Hide left sidebar (field types)
            const leftSidebar = document.querySelector('.w-80.border-r');
            if (leftSidebar) leftSidebar.style.display = 'none';

            // Hide Save Template button
            const saveBtn = document.getElementById('saveTemplateBtn');
            if (saveBtn) saveBtn.style.display = 'none';

            // Pass read-only flag to field manager
            window.fieldManager.setReadOnly(true);

            showToast('Viewing admin template. You can fill it out, but cannot change the fields.', 'info');
        }

        // Try to load saved template fields first (if this is a template PDF)
        let fieldsLoaded = false;
        if (currentTemplateFilename) {
            try {
                const userId = window.getCurrentUserId ? await window.getCurrentUserId() : null;
                const templateFieldsRes = await fetch(`/api/templates/${encodeURIComponent(currentTemplateFilename)}/fields`, {
                    headers: { 'x-user-id': 'admin' } // we can just pass an empty one or dummy since it hits global fallback anyway
                });
                if (templateFieldsRes.ok) {
                    const templateData = await templateFieldsRes.json();
                    if (templateData.saved && templateData.fields.length > 0) {
                        // Store template field definitions
                        templateFields = JSON.parse(JSON.stringify(templateData.fields));
                        window.fieldManager.setFields(templateData.fields);
                        fieldsLoaded = true;
                        showToast('Loaded saved template fields!', 'success');

                        // Initialize first page instance
                        pageInstances = [{ fields: JSON.parse(JSON.stringify(templateData.fields)) }];
                        currentInstanceIndex = 0;
                    }
                }
            } catch (e) {
                console.log('No saved template fields found');
            }
        }

        // If no template fields, try to load detected fields
        if (!fieldsLoaded && sessionId) {
            const fieldsRes = await fetch(`/api/fields/${sessionId}`);
            if (fieldsRes.ok) {
                const data = await fieldsRes.json();
                window.fieldManager.setFields(data.fields || []);
                templateFields = JSON.parse(JSON.stringify(data.fields || []));
                pageInstances = [{ fields: JSON.parse(JSON.stringify(data.fields || [])) }];
            }
        }

        // Set up field manager callbacks
        window.fieldManager.onFieldSelect = (field) => {
            updateFieldProperties(field);

            // Update sidebar selection
            document.querySelectorAll('.field-item').forEach(item => {
                item.classList.toggle('active', item.dataset.fieldId === field?.id);
            });
        };

        window.fieldManager.onFieldUpdate = (fields) => {
            updateFieldsList(fields, window.pdfViewer.currentPage);
            // Update the current instance with new field data
            if (pageInstances[currentInstanceIndex]) {
                pageInstances[currentInstanceIndex].fields = JSON.parse(JSON.stringify(fields));
            }
        };

        // Update UI
        updatePageInfo();
        updateZoomLevel();
        updateFieldsList(window.fieldManager.fields, 1);

        // Initial status update
        setTimeout(updateStatusDisplay, 100);

        hideLoading();
        if (!fieldsLoaded) {
            showToast('PDF loaded successfully!', 'success');
        }

        // Notify if multi-page
        const pageInfo = window.pdfViewer.getCurrentPageInfo();
        if (pageInfo.totalPages > 1) {
            setTimeout(() => {
                showToast(`Document has ${pageInfo.totalPages} pages. Use arrows to navigate.`, 'info');
            }, 500);
        }

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                document.getElementById('nextPage')?.click();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                document.getElementById('prevPage')?.click();
            }
        });

    } catch (error) {
        console.error('Error loading editor:', error);
        hideLoading();
        showToast(error.message || 'Failed to load PDF', 'error');

        setTimeout(() => {
            window.location.href = '/app.html';
        }, 3000);
        return;
    }

    // Set up toolbar controls
    setupToolbarControls();

    // Set up field type buttons
    setupFieldButtons();

    // Set up signature modal
    setupSignatureModal();

    // Set up download button
    setupDownloadButton(sessionId);

    // Set up save template button
    setupSaveTemplateButton();

    // Set up add page button
    setupAddPageButton();

    // Set up download CSV button
    setupDownloadCsvButton();
});

/**
 * Add a new page instance (copy of the template)
 */
function addPageInstance() {
    // Save current instance fields
    if (window.fieldManager && pageInstances[currentInstanceIndex]) {
        pageInstances[currentInstanceIndex].fields = JSON.parse(JSON.stringify(window.fieldManager.getFields()));
    }

    // Create new instance with fresh template fields (no values)
    const newFields = templateFields.map(field => ({
        ...JSON.parse(JSON.stringify(field)),
        value: field.type === 'checkbox' ? false : ''
    }));

    pageInstances.push({ fields: newFields });

    // Navigate to new instance
    goToInstance(pageInstances.length - 1);

    // Go to first page
    window.pdfViewer.goToPage(1);

    showToast(`Added page copy ${pageInstances.length}. Fill in the fields!`, 'success');
}

/**
 * Navigate to a specific page instance
 */
function goToInstance(index) {
    if (index < 0 || index >= pageInstances.length) return;

    // Save current instance fields
    if (window.fieldManager && pageInstances[currentInstanceIndex]) {
        pageInstances[currentInstanceIndex].fields = JSON.parse(JSON.stringify(window.fieldManager.getFields()));
    }

    // Switch to new instance
    currentInstanceIndex = index;

    // Load instance fields
    if (pageInstances[currentInstanceIndex]) {
        window.fieldManager.setFields(pageInstances[currentInstanceIndex].fields);
        window.fieldManager.renderFields();
    }

    updateInstanceIndicator();
    updateFieldsList(window.fieldManager?.fields || [], window.pdfViewer?.currentPage || 1);

    // Reset to first page when switching instances (unless we handled it in navigation)
    // Actually, let's not force it here to allow flexibility, but navigation handlers should handle it.
    // However, if called from "Add Page", we definitely want to see Page 1.
    // Let's rely on the caller to set the page if needed, or updateStatusDisplay to show correct info.
    updateStatusDisplay();
}

/**
 * Update the instance indicator in the toolbar
 */
function updateInstanceIndicator() {
    document.getElementById('currentPage').textContent = currentInstanceIndex + 1;
    document.getElementById('totalPages').textContent = pageInstances.length;
}

/**
 * Get all fields from all instances for download
 */
function getAllInstanceFields() {
    // Save current instance first
    if (window.fieldManager && pageInstances[currentInstanceIndex]) {
        pageInstances[currentInstanceIndex].fields = JSON.parse(JSON.stringify(window.fieldManager.getFields()));
    }

    return pageInstances.map((instance, index) => ({
        instanceIndex: index,
        fields: instance.fields
    }));
}

/**
 * Set up Add Page button
 */
function setupAddPageButton() {
    const addPageBtn = document.getElementById('addPageBtn');

    addPageBtn?.addEventListener('click', () => {
        addPageInstance();
    });
}

/**
 * Set up toolbar controls
 */
function setupToolbarControls() {
    // Zoom controls
    document.getElementById('zoomIn')?.addEventListener('click', async () => {
        await window.pdfViewer.zoomIn();
        updateZoomLevel();
    });

    document.getElementById('zoomOut')?.addEventListener('click', async () => {
        await window.pdfViewer.zoomOut();
        updateZoomLevel();
    });

    // Page navigation (combined PDF pages and instances)
    document.getElementById('prevPage')?.addEventListener('click', () => {
        const pageInfo = window.pdfViewer.getCurrentPageInfo();

        // 1. Try to go to previous PDF page
        if (pageInfo.currentPage > 1) {
            window.pdfViewer.prevPage();
            updateStatusDisplay();
            return;
        }

        // 2. If at first page, try to go to previous instance
        if (currentInstanceIndex > 0) {
            goToInstance(currentInstanceIndex - 1);
            // Go to last page of previous instance
            const newInfo = window.pdfViewer.getCurrentPageInfo();
            window.pdfViewer.goToPage(newInfo.totalPages);
            updateStatusDisplay();
        }
    });

    document.getElementById('nextPage')?.addEventListener('click', () => {
        const pageInfo = window.pdfViewer.getCurrentPageInfo();

        // 1. Try to go to next PDF page
        if (pageInfo.currentPage < pageInfo.totalPages) {
            window.pdfViewer.nextPage();
            updateStatusDisplay();
            return;
        }

        // 2. If at last page, try to go to next instance
        if (currentInstanceIndex < pageInstances.length - 1) {
            goToInstance(currentInstanceIndex + 1);
            // Go to first page of next instance
            window.pdfViewer.goToPage(1);
            updateStatusDisplay();
        }
    });
}

/**
 * Update the status display (Page X/Y or Form A - Page X/Y)
 */
function updateStatusDisplay() {
    const pageInfo = window.pdfViewer?.getCurrentPageInfo();
    const currentPageSpan = document.getElementById('currentPage');
    const totalPagesSpan = document.getElementById('totalPages');

    if (!pageInfo || !currentPageSpan || !totalPagesSpan) return;

    if (pageInstances.length > 1) {
        // Show "Form X/N - Page Y/M"
        currentPageSpan.textContent = `${currentInstanceIndex + 1} (Pg ${pageInfo.currentPage}`;
        totalPagesSpan.textContent = `${pageInstances.length} / ${pageInfo.totalPages})`;

        // Hacky way to fit longer text, or we update the DOM structure
        // Let's just update the text content directly if possible
        const container = document.querySelector('.page-info');
        if (container) {
            container.textContent = `Form ${currentInstanceIndex + 1}/${pageInstances.length} • Page ${pageInfo.currentPage}/${pageInfo.totalPages}`;
        }
    } else {
        // Show standard "Page Y / M"
        // Reset container content if we messed with it
        const container = document.querySelector('.page-info');
        if (container && !container.querySelector('#currentPage')) {
            container.innerHTML = '<span id="currentPage">1</span> / <span id="totalPages">1</span>';
        }

        document.getElementById('currentPage').textContent = pageInfo.currentPage;
        document.getElementById('totalPages').textContent = pageInfo.totalPages;
    }
}

/**
 * Set up field type buttons
 */
function setupFieldButtons() {
    document.querySelectorAll('.field-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;

            // Toggle active state
            document.querySelectorAll('.field-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Start adding field
            window.fieldManager?.startAddingField(type);
            showToast(`Click on the PDF to add a ${type} field`, 'info');
        });
    });

    // Cancel adding on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            window.fieldManager?.cancelAddingField();
            document.querySelectorAll('.field-btn').forEach(b => b.classList.remove('active'));
        }
    });
}

/**
 * Set up signature modal
 */
function setupSignatureModal() {
    const modal = document.getElementById('signatureModal');
    const closeBtn = document.getElementById('closeSignature');
    const clearBtn = document.getElementById('clearSignature');
    const saveBtn = document.getElementById('saveSignature');
    const overlay = modal?.querySelector('.modal-overlay');

    // Upload elements
    const uploadZone = document.getElementById('signatureUploadZone');
    const fileInput = document.getElementById('signatureFileInput');
    const previewContainer = document.getElementById('signaturePreview');
    const previewImg = document.getElementById('signaturePreviewImg');
    const removeBtn = document.getElementById('removeSignatureImage');

    // Track uploaded image
    let uploadedImageDataUrl = null;

    // Upload zone click
    uploadZone?.addEventListener('click', () => fileInput?.click());

    // File input change
    fileInput?.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleSignatureFile(e.target.files[0]);
        }
    });

    // Drag and drop
    uploadZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone?.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleSignatureFile(e.dataTransfer.files[0]);
        }
    });

    // Handle file
    function handleSignatureFile(file) {
        if (!file.type.startsWith('image/')) {
            showToast('Please upload an image file (PNG, JPG, etc.)', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImageDataUrl = e.target.result;
            previewImg.src = uploadedImageDataUrl;
            uploadZone.classList.add('hidden');
            previewContainer.classList.remove('hidden');
            showToast('Image loaded! Click Save to apply.', 'success');
        };
        reader.readAsDataURL(file);
    }

    // Remove uploaded image
    removeBtn?.addEventListener('click', () => {
        clearSignatureImage();
    });

    closeBtn?.addEventListener('click', () => hideModal('signatureModal'));
    overlay?.addEventListener('click', () => hideModal('signatureModal'));

    clearBtn?.addEventListener('click', () => {
        clearSignatureImage();
    });

    function clearSignatureImage() {
        uploadedImageDataUrl = null;
        if (previewImg) previewImg.src = '';
        if (previewContainer) previewContainer.classList.add('hidden');
        if (uploadZone) uploadZone.classList.remove('hidden');
        if (fileInput) fileInput.value = '';
    }

    saveBtn?.addEventListener('click', () => {
        if (!uploadedImageDataUrl) {
            showToast('Please upload an image first', 'error');
            return;
        }

        window.fieldManager?.saveSignature(uploadedImageDataUrl);
        hideModal('signatureModal');
        showToast('Signature saved!', 'success');

        // Reset for next time
        clearSignatureImage();
    });
}

/**
 * Set up download button
 */
function setupDownloadButton(sessionId) {
    const downloadBtn = document.getElementById('downloadBtn');
    const flattenCheckbox = document.getElementById('flattenCheckbox');

    const urlParams = new URLSearchParams(window.location.search);
    const isAdminMode = urlParams.get('adminMode') === 'true';

    if (isAdminMode && downloadBtn) {
        downloadBtn.style.display = 'none';
        return;
    }

    downloadBtn?.addEventListener('click', async () => {
        showLoading('Generating PDF...');

        try {
            // Get all page instances with their fields
            const allInstances = getAllInstanceFields();
            const flatten = flattenCheckbox?.checked || false;

            // Determine if single or multiple instances
            const isSingleInstance = allInstances.length === 1;

            // Generate PDF
            const generateRes = await fetch(`/api/generate/${sessionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fields: isSingleInstance ? allInstances[0].fields : null,
                    instances: isSingleInstance ? null : allInstances,
                    flatten
                })
            });

            if (!generateRes.ok) {
                throw new Error('Failed to generate PDF');
            }

            // Download the file
            window.location.href = `/api/download/${sessionId}`;

            hideLoading();
            const pageWord = allInstances.length > 1 ? `${allInstances.length} pages` : 'PDF';
            showToast(`${pageWord} downloaded! Starting new session...`, 'success');

            // Redirect to home after a delay
            setTimeout(() => {
                window.location.href = '/app.html';
            }, 3000);

        } catch (error) {
            console.error('Download error:', error);
            hideLoading();
            showToast('Failed to download PDF. Please try again.', 'error');
        }
    });
}

/**
 * Update page info display
 */
function updatePageInfo() {
    const info = window.pdfViewer?.getCurrentPageInfo();
    if (info) {
        document.getElementById('currentPage').textContent = info.currentPage;
        document.getElementById('totalPages').textContent = info.totalPages;
    }
}

/**
 * Update zoom level display
 */
function updateZoomLevel() {
    const info = window.pdfViewer?.getCurrentPageInfo();
    if (info) {
        document.getElementById('zoomLevel').textContent = `${Math.round(info.scale * 100)}%`;
    }
}

/**
 * Set up save template button
 */
function setupSaveTemplateButton() {
    const saveBtn = document.getElementById('saveTemplateBtn');

    if (!saveBtn) return;

    // Show/hide button based on whether this is a template
    if (!currentTemplateFilename) {
        saveBtn.style.display = 'none';
        return;
    }

    saveBtn.addEventListener('click', async () => {
        try {
            const fields = window.fieldManager?.getFields() || [];

            if (fields.length === 0) {
                showToast('No fields to save. Add some fields first!', 'error');
                return;
            }

            const urlParams = new URLSearchParams(window.location.search);
            const isAdminMode = urlParams.get('adminMode') === 'true';

            // For admin mode, save directly without naming prompt
            if (isAdminMode) {
                await saveTemplateToServer(fields, currentTemplateFilename, true);
                return;
            }

            // For regular users, show naming prompt
            const defaultName = currentTemplateFilename.replace('.pdf', '').replace(/[_-]/g, ' ');
            showTemplateNamePrompt(defaultName, async (templateName) => {
                if (!templateName) return;
                // Sanitize name: replace spaces/special chars with underscores, add .pdf
                const sanitizedName = templateName.trim().replace(/[^a-zA-Z0-9\s\-_.]/g, '').replace(/\s+/g, '_');
                const finalFilename = sanitizedName.endsWith('.pdf') ? sanitizedName : sanitizedName + '.pdf';
                await saveTemplateToServer(fields, finalFilename, false);
            });

        } catch (error) {
            console.error('Save template error:', error);
            hideLoading();
            showToast('Failed to save template. Please try again.', 'error');
        }
    });
}

/**
 * Show a styled template naming prompt
 */
function showTemplateNamePrompt(defaultName, callback) {
    // Remove existing prompt if any
    const existing = document.getElementById('templateNameOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'templateNameOverlay';
    overlay.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    overlay.innerHTML = `
        <div class="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl border-2 border-slate-100 transform scale-100 transition-transform">
            <div class="flex items-center gap-3 mb-6">
                <div class="w-12 h-12 bg-vibrant-turquoise rounded-2xl flex items-center justify-center rotate-3 shadow-lg">
                    <span class="material-symbols-outlined text-white text-2xl">save</span>
                </div>
                <div>
                    <h3 class="text-xl font-bold text-slate-800">Save Template</h3>
                    <p class="text-sm text-slate-400">Give your template a friendly name</p>
                </div>
            </div>
            <input type="text" id="templateNameInput" value="${defaultName}"
                class="w-full bg-slate-50 border-2 border-slate-200 outline-none text-slate-700 font-bold px-4 py-3 rounded-xl focus:border-vibrant-turquoise transition-all text-lg mb-6"
                placeholder="E.g. Daily Internship Report" autofocus>
            <div class="flex justify-end gap-3">
                <button id="templateNameCancel"
                    class="px-5 py-2.5 rounded-full font-bold text-slate-500 hover:bg-slate-100 transition-all">Cancel</button>
                <button id="templateNameSave"
                    class="bg-vibrant-turquoise text-white px-6 py-2.5 rounded-full font-bold shadow-[0_4px_0_0_#00ACC1] hover:translate-y-0.5 hover:shadow-[0_2px_0_0_#00ACC1] transition-all flex items-center gap-2">
                    <span class="material-symbols-outlined text-lg">save</span> Save
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById('templateNameInput');
    input.select();

    // Enter to save
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            overlay.remove();
            callback(input.value);
        } else if (e.key === 'Escape') {
            overlay.remove();
        }
    });

    document.getElementById('templateNameCancel').addEventListener('click', () => {
        overlay.remove();
    });

    document.getElementById('templateNameSave').addEventListener('click', () => {
        overlay.remove();
        callback(input.value);
    });

    // Click outside to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

/**
 * Save template fields (and PDF) to the server
 */
async function saveTemplateToServer(fields, filename, isAdminMode) {
    showLoading('Saving template...');

    const urlParams = new URLSearchParams(window.location.search);
    let response;

    try {
        if (isAdminMode) {
            const token = await window.getFirebaseToken();
            response = await fetch(`/api/admin/templates/${encodeURIComponent(filename)}/fields`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ fields })
            });
        } else {
            const userId = window.getCurrentUserId ? await window.getCurrentUserId() : null;
            const sessionId = urlParams.get('session');
            response = await fetch(`/api/templates/${encodeURIComponent(filename)}/fields`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': userId || ''
                },
                body: JSON.stringify({ fields, sessionId })
            });
        }

        if (!response.ok) {
            throw new Error('Failed to save template');
        }

        // Update the URL template parameter to the new name
        currentTemplateFilename = filename;

        hideLoading();
        showToast('Template saved! You can find it in "My Saved Templates" on the dashboard.', 'success');

        if (isAdminMode) {
            setTimeout(() => {
                window.location.href = '/templates.html';
            }, 2000);
        }
    } catch (error) {
        console.error('Save template error:', error);
        hideLoading();
        showToast('Failed to save template. Please try again.', 'error');
    }
}

/**
 * Set up download CSV button
 */
function setupDownloadCsvButton() {
    const downloadCsvBtn = document.getElementById('downloadCsvBtn');

    if (!downloadCsvBtn) return;

    // Show/hide button based on whether this is a template
    if (currentTemplateFilename) {
        // Only show if it matches the template filename pattern (not a session ID)
        downloadCsvBtn.style.display = 'flex';
    } else {
        downloadCsvBtn.style.display = 'none';
        return;
    }

    downloadCsvBtn.addEventListener('click', async () => {
        try {
            showLoading('Generating CSV...');

            const userId = window.getCurrentUserId ? await window.getCurrentUserId() : null;
            const token = window.getFirebaseToken ? await window.getFirebaseToken() : null;

            const headers = {
                'x-user-id': userId || ''
            };
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch(`/api/bulk/template-csv/${encodeURIComponent(currentTemplateFilename)}`, {
                headers
            });

            if (!response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    throw new Error(data.error || 'Failed to generate CSV');
                } else {
                    const text = await response.text();
                    console.error('Non-JSON error response:', text);
                    throw new Error(`Server error (${response.status}): ${response.statusText}`);
                }
            }

            // Trigger download
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Get filename from header or default
            const disposition = response.headers.get('Content-Disposition');
            let filename = 'template.csv';
            if (disposition && disposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(disposition);
                if (matches != null && matches[1]) {
                    filename = matches[1].replace(/['"]/g, '');
                }
            }
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);

            hideLoading();
            showToast('CSV template downloaded!', 'success');

        } catch (error) {
            console.error('Download CSV error:', error);
            hideLoading();
            showToast(error.message || 'Failed to download CSV', 'error');
        }
    });
}
