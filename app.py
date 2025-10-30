#!/usr/bin/env python3
"""
Mobile-First WiFi Chat - Professional White Theme with Session Persistence
"""

from flask import Flask, render_template, request, send_from_directory, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
import uuid
import datetime
import json
import threading
import time
from werkzeug.utils import secure_filename
import mimetypes
import hashlib

app = Flask(__name__)
app.config['SECRET_KEY'] = 'wifi-chat-secret-2024'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024 * 1024

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {
    'txt', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tiff',
    'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', '3gp',
    'mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma',
    'php', 'js', 'html', 'css', 'py', 'java', 'cpp', 'c',
    'json', 'xml', 'csv', 'sql', 'md', 'log', 'ini', 'cfg',
    'zip', 'rar', '7z', 'tar', 'gz', 'exe', 'dmg', 'pkg'
}

for folder in [UPLOAD_FOLDER, 'static', 'static/css', 'static/js']:
    os.makedirs(folder, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
socketio = SocketIO(app, cors_allowed_origins="*", max_size=50*1024*1024, ping_timeout=60, ping_interval=25)

# Storage
users = {}
sessions = {}
rooms = {'general': {'users': [], 'messages': []}}
SESSION_DURATION = 24 * 3600

def get_device_hash(device_id):
    """Get or create device hash for session persistence"""
    return hashlib.sha256(device_id.encode()).hexdigest()

def cleanup_old_messages():
    """Delete messages older than 24 hours"""
    while True:
        try:
            current_time = datetime.datetime.now()
            for room_id in rooms:
                room = rooms[room_id]
                room['messages'] = [
                    msg for msg in room['messages']
                    if (current_time - datetime.datetime.fromisoformat(msg['timestamp'])).total_seconds() < 86400
                ]
            
            # Cleanup expired sessions
            expired_devices = []
            for device_hash, session in sessions.items():
                if (datetime.datetime.now() - datetime.datetime.fromisoformat(session['joined_at'])).total_seconds() > SESSION_DURATION:
                    expired_devices.append(device_hash)
            
            for device_hash in expired_devices:
                del sessions[device_hash]
            
            time.sleep(3600)
        except Exception as e:
            print(f"Cleanup error: {e}")
            time.sleep(3600)

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def get_file_type(filename):
    """Determine file type for frontend handling"""
    mime_type, _ = mimetypes.guess_type(filename)
    extension = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    
    if mime_type and mime_type.startswith('image/'):
        return 'image'
    elif mime_type and mime_type.startswith('video/'):
        return 'video'
    elif mime_type and mime_type.startswith('audio/'):
        return 'audio'
    elif extension in ['php', 'js', 'html', 'css', 'py', 'java', 'cpp', 'c', 'json', 'xml']:
        if extension == 'php':
            return 'php'
        elif extension in ['js', 'javascript']:
            return 'javascript'
        elif extension == 'py':
            return 'python'
        else:
            return 'code'
    elif extension in ['pdf', 'doc', 'docx', 'txt', 'md']:
        if extension == 'pdf':
            return 'pdf'
        else:
            return 'document'
    elif extension in ['zip', 'rar', '7z', 'tar', 'gz']:
        return 'archive'
    
    return 'file'

@app.route('/')
def index():
    """Main chat interface"""
    return render_template('index.html')

@app.route('/uploads/<filename>')
def uploaded_file(filename):
    """Serve uploaded files"""
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle file uploads"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file selected'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        unique_filename = f"{uuid.uuid4().hex}_{filename}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_filename)
        
        try:
            file.save(file_path)
            file_size = os.path.getsize(file_path)
            file_type = get_file_type(filename)
            
            return jsonify({
                'success': True,
                'filename': unique_filename,
                'original_name': filename,
                'file_type': file_type,
                'file_size': file_size,
                'url': f'/uploads/{unique_filename}'
            })
        except Exception as e:
            return jsonify({'error': f'Upload failed: {str(e)}'}), 500
    
    return jsonify({'error': 'File type not allowed'}), 400

@socketio.on('connect')
def on_connect():
    """Handle user connection"""
    print(f'User connected: {request.sid}')

@socketio.on('disconnect')
def on_disconnect():
    """Handle user disconnection"""
    user_id = request.sid
    if user_id in users:
        user = users[user_id]
        for room_id in rooms:
            if user_id in rooms[room_id]['users']:
                rooms[room_id]['users'].remove(user_id)
                emit('user_left', {
                    'user': user['username'],
                    'room': room_id,
                    'users_count': len(rooms[room_id]['users'])
                }, room=room_id)
        
        del users[user_id]
        print(f'User disconnected: {user["username"]}')

