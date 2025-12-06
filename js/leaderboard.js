// Leaderboard System for Snow Rider 3D
class Leaderboard {
    constructor() {
        this.storageKey = 'snowRider3D_leaderboard';
        this.maxEntries = 10;
        this.currentScore = 0;
        this.currentTab = 'global';
        this.isOnline = false;
        this.database = null;
        this.leaderboardRef = null;
        this.onlineScores = [];
        
        // Bind event handler methods
        this.stopUnityKeys = this.stopUnityKeys.bind(this);
        
        this.init();
    }

    init() {
        // Get DOM elements
        this.leaderboardBtn = document.getElementById('leaderboardBtn');
        this.manualScoreBtn = document.getElementById('manualScoreBtn');
        this.leaderboardModal = document.getElementById('leaderboardModal');
        this.scoreModal = document.getElementById('scoreModal');
        this.closeBtn = document.querySelector('.close');
        this.submitScoreBtn = document.getElementById('submitScore');
        this.clearLeaderboardBtn = document.getElementById('clearLeaderboard');
        this.playerNameInput = document.getElementById('playerName');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.playerCount = document.getElementById('playerCount');

        // Initialize Firebase/Online database
        this.initializeOnlineDatabase();

        // Bind events
        this.leaderboardBtn.addEventListener('click', () => this.showLeaderboard());
        this.manualScoreBtn.addEventListener('click', () => this.promptManualScore());
        this.closeBtn.addEventListener('click', () => this.hideLeaderboard());
        this.submitScoreBtn.addEventListener('click', () => this.submitScore());
        this.clearLeaderboardBtn.addEventListener('click', () => this.clearLeaderboard());
        
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setTab(e.target.dataset.tab);
            });
        });

        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.leaderboardModal) {
                this.hideLeaderboard();
            }
            if (e.target === this.scoreModal) {
                this.hideScoreModal();
            }
        });

        // Enter key to submit score
        this.playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.submitScore();
            }
        });

        // Listen for Unity messages
        this.setupUnityListener();
    }

    async initializeOnlineDatabase() {
        // Wait for Firebase config to load
        await this.waitForFirebase();

        if (window.firebaseConfig && window.firebaseConfig.isAvailable) {
            try {
                this.database = window.firebaseConfig.database;
                this.leaderboardRef = this.database.ref('leaderboard');
                this.isOnline = true;
                
                // Listen for real-time updates
                this.leaderboardRef.orderByChild('score').limitToLast(100).on('value', (snapshot) => {
                    this.onlineScores = [];
                    snapshot.forEach((child) => {
                        this.onlineScores.push({
                            id: child.key,
                            ...child.val()
                        });
                    });
                    
                    // Sort by score descending
                    this.onlineScores.sort((a, b) => b.score - a.score);
                    this.onlineScores = this.onlineScores.slice(0, this.maxEntries);
                    
                    // Update display if modal is open
                    if (this.leaderboardModal.style.display === 'block') {
                        this.updateLeaderboardDisplay();
                    }
                    
                    this.updatePlayerCount();
                });

                this.updateConnectionStatus(true);
                console.log('✓ Online leaderboard connected');
            } catch (error) {
                console.error('Firebase connection error:', error);
                this.fallbackToLocalOnly();
            }
        } else {
            this.fallbackToLocalOnly();
        }
    }

    waitForFirebase() {
        return new Promise((resolve) => {
            if (window.firebaseConfig) {
                resolve();
            } else {
                const checkInterval = setInterval(() => {
                    if (window.firebaseConfig) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
                
                // Timeout after 5 seconds
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                }, 5000);
            }
        });
    }

    fallbackToLocalOnly() {
        this.isOnline = false;
        this.updateConnectionStatus(false);
        console.log('⚠ Using local-only leaderboard');
        
        // Switch to local tab
        this.currentTab = 'local';
        document.querySelector('[data-tab="local"]').click();
        
        // Hide global tab
        document.querySelector('[data-tab="global"]').style.display = 'none';
    }

    updateConnectionStatus(online) {
        if (this.connectionStatus) {
            if (online) {
                this.connectionStatus.textContent = '✓ Online';
                this.connectionStatus.className = 'status-badge online';
            } else {
                this.connectionStatus.textContent = '⚠ Offline';
                this.connectionStatus.className = 'status-badge offline';
            }
        }
    }

    updatePlayerCount() {
        if (this.playerCount) {
            const count = this.onlineScores.length;
            this.playerCount.textContent = `${count} player${count !== 1 ? 's' : ''}`;
        }
    }

    setupUnityListener() {
        // Listen for scores from Unity game
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'gameScore') {
                this.checkAndAddScore(event.data.score);
            }
        });

        // Alternative: Create a global function that Unity can call
        window.submitGameScore = (score) => {
            this.checkAndAddScore(score);
        };
    }

    getScores() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
    }

    saveScores(scores) {
        localStorage.setItem(this.storageKey, JSON.stringify(scores));
    }

    checkAndAddScore(score) {
        this.currentScore = score;
        const localScores = this.getScores();
        
        // Check if score qualifies for leaderboard (local or online)
        const qualifiesLocal = localScores.length < this.maxEntries || score > localScores[localScores.length - 1].score;
        const qualifiesOnline = this.isOnline && (this.onlineScores.length < this.maxEntries || score > this.onlineScores[this.onlineScores.length - 1].score);
        
        if (qualifiesLocal || qualifiesOnline) {
            // Use browser prompt instead of modal to bypass Unity keyboard capture
            const playerName = prompt(`🎉 New High Score: ${score.toLocaleString()}!\n\nEnter your name for the leaderboard:`, 'Player');
            
            if (playerName !== null) { // User didn't click cancel
                const scoreEntry = {
                    name: playerName.trim() || 'Anonymous',
                    score: score,
                    date: new Date().toISOString(),
                    timestamp: Date.now()
                };

                // Save to local storage
                localScores.push(scoreEntry);
                localScores.sort((a, b) => b.score - a.score);
                const topLocalScores = localScores.slice(0, this.maxEntries);
                this.saveScores(topLocalScores);

                // Save to online database if available
                if (this.isOnline && this.leaderboardRef) {
                    this.leaderboardRef.push(scoreEntry).catch(error => {
                        console.error('Failed to save score online:', error);
                    });
                }

                // Show leaderboard
                this.setTab(this.isOnline ? 'global' : 'local');
                this.leaderboardModal.style.display = 'block';
            }
        }
    }

    showScoreModal(score) {
        document.getElementById('currentScore').textContent = score.toLocaleString();
        if (this.playerNameInput) {
            this.playerNameInput.value = '';
        }
        this.scoreModal.style.display = 'block';
        this.scoreModal.classList.add('active');

        // Completely disable Unity canvas and game container
        const gameContainer = document.getElementById('gameContainer');
        const canvas = document.querySelector('#gameContainer canvas');
        
        if (gameContainer) {
            gameContainer.style.pointerEvents = 'none';
            gameContainer.style.userSelect = 'none';
        }
        
        if (canvas) {
            canvas.blur();
            canvas.style.pointerEvents = 'none';
            canvas.classList.add('blur-game');
            canvas.tabIndex = -1;
        }
        
        // Prevent any keyboard events from reaching Unity
        document.addEventListener('keydown', this.stopUnityKeys, true);
        document.addEventListener('keyup', this.stopUnityKeys, true);
        document.addEventListener('keypress', this.stopUnityKeys, true);
        
        // Aggressively focus the input
        if (this.playerNameInput) {
            // Multiple focus attempts
            this.playerNameInput.focus();
            this.playerNameInput.select();
            
            setTimeout(() => {
                this.playerNameInput.focus();
                this.playerNameInput.select();
            }, 10);
            
            setTimeout(() => {
                this.playerNameInput.focus();
                this.playerNameInput.select();
            }, 100);
            
            setTimeout(() => {
                this.playerNameInput.focus();
                this.playerNameInput.select();
            }, 300);
        }
    }

    stopUnityKeys(e) {
        // Block Unity from receiving keyboard events, but allow input field
        if (e.target.id !== 'playerName' && e.target !== this.playerNameInput) {
            e.stopPropagation();
            e.preventDefault();
        }
    }

    hideScoreModal() {
        this.scoreModal.style.display = 'none';
        this.scoreModal.classList.remove('active');
        
        // Re-enable everything
        const gameContainer = document.getElementById('gameContainer');
        const canvas = document.querySelector('#gameContainer canvas');
        
        if (gameContainer) {
            gameContainer.style.pointerEvents = 'auto';
            gameContainer.style.userSelect = 'auto';
        }
        
        if (canvas) {
            canvas.style.pointerEvents = 'auto';
            canvas.classList.remove('blur-game');
            canvas.tabIndex = 0;
        }
        
        // Remove keyboard event blockers
        document.removeEventListener('keydown', this.stopUnityKeys, true);
        document.removeEventListener('keyup', this.stopUnityKeys, true);
        document.removeEventListener('keypress', this.stopUnityKeys, true);
    }

    async submitScore() {
        let playerName = 'Anonymous';
        if (this.playerNameInput) {
            playerName = this.playerNameInput.value.trim() || 'Anonymous';
        } else {
            // Fallback prompt if input is unavailable
            const promptName = (typeof prompt === 'function') ? prompt('Enter your name for the leaderboard:', '') : '';
            playerName = (promptName && promptName.trim()) ? promptName.trim() : 'Anonymous';
        }
        
        if (this.currentScore > 0) {
            const scoreEntry = {
                name: playerName,
                score: this.currentScore,
                date: new Date().toISOString(),
                timestamp: Date.now()
            };

            // Save to local storage
            const localScores = this.getScores();
            localScores.push(scoreEntry);
            localScores.sort((a, b) => b.score - a.score);
            const topLocalScores = localScores.slice(0, this.maxEntries);
            this.saveScores(topLocalScores);

            // Save to online database if available
            if (this.isOnline && this.leaderboardRef) {
                try {
                    await this.leaderboardRef.push(scoreEntry);
                    console.log('✓ Score saved to online leaderboard');
                } catch (error) {
                    console.error('Failed to save score online:', error);
                    // Fall back to local tab so the user still sees their score
                    this.setTab('local');
                }
            }

            // Hide score modal and show leaderboard
            this.hideScoreModal();
            // Show leaderboard on the most relevant tab
            this.setTab(this.isOnline ? 'global' : 'local');
            this.showLeaderboard();
            
            this.currentScore = 0;
        }
    }

    showLeaderboard() {
        // Default to global when online, otherwise local
        this.setTab(this.isOnline ? 'global' : 'local');
        this.leaderboardModal.style.display = 'block';
    }

    setTab(tab) {
        const desired = tab === 'global' && this.isOnline ? 'global' : 'local';
        this.currentTab = desired;
        document.querySelectorAll('.tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === desired);
        });
        this.updateLeaderboardDisplay();
    }

    updateLeaderboardDisplay() {
        const leaderboardList = document.getElementById('leaderboardList');
        const scores = this.currentTab === 'global' ? this.onlineScores : this.getScores();
        
        if (scores.length === 0) {
            const tabName = this.currentTab === 'global' ? 'global' : 'local';
            leaderboardList.innerHTML = `<p style="text-align: center; padding: 20px;">No ${tabName} scores yet. Play the game to set a record!</p>`;
        } else {
            leaderboardList.innerHTML = scores.map((entry, index) => {
                const rank = index + 1;
                const rankClass = rank <= 3 ? `rank-${rank}` : '';
                const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
                const date = new Date(entry.date || entry.timestamp);
                const timeAgo = this.getTimeAgo(date);
                
                return `
                    <div class="leaderboard-entry ${rankClass}">
                        <div class="rank">${medal || rank}</div>
                        <div class="player-info">
                            <div class="player-name">${this.escapeHtml(entry.name)}</div>
                            <div class="player-time">${timeAgo}</div>
                        </div>
                        <div class="score">${entry.score.toLocaleString()}</div>
                    </div>
                `;
            }).join('');
        }
    }

    getTimeAgo(date) {
        const seconds = Math.floor((new Date() - date) / 1000);
        
        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
        return date.toLocaleDateString();
    }

    hideLeaderboard() {
        this.leaderboardModal.style.display = 'none';
    }

    clearLeaderboard() {
        if (confirm('Are you sure you want to clear all local leaderboard scores?')) {
            localStorage.removeItem(this.storageKey);
            if (this.currentTab === 'local') {
                this.updateLeaderboardDisplay();
            }
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Manual score addition for testing
    addTestScore(name, score) {
        this.currentScore = score;
        this.playerNameInput.value = name;
        this.submitScore();
    }

    promptManualScore() {
        const score = prompt('Enter your score:');
        if (score && !isNaN(parseInt(score))) {
            const scoreNum = parseInt(score);
            if (scoreNum > 0) {
                this.checkAndAddScore(scoreNum);
            } else {
                alert('Please enter a valid score greater than 0');
            }
        }
    }
}

// Initialize leaderboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.leaderboard = new Leaderboard();
    });
} else {
    window.leaderboard = new Leaderboard();
}
