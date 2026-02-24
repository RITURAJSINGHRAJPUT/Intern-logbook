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
        list.innerHTML = '<p class="no-selection text-sm font-bold text-slate-400 text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl">No fields on this page</p>';
        return;
    }

    pageFields.forEach(field => {
        const item = document.createElement('div');
        // Match the newest screenshot where detected fields have light rounded borders and change to bright cyan when active
        // The active state css should be handled by a class toggler in editor.js, assuming 'active' is the class
        item.className = 'field-item flex justify-between items-center p-3 mb-3 bg-white border-2 border-slate-100 hover:border-vibrant-turquoise text-slate-700 rounded-xl cursor-pointer transition-all';
        item.dataset.fieldId = field.id;

        // Use an inline style block or force active styling (which will be swapped by editor.js)
        item.innerHTML = `
            <span class="font-bold text-sm truncate pr-2">${field.name || 'Unnamed'}</span>
            <span class="type text-[10px] font-black uppercase text-slate-400 tracking-wider">${field.type}</span>
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
        panel.innerHTML = '<p class="no-selection text-sm font-bold text-slate-400 text-center py-10">Click a field to edit its properties</p>';
        return;
    }

    // Match the specific layout: Indigo rounded inputs and custom toggle
    panel.innerHTML = `
        <div class="property-row flex items-center justify-between mb-4">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-widest w-1/3">Name</label>
            <input type="text" id="propName" value="${field.name || ''}" class="w-2/3 bg-[#6366f1] border-none outline-none text-white text-sm font-bold px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-300 transition-all shadow-sm">
        </div>
        <div class="property-row flex items-center justify-between mb-4">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-widest w-1/3">Type</label>
            <select id="propType" class="w-2/3 bg-[#6366f1] border-none outline-none text-white text-sm font-bold px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-300 transition-all appearance-none cursor-pointer shadow-sm" style="background-image: url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23FFFFFF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E'); background-repeat: no-repeat; background-position: right 1rem top 50%; background-size: .65rem auto;">
                <option value="text" ${field.type === 'text' ? 'selected' : ''}>Text</option>
                <option value="textarea" ${field.type === 'textarea' ? 'selected' : ''}>Notes</option>
                <option value="number" ${field.type === 'number' ? 'selected' : ''}>Number</option>
                <option value="date" ${field.type === 'date' ? 'selected' : ''}>Date</option>
                <option value="day" ${field.type === 'day' ? 'selected' : ''}>Day</option>
                <option value="time" ${field.type === 'time' ? 'selected' : ''}>Time</option>
                <option value="checkbox" ${field.type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                <option value="signature" ${field.type === 'signature' ? 'selected' : ''}>Signature</option>
            </select>
        </div>
        <div class="property-row flex items-center justify-between mb-4">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-widest w-1/3">Required</label>
            <div class="w-2/3 flex items-center justify-end pr-1">
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="propRequired" ${field.required ? 'checked' : ''} class="sr-only peer">
                    <!-- Track -->
                    <div class="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-indigo-100 transition-colors"></div>
                    <!-- Thumb with icon -->
                    <div class="absolute left-[2px] top-[2px] bg-white border-slate-300 border rounded-full h-5 w-5 transition-all peer-checked:translate-x-6 peer-checked:bg-[#6366f1] peer-checked:border-[#6366f1] flex items-center justify-center">
                        <span class="material-symbols-outlined text-white text-[14px] font-bold opacity-0 peer-checked:opacity-100 transition-opacity">check</span>
                    </div>
                </label>
            </div>
        </div>
        <div class="property-row flex items-center justify-between mb-4 mt-8 pt-6 border-t border-slate-100">
            <label class="text-xs font-bold text-slate-400 uppercase tracking-widest w-1/3">Font Size</label>
            <input type="number" id="propFontSize" value="${field.fontSize || ''}" placeholder="14" min="6" max="72" class="w-2/3 bg-[#6366f1] border-none outline-none text-white text-sm font-bold px-4 py-2.5 rounded-xl focus:ring-2 focus:ring-indigo-300 transition-all shadow-sm">
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
