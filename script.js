// WebSocket 연결
let socket = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// DOM 요소
const logContainer = document.getElementById('logContainer');
const commandInput = document.getElementById('commandInput');
const sendButton = document.getElementById('sendButton');
const clearButton = document.getElementById('clearButton');
const connectionStatus = document.getElementById('connectionStatus');
const quickCmdButtons = document.querySelectorAll('.quick-cmd');

// WebSocket 연결 함수
function connectWebSocket() {
    // WebSocket URL 설정 (현재 페이지의 호스트 사용)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    try {
        socket = new WebSocket(wsUrl);
        
        socket.onopen = () => {
            console.log('✅ WebSocket 연결됨');
            isConnected = true;
            reconnectAttempts = 0;
            updateConnectionStatus('connected', '● 연결됨');
            enableControls(true);
            addLogEntry('[시스템] 서버에 연결되었습니다.', 'system');
        };
        
        socket.onmessage = (event) => {
            // 서버로부터 받은 메시지 (로그)
            addLogEntry(event.data);
        };
        
        socket.onclose = () => {
            console.log('❌ WebSocket 연결 종료');
            isConnected = false;
            updateConnectionStatus('disconnected', '● 연결 끊김');
            enableControls(false);
            addLogEntry('[시스템] 서버 연결이 종료되었습니다.', 'system');
            
            // 재연결 시도
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                setTimeout(() => {
                    addLogEntry(`[시스템] 재연결 시도 ${reconnectAttempts}...`, 'system');
                    connectWebSocket();
                }, 3000);
            } else {
                addLogEntry('[시스템] 재연결 실패. 페이지를 새로고침하세요.', 'error');
            }
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket 오류:', error);
            addLogEntry('[오류] WebSocket 오류가 발생했습니다.', 'error');
        };
        
    } catch (error) {
        console.error('WebSocket 연결 실패:', error);
        addLogEntry(`[오류] 연결 실패: ${error.message}`, 'error');
    }
}

// 연결 상태 업데이트
function updateConnectionStatus(status, text) {
    connectionStatus.className = status;
    connectionStatus.textContent = text;
}

// 컨트롤 활성화/비활성화
function enableControls(enabled) {
    commandInput.disabled = !enabled;
    sendButton.disabled = !enabled;
}

// 로그 추가
function addLogEntry(message, type = '') {
    // place holder 제거
    const placeholder = logContainer.querySelector('.log-placeholder');
    if (placeholder) {
        placeholder.remove();
    }
    
    // 로그 항목 생성
    const entry = document.createElement('div');
    entry.className = `log-entry ${type ? `log-${type}` : ''}`;
    
    // 시간 표시 (선택사항)
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = message;
    
    // 메시지에 따라 색상 분류 (간단한 예시)
    if (message.includes('[오류]') || message.includes('Error')) {
        entry.classList.add('log-error');
    } else if (message.includes('[시스템]') || message.includes('Server started')) {
        entry.classList.add('log-system');
    } else if (message.includes('joined') || message.includes('left') || message.includes('玩家')) {
        entry.classList.add('log-player');
    }
    
    logContainer.appendChild(entry);
    
    // 자동 스크롤
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // 로그가 너무 많으면 오래된 것 제거 (성능)
    while (logContainer.children.length > 500) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

// 명령어 전송
function sendCommand(command) {
    if (!isConnected || !socket || socket.readyState !== WebSocket.OPEN) {
        addLogEntry('[오류] 서버에 연결되어 있지 않습니다.', 'error');
        return;
    }
    
    if (!command || command.trim() === '') {
        return;
    }
    
    // 명령어 로그에 표시 (선택사항)
    addLogEntry(`> ${command.trim()}`, 'system');
    
    // WebSocket으로 전송
    socket.send(command.trim());
}

// 로그 모두 지우기
function clearLogs() {
    logContainer.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'log-placeholder';
    placeholder.textContent = '로그가 모두 지워졌습니다.';
    logContainer.appendChild(placeholder);
}

// 이벤트 리스너 설정
function setupEventListeners() {
    // 전송 버튼 클릭
    sendButton.addEventListener('click', () => {
        const command = commandInput.value;
        sendCommand(command);
        commandInput.value = '';
    });
    
    // 엔터 키
    commandInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const command = commandInput.value;
            sendCommand(command);
            commandInput.value = '';
        }
    });
    
    // 로그 지우기
    clearButton.addEventListener('click', clearLogs);
    
    // 빠른 명령어 버튼
    quickCmdButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            sendCommand(cmd);
        });
    });
}

// 초기화
function init() {
    setupEventListeners();
    connectWebSocket();
    addLogEntry('[시스템] 콘솔이 초기화되었습니다.', 'system');
    addLogEntry('[시스템] 서버에 연결 중...', 'system');
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', init);

// 페이지 닫을 때 WebSocket 정리
window.addEventListener('beforeunload', () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
    }
});
