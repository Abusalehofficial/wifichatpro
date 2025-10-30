// Initialize Socket.IO connection
const socket = io();

// State management
const state = {
    currentUsername: '',
    currentDeviceId: '',
    currentRoom: 'general',
    messages: [],
    typingUsers: new Set(),
    isConnected: false,
    currentContextMessage: null
};

// Detect code patterns
function detectCodePattern(text) {
    const codePatterns = [
        { pattern: /^(function|const|let|var|class|import|export|def|if|for|while)\s/m, lang: 'javascript' },
        { pattern: /^(def|class|import|for|if|while|try|except)\s/m, lang: 'python' },
        { pattern: /^(public|private|class|interface|void|int|String)\s/m, lang: 'java' },
        { pattern: /^(#include|using|namespace|class|void|int)\s/m, lang: 'cpp' },
        { pattern: /^(function|foreach|foreach|class|interface|namespace)\s/m, lang: 'csharp' },
        { pattern: /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/m, lang: 'sql' },
        { pattern: /{[\s\S]*"[\s\S]*"[\s\S]*}/m, lang: 'json' },
        { pattern: /<[\w]+[\s\S]*>[\s\S]*<\/[\w]+>/m, lang: 'xml' },
        { pattern: /^<!DOCTYPE|<html|<head|<body/m, lang: 'html' },
        { pattern: /^\.[\w-]+\s*{[\s\S]*}/m, lang: 'css' }
    ];

    for (const { pattern, lang } of codePatterns) {
        if (pattern.test(text)) {
            return { isCode: true, language: lang };
        }
    }

    return { isCode: false, language: null };
}

// Initialize device ID for session persistence
function initializeDeviceId() {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = generateUUID();
        localStorage.setItem('device_id', deviceId);
    }
    state.currentDeviceId = deviceId;
    return deviceId;
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format timestamp
function formatTime(isoString) {
    const date = new Date(isoString);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// Get initials for avatar
function getInitials(username) {
    return username.split('_')[0].substring(0, 2).toUpperCase();
}

// Highlight code syntax
function highlightCode(code, language) {
    if (hljs) {
        try {
            if (language && hljs.getLanguage(language)) {
                return hljs.highlight(code, { language: language }).value;
            }
        } catch (e) {
            console.log('Syntax highlighting failed:', e);
        }
    }
    return code;
}

// Create message element
function createMessageElement(msg) {
    const isOwn = msg.user_id === socket.id;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : 'other'}`;
    messageDiv.dataset.messageId = msg.id;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = getInitials(msg.user);

    const content = document.createElement('div');
    content.className = 'message-content';

    // Message bubble
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${msg.deleted ? 'deleted' : ''}`;

    if (msg.deleted) {
        bubble.textContent = 'This message was deleted';
    } else if (msg.is_code) {
        // Code message
        const codeBlock = document.createElement('div');
        codeBlock.className = 'message-code';

        const header = document.createElement('div');
        header.className = 'code-header';
        header.innerHTML = `
            <span class="code-language">${msg.language || 'code'}</span>
        `;

        const snippet = document.createElement('div');
        snippet.className = 'code-snippet';
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.innerHTML = highlightCode(msg.message, msg.language);
        pre.appendChild(code);
        snippet.appendChild(pre);

        const viewBtn = document.createElement('button');
        viewBtn.className = 'view-code-btn';
        viewBtn.textContent = '👁️ View Full Code';
        viewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showCodeModal(msg);
        });

        codeBlock.appendChild(header);
        codeBlock.appendChild(snippet);
        codeBlock.appendChild(viewBtn);
        bubble.appendChild(codeBlock);
    } else if (msg.file_info) {
        // File message
        const fileEl = document.createElement('div');
        fileEl.className = 'message-file';

        const fileIcon = document.createElement('div');
        fileIcon.className = 'file-icon';
        fileIcon.innerHTML = getFileIcon(msg.file_info.file_type);

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';

        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = msg.file_info.original_name;

        const fileSize = document.createElement('div');
        fileSize.className = 'file-size';
        fileSize.textContent = formatFileSize(msg.file_info.file_size);

        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileSize);
        fileEl.appendChild(fileIcon);
        fileEl.appendChild(fileInfo);

        // Add click handler for file download
        fileEl.addEventListener('click', () => {
            window.open(msg.file_info.url, '_blank');
        });

        bubble.appendChild(fileEl);
    } else {
        // Text message
        const textEl = document.createElement('div');
        textEl.textContent = msg.message;
        bubble.appendChild(textEl);
    }

    content.appendChild(bubble);

    // Timestamp
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = formatTime(msg.timestamp);
    content.appendChild(meta);

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    // Context menu
    messageDiv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e, msg);
    });

    messageDiv.addEventListener('long-press', (e) => {
        showContextMenu(e, msg);
    });

    return messageDiv;
}

