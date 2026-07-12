const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. HTTP 서버 생성 (정적 파일 제공용)
const httpServer = http.createServer((req, res) => {
    // index.html 제공
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }
    
    // style.css 제공
    if (req.url === '/style.css') {
        fs.readFile(path.join(__dirname, 'style.css'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading style.css');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
            res.end(data);
        });
        return;
    }
    
    // script.js 제공
    if (req.url === '/script.js') {
        fs.readFile(path.join(__dirname, 'script.js'), (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Error loading script.js');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(data);
        });
        return;
    }
    
    // 404 처리
    res.writeHead(404);
    res.end('Not Found');
});

// 2. WebSocket 서버 생성 (HTTP 서버와 공유)
const wss = new WebSocket.Server({ server: httpServer });

// 3. 테라리아 서버 프로세스 실행 (아직 시작하지 않고 대기)
let serverProcess = null;
let wsClients = [];

// WebSocket 연결 처리
wss.on('connection', (ws) => {
    console.log('🟢 프론트엔드 연결됨');
    wsClients.push(ws);
    
    // 4. 클라이언트가 연결되면 테라리아 서버 시작
    if (!serverProcess) {
        console.log('🚀 테라리아 서버 시작 중...');
        startTerrariaServer();
    }
    
    // 5. 클라이언트로부터 명령어 수신
    ws.on('message', (message) => {
        const command = message.toString().trim();
        console.log(`📝 명령어 수신: ${command}`);
        
        if (serverProcess) {
            serverProcess.stdin.write(command + '\n');
        } else {
            ws.send('[오류] 서버가 실행 중이 아닙니다.');
        }
    });
    
    // 6. 연결 종료 처리
    ws.on('close', () => {
        console.log('🔴 프론트엔드 연결 종료');
        wsClients = wsClients.filter(client => client !== ws);
        
        // 모든 클라이언트가 연결 해제되면 서버도 종료 (선택사항)
        if (wsClients.length === 0 && serverProcess) {
            console.log('⏹️ 모든 클라이언트 연결 해제 - 서버 종료');
            serverProcess.kill();
            serverProcess = null;
        }
    });
});

// 7. 테라리아 서버 시작 함수
function startTerrariaServer() {
    // terraria-server-1449.zip을 압축 풀고 Linux 폴더 안의 실행 파일 경로를 지정
    const serverPath = path.join(__dirname, 'terraria-server', 'Linux', 'TerrariaServer.bin.x86_64');
    
    serverProcess = spawn(serverPath, [], {
        cwd: path.join(__dirname, 'terraria-server', 'Linux'),
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // 8. 서버 로그를 모든 WebSocket 클라이언트에 전송
    serverProcess.stdout.on('data', (data) => {
        const log = data.toString();
        console.log(`[서버 로그] ${log.trim()}`);
        broadcast(log);
    });
    
    serverProcess.stderr.on('data', (data) => {
        const errorLog = `[오류] ${data.toString()}`;
        console.error(errorLog.trim());
        broadcast(errorLog);
    });
    
    // 9. 서버 프로세스 종료 감지
    serverProcess.on('close', (code) => {
        console.log(`⏹️ 테라리아 서버 종료 (코드: ${code})`);
        broadcast(`[시스템] 서버가 종료되었습니다. (코드: ${code})`);
        serverProcess = null;
    });
}

// 10. 모든 클라이언트에 메시지 브로드캐스트
function broadcast(message) {
    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// 11. 서버 시작
const PORT = 10000;
httpServer.listen(PORT, () => {
    console.log(`🌐 서버 실행 중: http://localhost:${PORT}`);
    console.log('💡 WebSocket 서버도 함께 실행됨');
});
