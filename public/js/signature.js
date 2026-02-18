/**
 * Signature Pad - canvas-based signature drawing
 */

class SignaturePad {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.drawing = false;
        this.lastX = 0;
        this.lastY = 0;

        this.init();
    }

    /**
     * Initialize signature pad
     */
    init() {
        // Set canvas size
        this.resizeCanvas();

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => this.startDrawing(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.draw(e), { passive: false });
        this.canvas.addEventListener('touchend', () => this.stopDrawing());

        // Initialize canvas style
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    /**
     * Resize canvas to match display size
     */
    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;

        this.ctx.scale(dpr, dpr);

        // Reset styles after resize
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
    }

    /**
     * Get position from event
     */
    getPosition(e) {
        const rect = this.canvas.getBoundingClientRect();

        if (e.touches) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }

        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    /**
     * Start drawing
     */
    startDrawing(e) {
        e.preventDefault();
        this.drawing = true;

        const pos = this.getPosition(e);
        this.lastX = pos.x;
        this.lastY = pos.y;

        // Draw a single dot
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, 1, 0, Math.PI * 2);
        this.ctx.fill();
    }

    /**
     * Draw on canvas
     */
    draw(e) {
        if (!this.drawing) return;
        e.preventDefault();

        const pos = this.getPosition(e);

        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();

        this.lastX = pos.x;
        this.lastY = pos.y;
    }

    /**
     * Stop drawing
     */
    stopDrawing() {
        this.drawing = false;
    }

    /**
     * Clear the canvas
     */
    clear() {
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.clearRect(0, 0, rect.width, rect.height);
    }

    /**
     * Check if canvas is empty
     */
    isEmpty() {
        const rect = this.canvas.getBoundingClientRect();
        const data = this.ctx.getImageData(0, 0, rect.width, rect.height).data;

        for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) return false;
        }

        return true;
    }

    /**
     * Get signature as data URL
     */
    toDataURL() {
        if (this.isEmpty()) {
            return null;
        }
        return this.canvas.toDataURL('image/png');
    }
}

// Export for global use
window.SignaturePad = SignaturePad;
