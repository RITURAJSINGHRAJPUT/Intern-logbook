# PDF Form Filler

A 100% free, secure, and privacy-focused online PDF form filler. No login required.

## 🚀 Features

- **No Uploads Stored**: Files are processed locally or deleted immediately after use.
- **Drag & Drop Interface**: Easy to use editor.
- **Form Fields**: 
  - Text, Date, Checkbox, Signature.
  - **New!** Day (Weekday picker), Time (12-hour), Notes (Rich Text).
- **Rich Text Editor**: Notes fields support Bold, Italic, Underline, and Lists.
- **Templates**: Save field layouts for re-using on standard forms.
- **Mobile Friendly**: Works on desktop and tablets.

## 🛠️ Tech Stack

- **Frontend**: Vanilla JavaScript (no framework overhead), HTML5, CSS3.
- **Backend**: Node.js, Express.
- **PDF Processing**: `pdf-lib` for generation, `pdf.js` for rendering.

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd pdf-form-filler
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open in Browser**
   Go to `http://localhost:3000`

## 📝 Usage

1. **Upload**: Drag your PDF file or select a Template.
2. **Edit**: 
   - Drag fields from the sidebar onto the PDF.
   - Resize and move them as needed.
   - Fill in your data.
3. **Format**: Use the new rich text toolbar for Notes.
4. **Download**: Click "Download PDF" to get your filled document.
5. **Save Template**: If you use this form often, click "Save Template" to store the field layout.

## 🔒 Privacy

- No user accounts.
- No database storage of user content.
- Automatic cleanup of temporary files.

## 📄 License

MIT
