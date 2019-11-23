const admin = require('firebase-admin');

const serviceAccount = require("./serviceAcc.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "CHANGE TO YOURS",
    storageBucket: "CHANE TO YOURS"
});

const db = admin.firestore();

module.exports = { admin, db };