// Get file icon
function getFileIcon(fileType) {
    const icons = {
        'image': '🖼️',
        'video': '🎬',
        'audio': '🎵',
        'pdf': '📄',
        'document': '📋',
        'code': '💻',
        'archive': '📦',
        'file': '📎'
    };
    return icons[fileType] || '📎';
}

// Show code modal
function showCodeModal(msg) {
    const modal = document.getElementById('codeModal');
    document.getElementById('codeTitle').textContent = msg.user;
    document.getElementById('codeLanguage').textContent = msg.language || 'code';

    const codeContent = document.querySelector('#codeModal code');
    codeContent.innerHTML = highlightCode(msg.message, msg.language);

    document.getElementById('copyCodeBtn').onclick = () => {
        navigator.clipboard.writeText(msg.message).then(() => {
            const btn = document.getElementById('copyCodeBtn');
            const original = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                btn.innerHTML = original;
            }, 2000);
        });
    };

    modal.classList.remove('hidden');
}

// Close code modal
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeCodeModal');
    const modal = document.getElementById('codeModal');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });
});

// Show context menu
function showContextMenu(e, msg) {
    const menu = document.getElementById('contextMenu');
    menu.style.top = e.clientY + 'px';
    menu.style.left = e.clientX + 'px';
    menu.classList.remove('hidden');
    state.currentContextMessage = msg;

    const deleteBtn = document.getElementById('deleteMessage');
    const copyBtn = document.getElementById('copyMessage');

    // Only allow delete for own messages
    if (msg.user_id === socket.id && !msg.deleted) {
        deleteBtn.style.display = 'flex';
        deleteBtn.onclick = () => {
            socket.emit('delete_message', { message_id: msg.id });
            menu.classList.add('hidden');
        };
    } else {
        deleteBtn.style.display = 'none';
    }

    copyBtn.onclick = () => {
        const text = msg.message;
        navigator.clipboard.writeText(text).then(() => {
            menu.classList.add('hidden');
        });
    };
}

