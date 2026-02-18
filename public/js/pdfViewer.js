/**
 * PDF Viewer using PDF.js
 */

class PDFViewer {
    constructor(containerId, canvasId) {
        this.container = document.getElementById(containerId);
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.pdfDoc = null;
        this.currentPage = 1;
        this.totalPages = 0;
        this.scale = 1.0;
        this.pageInfo = [];

        // Set PDF.js worker
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    /**
     * Load PDF from URL
     */
    async loadPDF(url) {
        try {
            const loadingTask = pdfjsLib.getDocument(url);
            this.pdfDoc = await loadingTask.promise;
            this.totalPages = this.pdfDoc.numPages;

            // Get page info for all pages
            this.pageInfo = [];
            for (let i = 1; i <= this.totalPages; i++) {
                const page = await this.pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale: 1.0 });
                this.pageInfo.push({
                    pageNumber: i,
                    width: viewport.width,
                    height: viewport.height
                });
            }

            // Render first page
            await this.renderPage(1);

            return {
                pageCount: this.totalPages,
                pageInfo: this.pageInfo
            };
        } catch (error) {
            console.error('Error loading PDF:', error);
            throw error;
        }
    }

    /**
     * Render a specific page
     */
    async renderPage(pageNum) {
        if (!this.pdfDoc || pageNum < 1 || pageNum > this.totalPages) {
            return;
        }

        this.currentPage = pageNum;

        const page = await this.pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: this.scale });

        // Update canvas dimensions
        this.canvas.width = viewport.width;
        this.canvas.height = viewport.height;

        // Render page
        const renderContext = {
            canvasContext: this.ctx,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        // Dispatch event for field manager
        this.container.dispatchEvent(new CustomEvent('pageRendered', {
            detail: {
                pageNum: this.currentPage,
                width: viewport.width,
                height: viewport.height,
                scale: this.scale
            }
        }));
    }

    /**
     * Go to next page
     */
    async nextPage() {
        if (this.currentPage < this.totalPages) {
            await this.renderPage(this.currentPage + 1);
        }
    }

    /**
     * Go to previous page
     */
    async prevPage() {
        if (this.currentPage > 1) {
            await this.renderPage(this.currentPage - 1);
        }
    }

    /**
     * Go to specific page
     */
    async goToPage(pageNum) {
        await this.renderPage(pageNum);
    }

    /**
     * Zoom in
     */
    async zoomIn() {
        if (this.scale < 2.0) {
            this.scale = Math.min(2.0, this.scale + 0.25);
            await this.renderPage(this.currentPage);
        }
    }

    /**
     * Zoom out
     */
    async zoomOut() {
        if (this.scale > 0.5) {
            this.scale = Math.max(0.5, this.scale - 0.25);
            await this.renderPage(this.currentPage);
        }
    }

    /**
     * Set zoom level
     */
    async setZoom(scale) {
        this.scale = Math.max(0.5, Math.min(2.0, scale));
        await this.renderPage(this.currentPage);
    }

    /**
     * Get current page info
     */
    getCurrentPageInfo() {
        return {
            currentPage: this.currentPage,
            totalPages: this.totalPages,
            scale: this.scale,
            width: this.canvas.width,
            height: this.canvas.height
        };
    }

    /**
     * Convert PDF coordinates to screen coordinates
     */
    pdfToScreen(x, y, pageHeight) {
        return {
            x: x * this.scale,
            y: (pageHeight - y) * this.scale
        };
    }

    /**
     * Convert screen coordinates to PDF coordinates
     */
    screenToPdf(x, y, pageHeight) {
        return {
            x: x / this.scale,
            y: pageHeight - (y / this.scale)
        };
    }
}

// Export for global use
window.PDFViewer = PDFViewer;
