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
    minScore: 1,                // Minimum valid score
    maxScore: 999999999,        // Maximum valid score
    minScoreLength: 1,          // Minimum digits in a score
    debounceTime: 2000,         // Milliseconds to wait before submitting same score again
    domCheckInterval: 500,      // How often to check DOM for score display
    storageCheckInterval: 1000, // How often to check storage
    enableOcr: false,           // OCR disabled - Unity WebGL canvas cannot be captured
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
    
    // Disabled: Automatic score submission
    // Users must manually use the "➕ Submit Score" button
    console.log('ℹ️ Automatic submission disabled - use Submit Score button to add to leaderboard');
    return false;
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

// Debug: Test if we can read canvas data
window.debugCanvasHealth = function() {
    console.log('🔍 Canvas Health Check:');
    
    // Find all canvas elements
    const allCanvases = document.querySelectorAll('canvas');
    console.log(`   Found ${allCanvases.length} canvas elements total`);
    
    allCanvases.forEach((canvas, idx) => {
        console.log(`   Canvas ${idx}: ${canvas.width}x${canvas.height}, id="${canvas.id}", class="${canvas.className}"`);
        
        try {
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, 1, 1);
            console.log(`      ✓ Can read pixel data: RGBA(${data.data[0]},${data.data[1]},${data.data[2]},${data.data[3]})`);
        } catch (e) {
            console.log(`      ✗ CANNOT read pixel data: ${e.message}`);
        }
    });
    
    // Check gameContainer
    const gameContainer = document.getElementById('gameContainer');
    if (gameContainer) {
        console.log(`   gameContainer: ${gameContainer.offsetWidth}x${gameContainer.offsetHeight}`);
        console.log(`   gameContainer children:`, gameContainer.children.length);
        for (let i = 0; i < gameContainer.children.length; i++) {
            const child = gameContainer.children[i];
            console.log(`      ${child.tagName}: ${child.offsetWidth}x${child.offsetHeight}`);
        }
    }
};

// Debug: Create downloadable crops for manual analysis
window.debugExportCrops = function() {
    const canvas = document.querySelector('#gameContainer canvas');
    if (!canvas) {
        console.log('❌ Canvas not found');
        return;
    }
    
    const w = canvas.width;
    const h = canvas.height;
    const regions = [
        { name: 'V0: Bottom half', sx: 0, sy: h * 0.5, sw: w, sh: h * 0.5 },
        { name: 'V1: Left half', sx: 0, sy: 0, sw: w * 0.5, sh: h },
        { name: 'V2: Bottom-left', sx: 0, sy: h * 0.5, sw: w * 0.5, sh: h * 0.5 },
        { name: 'V3: Top-left', sx: 0, sy: 0, sw: w * 0.5, sh: h * 0.5 },
        { name: 'V4: Center strip', sx: w * 0.25, sy: h * 0.3, sw: w * 0.5, sh: h * 0.4 },
        { name: 'V5: Full canvas', sx: 0, sy: 0, sw: w, sh: h },
        { name: 'V6: Lower strip', sx: 0, sy: h * 0.4, sw: w, sh: h * 0.6 }
    ];
    
    console.log(`📋 OCR Crop Regions (Canvas ${w}x${h}):`);
    regions.forEach((r, i) => {
        console.log(`  ${r.name}: (${r.sx.toFixed(0)}, ${r.sy.toFixed(0)}) size ${r.sw.toFixed(0)}x${r.sh.toFixed(0)}`);
    });
    
    // Create and download each crop as a PNG file
    regions.forEach((r, i) => {
        setTimeout(() => {
            const cropped = cropCanvasRegion(canvas, i);
            if (cropped) {
                const link = document.createElement('a');
                link.href = cropped.toDataURL('image/png');
                link.download = `crop_v${i}_${r.name.replace(/[^a-z0-9]/gi, '_')}.png`;
                link.click();
                console.log(`💾 Downloaded: ${link.download}`);
            }
        }, i * 500); // Stagger downloads to avoid browser blocking
    });
};

