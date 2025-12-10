// Real-time Chat System for Snow Rider 3D
class Chat {
    constructor() {
        this.database = null;
        this.chatRef = null;
        this.isOnline = false;
        this.currentPlayerName = localStorage.getItem('snowRider3D_playerName') || 'Anonymous';
        this.maxMessages = 50;
        this.messages = [];
        
        this.init();
    }

    init() {
        // Get DOM elements for modal
        this.chatBtn = document.getElementById('chatBtn');
        this.chatModal = document.getElementById('chatModal');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.chatSendBtn = document.getElementById('chatSendBtn');
        this.chatClose = document.getElementById('chatClose');
        
        // Get DOM elements for floating popup
        this.floatingPopup = document.getElementById('floatingChatPopup');
        this.floatingMessages = document.getElementById('floatingChatMessages');
        this.floatingInput = document.getElementById('floatingChatInput');
        this.floatingSendBtn = document.getElementById('floatingChatSendBtn');
        this.floatingToggle = document.getElementById('floatingChatToggle');
        
        if (!this.chatBtn) return; // Chat not in HTML yet
        
        // Modal events
        this.chatBtn.addEventListener('click', () => this.showChat());
        this.chatClose.addEventListener('click', () => this.hideChat());
        this.chatSendBtn.addEventListener('click', () => this.sendMessage());
        
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Floating popup events
        this.floatingToggle.addEventListener('click', () => this.toggleFloatingChat());
        this.floatingSendBtn.addEventListener('click', () => this.sendMessageFloating());
        
        this.floatingInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessageFloating();
            }
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === this.chatModal) {
                this.hideChat();
            }
        });
        
        // Initialize Firebase
        this.initializeChat();
    }

    async initializeChat() {
        // Wait for Firebase to load
        await this.waitForFirebase();
        
        if (window.firebaseConfig && window.firebaseConfig.isAvailable) {
            try {
                this.database = window.firebaseConfig.database;
                this.chatRef = this.database.ref('chat');
                this.isOnline = true;
                console.log('💬 Chat system initialized');
                
                // Listen for new messages
                this.chatRef.orderByChild('timestamp').limitToLast(this.maxMessages).on('value', (snapshot) => {
                    this.messages = [];
                    snapshot.forEach((child) => {
                        this.messages.push({
                            id: child.key,
                            ...child.val()
                        });
                    });
                    
                    // Sort by timestamp ascending (oldest first)
                    this.messages.sort((a, b) => a.timestamp - b.timestamp);
                    
                    // Update both displays
                    if (this.chatModal.style.display === 'block') {
                        this.updateChatDisplay();
                    }
                    if (!this.floatingPopup.classList.contains('collapsed')) {
                        this.updateFloatingChatDisplay();
                    }
                });
            } catch (error) {
                console.error('❌ Chat initialization error:', error);
                this.isOnline = false;
            }
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
                
                setTimeout(() => {
                    clearInterval(checkInterval);
                    resolve();
                }, 5000);
            }
        });
    }

    showChat() {
        if (this.chatModal) {
            this.chatModal.style.display = 'block';
            this.chatModal.classList.add('active');
            this.updateChatDisplay();
            
            // Scroll to bottom
            setTimeout(() => {
                this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
            }, 100);
            
            // Focus input
            this.chatInput.focus();
        }
    }

    hideChat() {
        if (this.chatModal) {
            this.chatModal.style.display = 'none';
            this.chatModal.classList.remove('active');
        }
    }

    toggleFloatingChat() {
        if (!this.floatingPopup) return;
        
        const isCollapsed = this.floatingPopup.classList.contains('collapsed');
        if (isCollapsed) {
            this.floatingPopup.classList.remove('collapsed');
            this.floatingToggle.textContent = '−';
            this.updateFloatingChatDisplay();
            setTimeout(() => this.floatingInput.focus(), 100);
        } else {
            this.floatingPopup.classList.add('collapsed');
            this.floatingToggle.textContent = '+';
        }
    }

    updateChatDisplay() {
        if (!this.chatMessages) return;
        
        this.chatMessages.innerHTML = '';
        
        if (this.messages.length === 0) {
            this.chatMessages.innerHTML = '<div class="chat-empty">No messages yet. Start the conversation!</div>';
            return;
        }
        
        this.messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'chat-message';
            if (msg.name === this.currentPlayerName) {
                msgDiv.classList.add('own-message');
            }
            
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            msgDiv.innerHTML = `
                <div class="chat-name">${this.escapeHtml(msg.name)}</div>
                <div class="chat-text">${this.escapeHtml(msg.text)}</div>
                <div class="chat-time">${timeStr}</div>
            `;
            
            this.chatMessages.appendChild(msgDiv);
        });
        
        // Scroll to bottom
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    updateFloatingChatDisplay() {
        if (!this.floatingMessages) return;
        
        this.floatingMessages.innerHTML = '';
        
        if (this.messages.length === 0) {
            this.floatingMessages.innerHTML = '<div class="floating-chat-empty">No messages yet</div>';
            return;
        }
        
        this.messages.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'floating-chat-message';
            if (msg.name === this.currentPlayerName) {
                msgDiv.classList.add('own-message');
            }
            
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
            
            msgDiv.innerHTML = `
                <div class="floating-chat-name">${this.escapeHtml(msg.name)}</div>
                <div class="floating-chat-text">${this.escapeHtml(msg.text)}</div>
                <div class="floating-chat-time">${timeStr}</div>
            `;
            
            this.floatingMessages.appendChild(msgDiv);
        });
        
        // Scroll to bottom
        this.floatingMessages.scrollTop = this.floatingMessages.scrollHeight;
    }

    async sendMessage() {
        const text = this.chatInput.value.trim();
        
        if (!text) {
            return;
        }
        
        if (text.length > 200) {
            alert('❌ Message too long (max 200 characters)');
            return;
        }
        
        // Check for spam
        if (this.isSpam(text)) {
            alert('❌ Message contains spam or is not allowed');
            return;
        }
        
        if (!this.isOnline || !this.chatRef) {
            alert('❌ Chat not available. Firebase connection required.');
            return;
        }
        
        try {
            const message = {
                name: this.currentPlayerName,
                text: text,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            
            await this.chatRef.push(message);
            this.chatInput.value = '';
            console.log('✅ Message sent');
        } catch (error) {
            console.error('❌ Error sending message:', error);
            alert('❌ Failed to send message: ' + error.message);
        }
    }

    async sendMessageFloating() {
        const text = this.floatingInput.value.trim();
        
        if (!text) {
            return;
        }
        
        if (text.length > 200) {
            alert('❌ Message too long (max 200 characters)');
            return;
        }
        
        // Check for spam
        if (this.isSpam(text)) {
            alert('❌ Message contains spam or is not allowed');
            return;
        }
        
        if (!this.isOnline || !this.chatRef) {
            alert('❌ Chat not available. Firebase connection required.');
            return;
        }
        
        try {
            const message = {
                name: this.currentPlayerName,
                text: text,
                timestamp: firebase.database.ServerValue.TIMESTAMP
            };
            
            await this.chatRef.push(message);
            this.floatingInput.value = '';
            console.log('✅ Message sent');
        } catch (error) {
            console.error('❌ Error sending message:', error);
            alert('❌ Failed to send message: ' + error.message);
        }
    }

    isSpam(text) {
        // Convert to lowercase for checking
        const lowerText = text.toLowerCase();
        
        // Check for repeated characters (more than 3 of the same char in a row)
        if (/(.)\1{3,}/g.test(lowerText)) {
            console.log('❌ Spam detected: Repeated characters');
            return true;
        }
        
        // Check for excessive all caps (more than 80% uppercase)
        const uppercaseCount = (text.match(/[A-Z]/g) || []).length;
        if (text.length > 5 && (uppercaseCount / text.length) > 0.8) {
            console.log('❌ Spam detected: Excessive caps');
            return true;
        }
        
        // Check for common spam words/phrases
        const spamKeywords = [
            'viagra', 'casino', 'lottery', 'prize', 'click here', 
            'buy now', 'free money', 'make money fast', 'work from home',
            'xxx', 'porn', 'adult content', 'dating site'
        ];
        
        for (let keyword of spamKeywords) {
            if (lowerText.includes(keyword)) {
                console.log('❌ Spam detected: Banned keyword -', keyword);
                return true;
            }
        }
        
        // Check for URLs (simple check)
        if (/https?:\/\/|www\./g.test(lowerText)) {
            console.log('❌ Spam detected: URL');
            return true;
        }
        
        // Check for too many special characters
        const specialCharCount = (text.match(/[!@#$%^&*]/g) || []).length;
        if (specialCharCount > (text.length * 0.3)) {
            console.log('❌ Spam detected: Too many special characters');
            return true;
        }
        
        return false;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updatePlayerName(newName) {
        this.currentPlayerName = newName;
    }
}

// Initialize chat when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.chat = new Chat();
    });
} else {
    window.chat = new Chat();
}
