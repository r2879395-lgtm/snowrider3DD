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
        // Get DOM elements
        this.chatBtn = document.getElementById('chatBtn');
        this.chatModal = document.getElementById('chatModal');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.chatSendBtn = document.getElementById('chatSendBtn');
        this.chatClose = document.getElementById('chatClose');
        
        if (!this.chatBtn) return; // Chat not in HTML yet
        
        // Bind events
        this.chatBtn.addEventListener('click', () => this.showChat());
        this.chatClose.addEventListener('click', () => this.hideChat());
        this.chatSendBtn.addEventListener('click', () => this.sendMessage());
        
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
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
                    
                    // Update display if chat is open
                    if (this.chatModal.style.display === 'block') {
                        this.updateChatDisplay();
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

    async sendMessage() {
        const text = this.chatInput.value.trim();
        
        if (!text) {
            return;
        }
        
        if (text.length > 200) {
            alert('❌ Message too long (max 200 characters)');
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
