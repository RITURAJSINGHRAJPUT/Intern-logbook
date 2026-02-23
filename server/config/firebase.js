const admin = require('firebase-admin');
const path = require('path');

let serviceAccount;

// Try base64 env var first (most robust for Render), then literal JSON env var, then local file
if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    try {
        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
        serviceAccount = JSON.parse(decoded);
    } catch (e) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64 env var:', e.message);
        process.exit(1);
    }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        // Render often strips or mangles literal '\n' within environment variable strings.
        // We attempt to re-escape them so that the private key maintains its formatting.
        let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT;
        serviceAccount = JSON.parse(jsonString);

        // Ensure private key has proper newlines for Firebase SDK
        if (serviceAccount.private_key) {
            serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        }
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
