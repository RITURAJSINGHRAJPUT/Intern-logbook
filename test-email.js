require('dotenv').config();
const { sendPdfEmail } = require('./server/services/emailService');
const fs = require('fs');

fs.writeFileSync('test.pdf', 'dummy');

console.log('Testing email directly with:');
console.log('Host:', process.env.SMTP_HOST);
console.log('User:', process.env.SMTP_USER);

sendPdfEmail('sparshnfc@gmail.com', 'test.pdf')
    .then(res => console.log('SUCCESS:', res))
    .catch(err => console.error('SMTP ERROR:', err))
    .finally(() => fs.unlinkSync('test.pdf'));
