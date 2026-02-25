/**
 * Main application logic for landing page
 * Updated with template access control
 */

document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const uploadLoading = document.getElementById('uploadLoading');
    const templatesGrid = document.getElementById('templatesGrid');

    // Listen for auth to map token properly
    if (window.isAuthReady) {
        loadTemplates();
    } else {
        window.addEventListener('auth-ready', () => {
            loadTemplates();
        });
    }

    // Click to upload
    uploadZone.addEventListener('click', () => {
        fileInput.click();
    });

    // File selected
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            uploadFile(file);
        }
    });

    // Drag and drop handlers
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                uploadFile(file);
            } else {
                showError('Please upload a PDF file');
            }
        }
    });

    /**
     * Load available PDF templates from server
     * Now includes access control — marks templates as allowed/denied
     */
    async function loadTemplates() {
        try {
            // Get Firebase token for access control check
            const token = window.getFirebaseToken ? await window.getFirebaseToken() : null;

            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const response = await fetch('/api/templates', { headers });
            if (!response.ok) throw new Error('Failed to load templates');

            const data = await response.json();

            if (data.templates && data.templates.length > 0) {
                // Ensure the section is visible
                document.getElementById('templatesSection').classList.remove('hidden');

                templatesGrid.innerHTML = data.templates.map(template => {
                    const isLocked = template.allowed === false;
                    return `
                    <div class="template-card ${isLocked ? 'template-locked' : ''}" 
                         data-url="${template.url}" 
                         data-filename="${template.filename}"
                         data-allowed="${template.allowed !== false}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            ${isLocked ? `
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            ` : `
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                                <line x1="16" y1="13" x2="8" y2="13"/>
                                <line x1="16" y1="17" x2="8" y2="17"/>
                            `}
                        </svg>
                        <span>${template.name}</span>
                        ${isLocked ? '<span class="lock-badge">🔒</span>' : ''}
                    </div>
                `;
                }).join('');

                // Add click handlers for template cards
                templatesGrid.querySelectorAll('.template-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const allowed = card.dataset.allowed === 'true';
                        if (!allowed) {
                            showError('Access Denied: You do not have permission to use this template. Contact your admin.');
                            return;
                        }
                        const url = card.dataset.url;
                        loadTemplateFromUrl(url);
                    });
                });
            } else {
                // Hide templates section if no templates
                document.getElementById('templatesSection').classList.add('hidden');
            }

            // Also load user's saved templates
            await loadUserTemplates();
        } catch (error) {
            console.error('Error loading templates:', error);
            // Hide templates section on error
            document.getElementById('templatesSection').classList.add('hidden');
        }
    }

    /**
     * Load user's saved templates from their personal directory
     */
    async function loadUserTemplates() {
        try {
            const userId = window.getCurrentUserId ? await window.getCurrentUserId() : null;
            if (!userId) return;

            const response = await fetch(`/api/templates/user/${userId}`);
            if (!response.ok) return;

            const data = await response.json();
            const mySection = document.getElementById('myTemplatesSection');
            const myGrid = document.getElementById('myTemplatesGrid');

            if (!mySection || !myGrid) return;

            if (data.templates && data.templates.length > 0) {
                mySection.classList.remove('hidden');
                document.getElementById('templatesSection').classList.remove('hidden');

                myGrid.innerHTML = data.templates.map(template => `
                    <div class="template-card relative group" 
                         data-url="${template.url}" 
                         data-filename="${template.filename}"
                         data-allowed="true"
                         style="border-color: #4DD0E1; background: linear-gradient(135deg, #E0F7FA 0%, white 100%);">
                        
                        <button class="delete-template-btn absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10" title="Delete Template">
                            <span class="material-symbols-outlined text-sm">delete</span>
                        </button>

                        <svg viewBox="0 0 24 24" fill="none" stroke="#4DD0E1" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                        <span>${template.name}</span>
                        <span style="font-size: 10px; color: #4DD0E1; font-weight: 700;">${template.fieldCount} fields</span>
                    </div>
                `).join('');

                // Click handlers for user template cards
                myGrid.querySelectorAll('.template-card').forEach(card => {
                    card.addEventListener('click', (e) => {
                        // Prevent loading if delete was clicked
                        if (e.target.closest('.delete-template-btn')) return;

                        const url = card.dataset.url;
                        loadTemplateFromUrl(url, card.dataset.filename);
                    });

                    // Delete button handler
                    const deleteBtn = card.querySelector('.delete-template-btn');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            if (confirm('Are you sure you want to delete this specific template? This cannot be undone.')) {
                                try {
                                    const filename = card.dataset.filename;
                                    const token = window.getFirebaseToken ? await window.getFirebaseToken() : null;

                                    const delResponse = await fetch(`/api/templates/user/${userId}/template/${encodeURIComponent(filename)}`, {
                                        method: 'DELETE',
                                        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                                    });

                                    if (delResponse.ok) {
                                        showToast('Template deleted successfully', 'success');
                                        await loadUserTemplates(); // Refresh the list
                                    } else {
                                        const errData = await delResponse.json();
                                        showError(errData.error || 'Failed to delete template');
                                    }
                                } catch (err) {
                                    console.error('Error deleting template:', err);
                                    showError('Failed to delete template. Please try again.');
                                }
                            }
                        });
                    }
                });
            } else {
                mySection.classList.add('hidden');
                myGrid.innerHTML = '';
            }
        } catch (error) {
            console.error('Error loading user templates:', error);
            const mySection = document.getElementById('myTemplatesSection');
            if (mySection) mySection.classList.add('hidden');
        }
    }

    /**
     * Load a template PDF by fetching it and uploading to server
     */
    async function loadTemplateFromUrl(url, templateFilename = null, isUserTemplate = false) {
        // Show loading state
        uploadZone.classList.add('hidden');
        document.getElementById('templatesSection').classList.add('hidden');
        uploadLoading.classList.remove('hidden');

        try {
            // Fetch the template file
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch template');

            const blob = await response.blob();
            const filename = templateFilename || decodeURIComponent(url.split('/').pop());
            const file = new File([blob], filename, { type: 'application/pdf' });

            // Upload the template file with template filename for saving later
            await uploadFile(file, filename, isUserTemplate);
        } catch (error) {
            console.error('Error loading template:', error);
            showError('Failed to load template. Please try again.');

            // Reset UI
            uploadZone.classList.remove('hidden');
            document.getElementById('templatesSection').classList.remove('hidden');
            uploadLoading.classList.add('hidden');
        }
    }

    /**
     * Upload PDF file to server
     */
    async function uploadFile(file, templateFilename = null, isUserTemplate = false) {
        if (!file || file.type !== 'application/pdf') {
            showError('Please upload a valid PDF file.');
            return;
        }

        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            showError('File size must be less than 10MB');
            return;
        }

        const formData = new FormData();
        formData.append('pdf', file);

        try {
            // Show loading state
            uploadZone.classList.add('hidden');
            if (document.getElementById('templatesSection')) {
                document.getElementById('templatesSection').classList.add('hidden');
            }
            uploadLoading.classList.remove('hidden');

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();

            if (data.success && data.sessionId) {
                // Always store the filename the item will be saved as
                // Use provided template filename if it's a template, otherwise use the uploaded file's original name
                const saveName = templateFilename || file.name;

                // Redirect to editor
                let editorUrl = `/editor.html?session=${data.sessionId}&template=${encodeURIComponent(saveName)}`;

                // Add isUserTemplate flag (either it's an existing user template or they just uploaded a new file)
                if (isUserTemplate || !templateFilename) {
                    editorUrl += '&isUserTemplate=true';
                } else {
                    editorUrl += '&isUserTemplate=false';
                }

                window.location.href = editorUrl;
            } else {
                throw new Error(data.error || 'Upload failed');
            }

        } catch (error) {
            console.error('Upload error:', error);
            showError(error.message || 'Failed to upload PDF. Please try again.');

            // Reset UI
            uploadZone.classList.remove('hidden');
            if (document.getElementById('templatesSection')) {
                document.getElementById('templatesSection').classList.remove('hidden');
            }
            uploadLoading.classList.add('hidden');
        }
    }

    /**
     * Show error message
     */
    function showError(message) {
        // Create toast notification
        const toast = document.createElement('div');
        toast.className = 'toast error';
        toast.innerHTML = `
            <strong>Error</strong>
            <p>${message}</p>
        `;

        // Add to body
        document.body.appendChild(toast);

        // Style for temporary toast
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            padding: 16px 24px;
            background: #1e293b;
            border-radius: 10px;
            border-left: 4px solid #ef4444;
            box-shadow: 0 10px 15px rgba(0,0,0,0.3);
            z-index: 1000;
            animation: slideIn 0.3s ease;
            max-width: 400px;
        `;

        // Remove after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
});
