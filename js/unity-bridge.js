/**
 * Unity-to-Leaderboard Bridge - Enhanced Score Detection
 * 
 * This script provides multiple methods to detect game scores:
 * 1. Direct Unity callback (window.SubmitScoreToLeaderboard)
 * 2. DOM monitoring for score display elements
 * 3. IndexedDB monitoring for UnityCache
 * 4. Smart localStorage filtering (ignores timestamps)
 */

// Configuration
const SCORE_CONFIG = {
    minScore: 100,              // Minimum valid score
    maxScore: 999999999,        // Maximum valid score
    minScoreLength: 3,          // Minimum digits in a score
    debounceTime: 2000,         // Milliseconds to wait before submitting same score again
    domCheckInterval: 500,      // How often to check DOM for score display
    storageCheckInterval: 1000, // How often to check storage
    enableOcr: true,            // Turn on canvas OCR monitoring
    ocrInterval: 2500           // How often to OCR the canvas (ms)
};

// State tracking
let lastDetectedScore = 0;
let lastScoreTime = 0;
let gameStartTime = Date.now();
let knownTimestamps = new Set();
let ocrReady = false;
let ocrIntervalId = null;

// Function that Unity can call directly
window.SubmitScoreToLeaderboard = function(score) {
    console.log('✅ Score received from Unity via callback:', score);
    submitScoreToLeaderboard(score);
};

// Core score submission function
function submitScoreToLeaderboard(score) {
    const numScore = parseInt(score);
    
    if (isNaN(numScore) || numScore < SCORE_CONFIG.minScore || numScore > SCORE_CONFIG.maxScore) {
        console.log(`⚠️ Invalid score detected: ${score}`);
        return false;
    }
    
    // Check if this is a duplicate recent submission
    const timeSinceLastScore = Date.now() - lastScoreTime;
    if (numScore === lastDetectedScore && timeSinceLastScore < SCORE_CONFIG.debounceTime) {
        console.log(`⏭️ Skipping duplicate score: ${numScore} (submitted ${timeSinceLastScore}ms ago)`);
        return false;
    }
    
    console.log(`🎯 Valid score detected: ${numScore}`);
    lastDetectedScore = numScore;
    lastScoreTime = Date.now();
    
    if (window.leaderboard) {
        window.leaderboard.checkAndAddScore(numScore);
        return true;
    } else {
        console.error('❌ Leaderboard not initialized');
        return false;
    }
}

// Validate if a number could be a score vs a timestamp
function isLikelyScore(value) {
    const num = typeof value === 'string' ? parseInt(value) : value;
    
    if (isNaN(num) || !Number.isFinite(num)) return false;
    
    // Timestamps are 13 digits (milliseconds since epoch)
    const valueStr = String(Math.abs(num));
    if (valueStr.length === 13) {
        // Check if it's close to current time (within last year or next year)
        const oneYear = 365 * 24 * 60 * 60 * 1000;
        const now = Date.now();
        if (Math.abs(num - now) < oneYear) {
            knownTimestamps.add(num);
            return false;
        }
    }
    
    // Timestamps created after page load are definitely not scores
    if (num > gameStartTime && num < Date.now() + 1000) {
        knownTimestamps.add(num);
        return false;
    }
    
    // Check against known timestamps
    if (knownTimestamps.has(num)) return false;
    
    // Score must be within configured bounds
    if (num < SCORE_CONFIG.minScore || num > SCORE_CONFIG.maxScore) return false;
    
    // Score must have reasonable number of digits
    if (valueStr.length < SCORE_CONFIG.minScoreLength) return false;
    
    return true;
}