// Debug: Export raw canvas screenshot without any processing
window.debugExportRawCanvas = function() {
    const canvas = document.querySelector('#gameContainer canvas');
    if (!canvas) {
        console.log('❌ Canvas not found');
        return;
    }
    
    console.log(`📸 Exporting raw canvas: ${canvas.width}x${canvas.height}`);
    
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = 'raw_canvas_screenshot.png';
    link.click();
    console.log('💾 Downloaded: raw_canvas_screenshot.png');
};

// Debug: Test OCR on just the raw canvas (no cropping, no processing)
window.debugTestOcrRaw = async function() {
    const canvas = document.querySelector('#gameContainer canvas');
    if (!canvas) {
        console.log('❌ Canvas not found');
        return;
    }
    
    if (!window.Tesseract) {
        console.log('❌ Tesseract not loaded. Call loadTesseract() first');
        return;
    }
    
    console.log(`🧪 Testing raw canvas OCR (${canvas.width}x${canvas.height})...`);
    
    const dataUrl = canvas.toDataURL('image/png');
    console.log('   Sending to Tesseract...');
    
    const result = await window.Tesseract.recognize(dataUrl, 'eng', {
        tessedit_char_whitelist: '0123456789',
    });
    
    const text = (result && result.data && result.data.text) ? result.data.text : '';
    console.log(`   Raw OCR result: "${text}"`);
    console.log(`   Confidence: ${result?.data?.confidence || 'unknown'}%`);
    
    const numbers = text.match(/\d+/g) || [];
    console.log(`   Found numbers: ${numbers.join(', ')}`);
};

// Debug: Also show crop regions visually on the canvas
window.debugShowCropRegions = function() {
    const canvas = document.querySelector('#gameContainer canvas');
    if (!canvas) {
        console.log('❌ Canvas not found');
        return;
    }
    
    const w = canvas.width;
    const h = canvas.height;
    const regions = [
        { name: 'V0: Bottom half', sx: 0, sy: h * 0.5, sw: w, sh: h * 0.5 },
        { name: 'V1: Left half', sx: 0, sy: 0, sw: w * 0.5, sh: h },
        { name: 'V2: Bottom-left', sx: 0, sy: h * 0.5, sw: w * 0.5, sh: h * 0.5 },
        { name: 'V3: Top-left', sx: 0, sy: 0, sw: w * 0.5, sh: h * 0.5 },
        { name: 'V4: Center strip', sx: w * 0.25, sy: h * 0.3, sw: w * 0.5, sh: h * 0.4 },
        { name: 'V5: Full canvas', sx: 0, sy: 0, sw: w, sh: h },
        { name: 'V6: Lower strip', sx: 0, sy: h * 0.4, sw: w, sh: h * 0.6 }
    ];
    
    // Create an overlay canvas showing all regions
    const overlay = document.createElement('canvas');
    overlay.width = w;
    overlay.height = h;
    overlay.style.position = 'absolute';
    overlay.style.border = '2px solid red';
    overlay.style.pointerEvents = 'none';
    overlay.style.zIndex = '10000';
    
    const ctx = overlay.getContext('2d');
    const colors = ['red', 'lime', 'blue', 'yellow', 'magenta', 'cyan', 'orange'];
    
    regions.forEach((r, i) => {
        ctx.strokeStyle = colors[i % colors.length];
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.strokeRect(r.sx, r.sy, r.sw, r.sh);
        
        ctx.fillStyle = colors[i % colors.length];
        ctx.globalAlpha = 1;
        ctx.font = 'bold 12px Arial';
        ctx.fillText(`V${i}`, r.sx + 5, r.sy + 15);
    });
    
    // Position overlay on top of game canvas
    const gameContainer = document.getElementById('gameContainer');
    overlay.style.top = gameContainer.offsetTop + 'px';
    overlay.style.left = gameContainer.offsetLeft + 'px';
    document.body.appendChild(overlay);
    
    console.log('🎨 Crop regions visualization added to page (red/lime/blue/yellow/magenta/cyan/orange boxes)');
    setTimeout(() => {
        overlay.remove();
        console.log('🗑️ Visualization removed after 10 seconds');
    }, 10000);
};