@socketio.on('join_chat')
def on_join_chat(data):
    """Handle user joining chat - check for existing session first"""
    user_id = request.sid
    device_id = data.get('device_id', str(uuid.uuid4()))
    device_hash = get_device_hash(device_id)
    room_id = 'general'
    
    # Check if device has existing session
    username = None
    if device_hash in sessions:
        session = sessions[device_hash]
        if (datetime.datetime.now() - datetime.datetime.fromisoformat(session['joined_at'])).total_seconds() < SESSION_DURATION:
            username = session['username']
    
    # If no valid session, generate new username
    if not username:
        username = f"User_{uuid.uuid4().hex[:8].upper()}"
        sessions[device_hash] = {
            'username': username,
            'joined_at': datetime.datetime.now().isoformat()
        }
    
    users[user_id] = {
        'username': username,
        'device_hash': device_hash,
        'room': room_id,
        'joined_at': datetime.datetime.now().isoformat()
    }
    
    join_room(room_id)
    if room_id not in rooms:
        rooms[room_id] = {'users': [], 'messages': []}
    
    if user_id not in rooms[room_id]['users']:
        rooms[room_id]['users'].append(user_id)
    
    recent_messages = rooms[room_id]['messages'][-50:]
    emit('message_history', recent_messages)
    emit('username_assigned', {'username': username, 'device_id': device_id})
    
    emit('user_joined', {
        'user': username,
        'room': room_id,
        'users_count': len(rooms[room_id]['users'])
    }, room=room_id)
    
    print(f'User {username} joined room {room_id}')

@socketio.on('delete_message')
def on_delete_message(data):
    """Handle message deletion"""
    user_id = request.sid
    message_id = data.get('message_id')
    
    if user_id not in users:
        return
    
    user = users[user_id]
    room_id = user['room']
    
    room_messages = rooms[room_id]['messages']
    for i, msg in enumerate(room_messages):
        if msg['id'] == message_id and msg['user_id'] == user_id:
            room_messages[i]['deleted'] = True
            room_messages[i]['message'] = 'This message was deleted'
            
            emit('message_deleted', {
                'message_id': message_id,
                'room': room_id
            }, room=room_id)
            break

@socketio.on('send_message')
def on_send_message(data):
    """Handle sending messages"""
    user_id = request.sid
    if user_id not in users:
        return
    
    user = users[user_id]
    room_id = user['room']
    
    message = {
        'id': str(uuid.uuid4()),
        'user': user['username'],
        'user_id': user_id,
        'message': data.get('message', ''),
        'timestamp': datetime.datetime.now().isoformat(),
        'type': data.get('type', 'text'),
        'file_info': data.get('file_info'),
        'is_code': data.get('is_code', False)
    }
    
    rooms[room_id]['messages'].append(message)
    
    if len(rooms[room_id]['messages']) > 1000:
        rooms[room_id]['messages'] = rooms[room_id]['messages'][-1000:]
    
    emit('new_message', message, room=room_id)
    print(f'Message from {user["username"]}: {str(message["message"])[:50]}...')

@socketio.on('typing_start')
def on_typing_start():
    """Handle typing indicator start"""
    user_id = request.sid
    if user_id in users:
        user = users[user_id]
        emit('user_typing', {
            'user': user['username'],
            'typing': True
        }, room=user['room'], include_self=False)

@socketio.on('typing_stop')
def on_typing_stop():
    """Handle typing indicator stop"""
    user_id = request.sid
    if user_id in users:
        user = users[user_id]
        emit('user_typing', {
            'user': user['username'],
            'typing': False
        }, room=user['room'], include_self=False)

if __name__ == '__main__':
    cleanup_thread = threading.Thread(target=cleanup_old_messages, daemon=True)
    cleanup_thread.start()
    
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except:
        local_ip = '127.0.0.1'
    
    print(f"\n🔥 WiFi Chat Pro - White Theme Edition")
    print(f"📱 MOBILE ACCESS: http://{local_ip}:5000")
    print(f"💻 COMPUTER ACCESS: http://127.0.0.1:5000")
    print(f"⏰ Messages auto-delete after 24 hours")
    print(f"📦 Session persistence: 24 hours\n")
    
    socketio.run(app, host='0.0.0.0', port=5000, debug=False, allow_unsafe_werkzeug=True)