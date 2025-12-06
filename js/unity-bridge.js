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
let lastScoreTime = 0;
let scoreCheckInterval = null;

function extractScore(value) {
    if (value === null || value === undefined) return null;

    // If already numeric
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }

    // If simple numeric string
    if (typeof value === 'string' && value.trim().length) {
        const direct = parseFloat(value);
        if (!isNaN(direct) && direct > 0) return direct;

        // Try JSON decode and search numbers inside
        try {
            const parsed = JSON.parse(value);
            const found = findNumberInObject(parsed);
            if (found) return found;
        } catch (_) {
            // Not JSON, fall through
        }

        // Fallback: regex to pull largest number
        const matches = value.match(/\d+(?:\.\d+)?/g);
        if (matches && matches.length) {
            const nums = matches.map(parseFloat).filter(n => !isNaN(n));
            if (nums.length) return Math.max(...nums);
        }
    }

    return null;
}

function findNumberInObject(obj) {
    let best = null;
    const visit = (v) => {
        if (v === null || v === undefined) return;
        if (typeof v === 'number') {
            if (Number.isFinite(v) && v > 0) {
                best = best === null ? v : Math.max(best, v);
            }
            return;
        }
        if (typeof v === 'string') {
            const num = parseFloat(v);
            if (!isNaN(num) && num > 0) {
                best = best === null ? num : Math.max(best, num);
            }
            return;
        }
        if (Array.isArray(v)) v.forEach(visit);
        else if (typeof v === 'object') Object.values(v).forEach(visit);
    };
    visit(obj);
    return best;
}

