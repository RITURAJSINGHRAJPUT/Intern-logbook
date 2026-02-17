/**
 * UI Components - Toast, Modal, Loading
 */

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Show loading overlay
 */
function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const text = document.getElementById('loadingText');

    if (overlay) {
        overlay.classList.remove('hidden');
        if (text) text.textContent = message;
    }
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

/**
 * Show modal
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('hidden');
    }
}

/**
 * Hide modal
 */
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Update fields list in sidebar
 */
function updateFieldsList(fields, currentPage) {
    const list = document.getElementById('fieldsList');
    if (!list) return;

    list.innerHTML = '';

    const pageFields = fields.filter(f => f.page === currentPage);

    if (pageFields.length === 0) {
        list.innerHTML = '<p class="no-selection">No fields on this page</p>';
        return;
    }

    pageFields.forEach(field => {
        const item = document.createElement('div');
        item.className = 'field-item';
        item.dataset.fieldId = field.id;
        item.innerHTML = `
            <span>${field.name || 'Unnamed'}</span>
            <span class="type">${field.type}</span>
        `;
        item.addEventListener('click', () => {
            window.fieldManager?.selectField(field.id);
        });
        list.appendChild(item);
    });
}

/**
 * Update field properties panel
 */
function updateFieldProperties(field) {
    const panel = document.getElementById('fieldProperties');
    if (!panel) return;

    if (!field) {
        panel.innerHTML = '<p class="no-selection">Click a field to edit its properties</p>';
        return;
    }

    panel.innerHTML = `
        <div class="property-row">
            <label>Name</label>
            <input type="text" id="propName" value="${field.name || ''}">
        </div>
        <div class="property-row">
            <label>Type</label>
            <select id="propType">
                <option value="text" ${field.type === 'text' ? 'selected' : ''}>Text</option>
                <option value="number" ${field.type === 'number' ? 'selected' : ''}>Number</option>
                <option value="date" ${field.type === 'date' ? 'selected' : ''}>Date</option>
                <option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                <option value="signature" ${field.type === 'signature' ? 'selected' : ''}>Signature</option>
            </select>
        </div>
        <div class="property-row">
            <label>Required</label>
            <input type="checkbox" id="propRequired" ${field.required ? 'checked' : ''}>
        </div>
        <div class="property-row">
            <label>Font Size</label>
            <input type="number" id="propFontSize" value="${field.fontSize || ''}" placeholder="14" min="6" max="72">
        </div>
    `;

    // Add change listeners
    const nameInput = document.getElementById('propName');
    const typeSelect = document.getElementById('propType');
    const requiredCheck = document.getElementById('propRequired');

    nameInput?.addEventListener('change', () => {
        field.name = nameInput.value;
        updateFieldsList(window.fieldManager?.fields || [], window.pdfViewer?.currentPage || 1);
    });

    typeSelect?.addEventListener('change', () => {
        field.type = typeSelect.value;
        window.fieldManager?.renderFields();
    });

    const fontSizeInput = document.getElementById('propFontSize');
    fontSizeInput?.addEventListener('change', () => {
        const size = parseInt(fontSizeInput.value, 10);
        if (size && size > 4) {
            field.fontSize = size;
            window.fieldManager?.renderFields();
        }
    });

    requiredCheck?.addEventListener('change', () => {
        field.required = requiredCheck.checked;
    });
}

// Export functions
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showModal = showModal;
window.hideModal = hideModal;
window.updateFieldsList = updateFieldsList;
window.updateFieldProperties = updateFieldProperties;
