// Firebase Configuration for Snow Rider 3D Leaderboard
// This uses a demo/public Firebase instance - replace with your own for production

const firebaseConfig = {
  apiKey: "AIzaSyDRDkhXXmqc8wiiozUdtCHUEppaZEiL3As",
  authDomain: "snowrider-34d40.firebaseapp.com",
  projectId: "snowrider-34d40",
  storageBucket: "snowrider-34d40.firebasestorage.app",
  messagingSenderId: "359176844016",
  appId: "1:359176844016:web:686e463928b6d71889c835",
  measurementId: "G-Z45Y8Y1449"
};

// Alternative: Use a free realtime database service
// If Firebase doesn't work, this will fall back to a simple JSON-based system
const ALTERNATIVE_API = "https://api.jsonbin.io/v3/b/"; // You can use jsonbin.io or similar

// Initialize Firebase
let firebaseApp = null;
let database = null;
let isFirebaseAvailable = false;

try {
    if (typeof firebase !== 'undefined') {
        // Try to initialize Firebase
        firebaseApp = firebase.initializeApp(firebaseConfig);
        database = firebase.database();
        isFirebaseAvailable = true;
        console.log('✓ Firebase initialized successfully');
    }
} catch (error) {
    console.log('Firebase initialization failed, using fallback system:', error.message);
    isFirebaseAvailable = false;
}

// Export configuration
window.firebaseConfig = {
    app: firebaseApp,
    database: database,
    isAvailable: isFirebaseAvailable
};
