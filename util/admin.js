const admin = require('firebase-admin');

const serviceAccount = require("./serviceAcc.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://social-app-cffe5.firebaseio.com",
    storageBucket: "social-app-cffe5.appspot.com"
});

const db = admin.firestore();

module.exports = { admin, db };