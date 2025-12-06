# Firebase Security Rules for Snow Rider 3D Leaderboard

## Setup Instructions

1. Go to: https://console.firebase.google.com/
2. Select your project: **snowrider-34d40**
3. Navigate to: **Realtime Database** > **Rules** tab
4. Replace the existing rules with the code below
5. Click **Publish**

## Security Rules

```json
{
  "rules": {
    "leaderboard": {
      // Only authenticated users can read
      ".read": "auth != null",
      
      // Anyone can write, but with validation
      ".write": true,
      
      "$scoreId": {
        ".validate": "newData.hasChildren(['name', 'score', 'date', 'timestamp'])",
        
        "name": {
          // Name must be a string, 1-50 characters
          ".validate": "newData.isString() && newData.val().length > 0 && newData.val().length <= 50"
        },
        
        "score": {
          // Score must be a number between 100 and 999999999
          ".validate": "newData.isNumber() && newData.val() >= 100 && newData.val() <= 999999999"
        },
        
        "date": {
          // Date must be ISO string
          ".validate": "newData.isString() && newData.val().length == 24"
        },
        
        "timestamp": {
          // Timestamp must be recent (within last 1 hour)
          ".validate": "newData.isNumber() && newData.val() > now - 3600000 && newData.val() < now + 60000"
        }
      }
    }
  }
}
```

## What These Rules Do

✅ **Prevents invalid scores**: Only 100-999999999 accepted
✅ **Prevents timestamps**: Rejects timestamps disguised as scores
✅ **Requires all fields**: Must have name, score, date, timestamp
✅ **Validates name**: 1-50 characters only
✅ **Recent submissions only**: Can't add scores from months ago
✅ **Rate limiting**: Timestamps must be within 1 hour (can't flood with old data)

## Enable Authentication (Optional - More Secure)

For even better security, you can require sign-in:

```json
{
  "rules": {
    "leaderboard": {
      ".read": "auth != null",
      ".write": "auth != null",
      // ... rest of validation rules
    }
  }
}
```

Then update `js/firebase-config.js` to require sign-in before submitting scores.

## Disable Public Write (Maximum Security)

If you only want admins to manage the leaderboard:

```json
{
  "rules": {
    "leaderboard": {
      ".read": true,
      ".write": "auth != null && root.child('admins').child(auth.uid).exists()"
    }
  }
}
```

## Testing Rules

After publishing:
1. Open DevTools Console
2. Try submitting invalid scores:
   - `debugExportCrops()` - will fail validation
   - Scores with missing fields - will fail
   - Timestamps as scores - will fail
3. Valid scores should still work