function cropCanvasRegion(canvas, variant = 0) {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h) return null;

    // Aggressive crops covering entire canvas regions and specific score areas
    const regions = [
        // Full bottom half (score should be here when game ends)
        { sx: 0, sy: h * 0.5, sw: w, sh: h * 0.5 },
        
        // Full left half (homepage stats on left side)
        { sx: 0, sy: 0, sw: w * 0.5, sh: h },
        
        // Bottom-left quadrant
        { sx: 0, sy: h * 0.5, sw: w * 0.5, sh: h * 0.5 },
        
        // Top-left quadrant (homepage stats area)
        { sx: 0, sy: 0, sw: w * 0.5, sh: h * 0.5 },
        
        // Center vertical strip (for middle scores)
        { sx: w * 0.25, sy: h * 0.3, sw: w * 0.5, sh: h * 0.4 },
        
        // Full canvas (last resort - full screenshot)
        { sx: 0, sy: 0, sw: w, sh: h },
        
        // Lower portion of full width
        { sx: 0, sy: h * 0.4, sw: w, sh: h * 0.6 }
    ];
    const r = regions[Math.min(variant, regions.length - 1)];

    try {
        // Convert canvas to image first (workaround for WebGL canvas)
        const img = new Image();
        img.onload = function() {
            // After image loads, crop it
            const off = document.createElement('canvas');
            off.width = Math.floor(r.sw);
            off.height = Math.floor(r.sh);
            const ctx = off.getContext('2d');
            
            if (!ctx) {
                console.log(`   ⚠️ Cannot get 2D context from crop canvas`);
                return null;
            }

            // Draw the cropped region
            ctx.drawImage(img, Math.floor(r.sx), Math.floor(r.sy), Math.floor(r.sw), Math.floor(r.sh), 0, 0, off.width, off.height);

            // Enhanced contrast for OCR: preserve light text better
            const imgData = ctx.getImageData(0, 0, off.width, off.height);
            const data = imgData.data;
            
            // First pass: calculate histogram to find better threshold
            const histogram = new Array(256).fill(0);
            for (let i = 0; i < data.length; i += 4) {
                const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
                histogram[gray]++;
            }
            
            // Find threshold using Otsu's method (adaptive threshold)
            let sum = 0;
            let sumB = 0;
            let wB = 0;
            let max = 0;
            let threshold = 0;
            
            for (let i = 0; i < 256; i++) {
                wB += histogram[i];
                if (wB === 0) continue;
                
                const wF = (data.length / 4) - wB;
                if (wF === 0) break;
                
                sumB += i * histogram[i];
                const mB = sumB / wB;
                const mF = (sum - sumB) / wF;
                
                const between = wB * wF * Math.pow(mB - mF, 2);
                
                if (between > max) {
                    max = between;
                    threshold = i;
                }
                
                sum += i * histogram[i];
            }
            
            console.log(`   Otsu threshold: ${threshold}`);
            
            // Second pass: apply adaptive threshold with slight dilation
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                const bw = gray > threshold ? 255 : 0;
                data[i] = data[i + 1] = data[i + 2] = bw;
            }
            ctx.putImageData(imgData, 0, 0);

            return off;
        };
        
        // Start the async image load
        img.src = canvas.toDataURL('image/png');
        
        // For synchronous return, we need a different approach
        // Create a temporary canvas and draw immediately
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.floor(r.sw);
        tempCanvas.height = Math.floor(r.sh);
        const tempCtx = tempCanvas.getContext('2d');
        
        if (!tempCtx) {
            console.log(`   ⚠️ Cannot get 2D context`);
            return null;
        }

        // This approach: convert to image data URL, then draw
        const imageData = tempCtx.getImageData(0, 0, 1, 1); // Dummy call to initialize
        
        // Better approach: use the canvas directly with drawImage (if possible)
        try {
            tempCtx.drawImage(canvas, Math.floor(r.sx), Math.floor(r.sy), Math.floor(r.sw), Math.floor(r.sh), 0, 0, tempCanvas.width, tempCanvas.height);
        } catch (e1) {
            console.log(`   drawImage failed, trying toDataURL approach: ${e1.message}`);
            
            // Fallback: Draw from toDataURL (slower but works with WebGL)
            const tmpImg = new Image();
            tmpImg.src = canvas.toDataURL('image/png');
            tempCtx.drawImage(tmpImg, Math.floor(r.sx), Math.floor(r.sy), Math.floor(r.sw), Math.floor(r.sh), 0, 0, tempCanvas.width, tempCanvas.height);
        }

        // Enhanced contrast for OCR: preserve light text better
        const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const data = imgData.data;
        
        // First pass: calculate histogram to find better threshold
        const histogram = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[gray]++;
        }
        
        // Find threshold using Otsu's method (adaptive threshold)
        let sum = 0;
        let sumB = 0;
        let wB = 0;
        let max = 0;
        let threshold = 0;
        
        for (let i = 0; i < 256; i++) {
            wB += histogram[i];
            if (wB === 0) continue;
            
            const wF = (data.length / 4) - wB;
            if (wF === 0) break;
            
            sumB += i * histogram[i];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            
            const between = wB * wF * Math.pow(mB - mF, 2);
            
            if (between > max) {
                max = between;
                threshold = i;
            }
            
            sum += i * histogram[i];
        }
        
        // Second pass: apply adaptive threshold
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const bw = gray > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = bw;
        }
        tempCtx.putImageData(imgData, 0, 0);

        return tempCanvas;
        
    } catch (e) {
        console.log(`   Crop error: ${e.message}`);
        return null;
    }
}