function extractScore(value) {
    if (value === null || value === undefined) return null;

    // If already numeric
    if (typeof value === 'number') {
        return isLikelyScore(value) ? value : null;
    }

    // If simple numeric string
    if (typeof value === 'string' && value.trim().length) {
        const direct = parseInt(value);
        if (!isNaN(direct) && isLikelyScore(direct)) return direct;

        // Try JSON decode and search numbers inside
        try {
            const parsed = JSON.parse(value);
            const found = findNumberInObject(parsed);
            if (found && isLikelyScore(found)) return found;
        } catch (_) {
            // Not JSON, fall through
        }

        // Fallback: regex to pull numbers
        const matches = value.match(/\d+/g);
        if (matches && matches.length) {
            const nums = matches.map(n => parseInt(n)).filter(n => isLikelyScore(n));
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
            if (isLikelyScore(v)) {
                best = best === null ? v : Math.max(best, v);
            }
            return;
        }
        if (typeof v === 'string') {
            const num = parseInt(v);
            if (!isNaN(num) && isLikelyScore(num)) {
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

// ---------- Canvas OCR (fallback when game doesn't expose score) ----------
function loadTesseract() {
    return new Promise((resolve, reject) => {
        if (window.Tesseract) {
            ocrReady = true;
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
        script.onload = () => {
            ocrReady = true;
            console.log('📥 Tesseract loaded for OCR score detection');
            resolve();
        };
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function cropCanvasRegion(canvas, variant = 0) {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return null;

    // Multiple crops: game-over screen + homepage/menu stats
    const regions = [
        // Game-over screen (bottom-left area)
        { sx: 0.02 * w, sy: 0.72 * h, sw: 0.35 * w, sh: 0.25 * h },      // Tight bottom-left (69 SCORE)
        { sx: 0, sy: 0.68 * h, sw: 0.40 * w, sh: 0.30 * h },             // Slightly wider
        { sx: 0, sy: 0.65 * h, sw: 0.45 * w, sh: 0.33 * h },             // Even wider
        { sx: 0.15 * w, sy: 0.65 * h, sw: 0.40 * w, sh: 0.28 * h },      // Center-shifted
        
        // Homepage/menu stats (left-side wooden sign area showing "104 BEST", "5 PLAYS")
        { sx: 0.02 * w, sy: 0.15 * h, sw: 0.35 * w, sh: 0.45 * h },      // Left sign full area
        { sx: 0.05 * w, sy: 0.18 * h, sw: 0.25 * w, sh: 0.35 * h },      // Focused on stats
        { sx: 0, sy: 0.12 * h, sw: 0.40 * w, sh: 0.50 * h },             // Wider left region
    ];
    const r = regions[Math.min(variant, regions.length - 1)];

    const off = document.createElement('canvas');
    off.width = Math.floor(r.sw);
    off.height = Math.floor(r.sh);
    const ctx = off.getContext('2d');
    ctx.drawImage(canvas, Math.floor(r.sx), Math.floor(r.sy), Math.floor(r.sw), Math.floor(r.sh), 0, 0, off.width, off.height);

    // Boost contrast to help OCR
    const img = ctx.getImageData(0, 0, off.width, off.height);
    for (let i = 0; i < img.data.length; i += 4) {
        const gray = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
        const v = gray > 120 ? 255 : 0; // Lowered threshold to catch lighter text
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);

    return off;
}

async function runCanvasOcr(options = { submit: true }) {
    if (!SCORE_CONFIG.enableOcr) return;
    const canvas = document.querySelector('#gameContainer canvas');
    if (!canvas) return;

    try {
        let bestDetected = null;
        let rawText = '';
        
        // Try all 7 crop variants (game-over + homepage)
        for (let variant = 0; variant < 7; variant++) {
            const cropped = cropCanvasRegion(canvas, variant);
            if (!cropped) continue;

            const dataUrl = cropped.toDataURL('image/png');
            const result = await window.Tesseract.recognize(dataUrl, 'eng', {
                tessedit_char_whitelist: '0123456789',
            });

            const text = (result && result.data && result.data.text) ? result.data.text : '';
            rawText = text.trim();
            const matches = text.match(/\d+/g);
            if (!matches || !matches.length) continue;

            const numbers = matches.map(n => parseInt(n, 10)).filter(n => isLikelyScore(n));
            if (!numbers.length) continue;

            const bestHere = Math.max(...numbers);
            if (bestDetected === null || bestHere > bestDetected) {
                bestDetected = bestHere;
            }
        }

        if (bestDetected !== null) {
            console.log(`👁️ OCR detected score: ${bestDetected} (raw: "${rawText}")`);
            if (options.submit !== false) {
                submitScoreToLeaderboard(bestDetected);
            }
            return bestDetected;
        }
        return null;
    } catch (e) {
        console.log('⚠️ OCR error:', e);
        return null;
    }
}

// METHOD 1: Monitor DOM for score display
function monitorDOMForScore() {
    setInterval(() => {
        try {
            // Look for common score display patterns in the page
            const possibleScoreElements = [
                ...document.querySelectorAll('[class*="score" i]'),
                ...document.querySelectorAll('[id*="score" i]'),
                ...document.querySelectorAll('div, span, p')
            ];
            
            for (const el of possibleScoreElements) {
                if (!el.textContent) continue;
                
                // Look for patterns like "Score: 1234" or "1234 points"
                const text = el.textContent.trim();
                const scoreMatch = text.match(/(?:score|points?|total)[\s:]*(\d{3,})/i) || 
                                 text.match(/^(\d{3,})$/);
                
                if (scoreMatch) {
                    const score = parseInt(scoreMatch[1]);
                    if (isLikelyScore(score)) {
                        console.log(`🔍 DOM score found in element:`, el, `Score: ${score}`);
                        submitScoreToLeaderboard(score);
                    }
                }
            }
        } catch (e) {
            console.log('⚠️ DOM monitoring error:', e);
        }
    }, SCORE_CONFIG.domCheckInterval);
}

// METHOD 2: Monitor localStorage with smart filtering
function monitorLocalStorage() {
    setInterval(() => {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                
                // Only check keys that might contain scores
                if (key.toLowerCase().includes('score') || 
                    key.toLowerCase().includes('highscore') ||
                    key.toLowerCase().includes('bestscore')) {
                    
                    const value = localStorage.getItem(key);
                    const score = extractScore(value);
                    
                    if (score) {
                        console.log(`💾 Found score in localStorage['${key}']:`, score);
                        submitScoreToLeaderboard(score);
                    }
                }
            }
        } catch (e) {
            console.log('⚠️ localStorage monitoring error:', e);
        }
    }, SCORE_CONFIG.storageCheckInterval);
}

// METHOD 3: Intercept localStorage.setItem
function interceptLocalStorage() {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
        originalSetItem.call(this, key, value);
        
        // Only check score-related keys
        if (key && (key.toLowerCase().includes('score') || 
                   key.toLowerCase().includes('high') ||
                   key.toLowerCase().includes('best'))) {
            
            console.log(`📝 localStorage.setItem('${key}', '${value}')`);
            
            const score = extractScore(value);
            if (score) {
                console.log(`🎯 Score detected from setItem:`, score);
                submitScoreToLeaderboard(score);
            }
        }
    };
}

// METHOD 4: Monitor IndexedDB (UnityCache)
async function monitorIndexedDB() {
    try {
        const dbs = await indexedDB.databases();
        
        for (const dbInfo of dbs) {
            if (!dbInfo.name || dbInfo.name.includes('firebaseLocalStorageDb')) continue;
            
            try {
                const db = await new Promise((resolve, reject) => {
                    const request = indexedDB.open(dbInfo.name);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
                
                const storeNames = Array.from(db.objectStoreNames);
                
                for (const storeName of storeNames) {
                    const tx = db.transaction(storeName, 'readonly');
                    const store = tx.objectStore(storeName);
                    const request = store.getAll();
                    
                    request.onsuccess = () => {
                        const data = request.result;
                        for (const item of data) {
                            const score = extractScore(item);
                            if (score) {
                                console.log(`🗄️ Score found in IndexedDB['${dbInfo.name}']['${storeName}']:`, score);
                                submitScoreToLeaderboard(score);
                            }
                        }
                    };
                }
                
                db.close();
            } catch (e) {
                // Silent fail for databases we can't access
            }
        }
    } catch (e) {
        console.log('⚠️ IndexedDB monitoring error:', e);
    }
}

// Initialize all monitoring methods
function startScoreMonitoring() {
    console.log('🚀 Enhanced Score Monitoring Started');
    console.log(`⚙️ Config: minScore=${SCORE_CONFIG.minScore}, maxScore=${SCORE_CONFIG.maxScore}`);
    console.log('📡 Active detection methods:');
    console.log('   1. Unity direct callback (window.SubmitScoreToLeaderboard)');
    console.log('   2. DOM element monitoring');
    console.log('   3. localStorage monitoring with timestamp filtering');
    console.log('   4. localStorage.setItem interception');
    console.log('   5. IndexedDB scanning');
    
    // Collect initial timestamps to avoid false positives
    setTimeout(() => {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            const value = localStorage.getItem(key);
            const num = parseInt(value);
            if (!isNaN(num) && String(num).length === 13) {
                knownTimestamps.add(num);
            }
        }
        console.log(`🕐 Registered ${knownTimestamps.size} known timestamps to ignore`);
    }, 1000);
    
    // Start all monitoring methods
    interceptLocalStorage();
    monitorDOMForScore();
    monitorLocalStorage();
    
    // Check IndexedDB periodically
    setInterval(monitorIndexedDB, 5000);

    // Start OCR-based canvas monitoring as last-resort detector
    if (SCORE_CONFIG.enableOcr) {
        loadTesseract().then(() => {
            if (ocrIntervalId) clearInterval(ocrIntervalId);
            ocrIntervalId = setInterval(runCanvasOcr, SCORE_CONFIG.ocrInterval);
            console.log('👁️ Canvas OCR monitoring enabled');
        }).catch(() => {
            console.log('⚠️ Failed to load Tesseract OCR; canvas monitoring disabled');
        });
    }
    
    console.log('✅ All monitoring systems active');
}

// On-demand scan button
function wireScanButton() {
    const btn = document.getElementById('scanScoreBtn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'Scanning...';
        try {
            await loadTesseract();
            const score = await runCanvasOcr({ submit: true });
            if (score) {
                console.log(`✅ Scan button detected score: ${score}`);
            } else {
                console.log('ℹ️ Scan button did not find a score');
            }
        } catch (e) {
            console.log('⚠️ Scan error:', e);
        } finally {
            btn.disabled = false;
            btn.textContent = '🔍 Scan Score';
        }
    });
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
    if (window.leaderboard) {
        testScores.forEach(entry => {
            submitScoreToLeaderboard(entry.score);
        });
    }
};

// Start monitoring when the page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        startScoreMonitoring();
        wireScanButton();
    });
} else {
    startScoreMonitoring();
    wireScanButton();
}

// Log when the bridge is ready
console.log('════════════════════════════════════════════════════════════');
console.log('🏆 Unity-Leaderboard Bridge Initialized');
console.log('════════════════════════════════════════════════════════════');
console.log('📋 Testing commands:');
console.log('   testLeaderboard()      - Add sample scores');
console.log('   Press "📝 Submit Score" button - Manual score entry');
console.log('════════════════════════════════════════════════════════════');
console.log('🔍 Auto-detection: Active with smart timestamp filtering');
console.log('💡 Watch this console - you\'ll see logs when scores are detected!');
console.log('════════════════════════════════════════════════════════════');
