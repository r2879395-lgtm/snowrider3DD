# Firebase Security Rules for Snow Rider 3D Leaderboard

## Setup Instructions (IMPORTANT!)

1. Go to: https://console.firebase.google.com/
2. Select your project: **snowrider-34d40**
3. Navigate to: **Realtime Database** > **Rules** tab
4. **DELETE the default rules** (the `.read` and `.write` at root level)
5. Copy **ONLY** the rules below and paste them
6. Click **Publish** button

## Working Security Rules (Public Writes Allowed)

```json
{
  "rules": {    
    "leaderboard": {
      ".read": true,
      ".write": true,
      "$scoreId": {
        ".validate": "newData.hasChildren(['name', 'score', 'date', 'timestamp'])",
        
        "name": {
          ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 50"
        },
        
        "score": {
          ".validate": "newData.isNumber() && newData.val() >= 100 && newData.val() <= 999999999"
        },
        
        "date": {
          ".validate": "newData.isString()"
        },
        
        "timestamp": {
          ".validate": "newData.isNumber()"
        }
      }
    },
    "activePlayers": {
      ".read": true,
      ".write": true,
      "$sessionId": {
        "sessionId": {
          ".validate": "newData.isString() && newData.val().length > 0"
        },
        
        "name": {
          ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 50"
        },
        
        "timestamp": {
          ".validate": "newData.isNumber()"
        }
      }
    },
    "chat": {
      ".read": true,
      ".write": true,
      "$messageId": {
        ".validate": "newData.hasChildren(['name', 'text', 'timestamp'])",
        
        "name": {
          ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 50"
        },
        
        "text": {
          ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 200"
        },
        
        "timestamp": {
          ".validate": "newData.isNumber()"
        }
      }
    }
  }
}
```

## What These Rules Do

✅ **Allows public reads** - Anyone can view the leaderboard and chat
✅ **Allows public writes** - Anyone can submit scores and chat messages
      ".indexOn": ["score"],
      "$playerName": {
        ".validate": "newData.hasChildren(['score','name','date','timestamp'])",
        "score": {".validate": "newData.isNumber() && newData.val() >= 0"},
        "name": {".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 40"},
        "date": {".validate": "newData.isString()"},
        "timestamp": {".validate": "newData.isNumber()"}
      }

After publishing the rules:

1. Refresh your game page (Ctrl+Shift+R)
2. Open DevTools Console (F12)
3. Run: `debugTestFirebaseWrite()`
4. You should see: `✅ Write successful! Key: ...`
5. Click "➕ Submit Score" and enter a test score
6. Check the **Global** leaderboard tab - your score should appear!
7. The active players badge (top-left) should show "🎮 1 playing"

## Optional: Add Authentication (More Secure)

If you want only authenticated users to submit scores:

```json
{
  "rules": {
    "leaderboard": {
      ".read": true,
      ".write": "auth != null",
      "$scoreId": {
        // ... same validation rules as above
      }
    }
  }
}
```

Then update the code to require sign-in before submitting.

## Troubleshooting

**If scores still don't appear:**
- Make sure you clicked **Publish** (not just copied)
- Check Firebase Console > Realtime Database > Data to see if data is there
- Run `debugFirebase()` in console to verify connection
- Run `debugTestFirebaseWrite()` to test write permissions

**If you see "PERMISSION_DENIED" error:**
- The rules above weren't published correctly
- Go back to Rules tab and click Publish again
- Wait 10 seconds for rules to apply