function startScoreMonitoring() {
    console.log('🔍 Score monitoring disabled - use the "📝 Submit Score" button to add scores manually');
    console.log('💡 This prevents false triggers from localStorage timestamps');
    
    // DISABLED: Automatic monitoring was detecting timestamps as scores
    // Users should click the "Submit Score" button instead
    return;
    
    /* ORIGINAL CODE - DISABLED
    console.log('🔍 Starting score monitoring...');
    console.log('👀 Will check localStorage every 500ms for score changes');
    
    // Log all localStorage keys on start for debugging
    setTimeout(() => {
        const keys = Object.keys(localStorage);
        console.log('📦 Current localStorage keys:', keys);
        keys.forEach(key => {
            const value = localStorage.getItem(key);
            const displayValue = (value && typeof value === 'string' && value.length > 100) 
                ? value.substring(0, 100) + '...' 
                : value;
            console.log(`   ${key} =`, displayValue);
        });
        if (localStorage.length === 0) {
            console.log('⚠️ localStorage is empty - game may not have started yet');
        }
    }, 2000);
    
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
                if (key && (key.toLowerCase().includes('score') || key.toLowerCase().includes('snowrider') || key.toLowerCase().includes('unity'))) {
                    if (!possibleKeys.includes(key)) {
                        possibleKeys.push(key);
                    }
                }
            }
            
            // Check each possible key
            for (const key of possibleKeys) {
                const raw = localStorage.getItem(key);
                if (raw !== null) {
                    const score = extractScore(raw);
                    if (score && score > 0) {
                        const isNew = score !== lastScore || (Date.now() - lastScoreTime) > 5000;
                        if (isNew && score >= 50) {
                            console.log(`🎯 Score detected from ${key}:`, score);
                            lastScore = score;
                            lastScoreTime = Date.now();
                            if (window.leaderboard) {
                                console.log('✅ Triggering leaderboard with score:', score);
                                window.leaderboard.checkAndAddScore(score);
                            } else {
                                console.error('❌ Leaderboard not available!');
                            }
                        }
                    }
                }
            }
            
            // Also monitor IndexedDB if Unity uses it
            checkIndexedDB();
            
        } catch (e) {
            console.error('❌ Score monitoring error:', e);
        }
    }, 500);
}

// Check IndexedDB for Unity data
let unityDB = null;
let isMonitoringIndexedDB = false;

async function checkIndexedDB() {
    if (isMonitoringIndexedDB) return;
    
    if (window.indexedDB) {
        try {
            // Try to open the UnityCache database
            const dbRequest = indexedDB.open('UnityCache');
            
            dbRequest.onsuccess = function(event) {
                unityDB = event.target.result;
                console.log('✅ Connected to UnityCache database');
                isMonitoringIndexedDB = true;
                
                // List all object stores
                const storeNames = Array.from(unityDB.objectStoreNames);
                console.log('📦 UnityCache stores:', storeNames);
                
                // Start monitoring the database
                monitorUnityDB();
            };
            
            dbRequest.onerror = function(event) {
                console.log('⚠️ Could not open UnityCache:', event.target.error);
            };
        } catch (e) {
            console.log('⚠️ IndexedDB access error:', e);
        }
    }
}

async function monitorUnityDB() {
    if (!unityDB) return;
    
    setInterval(async () => {
        try {
            const storeNames = Array.from(unityDB.objectStoreNames);
            
            for (const storeName of storeNames) {
                try {
                    const transaction = unityDB.transaction(storeName, 'readonly');
                    const store = transaction.objectStore(storeName);
                    const request = store.getAll();
                    
                    request.onsuccess = function() {
                        const data = request.result;
                        if (data && data.length > 0) {
                            // Search through all data for score-like values
                            for (const item of data) {
                                const score = findNumberInObject(item);
                                if (score && score >= 50) {
                                    const isNew = score !== lastScore || (Date.now() - lastScoreTime) > 5000;
                                    if (isNew) {
                                        console.log(`🎯 Score found in IndexedDB ${storeName}:`, score);
                                        lastScore = score;
                                        lastScoreTime = Date.now();
                                        if (window.leaderboard) {
                                            console.log('✅ Triggering leaderboard with score:', score);
                                            window.leaderboard.checkAndAddScore(score);
                                        }
                                    }
                                }
                            }
                        }
                    };
                } catch (e) {
                    // Store might not be accessible
                }
            }
        } catch (e) {
            console.log('⚠️ Error monitoring UnityDB:', e);
        }
    }, 1000); // Check every second
}

// Intercept Unity PlayerPrefs operations
const originalSetItem = localStorage.setItem;
localStorage.setItem = function(key, value) {
    originalSetItem.apply(this, arguments);
    
    console.log(`💾 localStorage.setItem called: ${key} =`, value);
    
    // DISABLED: Automatic score detection was triggering on timestamps
    // Use the manual "Submit Score" button instead
    /*
    // Check if this is a score-related key
    if (key && (key.toLowerCase().includes('score') || key.toLowerCase().includes('snowrider') || key.toLowerCase().includes('unity'))) {
        const score = extractScore(value);
        if (score && score > 0) {
            const isNew = score !== lastScore || (Date.now() - lastScoreTime) > 5000;
            if (isNew) {
                console.log(`🎯 Score change detected via setItem (${key}):`, score);
                lastScore = score;
                lastScoreTime = Date.now();
                if (score >= 50 && window.leaderboard) {
                    console.log('⏱️ Scheduling leaderboard popup in 1 second...');
                    setTimeout(() => {
                        console.log('✅ Triggering leaderboard with score:', score);
                        window.leaderboard.checkAndAddScore(score);
                    }, 1000); // Delay to ensure game has finished
                } else if (!window.leaderboard) {
                    console.error('❌ Leaderboard not available!');
                }
            }
        }
    }
    */
};

// Start monitoring when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        startScoreMonitoring();
        checkIndexedDB();
    });
} else {
    startScoreMonitoring();
    checkIndexedDB();
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
console.log('════════════════════════════════════════════════════════════');
console.log('🏆 Unity-Leaderboard Bridge Initialized');
console.log('════════════════════════════════════════════════════════════');
console.log('📋 Testing commands:');
console.log('   testLeaderboard()      - Add sample scores');
console.log('   manualSubmitScore()    - Submit a score manually');
console.log('   Press "L" during game  - Quick score entry');
console.log('════════════════════════════════════════════════════════════');
console.log('🔍 Auto-detection: Monitoring localStorage for score changes');
console.log('💡 Watch this console - you\'ll see logs when scores are detected!');
console.log('════════════════════════════════════════════════════════════');
