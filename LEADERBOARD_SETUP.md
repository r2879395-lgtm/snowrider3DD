# Online Leaderboard Setup Guide

Your Snow Rider 3D game now has an **online global leaderboard** that syncs across all devices! 🌍

## 🚀 Quick Start (Using Firebase - FREE)

### Step 1: Create a Firebase Project (5 minutes)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Name it "SnowRider3D" (or any name)
4. Disable Google Analytics (not needed)
5. Click "Create project"

### Step 2: Set Up Realtime Database

1. In your Firebase project, click "Realtime Database" in the left menu
2. Click "Create Database"
3. Choose a location (closest to your users)
4. **Start in TEST MODE** (for now - we'll secure it later)
5. Click "Enable"

### Step 3: Get Your Configuration

1. Click the gear icon ⚙️ next to "Project Overview"
2. Select "Project settings"
3. Scroll down to "Your apps"
4. Click the web icon `</>`
5. Register your app (name it "Snow Rider 3D Web")
6. Copy the `firebaseConfig` object

### Step 4: Update Your Code

Open `js/firebase-config.js` and replace the dummy config with your real one:

```javascript
const firebaseConfig = {
    apiKey: "YOUR-API-KEY-HERE",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project-default-rtdb.firebaseio.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
};
```

### Step 5: Secure Your Database (IMPORTANT!)

1. Go back to Realtime Database in Firebase Console
2. Click on the "Rules" tab
3. Replace the rules with this:

```json
{
  "rules": {
    "leaderboard": {
      ".read": true,
      ".write": true,
      "$entry": {
        ".validate": "newData.hasChildren(['name', 'score', 'date', 'timestamp'])"
      }
    }
  }
}
```

4. Click "Publish"

## ✅ That's It!

Your leaderboard is now LIVE and will sync across all devices using your link!

## 🧪 Testing

1. Play the game on one device and submit a score
2. Open the game on another device (or browser)
3. Click the 🏆 Leaderboard button
4. You should see the score from the first device!

## 📊 Features

- ✨ **Real-time sync** - Scores appear instantly on all devices
- 🌍 **Global leaderboard** - See top players worldwide
- 💾 **Local backup** - Works offline, syncs when back online
- 🏅 **Top 10 rankings** - Shows best players with medals
- 🕐 **Time stamps** - See when scores were submitted

## 🔒 Security (Advanced)

For production, add these stricter rules:

```json
{
  "rules": {
    "leaderboard": {
      ".read": true,
      ".write": "newData.child('timestamp').val() === now",
      "$entry": {
        ".validate": "newData.child('score').isNumber() && 
                     newData.child('score').val() > 0 && 
                     newData.child('score').val() < 100000 &&
                     newData.child('name').isString() &&
                     newData.child('name').val().length < 50"
      }
    }
  }
}
```

## 💡 No Firebase? No Problem!

The system automatically falls back to local-only mode if Firebase isn't configured. Players can still save and view scores on their own device.

## 🆘 Troubleshooting

**Scores not syncing?**
- Check browser console (F12) for error messages
- Verify your Firebase config is correct
- Make sure database rules allow read/write
- Check if database URL ends with `.firebaseio.com`

**"Offline" status showing?**
- Firebase might not be configured yet (it's normal during setup)
- Check your internet connection
- Verify Firebase credentials

**Free tier limits:**
- Firebase free tier: 10GB storage, 100,000 daily reads
- More than enough for most games!

---

Need help? Check the Firebase documentation: https://firebase.google.com/docs/database