// Hide context menu on click outside
document.addEventListener('click', (e) => {
    const menu = document.getElementById('contextMenu');
    if (!menu.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

// Socket events
socket.on('connect', () => {
    console.log('Connected to server');
    state.isConnected = true;
    updateOnlineStatus('Connected');
    document.getElementById('connectionToast').classList.add('hidden');

    const deviceId = initializeDeviceId();
    socket.emit('join_chat', { device_id: deviceId });
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    state.isConnected = false;
    updateOnlineStatus('Disconnected');
    document.getElementById('connectionToast').classList.remove('hidden');
});

socket.on('username_assigned', (data) => {
    state.currentUsername = data.username;
    state.currentDeviceId = data.device_id;
    document.getElementById('currentUsername').textContent = state.currentUsername;
});

socket.on('message_history', (messages) => {
    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    state.messages = messages;

    messages.forEach(msg => {
        const el = createMessageElement(msg);
        container.appendChild(el);
    });

    scrollToBottom();
});

socket.on('new_message', (msg) => {
    state.messages.push(msg);
    const container = document.getElementById('messagesContainer');
    const el = createMessageElement(msg);
    container.appendChild(el);
    scrollToBottom();
});

socket.on('message_deleted', (data) => {
    const msgEl = document.querySelector(`[data-message-id="${data.message_id}"]`);
    if (msgEl) {
        const bubble = msgEl.querySelector('.message-bubble');
        bubble.classList.add('deleted');
        bubble.innerHTML = '<div>This message was deleted</div>';
    }
});

socket.on('user_joined', (data) => {
    console.log(`${data.user} joined (${data.users_count} users)`);
    updateOnlineStatus(`${data.users_count} online`);
});

socket.on('user_left', (data) => {
    console.log(`${data.user} left (${data.users_count} users)`);
    updateOnlineStatus(`${data.users_count} online`);
});

socket.on('user_typing', (data) => {
    const indicator = document.getElementById('typingIndicator');
    const typingUser = document.getElementById('typingUser');

    if (data.typing && data.user !== state.currentUsername) {
        state.typingUsers.add(data.user);
        typingUser.textContent = `${data.user} is typing...`;
        indicator.classList.remove('hidden');
    } else {
        state.typingUsers.delete(data.user);
        if (state.typingUsers.size === 0) {
            indicator.classList.add('hidden');
        }
    }
});

// Update online status
function updateOnlineStatus(status) {
    document.getElementById('onlineStatus').textContent = status;
}

// Scroll to bottom
function scrollToBottom() {
    const container = document.getElementById('messagesContainer');
    container.scrollTop = container.scrollHeight;
}

// Textarea auto-expand
const textarea = document.getElementById('messageInput');
if (textarea) {
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    // Handle paste event
    textarea.addEventListener('paste', async function(e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text');
        
        // Insert text at cursor position
        const start = this.selectionStart;
        const end = this.selectionEnd;
        const before = this.value.substring(0, start);
        const after = this.value.substring(end);
        this.value = before + text + after;
        
        // Set cursor after pasted text
        this.selectionStart = this.selectionEnd = start + text.length;
        
        // Trigger input event for auto-expand
        this.dispatchEvent(new Event('input'));
    });
}

// Send message
document.getElementById('sendBtn').addEventListener('click', sendMessage);
document.getElementById('messageInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        sendMessage();
    }
});

function sendMessage() {
    const textarea = document.getElementById('messageInput');
    const message = textarea.value.trim();

    if (!message) return;

    const { isCode, language } = detectCodePattern(message);

    socket.emit('send_message', {
        message: message,
        type: 'text',
        is_code: isCode,
        language: language
    });

    textarea.value = '';
    textarea.style.height = 'auto';

    // Reset typing indicator
    socket.emit('typing_stop');
}

// Typing indicator
let typingTimer;
const doneTypingInterval = 1000;

document.getElementById('messageInput').addEventListener('input', function() {
    clearTimeout(typingTimer);
    socket.emit('typing_start');
    typingTimer = setTimeout(() => {
        socket.emit('typing_stop');
    }, doneTypingInterval);
});

// File upload
document.getElementById('attachBtn').addEventListener('click', () => {
    document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', async function(e) {
    const files = Array.from(this.files);
    
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);

        const overlay = document.getElementById('uploadOverlay');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');

        overlay.classList.remove('hidden');

        try {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;
                    progressFill.style.width = percent + '%';
                    progressText.textContent = Math.round(percent) + '%';
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    const data = JSON.parse(xhr.responseText);
                    socket.emit('send_message', {
                        message: data.original_name,
                        type: 'file',
                        file_info: {
                            filename: data.filename,
                            original_name: data.original_name,
                            file_type: data.file_type,
                            file_size: data.file_size,
                            url: data.url
                        }
                    });
                }
                overlay.classList.add('hidden');
            });

            xhr.addEventListener('error', () => {
                overlay.classList.add('hidden');
                alert('Upload failed');
            });

            xhr.open('POST', '/upload');
            xhr.send(formData);
        } catch (error) {
            console.error('Upload error:', error);
            overlay.classList.add('hidden');
        }
    }

    this.value = '';
});

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initializeDeviceId();
});

// Prevent context menu on messages
document.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.message')) {
        e.preventDefault();
    }
});

// Long press for mobile
let pressTimer;
const pressDuration = 500;

document.addEventListener('touchstart', (e) => {
    const msg = e.target.closest('.message');
    if (msg) {
        pressTimer = setTimeout(() => {
            const touch = e.touches[0];
            msg.dispatchEvent(new MouseEvent('long-press', {
                clientX: touch.clientX,
                clientY: touch.clientY
            }));
        }, pressDuration);
    }
});

document.addEventListener('touchend', () => {
    clearTimeout(pressTimer);
});

console.log('WiFi Chat Pro - Ready');