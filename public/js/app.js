/**
 * Main application logic for landing page
 */

document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const uploadLoading = document.getElementById('uploadLoading');
    const templatesGrid = document.getElementById('templatesGrid');

    // Load available templates
    loadTemplates();

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
     */
    async function loadTemplates() {
        try {
            const response = await fetch('/api/templates');
            if (!response.ok) throw new Error('Failed to load templates');

            const data = await response.json();

            if (data.templates && data.templates.length > 0) {
                templatesGrid.innerHTML = data.templates.map(template => `
                    <div class="template-card" data-url="${template.url}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                        </svg>
                        <span>${template.name}</span>
                    </div>
                `).join('');

                // Add click handlers for template cards
                templatesGrid.querySelectorAll('.template-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const url = card.dataset.url;
                        loadTemplateFromUrl(url);
                    });
                });
            } else {
                // Hide templates section if no templates
                document.getElementById('templatesSection').classList.add('hidden');
            }
        } catch (error) {
            console.error('Error loading templates:', error);
            // Hide templates section on error
            document.getElementById('templatesSection').classList.add('hidden');
        }
    }

    /**
     * Load a template PDF by fetching it and uploading to server
     */
    async function loadTemplateFromUrl(url) {
        // Show loading state
        uploadZone.classList.add('hidden');
        document.getElementById('templatesSection').classList.add('hidden');
        uploadLoading.classList.remove('hidden');

        try {
            // Fetch the template file
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch template');

            const blob = await response.blob();
            const filename = decodeURIComponent(url.split('/').pop());
            const file = new File([blob], filename, { type: 'application/pdf' });

            // Upload the template file with template filename for saving later
            await uploadFile(file, filename);
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
    async function uploadFile(file, templateFilename = null) {
        // Validate file size (10MB limit)
        if (file.size > 10 * 1024 * 1024) {
            showError('File size must be less than 10MB');
            return;
        }

        // Show loading state
        uploadZone.classList.add('hidden');
        if (document.getElementById('templatesSection')) {
            document.getElementById('templatesSection').classList.add('hidden');
        }
        uploadLoading.classList.remove('hidden');

        try {
            const formData = new FormData();
            formData.append('pdf', file);

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const data = await response.json();

            if (data.success && data.sessionId) {
                // Redirect to editor with session ID (and template filename if applicable)
                let editorUrl = `/editor?session=${data.sessionId}`;
                if (templateFilename) {
                    editorUrl += `&template=${encodeURIComponent(templateFilename)}`;
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
        `;

        // Remove after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
});

