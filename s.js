const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

// ============================================
// 0. 테라리아 서버 파일 자동 다운로드 함수
// ============================================
const TERRARIA_SERVER_DIR = path.join(__dirname, 'terraria-server');
const SERVER_ZIP_URL = 'https://terraria.org/api/download/pc-dedicated-server/terraria-server-1449.zip';
const SERVER_ZIP_PATH = path.join(__dirname, 'terraria-server-1449.zip');

function downloadTerrariaServer() {
    return new Promise((resolve, reject) => {
        console.log('📥 테라리아 서버 파일 다운로드 중...');
        
        const file = fs.createWriteStream(SERVER_ZIP_PATH);
        https.get(SERVER_ZIP_URL, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`다운로드 실패: HTTP ${response.statusCode}`));
                return;
            }
            
            const totalSize = parseInt(response.headers['content-length'], 10);
            let downloadedSize = 0;
            
            response.pipe(file);
            
            response.on('data', (chunk) => {
                downloadedSize += chunk.length;
                const percent = totalSize ? Math.round((downloadedSize / totalSize) * 100) : 0;
                process.stdout.write(`\r📥 다운로드 중... ${percent}%`);
            });
            
            file.on('finish', () => {
                file.close();
                console.log('\n✅ 다운로드 완료!');
                resolve();
            });
            
            file.on('error', (err) => {
                fs.unlink(SERVER_ZIP_PATH, () => {});
                reject(err);
            });
        }).on('error', (err) => {
            fs.unlink(SERVER_ZIP_PATH, () => {});
            reject(err);
        });
    });
}

function extractTerrariaServer() {
    return new Promise((resolve, reject) => {
        console.log('📦 압축 풀기 중...');
        
        // unzip 명령어로 압축 풀기
        exec(`unzip -o ${SERVER_ZIP_PATH} -d ${__dirname}`, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`압축 풀기 실패: ${error.message}`));
                return;
            }
            console.log('✅ 압축 풀기 완료!');
            resolve();
        });
    });
}

async function ensureTerrariaServerFiles() {
    // 이미 terraria-server 폴더가 있고 실행 파일이 있으면 스킵
    const serverBinaryPath = path.join(TERRARIA_SERVER_DIR, 'Linux', 'TerrariaServer.bin.x86_64');
    if (fs.existsSync(serverBinaryPath)) {
        console.log('✅ 테라리아 서버 파일이 이미 존재합니다.');
        return true;
    }
    
    console.log('⚠️ 테라리아 서버 파일이 없습니다. 자동 다운로드를 시작합니다...');
    
    try {
        // 1. 다운로드
        await downloadTerrariaServer();
        
        // 2. 압축 풀기
        await extractTerrariaServer();
        
        // 3. 다운로드한 zip 파일 삭제 (선택사항)
        if (fs.existsSync(SERVER_ZIP_PATH)) {
            fs.unlinkSync(SERVER_ZIP_PATH);
            console.log('🗑️ 임시 zip 파일 삭제됨');
        }
        
        // 4. 실행 권한 추가
        if (fs.existsSync(serverBinaryPath)) {
            exec(`chmod +x ${serverBinaryPath}`, (err) => {
                if (err) console.warn('⚠️ 실행 권한 설정 실패:', err.message);
                else console.log('✅ 실행 권한 설정 완료');
            });
        }
        
        console.log('✅ 테라리아 서버 파일 준비 완료!');
        return true;
        
    } catch (error) {
        console.error('❌ 파일 준비 실패:', error.message);
        return false;
    }
}

// ============================================
// 1. HTTP 서버 생성 (정적 파일 제공용)
// ============================================
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

// ============================================
// 2. WebSocket 서버 생성
// ============================================
const wss = new WebSocket.Server({ server: httpServer });

// ============================================
// 3. 테라리아 서버 프로세스 관리
// ============================================
let serverProcess = null;
let wsClients = [];
let isServerReady = false;

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
            isServerReady = false;
        }
    });
});

// ============================================
// 7. 테라리아 서버 시작 함수
// ============================================
function startTerrariaServer() {
    const serverPath = path.join(TERRARIA_SERVER_DIR, 'Linux', 'TerrariaServer.bin.x86_64');
    
    // 파일 존재 여부 확인
    if (!fs.existsSync(serverPath)) {
        broadcast('[오류] 테라리아 서버 파일을 찾을 수 없습니다. 다시 다운로드해주세요.');
        console.error('❌ 서버 파일 없음:', serverPath);
        return;
    }
    
    serverProcess = spawn(serverPath, [], {
        cwd: path.join(TERRARIA_SERVER_DIR, 'Linux'),
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    isServerReady = true;
    
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
        isServerReady = false;
    });
    
    serverProcess.on('error', (err) => {
        console.error('❌ 서버 프로세스 오류:', err.message);
        broadcast(`[오류] 서버 프로세스 오류: ${err.message}`);
        serverProcess = null;
        isServerReady = false;
    });
}

// ============================================
// 8. 모든 클라이언트에 메시지 브로드캐스트
// ============================================
function broadcast(message) {
    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ============================================
// 9. 서버 시작 (파일 준비 후)
// ============================================
const PORT = process.env.PORT || 10000;

async function startServer() {
    console.log('========================================');
    console.log('⚔️ 테라리아 웹 콘솔 서버');
    console.log('========================================');
    
    // 테라리아 서버 파일 확인 및 자동 다운로드
    const isReady = await ensureTerrariaServerFiles();
    
    if (!isReady) {
        console.error('❌ 테라리아 서버 파일 준비 실패. 서버를 종료합니다.');
        process.exit(1);
    }
    
    // HTTP + WebSocket 서버 시작
    httpServer.listen(PORT, () => {
        console.log(`🌐 웹 서버 실행 중: http://localhost:${PORT}`);
        console.log(`🔌 WebSocket 서버도 함께 실행됨`);
        console.log('========================================');
        console.log('💡 프론트엔드에서 접속하면 서버가 자동 시작됩니다.');
        console.log('========================================');
    });
}

// 서버 시작
startServer();

// ============================================
// 10. 프로세스 종료 처리
// ============================================
process.on('SIGINT', () => {
    console.log('\n🛑 서버 종료 신호 수신');
    if (serverProcess) {
        serverProcess.kill();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 서버 종료 신호 수신');
    if (serverProcess) {
        serverProcess.kill();
    }
    process.exit(0);
});
