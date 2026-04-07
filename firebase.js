// firebase.js — Initialize Firebase with compat SDKs (works without a bundler)

const firebaseConfig = {
  apiKey:            "AIzaSyBYZseUF0ayHls66itqgVr9AQ4g4t7tudc",
  authDomain:        "debug-the-diet.firebaseapp.com",
  projectId:         "debug-the-diet",
  storageBucket:     "debug-the-diet.firebasestorage.app",
  messagingSenderId: "591735452296",
  appId:             "1:591735452296:web:429a6afabf02a05320253d"
};

firebase.initializeApp(firebaseConfig);

// Expose auth + db globally so auth.js / storage.js / app.js can use them
window._auth = firebase.auth();
window._db   = firebase.firestore();

console.log('[Firebase] Initialized ✓');

