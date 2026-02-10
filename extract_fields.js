const fs = require('fs');
const path = require('path');

const filePath = 'e:\\55\\pdf-format\\Internship Form 1 (Daily).fields.json';

try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    if (data.fields) {
        console.log(data.fields.map(f => f.name).join(','));
    } else {
        console.log('No fields found');
    }
} catch (e) {
    console.error('Error:', e.message);
}
