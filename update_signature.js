const fs = require('fs');
const path = require('path');

const sigPath = path.join(__dirname, 'pdf-format', 'signature.png');
const fieldsPath = path.join(__dirname, 'pdf-format', 'Internship Form 1 (Daily).fields.json');

// Read signature image and convert to base64
const sigBuffer = fs.readFileSync(sigPath);
const base64Sig = 'data:image/png;base64,' + sigBuffer.toString('base64');
console.log('Signature base64 length:', base64Sig.length);

// Read fields JSON
const fieldsData = JSON.parse(fs.readFileSync(fieldsPath, 'utf8'));

// Update the Signature field value
let updated = false;
for (const field of fieldsData.fields) {
    if (field.name === 'Signature' && field.type === 'signature') {
        field.value = base64Sig;
        updated = true;
        console.log('Updated Signature field with base64 image');
    }
}

if (!updated) {
    console.log('ERROR: Signature field not found!');
    process.exit(1);
}

// Write back
fs.writeFileSync(fieldsPath, JSON.stringify(fieldsData, null, 2), 'utf8');
console.log('Saved updated fields.json');
