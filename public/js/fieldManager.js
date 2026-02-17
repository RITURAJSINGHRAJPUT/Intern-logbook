/**
 * Field Manager - handles field overlays on PDF
 */

class FieldManager {
    constructor(overlayId, pdfViewer) {
        this.overlay = document.getElementById(overlayId);
        this.pdfViewer = pdfViewer;
        this.fields = [];
        this.selectedField = null;
        this.addingFieldType = null;

        this.onFieldSelect = null;
        this.onFieldUpdate = null;

        this.initEventListeners();
    }

    /**
     * Initialize event listeners
     */
    initEventListeners() {
        // Click on overlay to add new field or deselect
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay && this.addingFieldType) {
                this.addFieldAtPosition(e.offsetX, e.offsetY);
            } else if (e.target === this.overlay) {
                this.deselectAll();
            }
        });

        // Listen for page render events
        this.overlay.parentElement.addEventListener('pageRendered', (e) => {
            this.updateFieldPositions(e.detail);
        });
    }

    /**
     * Set fields from API response
     */
    setFields(fields) {
        this.fields = fields.map(f => ({
            ...f,
            id: f.id || `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }));
        this.renderFields();
    }

    /**
     * Get all fields with values
     */
    getFields() {
        return this.fields.map(field => {
            const element = document.getElementById(`overlay_${field.id}`);
            if (element) {
                // Special handling for rich text editor (textarea)
                if (field.type === 'textarea') {
                    const editor = element.querySelector('.rich-editor-content');
                    if (editor) {
                        field.value = editor.innerHTML;
                    }
                } else {
                    const input = element.querySelector('input, select, textarea');
                    if (input) {
                        if (field.type === 'checkbox') {
                            field.value = input.checked;
                        } else {
                            field.value = input.value;
                        }
                    }
                }
            }
            return field;
        });
    }

    /**
     * Render all fields on current page
     */
    renderFields() {
        this.overlay.innerHTML = '';

        const pageInfo = this.pdfViewer.getCurrentPageInfo();
        const currentPage = pageInfo.currentPage;
        const scale = pageInfo.scale;

        // Get original page dimensions
        const pageData = this.pdfViewer.pageInfo[currentPage - 1];
        if (!pageData) return;

        this.fields.forEach(field => {
            if (field.page === currentPage) {
                this.createFieldElement(field, pageData.height, scale);
            }
        });
    }

    /**
     * Create DOM element for a field
     */
    createFieldElement(field, pageHeight, scale) {
        const wrapper = document.createElement('div');
        wrapper.id = `overlay_${field.id}`;
        wrapper.className = `field-overlay ${field.type}-field`;
        wrapper.dataset.fieldId = field.id;

        // Calculate screen position (PDF coords have origin at bottom-left)
        const screenX = field.x * scale;
        const screenY = (pageHeight - field.y - field.height) * scale;
        const screenWidth = field.width * scale;
        const screenHeight = field.height * scale;

        wrapper.style.left = `${screenX}px`;
        wrapper.style.top = `${screenY}px`;
        wrapper.style.width = `${screenWidth}px`;
        wrapper.style.width = `${screenWidth}px`;
        wrapper.style.height = `${screenHeight}px`;

        if (field.fontSize) {
            wrapper.style.fontSize = `${field.fontSize}px`;
        }

        // Create input element based on type
        let input;
        switch (field.type) {
            case 'text':
            case 'number':
                input = document.createElement('input');
                input.type = field.type;
                input.placeholder = field.name || 'Enter text...';
                input.value = field.value || '';
                break;

            case 'date':
                input = document.createElement('input');
                input.type = 'date';
                input.value = field.value || '';
                break;

            case 'day':
                input = document.createElement('select');
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.textContent = 'Select day...';
                input.appendChild(defaultOpt);
                days.forEach(d => {
                    const option = document.createElement('option');
                    option.value = d;
                    option.textContent = d;
                    input.appendChild(option);
                });
                input.value = field.value || '';
                break;

            case 'time':
                input = document.createElement('input');
                input.type = 'time';
                input.value = field.value || '';
                break;

            case 'textarea':
                // Create rich text editor container
                const editorContainer = document.createElement('div');
                editorContainer.className = 'rich-editor-container';

                // Create toolbar
                const toolbar = document.createElement('div');
                toolbar.className = 'rich-editor-toolbar';
                toolbar.innerHTML = `
                    <button type="button" class="toolbar-btn" data-command="bold" title="Bold (Ctrl+B)"><b>B</b></button>
                    <button type="button" class="toolbar-btn" data-command="italic" title="Italic (Ctrl+I)"><i>I</i></button>
                    <button type="button" class="toolbar-btn" data-command="underline" title="Underline (Ctrl+U)"><u>U</u></button>
                    <span class="toolbar-divider"></span>
                    <button type="button" class="toolbar-btn" data-command="insertUnorderedList" title="Bullet List">•</button>
                    <button type="button" class="toolbar-btn" data-command="insertOrderedList" title="Numbered List">1.</button>
                `;

                // Create contenteditable area
                const editor = document.createElement('div');
                editor.className = 'rich-editor-content';
                editor.contentEditable = 'true';
                if (field.fontSize) {
                    editor.style.fontSize = `${field.fontSize}px`;
                }
                editor.innerHTML = field.value || '<p>Enter notes...</p>';

                // Toolbar button handlers
                toolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
                    btn.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    });
                    btn.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const command = btn.dataset.command;
                        document.execCommand(command, false, null);
                        editor.focus();
                    });
                });

                // Store reference for value retrieval
                editor.dataset.fieldId = field.id;

                editorContainer.appendChild(toolbar);
                editorContainer.appendChild(editor);
                wrapper.appendChild(editorContainer);

                // Special handling - no standard input
                editor.addEventListener('focus', () => this.selectField(field.id));
                editor.addEventListener('input', () => {
                    field.value = editor.innerHTML;
                });
                break;

            case 'checkbox':
                input = document.createElement('input');
                input.type = 'checkbox';
                input.checked = field.value === true || field.value === 'true';
                break;

            case 'dropdown':
                input = document.createElement('select');
                const options = field.options || ['Option 1', 'Option 2', 'Option 3'];
                options.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt;
                    option.textContent = opt;
                    input.appendChild(option);
                });
                input.value = field.value || '';
                break;

            case 'signature':
                if (field.value && field.value.startsWith('data:image')) {
                    const img = document.createElement('img');
                    img.src = field.value;
                    wrapper.appendChild(img);
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'placeholder';
                    placeholder.textContent = 'Click to sign';
                    wrapper.appendChild(placeholder);
                }
                wrapper.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openSignatureModal(field);
                });
                break;
        }

        if (input) {
            if (field.fontSize) {
                input.style.fontSize = `${field.fontSize}px`;
            }
            input.addEventListener('focus', () => this.selectField(field.id));
            input.addEventListener('change', () => this.updateFieldValue(field.id, input));
            wrapper.appendChild(input);
        }

        // Add resize handle
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'resize-handle se';
        resizeHandle.addEventListener('mousedown', (e) => this.startResize(e, field));
        resizeHandle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.startResize({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => { }, stopPropagation: () => { } }, field, true);
        }, { passive: false });
        wrapper.appendChild(resizeHandle);

        // Add delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteField(field.id);
        });
        wrapper.appendChild(deleteBtn);

        // Make draggable (mouse)
        wrapper.addEventListener('mousedown', (e) => {
            if (e.target === wrapper || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                if (e.target === wrapper) {
                    this.startDrag(e, field);
                }
                this.selectField(field.id);
            }
        });

        // Make draggable (touch)
        wrapper.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            if (target === wrapper || target === wrapper.querySelector('.field-overlay')) {
                e.preventDefault();
                this.startDrag({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => { } }, field, true);
                this.selectField(field.id);
            }
        }, { passive: false });

        this.overlay.appendChild(wrapper);
    }

    /**
     * Select a field
     */
    selectField(fieldId) {
        this.deselectAll();

        const element = document.getElementById(`overlay_${fieldId}`);
        if (element) {
            element.classList.add('selected');
            this.selectedField = this.fields.find(f => f.id === fieldId);

            if (this.onFieldSelect) {
                this.onFieldSelect(this.selectedField);
            }
        }
    }

    /**
     * Deselect all fields
     */
    deselectAll() {
        document.querySelectorAll('.field-overlay.selected').forEach(el => {
            el.classList.remove('selected');
        });
        this.selectedField = null;

        if (this.onFieldSelect) {
            this.onFieldSelect(null);
        }
    }

    /**
     * Start adding a new field
     */
    startAddingField(type) {
        this.addingFieldType = type;
        this.overlay.style.cursor = 'crosshair';
        this.overlay.style.pointerEvents = 'auto';
    }

    /**
     * Cancel adding field
     */
    cancelAddingField() {
        this.addingFieldType = null;
        this.overlay.style.cursor = 'default';
        this.overlay.style.pointerEvents = 'none';
    }

    /**
     * Add field at position
     */
    addFieldAtPosition(screenX, screenY) {
        const pageInfo = this.pdfViewer.getCurrentPageInfo();
        const pageData = this.pdfViewer.pageInfo[pageInfo.currentPage - 1];

        // Convert screen coords to PDF coords
        const pdfX = screenX / pageInfo.scale;
        const pdfY = pageData.height - (screenY / pageInfo.scale);

        // Default dimensions
        let width = 150;
        let height = 20;

        if (this.addingFieldType === 'checkbox') {
            width = 20;
            height = 20;
        } else if (this.addingFieldType === 'signature') {
            width = 200;
            height = 50;
        } else if (this.addingFieldType === 'textarea') {
            width = 280;
            height = 120;
        } else if (this.addingFieldType === 'day') {
            width = 120;
            height = 24;
        } else if (this.addingFieldType === 'time') {
            width = 100;
            height = 24;
        }

        const newField = {
            id: `field_${Date.now()}`,
            name: `New ${this.addingFieldType}`,
            type: this.addingFieldType,
            page: pageInfo.currentPage,
            x: pdfX,
            y: pdfY - height,
            width: width,
            height: height,
            value: '',
            fontSize: 14,
            required: false
        };

        this.fields.push(newField);
        this.renderFields();
        this.selectField(newField.id);

        // Reset adding mode
        this.cancelAddingField();

        if (this.onFieldUpdate) {
            this.onFieldUpdate(this.fields);
        }
    }

    /**
     * Delete a field
     */
    deleteField(fieldId) {
        this.fields = this.fields.filter(f => f.id !== fieldId);
        this.renderFields();
        this.deselectAll();

        if (this.onFieldUpdate) {
            this.onFieldUpdate(this.fields);
        }
    }

    /**
     * Update field value
     */
    updateFieldValue(fieldId, input) {
        const field = this.fields.find(f => f.id === fieldId);
        if (field) {
            if (field.type === 'checkbox') {
                field.value = input.checked;
            } else {
                field.value = input.value;
            }
        }
    }

    /**
     * Start dragging a field (supports both mouse and touch)
     */
    startDrag(e, field, isTouch = false) {
        e.preventDefault();

        const element = document.getElementById(`overlay_${field.id}`);
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = element.offsetLeft;
        const startTop = element.offsetTop;

        const onMove = (ev) => {
            let clientX, clientY;
            if (ev.touches) {
                clientX = ev.touches[0].clientX;
                clientY = ev.touches[0].clientY;
            } else {
                clientX = ev.clientX;
                clientY = ev.clientY;
            }
            const dx = clientX - startX;
            const dy = clientY - startY;

            element.style.left = `${startLeft + dx}px`;
            element.style.top = `${startTop + dy}px`;
        };

        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);

            // Update field position in PDF coords
            const pageInfo = this.pdfViewer.getCurrentPageInfo();
            const pageData = this.pdfViewer.pageInfo[pageInfo.currentPage - 1];

            field.x = element.offsetLeft / pageInfo.scale;
            field.y = pageData.height - (element.offsetTop / pageInfo.scale) - field.height;

            if (this.onFieldUpdate) {
                this.onFieldUpdate(this.fields);
            }
        };

        if (isTouch) {
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        } else {
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
        }
    }

    /**
     * Start resizing a field (supports both mouse and touch)
     */
    startResize(e, field, isTouch = false) {
        e.preventDefault();
        e.stopPropagation();

        const element = document.getElementById(`overlay_${field.id}`);
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = element.offsetWidth;
        const startHeight = element.offsetHeight;

        const onMove = (ev) => {
            let clientX, clientY;
            if (ev.touches) {
                ev.preventDefault();
                clientX = ev.touches[0].clientX;
                clientY = ev.touches[0].clientY;
            } else {
                clientX = ev.clientX;
                clientY = ev.clientY;
            }
            const dx = clientX - startX;
            const dy = clientY - startY;

            element.style.width = `${Math.max(50, startWidth + dx)}px`;
            element.style.height = `${Math.max(20, startHeight + dy)}px`;
        };

        const onEnd = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);

            // Update field dimensions in PDF coords
            const pageInfo = this.pdfViewer.getCurrentPageInfo();

            field.width = element.offsetWidth / pageInfo.scale;
            field.height = element.offsetHeight / pageInfo.scale;

            // Recalculate Y because height changed
            const pageData = this.pdfViewer.pageInfo[pageInfo.currentPage - 1];
            field.y = pageData.height - (element.offsetTop / pageInfo.scale) - field.height;

            if (this.onFieldUpdate) {
                this.onFieldUpdate(this.fields);
            }
        };

        if (isTouch) {
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onEnd);
        } else {
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onEnd);
        }
    }

    /**
     * Update field positions when page is re-rendered
     */
    updateFieldPositions(detail) {
        this.renderFields();
    }

    /**
     * Open signature modal
     */
    openSignatureModal(field) {
        this.signatureField = field;
        window.signaturePad?.clear();
        document.getElementById('signatureModal')?.classList.remove('hidden');
    }

    /**
     * Save signature to field
     */
    saveSignature(dataUrl) {
        if (this.signatureField) {
            this.signatureField.value = dataUrl;
            this.renderFields();

            if (this.onFieldUpdate) {
                this.onFieldUpdate(this.fields);
            }
        }
    }
}

// Export for global use
window.FieldManager = FieldManager;
