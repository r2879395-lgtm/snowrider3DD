// Leaderboard System for Snow Rider 3D
class Leaderboard {
    constructor() {
        this.storageKey = 'snowRider3D_leaderboard';
        this.maxEntries = 10;
        this.currentScore = 0;
        this.lastShownScore = null;
        this.scoreModalDebounceTime = 5000; // 5 second debounce
        this.lastScoreModalTime = 0;
        this.currentTab = 'global';
        this.isOnline = false;
        this.database = null;
        this.leaderboardRef = null;
        this.onlineScores = [];
        this.activePlayersRef = null;
        this.activePlayers = 0;
        this.playerSessionId = this.generateSessionId();
        
        // Bind event handler methods
        this.stopUnityKeys = this.stopUnityKeys.bind(this);
        
        this.init();
    }

    generateSessionId() {
        return 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    init() {
        // Get DOM elements
        this.leaderboardBtn = document.getElementById('leaderboardBtn');
        this.leaderboardModal = document.getElementById('leaderboardModal');
        this.scoreModal = document.getElementById('scoreModal');
        this.closeBtn = document.querySelector('.close');
        this.submitScoreBtn = document.getElementById('submitScore');
        this.playerNameDisplay = document.getElementById('playerNameDisplay');
        this.connectionStatus = document.getElementById('connectionStatus');
        this.playerCount = document.getElementById('playerCount');
        this.activeBadge = document.getElementById('activePlayers');
        this.playersListContent = document.getElementById('playersListContent');
        this.welcomeModal = document.getElementById('welcomeModal');
        this.welcomePlayerNameInput = document.getElementById('welcomePlayerName');
        this.welcomeStartBtn = document.getElementById('welcomeStartBtn');
        this.currentPlayerName = localStorage.getItem('snowRider3D_playerName') || null;

        // Show welcome modal if no saved name
        if (!this.currentPlayerName) {
            this.showWelcomeModal();
        } else {
            console.log('👤 Welcome back,', this.currentPlayerName);
                    // Player already has a name, start Unity immediately
                    if (window.initUnity) {
                        setTimeout(() => window.initUnity(), 100);
                    }
        }

        // Initialize Firebase/Online database
        this.initializeOnlineDatabase();

        // Bind events
        this.leaderboardBtn.addEventListener('click', () => this.showLeaderboard());
        this.closeBtn.addEventListener('click', () => this.hideLeaderboard());
        this.submitScoreBtn.addEventListener('click', () => this.submitScore());
        
        // Add dismiss button handler for score modal
        const dismissScoreBtn = document.getElementById('dismissScore');
        if (dismissScoreBtn) {
            dismissScoreBtn.addEventListener('click', () => this.hideScoreModal());
        }
        
        // Add close button handler for score modal
        const scoreModalClose = document.getElementById('scoreModalClose');
        if (scoreModalClose) {
            scoreModalClose.addEventListener('click', () => this.hideScoreModal());
        }
        
        // Remove scores button
        const removeBtn = document.getElementById('removeScoresBtn');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => this.showRemoveScoresDialog());
        }
        
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
            // Don't allow closing welcome modal by clicking outside
        });



        // Enter key in welcome modal
        if (this.welcomePlayerNameInput) {
            this.welcomePlayerNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleWelcomeSubmit();
                }
            });
        }

        // Welcome start button
        if (this.welcomeStartBtn) {
            this.welcomeStartBtn.addEventListener('click', () => {
                this.handleWelcomeSubmit();
            });
        }

        // Track when user closes browser/tab - remove from active players
        window.addEventListener('beforeunload', () => {
            this.removeActivePlayer();
        });

        // Listen for Unity messages
        this.setupUnityListener();
    }

    async initializeOnlineDatabase() {
        // Wait for Firebase config to load
        await this.waitForFirebase();

        console.log('🔍 Firebase check:', {
            firebaseConfig: !!window.firebaseConfig,
            isAvailable: window.firebaseConfig?.isAvailable,
            hasDatabase: !!window.firebaseConfig?.database
        });

        if (window.firebaseConfig && window.firebaseConfig.isAvailable) {
            try {
                this.database = window.firebaseConfig.database;
                this.leaderboardRef = this.database.ref('leaderboard');
                this.activePlayersRef = this.database.ref('activePlayers');
                this.isOnline = true;
                console.log('📡 Firebase reference created');

                // Register as active player
                const playerData = {
                    timestamp: firebase.database.ServerValue.TIMESTAMP,
                    sessionId: this.playerSessionId,
                    name: this.currentPlayerName || 'Anonymous'
                };
                
                this.activePlayersRef.child(this.playerSessionId).set(playerData)
                    .then(() => console.log('✓ Registered as active player:', this.playerSessionId, this.currentPlayerName || 'Anonymous'))
                    .catch(err => console.log('Error registering active player:', err));
                
                // Remove this player when they disconnect
                this.activePlayersRef.child(this.playerSessionId).onDisconnect().remove();
                
                // Update active player timestamp every 15 seconds to keep session alive and show updates
                this.heartbeatInterval = setInterval(() => {
                    if (this.activePlayersRef) {
                        this.activePlayersRef.child(this.playerSessionId).update({
                            timestamp: firebase.database.ServerValue.TIMESTAMP,
                            name: this.currentPlayerName
                        }).catch(err => console.log('Error updating player timestamp:', err));
                    }
                }, 15000);
                
                // Listen for real-time updates
                this.leaderboardRef.orderByChild('score').limitToLast(100).on('value', (snapshot) => {
                    console.log('📊 Firebase snapshot received:', snapshot.numChildren(), 'entries');
                    this.onlineScores = [];
                    snapshot.forEach((child) => {
                        this.onlineScores.push({
                            id: child.key,
                            ...child.val()
                        });
                    });
                    
                    // Sort by score descending
                    this.onlineScores.sort((a, b) => b.score - a.score);
                    
                    // Deduplicate by player name - keep only the highest score per player
                    const playerMap = new Map();
                    this.onlineScores.forEach(score => {
                        const playerKey = score.name.toLowerCase();
                        if (!playerMap.has(playerKey) || playerMap.get(playerKey).score < score.score) {
                            playerMap.set(playerKey, score);
                        }
                    });
                    this.onlineScores = Array.from(playerMap.values()).sort((a, b) => b.score - a.score);
                    this.onlineScores = this.onlineScores.slice(0, this.maxEntries);
                    
                    console.log('🏆 Top scores:', this.onlineScores.map(s => `${s.name}: ${s.score}`).join(', '));
                    
                    // Update display if modal is open
                    if (this.leaderboardModal.style.display === 'block') {
                        this.updateLeaderboardDisplay();
                    }
                    
                    this.updatePlayerCount();
                }, (error) => {
                    console.error('❌ Firebase listener error:', error);
                    this.fallbackToLocalOnly();
                });

                // Listen for active players count
                this.activePlayersRef.on('value', (snapshot) => {
                    const data = snapshot.val();
                    console.log('📡 Active players snapshot:', data);
                    
                    if (!data) {
                        this.activePlayers = 0;
                        this.activePlayersList = [];
                    } else {
                        const now = Date.now();
                        const allPlayers = Object.values(data);
                        console.log(`📊 Total entries in activePlayers: ${allPlayers.length}`);
                        
                        const validPlayers = allPlayers.filter(player => {
                            // Consider player active if timestamp is within last 5 minutes
                            const timeSinceLastSeen = now - player.timestamp;
                            const isActive = timeSinceLastSeen < 5 * 60 * 1000;
                            console.log(`   Player: ${player.name || player.sessionId}, age: ${(timeSinceLastSeen / 1000).toFixed(1)}s, active: ${isActive}`);
                            return isActive;
                        });
                        this.activePlayers = validPlayers.length;
                        this.activePlayersList = validPlayers.map(p => p.name || 'Anonymous');
                        console.log(`🎮 Active players: ${this.activePlayers}`, this.activePlayersList);
                    }
                    this.updatePlayerCountDisplay();
                });

                this.updateConnectionStatus(true);
                console.log('✓ Online leaderboard connected');
            } catch (error) {
                console.error('❌ Firebase connection error:', error);
                this.fallbackToLocalOnly();
            }
        } else {
            console.log('⚠️ Firebase not available, using local only');
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
                this.connectionStatus.textContent = '🟢 Online';
                this.connectionStatus.className = 'status-badge online';
            } else {
                this.connectionStatus.textContent = '🔴 Offline';
                this.connectionStatus.className = 'status-badge offline';
            }
        }
    }

    updatePlayerCount() {
        if (this.playerCount) {
            // Count unique players by unique names
            const uniquePlayers = new Set();
            this.onlineScores.forEach(score => {
                if (score.name) {
                    uniquePlayers.add(score.name.toLowerCase());
                }
            });
            
            const count = uniquePlayers.size;
            const scoreCount = this.onlineScores.length;
            this.playerCount.textContent = `👥 ${count} player${count !== 1 ? 's' : ''} | 📊 ${scoreCount} score${scoreCount !== 1 ? 's' : ''}`;
            console.log(`📊 Leaderboard: ${count} unique players, ${scoreCount} total scores`);
        }
    }

    updatePlayerCountDisplay() {
        if (this.connectionStatus) {
            const currentText = this.connectionStatus.textContent;
            // Update connection status to show active players
            if (this.isOnline) {
                this.connectionStatus.textContent = `🟢 Online | 🎮 ${this.activePlayers} playing`;
                this.connectionStatus.style.color = '#44ff44';
            } else {
                this.connectionStatus.textContent = '🟡 Offline';
                this.connectionStatus.style.color = '#ffaa00';
            }
        }
        
        // Update the prominent badge
        if (this.activeBadge) {
            this.activeBadge.textContent = `🎮 ${this.activePlayers} playing`;
        }
        
        // Update the players list dropdown
        if (this.playersListContent) {
            if (!this.activePlayersList || this.activePlayersList.length === 0) {
                this.playersListContent.innerHTML = '<div style="color: #999; font-style: italic;">No players online</div>';
            } else {
                const playerItems = this.activePlayersList.map(name => 
                    `<div class="player-item">👤 ${name}</div>`
                ).join('');
                this.playersListContent.innerHTML = playerItems;
            }
        }
    }

    removeActivePlayer() {
        if (this.activePlayersRef && this.playerSessionId) {
            this.activePlayersRef.child(this.playerSessionId).remove()
                .catch(err => console.log('Error removing active player:', err));
        }
    }

    setupUnityListener() {
        // Disabled: Automatic score detection from game
        // Users must manually submit scores via the "➕ Submit Score" button
        // This prevents duplicate prompts and gives users control over when/what scores to submit
        
        console.log('ℹ️ Automatic score detection disabled - use ➕ Submit Score button instead');
    }

    getScores() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? JSON.parse(stored) : [];
    }

    hasExistingScore(name) {
        const target = (name || '').toLowerCase();
        if (!target) return false;

        // Check local stored scores
        const localHit = this.getScores().some(entry => (entry.name || '').toLowerCase() === target);
        if (localHit) return true;

        // Check online scores already loaded
        const onlineHit = (this.onlineScores || []).some(entry => (entry.name || '').toLowerCase() === target);
        return onlineHit;
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
            const storedName = this.currentPlayerName || localStorage.getItem('snowRider3D_playerName');
            const playerName = (storedName && storedName.trim()) ? storedName.trim() : '';

            // No name means welcome was not completed; require it before saving
            if (!playerName) {
                alert('Please enter your name on the welcome screen before submitting scores.');
                this.showWelcomeModal();
                return;
            }

            // Persist the chosen name so future submissions stay in sync
            localStorage.setItem('snowRider3D_playerName', playerName);
            this.currentPlayerName = playerName;
            if (window.chat) {
                window.chat.updatePlayerName(playerName);
            }

            // Prevent multiple scores per player
            if (this.hasExistingScore(playerName)) {
                alert('You have already submitted a score. Only one score per player.');
                return;
            }

            const scoreEntry = {
                name: playerName,
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
                // Write score keyed by name to avoid duplicates server-side
                const safeKey = playerName.toLowerCase();
                this.leaderboardRef.child(safeKey).set(scoreEntry).catch(error => {
                    console.error('Failed to save score online:', error);
                });
            }

            // Show leaderboard
            this.setTab(this.isOnline ? 'global' : 'local');
            this.leaderboardModal.style.display = 'block';
        }
    }

    showScoreModal(score) {
        // Debounce repeated score modal prompts for the same score
        const now = Date.now();
        if (this.lastShownScore === score && (now - this.lastScoreModalTime) < this.scoreModalDebounceTime) {
            console.log('↩️ Score modal already shown for', score, '- debounced');
            return;
        }
        
        this.lastShownScore = score;
        this.lastScoreModalTime = now;
        this.currentScore = score;
        
        document.getElementById('currentScore').textContent = score.toLocaleString();
        const storedName = this.currentPlayerName || localStorage.getItem('snowRider3D_playerName') || 'Player';
        if (this.playerNameDisplay) {
            this.playerNameDisplay.textContent = storedName;
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
    }

    stopUnityKeys(e) {
        // Allow inputs inside modals and floating chat; block everything else so Unity cannot capture
        const allowedTargets = [
            this.welcomePlayerNameInput,
            this.welcomeStartBtn,
            this.submitScoreBtn,
            document.getElementById('floatingChatInput'),
            document.getElementById('floatingChatSendBtn')
        ].filter(Boolean);

        const isAllowed = allowedTargets.some(el => el === e.target) ||
            (e.target.closest && (e.target.closest('.modal') || e.target.closest('.floating-chat-popup')));

        if (!isAllowed) {
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
        const storedName = this.currentPlayerName || localStorage.getItem('snowRider3D_playerName');
        let playerName = (storedName && storedName.trim()) ? storedName.trim() : '';

        if (!playerName) {
            alert('Please enter your name on the welcome screen before submitting scores.');
            this.showWelcomeModal();
            return;
        }

        // Prevent multiple scores per player
        if (this.hasExistingScore(playerName)) {
            alert('You have already submitted a score. Only one score per player.');
            return;
        }
        
        // Store player name for active player tracking
        localStorage.setItem('snowRider3D_playerName', playerName);
        this.currentPlayerName = playerName;
        
        // Update active player name in Firebase
        if (this.activePlayersRef) {
            this.activePlayersRef.child(this.playerSessionId).update({
                name: playerName
            }).catch(err => console.log('Error updating player name:', err));
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
        this.updatePlayerCount();
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
                const entryId = entry.id || index;
                
                return `
                    <div class="leaderboard-entry ${rankClass}">
                        <div class="rank">${medal || rank}</div>
                        <div class="player-info">
                            <div class="player-name">${this.escapeHtml(entry.name)}</div>
                            <div class="player-time">${timeAgo}</div>
                        </div>
                        <div class="score">${entry.score.toLocaleString()}</div>
                        <button class="delete-score-btn" data-entry-id="${entryId}" data-tab="${this.currentTab}" title="Delete this score">🗑️</button>
                    </div>
                `;
            }).join('');
            
            // Add event listeners to delete buttons
            document.querySelectorAll('.delete-score-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const entryId = btn.getAttribute('data-entry-id');
                    const tab = btn.getAttribute('data-tab');
                    this.deleteSingleScore(entryId, tab);
                });
            });
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

    showWelcomeModal() {
        if (this.welcomeModal) {
            this.welcomeModal.style.display = 'block';
            this.welcomeModal.classList.add('active');
            
            // Completely disable Unity canvas interactions
            const gameContainer = document.getElementById('gameContainer');
            const unityCanvas = document.querySelector('#gameContainer canvas');
            if (gameContainer) {
                gameContainer.style.pointerEvents = 'none';
            }
            if (unityCanvas) {
                unityCanvas.blur();
                unityCanvas.style.pointerEvents = 'none';
                unityCanvas.tabIndex = -1;
            }
            
            // Aggressive focus management
            const focusInput = () => {
                if (this.welcomePlayerNameInput && this.welcomeModal.style.display === 'block') {
                    this.welcomePlayerNameInput.focus();
                    this.welcomePlayerNameInput.select();
                }
            };
            
            // Focus immediately and repeatedly to fight Unity
            focusInput();
            setTimeout(focusInput, 100);
            setTimeout(focusInput, 300);
            setTimeout(focusInput, 500);
            
            // Keep focus on input - fight Unity's focus stealing
            this.focusInterval = setInterval(focusInput, 200);

            // Block Unity from receiving keyboard events while welcome modal is open
            document.addEventListener('keydown', this.stopUnityKeys, true);
            document.addEventListener('keyup', this.stopUnityKeys, true);
            document.addEventListener('keypress', this.stopUnityKeys, true);
            
            // Prevent any clicks/focus outside the input from stealing focus
            this.focusGuard = (e) => {
                if (this.welcomeModal.style.display === 'block' && 
                    e.target !== this.welcomePlayerNameInput && 
                    e.target !== this.welcomeStartBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    focusInput();
                }
            };
            document.addEventListener('mousedown', this.focusGuard, true);
            document.addEventListener('focus', this.focusGuard, true);
        }
    }

    handleWelcomeSubmit() {
        const name = this.welcomePlayerNameInput.value.trim();
        if (!name) {
            alert('Please enter your name!');
            return;
        }

        // Save player name
        localStorage.setItem('snowRider3D_playerName', name);
        this.currentPlayerName = name;
        console.log('👤 Welcome,', name);

        // Update chat system with new player name
        if (window.chat) {
            window.chat.updatePlayerName(name);
        }

        // Update active player name in Firebase
        if (this.activePlayersRef) {
            this.activePlayersRef.child(this.playerSessionId).update({
                name: name
            }).catch(err => console.log('Error updating player name:', err));
        }

        // Clean up focus management
        if (this.focusInterval) {
            clearInterval(this.focusInterval);
            this.focusInterval = null;
        }
        if (this.focusGuard) {
            document.removeEventListener('mousedown', this.focusGuard, true);
            document.removeEventListener('focus', this.focusGuard, true);
            this.focusGuard = null;
        }

        // Remove keyboard event blockers
        document.removeEventListener('keydown', this.stopUnityKeys, true);
        document.removeEventListener('keyup', this.stopUnityKeys, true);
        document.removeEventListener('keypress', this.stopUnityKeys, true);

        // Re-enable Unity canvas
        const gameContainer = document.getElementById('gameContainer');
        const unityCanvas = document.querySelector('#gameContainer canvas');
        if (gameContainer) {
            gameContainer.style.pointerEvents = 'auto';
        }
        if (unityCanvas) {
            unityCanvas.style.pointerEvents = 'auto';
            unityCanvas.tabIndex = 0;
        }

        // Hide welcome modal
        this.welcomeModal.style.display = 'none';
        this.welcomeModal.classList.remove('active');

            // Now that player has entered their name, start Unity
            console.log('🎮 Starting Unity...');
            if (window.initUnity) {
                window.initUnity();
            }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Debug: Test Firebase connection
    testFirebase() {
        console.log('🔍 Firebase Debug Info:');
        console.log('  isOnline:', this.isOnline);
        console.log('  database:', !!this.database);
        console.log('  leaderboardRef:', !!this.leaderboardRef);
        console.log('  onlineScores:', this.onlineScores.length, 'entries');
        
        if (this.isOnline && this.leaderboardRef) {
            console.log('📝 Attempting to read leaderboard...');
            this.leaderboardRef.once('value', (snapshot) => {
                console.log('✅ Firebase read successful:', snapshot.numChildren(), 'entries');
                snapshot.forEach((child) => {
                    console.log(`   ${child.val().name}: ${child.val().score}`);
                });
            }).catch(error => {
                console.error('❌ Firebase read failed:', error);
            });
        } else {
            console.log('⚠️ Firebase not online or ref not available');
        }
    }

    // Manual score addition for testing
    addTestScore(name, score) {
        this.currentScore = score;
        this.playerNameInput.value = name;
        this.submitScore();
    }

    // Remove scores with passkey protection
    showRemoveScoresDialog() {
        const passkey = prompt('🔐 Enter admin passkey to remove all scores:', '');
        
        if (passkey === null) {
            console.log('ℹ️ Remove cancelled');
            return;
        }
        
        // Admin passkey (change this to your own secure passkey)
        const ADMIN_PASSKEY = 'snowrider2025';
        
        if (passkey !== ADMIN_PASSKEY) {
            alert('❌ Incorrect passkey! Access denied.');
            console.log('⚠️ Invalid passkey attempt');
            return;
        }
        
        // Show confirmation dialog
        const confirm = window.confirm('⚠️ This will DELETE ALL scores from the global leaderboard!\n\nAre you sure?');
        
        if (!confirm) {
            console.log('ℹ️ Deletion cancelled');
            return;
        }
        
        this.deleteAllScores();
    }

    deleteSingleScore(entryId, tab) {
        // Ask for confirmation
        if (!confirm('Are you sure you want to delete this score?')) {
            return;
        }

        // Ask for passkey
        const passkey = prompt('Enter admin passkey to delete this score:');
        if (passkey !== 'snowrider2025') {
            alert('❌ Incorrect passkey!');
            return;
        }

        console.log('🗑️ Deleting score:', entryId, 'from', tab);

        if (tab === 'global') {
            // Delete from Firebase
            if (this.isOnline && this.leaderboardRef) {
                this.leaderboardRef.child(entryId).remove()
                    .then(() => {
                        console.log('✅ Score deleted from Firebase');
                        alert('✅ Score has been removed!');
                        // Firebase listener will automatically update the display
                    })
                    .catch(error => {
                        console.error('❌ Failed to delete score:', error);
                        alert('❌ Error deleting score: ' + error.message);
                    });
            }
        } else {
            // Delete from local storage
            const localScores = this.getScores();
            localScores.splice(entryId, 1); // entryId is the index for local scores
            this.saveScores(localScores);
            console.log('✅ Score deleted from local storage');
            alert('✅ Score has been removed!');
            this.updateLeaderboardDisplay();
        }
    }

    deleteAllScores() {
        console.log('🗑️ Deleting all scores...');
        
        // Delete local scores
        localStorage.removeItem(this.storageKey);
        this.onlineScores = [];
        console.log('✅ Local scores cleared');
        
        // Delete online scores
        if (this.isOnline && this.leaderboardRef) {
            this.leaderboardRef.remove()
                .then(() => {
                    console.log('✅ Online scores cleared from Firebase');
                    alert('✅ All scores have been removed!');
                    
                    // Refresh display
                    this.updateLeaderboardDisplay();
                })
                .catch(error => {
                    console.error('❌ Failed to delete online scores:', error);
                    alert('❌ Error deleting online scores: ' + error.message);
                });
        } else {
            alert('✅ Local scores cleared (Firebase not available)');
            this.updateLeaderboardDisplay();
        }
    }

    async resetAllNames() {
        console.log('🔁 Resetting all player names...');
        // Clear local name for this browser
        localStorage.removeItem('snowRider3D_playerName');
        this.currentPlayerName = null;

        const tasks = [];

        if (this.isOnline && this.leaderboardRef) {
            const leaderboardReset = this.leaderboardRef.once('value').then(snapshot => {
                const updates = {};
                snapshot.forEach(child => {
                    updates[`${child.key}/name`] = 'Anonymous';
                });
                if (Object.keys(updates).length === 0) return;
                return this.leaderboardRef.update(updates);
            });
            tasks.push(leaderboardReset);
        }

        if (this.isOnline && this.activePlayersRef) {
            const activeReset = this.activePlayersRef.once('value').then(snapshot => {
                const updates = {};
                snapshot.forEach(child => {
                    updates[`${child.key}/name`] = 'Anonymous';
                });
                if (Object.keys(updates).length === 0) return;
                return this.activePlayersRef.update(updates);
            });
            tasks.push(activeReset);
        }

        try {
            await Promise.all(tasks);
            console.log('✅ All names reset to Anonymous');
            alert('✅ All player names have been reset. Everyone will be prompted to enter a new name.');
        } catch (err) {
            console.error('❌ Error resetting names:', err);
            alert('❌ Error resetting names: ' + err.message);
        }

        // Prompt this user again immediately
        this.showWelcomeModal();
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

// Global debug function for Firebase testing
window.debugFirebase = function() {
    if (window.leaderboard) {
        window.leaderboard.testFirebase();
    } else {
        console.log('❌ Leaderboard not initialized');
    }
};

// Global function to reset player names - forces welcome modal to show again
window.resetPlayerNames = function() {
    localStorage.removeItem('snowRider3D_playerName');
    console.log('✅ Player name cleared! Reload the page to see the welcome modal again.');
    alert('✅ Player name has been reset! Reload the page to enter a new name.');
};

// Global function to reset ALL player names (Firebase + local) and re-prompt everyone
window.resetAllNames = async function() {
    if (window.leaderboard) {
        await window.leaderboard.resetAllNames();
    } else {
        console.log('❌ Leaderboard not initialized');
    }
};