async function runCanvasOcr(options = { submit: true }) {
    if (!SCORE_CONFIG.enableOcr) {
        console.log('⚠️ OCR disabled in config');
        return;
    }
    const canvas = document.querySelector('#gameContainer canvas');
    if (!canvas) {
        console.log('❌ Canvas not found');
        return null;
    }
    console.log(`📊 Canvas size: ${canvas.width}x${canvas.height}`);

    try {
        let bestDetected = null;
        let rawText = '';
        
        // Prioritize V3 (top-left where score text is), then others
        const priority = [3, 1, 5, 0, 6, 2, 4];
        
        for (let variant of priority) {
            const cropped = cropCanvasRegion(canvas, variant);
            if (!cropped) {
                console.log(`⊘ Variant ${variant}: crop failed`);
                continue;
            }
            console.log(`📷 Variant ${variant}: OCR processing (${cropped.width}x${cropped.height})...`);

            const dataUrl = cropped.toDataURL('image/png');
            const result = await window.Tesseract.recognize(dataUrl, 'eng', {
                tessedit_char_whitelist: '0123456789',
            });

            const text = (result && result.data && result.data.text) ? result.data.text : '';
            rawText = text.trim();
            if (rawText) {
                console.log(`   ✓ Raw OCR text: "${rawText}"`);
            } else {
                console.log(`   (empty OCR result)`);
            }
            
            const matches = text.match(/\d+/g);
            if (!matches || !matches.length) {
                continue;
            }

            const numbers = matches.map(n => parseInt(n, 10)).filter(n => isLikelyScore(n));
            console.log(`   Extracted numbers: ${matches.join(', ')} → Valid scores: ${numbers.join(', ')}`);
            if (!numbers.length) {
                continue;
            }

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
        console.log(`⚠️ No valid score detected across all 7 variants`);
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
    if (!btn) {
        console.log('❌ Scan button not found in DOM');
        return;
    }
    console.log('✅ Scan button found, adding click handler');
    btn.addEventListener('click', async () => {
        console.log('🔘 Manual Score Submit button clicked');
        // Show a dialog to manually enter score
        const scoreStr = prompt('📊 Enter your score:');
        if (!scoreStr) {
            console.log('ℹ️ Score entry cancelled');
            return;
        }
        
        const score = parseInt(scoreStr);
        
        // Validate score
        if (isNaN(score)) {
            alert('❌ Invalid score. Must be a number.');
            return;
        }
        
        if (score < SCORE_CONFIG.minScore || score > SCORE_CONFIG.maxScore) {
            alert(`❌ Invalid score. Must be between ${SCORE_CONFIG.minScore.toLocaleString()} and ${SCORE_CONFIG.maxScore.toLocaleString()}`);
            return;
        }
        
        // Check if it looks like a timestamp (13 digits, ~current time)
        const scoreStr13 = String(score);
        if (scoreStr13.length === 13) {
            const now = Date.now();
            const oneYear = 365 * 24 * 60 * 60 * 1000;
            if (Math.abs(score - now) < oneYear) {
                alert('⚠️ That looks like a timestamp, not a game score. Please enter your actual score.');
                return;
            }
        }
        
        // Get player name
        const playerName = prompt('👤 Enter your name for the leaderboard:', 'Player');
        if (playerName === null) {
            console.log('ℹ️ Name entry cancelled');
            return;
        }
        
        if (!playerName.trim()) {
            alert('❌ Please enter a valid name (1-50 characters)');
            return;
        }
        
        if (playerName.length > 50) {
            alert('❌ Name too long. Maximum 50 characters.');
            return;
        }
        
        console.log(`✅ Submitting manual score: ${score} by ${playerName}`);
        
        // Directly submit to leaderboard without going through checkAndAddScore
        if (window.leaderboard) {
            const scoreEntry = {
                name: playerName.trim() || 'Anonymous',
                score: score,
                date: new Date().toISOString(),
                timestamp: Date.now()
            };
            
            // Get local scores and add new one
            const localScores = window.leaderboard.getScores();
            localScores.push(scoreEntry);
            localScores.sort((a, b) => b.score - a.score);
            const topLocalScores = localScores.slice(0, window.leaderboard.maxEntries);
            window.leaderboard.saveScores(topLocalScores);
            console.log('✅ Score saved locally');
            
            // Save to online if available
            if (window.leaderboard.isOnline && window.leaderboard.leaderboardRef) {
                console.log('📤 Attempting to save score to Firebase...');
                window.leaderboard.leaderboardRef.push(scoreEntry)
                    .then(() => {
                        console.log('✅ Score saved to Firebase successfully!');
                    })
                    .catch(error => {
                        console.error('❌ Firebase write failed:', error.code, error.message);
                        console.log('📋 Score data:', scoreEntry);
                    });
            } else {
                console.log('⚠️ Firebase not available, score saved locally only');
            }
            
            // Show updated leaderboard
            window.leaderboard.setTab(window.leaderboard.isOnline ? 'global' : 'local');
            window.leaderboard.showLeaderboard();
            
            alert('✅ Score submitted successfully!');
        } else {
            console.error('❌ Leaderboard not initialized');
            alert('❌ Leaderboard not available');
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


// Debug: Test Firebase write permissions
window.debugTestFirebaseWrite = async function() {
    console.log('🔍 Testing Firebase write permissions...');
    
    if (!window.leaderboard || !window.leaderboard.leaderboardRef) {
        console.error('❌ Firebase not initialized');
        return;
    }
    
    const testEntry = {
        name: 'TEST_' + Date.now(),
        score: 12345,
        date: new Date().toISOString(),
        timestamp: Date.now()
    };
    
    console.log('📝 Writing test entry:', testEntry);
    
    try {
        const ref = await window.leaderboard.leaderboardRef.push(testEntry);
        console.log('✅ Write successful! Key:', ref.key);
        console.log('📖 Check Firebase Console to verify data');
    } catch (error) {
        console.error('❌ Write failed!');
        console.error('   Error code:', error.code);
        console.error('   Error message:', error.message);
        console.error('   Error:', error);
        
        if (error.code === 'PERMISSION_DENIED') {
            console.log('💡 Solution: Update Firebase Rules to allow writes');
            console.log('   See FIREBASE_RULES.md for security rules to apply');
        }
    }
};

// Log when the bridge is ready
console.log('════════════════════════════════════════════════════════════');
console.log('🏆 Unity-Leaderboard Bridge Initialized');
console.log('════════════════════════════════════════════════════════════');
console.log('📋 Testing commands:');
console.log('   testLeaderboard()      - Add sample scores');
console.log('   debugFirebase()        - Check Firebase connection');
console.log('   debugTestFirebaseWrite() - Test write permissions');
console.log('   Press "➕ Submit Score" button - Manual score entry');
console.log('════════════════════════════════════════════════════════════');
console.log('🔍 Auto-detection: Active with smart timestamp filtering');
console.log('💡 Watch this console - you\'ll see logs when scores are detected!');
console.log('════════════════════════════════════════════════════════════');

