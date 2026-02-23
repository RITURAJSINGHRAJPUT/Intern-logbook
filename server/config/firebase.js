const admin = require('firebase-admin');
const path = require('path');

let serviceAccount;

// Try env var first (for production/Render), then local file (for dev)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', e.message);
        process.exit(1);
    }
} else {
    try {
        serviceAccount = require(path.join(__dirname, '../../serviceAccountKey.json'));
    } catch (e) {
        console.warn('⚠️  No Firebase service account found. Admin features will be disabled.');
        console.warn('   Set FIREBASE_SERVICE_ACCOUNT env var or place serviceAccountKey.json in project root.');
    }
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK initialized');
} else {
    admin.initializeApp();
    console.warn('⚠️  Firebase Admin SDK initialized without credentials (limited functionality)');
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
