/**
 * Editor page main script
 */

// Store template filename for saving
let currentTemplateFilename = null;

document.addEventListener('DOMContentLoaded', async () => {
    // Get session ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    const templateFile = urlParams.get('template');

    // Store template filename if provided
    if (templateFile) {
        currentTemplateFilename = decodeURIComponent(templateFile);
    }

    if (!sessionId) {
        showToast('No session found. Please upload a PDF first.', 'error');
        setTimeout(() => {
            window.location.href = '/app.html';
        }, 2000);
        return;
    }

    // Initialize components
    showLoading('Loading PDF...');

    try {
        // Verify session exists
        const sessionRes = await fetch(`/api/session/${sessionId}`);
        if (!sessionRes.ok) {
            throw new Error('Session expired or not found');
        }

        // Initialize PDF Viewer
        window.pdfViewer = new PDFViewer('pdfViewer', 'pdfCanvas');
        await window.pdfViewer.loadPDF(`/api/pdf/${sessionId}`);

        // Initialize Field Manager
        window.fieldManager = new FieldManager('fieldsOverlay', window.pdfViewer);

        // Try to load saved template fields first (if this is a template PDF)
        let fieldsLoaded = false;
        if (currentTemplateFilename) {
            try {
                const templateFieldsRes = await fetch(`/api/templates/${encodeURIComponent(currentTemplateFilename)}/fields`);
                if (templateFieldsRes.ok) {
                    const templateData = await templateFieldsRes.json();
                    if (templateData.saved && templateData.fields.length > 0) {
                        window.fieldManager.setFields(templateData.fields);
                        fieldsLoaded = true;
                        showToast('Loaded saved template fields!', 'success');
                    }
                }
            } catch (e) {
                console.log('No saved template fields found');
            }
        }

        // If no template fields, try to load detected fields
        if (!fieldsLoaded) {
            const fieldsRes = await fetch(`/api/fields/${sessionId}`);
            if (fieldsRes.ok) {
                const data = await fieldsRes.json();
                window.fieldManager.setFields(data.fields || []);
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
        };

        // Initialize Signature Pad
        window.signaturePad = new SignaturePad('signatureCanvas');

        // Update UI
        updatePageInfo();
        updateZoomLevel();
        updateFieldsList(window.fieldManager.fields, 1);

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
                if (window.pdfViewer.currentPage < window.pdfViewer.totalPages) {
                    document.getElementById('nextPage').click();
                }
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                if (window.pdfViewer.currentPage > 1) {
                    document.getElementById('prevPage').click();
                }
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
});

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

    // Page navigation
    document.getElementById('prevPage')?.addEventListener('click', async () => {
        await window.pdfViewer.prevPage();
        updatePageInfo();
        updateFieldsList(window.fieldManager?.fields || [], window.pdfViewer.currentPage);
    });

    document.getElementById('nextPage')?.addEventListener('click', async () => {
        await window.pdfViewer.nextPage();
        updatePageInfo();
        updateFieldsList(window.fieldManager?.fields || [], window.pdfViewer.currentPage);
    });
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

    closeBtn?.addEventListener('click', () => hideModal('signatureModal'));
    overlay?.addEventListener('click', () => hideModal('signatureModal'));

    clearBtn?.addEventListener('click', () => {
        window.signaturePad?.clear();
    });

    saveBtn?.addEventListener('click', () => {
        const dataUrl = window.signaturePad?.toDataURL();
        if (dataUrl) {
            window.fieldManager?.saveSignature(dataUrl);
            hideModal('signatureModal');
            showToast('Signature saved!', 'success');
        } else {
            showToast('Please draw your signature first', 'error');
        }
    });
}

/**
 * Set up download button
 */
function setupDownloadButton(sessionId) {
    const downloadBtn = document.getElementById('downloadBtn');
    const flattenCheckbox = document.getElementById('flattenCheckbox');

    downloadBtn?.addEventListener('click', async () => {
        showLoading('Generating PDF...');

        try {
            // Get all filled fields
            const fields = window.fieldManager?.getFields() || [];
            const flatten = flattenCheckbox?.checked || false;

            // Generate PDF
            const generateRes = await fetch(`/api/generate/${sessionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fields, flatten })
            });

            if (!generateRes.ok) {
                throw new Error('Failed to generate PDF');
            }

            // Download the file
            window.location.href = `/api/download/${sessionId}`;

            hideLoading();
            showToast('PDF downloaded! Starting new session...', 'success');

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

            showLoading('Saving template...');

            const response = await fetch(`/api/templates/${encodeURIComponent(currentTemplateFilename)}/fields`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fields })
            });

            if (!response.ok) {
                throw new Error('Failed to save template');
            }

            hideLoading();
            showToast('Template saved! Fields will be loaded automatically next time.', 'success');

        } catch (error) {
            console.error('Save template error:', error);
            hideLoading();
            showToast('Failed to save template. Please try again.', 'error');
        }
    });
}
