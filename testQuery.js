require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const { db } = require('./server/config/firebase');

async function runTest() {
    try {
        console.log('Testing the exact memory sort logic...');
        const snapshot = await db.collection('paymentRequests')
            .where('status', '==', 'pending')
            .get();

        let payments = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            payments.push({
                id: doc.id,
                uid: data.uid,
                status: data.status,
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
            });
        });

        // Sort in memory by descending createdAt
        payments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        console.log('Processed Payments:', payments);
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

runTest();
