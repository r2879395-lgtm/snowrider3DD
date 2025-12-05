/**
 * Unity-to-Leaderboard Bridge
 * 
 * This script provides integration between Unity WebGL game and the leaderboard system.
 * 
 * USAGE IN UNITY:
 * ----------------
 * Add this C# code to your Unity game to send scores to the leaderboard:
 * 
 * using UnityEngine;
 * using System.Runtime.InteropServices;
 * 
 * public class ScoreManager : MonoBehaviour
 * {
 *     [DllImport("__Internal")]
 *     private static extern void SubmitScoreToLeaderboard(int score);
 * 
 *     public void SendScore(int score)
 *     {
 *         #if UNITY_WEBGL && !UNITY_EDITOR
 *         SubmitScoreToLeaderboard(score);
 *         #endif
 *     }
 * }
 * 
 * Then call it when the game ends:
 * scoreManager.SendScore(playerScore);
 * 
 * ALTERNATIVE METHOD:
 * -------------------
 * If you cannot modify Unity code, you can use this JavaScript to periodically
 * check for score updates from Unity PlayerPrefs or other methods.
 */

// Function that Unity can call directly
window.SubmitScoreToLeaderboard = function(score) {
    console.log('Score received from Unity:', score);
    if (window.leaderboard) {
        window.leaderboard.checkAndAddScore(score);
    }
};

// Monitor localStorage for Unity game score changes
let lastScore = 0;
let scoreCheckInterval = null;

function startScoreMonitoring() {
    console.log('Starting score monitoring...');
    
    // Check every 500ms for score changes in localStorage
    scoreCheckInterval = setInterval(() => {
        try {
            // Check various possible localStorage keys that Unity games commonly use
            const possibleKeys = [
                'SnowRider3D_HighScore',
                'SnowRider3D_Score',
                'highScore',
                'score',
                'gameScore',
                'playerScore',
                'bestScore'
            ];
            
            // Also check all localStorage keys for score-related entries
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && (key.toLowerCase().includes('score') || key.toLowerCase().includes('snowrider'))) {
                    possibleKeys.push(key);
                }
            }
            
            // Check each possible key
            for (const key of possibleKeys) {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    const score = parseInt(value);
                    if (!isNaN(score) && score > 0 && score !== lastScore && score > lastScore) {
                        console.log(`Score detected from ${key}:`, score);
                        lastScore = score;
                        
                        // Only submit if it's a reasonable score (not too low)
                        if (score >= 100) {
                            if (window.leaderboard) {
                                window.leaderboard.checkAndAddScore(score);
                            }
                        }
                    }
                }
            }
            
            // Also monitor IndexedDB if Unity uses it
            checkIndexedDB();
            
        } catch (e) {
            console.log('Score monitoring error:', e);
        }
    }, 500);
}

// Check IndexedDB for Unity data
function checkIndexedDB() {
    if (window.indexedDB) {
        try {
            const request = indexedDB.databases();
            if (request) {
                request.then(databases => {
                    databases.forEach(db => {
                        if (db.name && db.name.toLowerCase().includes('unity')) {
                            // Found Unity database, could check it here
                            console.log('Found Unity database:', db.name);
                        }
                    });
                });
            }
        } catch (e) {
            // IndexedDB.databases() not supported in all browsers
        }
    }
}

// Intercept Unity PlayerPrefs operations
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    
    // Check if this is a score-related key
    if (key && (key.toLowerCase().includes('score') || key.toLowerCase().includes('snowrider'))) {
        const score = parseInt(value);
        if (!isNaN(score) && score > 0 && score > lastScore) {
            console.log(`Score change detected via setItem (${key}):`, score);
            lastScore = score;
            
            if (score >= 100 && window.leaderboard) {
                setTimeout(() => {
                    window.leaderboard.checkAndAddScore(score);
                }, 1000); // Delay to ensure game has finished
            }
        }
    }
};

// Start monitoring when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startScoreMonitoring);
} else {
    startScoreMonitoring();
}

// Alternative: Monitor Unity instance for score changes
function monitorUnityScores() {
    if (typeof gameInstance !== 'undefined' && gameInstance) {
        // Try to get score from Unity (this requires Unity to expose it)
        try {
            // Example: gameInstance.SendMessage('GameManager', 'GetScore');
            // This would require Unity to send the score back via Application.ExternalCall
        } catch (e) {
            console.log('Unity score monitoring not available');
        }
    }
}

// Helper function to manually test the leaderboard
window.testLeaderboard = function() {
    const testScores = [
        { name: 'SpeedDemon', score: 15000 },
        { name: 'SnowPro', score: 12500 },
        { name: 'IceRacer', score: 10800 },
        { name: 'ChillMaster', score: 9500 },
        { name: 'Frosty', score: 8200 }
    ];

    console.log('Adding test scores to leaderboard...');
    testScores.forEach((entry, index) => {
        setTimeout(() => {
            if (window.leaderboard) {
                window.leaderboard.currentScore = entry.score;
                window.leaderboard.playerNameInput.value = entry.name;
                window.leaderboard.submitScore();
                console.log(`Added: ${entry.name} - ${entry.score}`);
            }
        }, index * 100);
    });
    
    setTimeout(() => {
        console.log('Test complete! Click the leaderboard button to view.');
        if (window.leaderboard) {
            window.leaderboard.showLeaderboard();
        }
    }, testScores.length * 100 + 500);
};

// Add a manual submit button for testing
window.manualSubmitScore = function(score) {
    if (!score) {
        score = prompt('Enter a score to submit:');
        score = parseInt(score);
    }
    if (score && !isNaN(score) && score > 0) {
        console.log('Manually submitting score:', score);
        if (window.leaderboard) {
            window.leaderboard.checkAndAddScore(score);
        }
    }
};

// Monitor for game over events
window.addEventListener('keydown', function(e) {
    // Press 'L' key to manually trigger score submission (for testing)
    if (e.key === 'l' || e.key === 'L') {
        const score = prompt('Enter your score:');
        if (score && !isNaN(parseInt(score))) {
            window.manualSubmitScore(parseInt(score));
        }
    }
});

// Log when the bridge is ready
console.log('Unity-Leaderboard bridge initialized');
console.log('═══════════════════════════════════════');
console.log('Testing commands:');
console.log('  testLeaderboard()     - Add sample scores');
console.log('  manualSubmitScore()   - Submit a score manually');
console.log('  Press "L" during game - Quick score entry');
console.log('═══════════════════════════════════════');
console.log('Auto-detection active: Monitoring localStorage for score changes');
