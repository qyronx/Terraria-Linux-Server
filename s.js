const { spawn, exec, execSync } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================
// 0. 테라리아 서버 파일 자동 다운로드 함수
// ============================================
const TERRARIA_SERVER_DIR = path.join(__dirname, 'terraria-server');
const SERVER_ZIP_URL = 'https://terraria.org/api/download/pc-dedicated-server/terraria-server-1449.zip';
const SERVER_ZIP_PATH = path.join(__dirname, 'terraria-server-1449.zip');

// ✅ 서버 실행 파일 경로를 찾는 함수 (정확한 경로 탐색)
function findServerBinary() {
    // 1. 가장 먼저 1449/Linux/TerrariaServer.bin.x86_64 확인 (가장 일반적인 경로)
    const primaryPaths = [
        path.join(__dirname, '1449', 'Linux', 'TerrariaServer.bin.x86_64'),
        path.join(__dirname, 'terraria-server-1449', 'Linux', 'TerrariaServer.bin.x86_64'),
        path.join(TERRARIA_SERVER_DIR, '1449', 'Linux', 'TerrariaServer.bin.x86_64'),
        path.join(TERRARIA_SERVER_DIR, 'Linux', 'TerrariaServer.bin.x86_64'),
        path.join(__dirname, '1449', 'Linux', 'TerrariaServer.exe'),
        path.join(__dirname, 'terraria-server-1449', 'Linux', 'TerrariaServer.exe'),
    ];
    
    for (const p of primaryPaths) {
        if (fs.existsSync(p)) {
            console.log(`✅ 실행 파일 발견: ${p}`);
            return p;
        }
    }
    
    // 2. terraria-server 폴더 내 모든 하위 디렉토리 탐색
    if (fs.existsSync(TERRARIA_SERVER_DIR)) {
        const searchDir = (dir) => {
            try {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const itemPath = path.join(dir, item);
                    try {
                        const stat = fs.statSync(itemPath);
                        if (stat.isDirectory()) {
                            // Linux 폴더 발견하면 내부 탐색
                            if (item === 'Linux') {
                                const binPath = path.join(itemPath, 'TerrariaServer.bin.x86_64');
                                if (fs.existsSync(binPath)) return binPath;
                                const exePath = path.join(itemPath, 'TerrariaServer.exe');
                                if (fs.existsSync(exePath)) return exePath;
                            }
                            // 하위 디렉토리 재귀 탐색
                            const found = searchDir(itemPath);
                            if (found) return found;
                        }
                    } catch (e) {}
                }
            } catch (e) {}
            return null;
        };
        const found = searchDir(TERRARIA_SERVER_DIR);
        if (found) {
            console.log(`✅ 실행 파일 발견: ${found}`);
            return found;
        }
    }
    
    // 3. 현재 디렉토리에서 1449 폴더 직접 탐색
    const versionDirs = ['1449', 'terraria-server-1449'];
    for (const versionDir of versionDirs) {
        const basePath = path.join(__dirname, versionDir);
        if (!fs.existsSync(basePath)) continue;
        
        // Linux 폴더 확인
        const linuxBin = path.join(basePath, 'Linux', 'TerrariaServer.bin.x86_64');
        if (fs.existsSync(linuxBin)) {
            console.log(`✅ 실행 파일 발견: ${linuxBin}`);
            return linuxBin;
        }
        
        const linuxExe = path.join(basePath, 'Linux', 'TerrariaServer.exe');
        if (fs.existsSync(linuxExe)) {
            console.log(`✅ 실행 파일 발견: ${linuxExe}`);
            return linuxExe;
        }
    }
    
    console.log('❌ 실행 파일을 찾을 수 없습니다.');
    return null;
}

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
        console.log(`📂 압축 풀기 대상: ${SERVER_ZIP_PATH}`);
        console.log(`📂 압축 풀기 위치: ${__dirname}`);
        
        exec(`unzip -o ${SERVER_ZIP_PATH} -d ${__dirname}`, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`압축 풀기 실패: ${error.message}\n${stderr}`));
                return;
            }
            console.log('✅ 압축 풀기 완료!');
            console.log('📋 압축 풀기 결과 (일부):', stdout.split('\n').slice(0, 15).join('\n'));
            resolve();
        });
    });
}

async function ensureTerrariaServerFiles() {
    // 1. 먼저 실행 파일이 이미 있는지 확인
    const existingBinary = findServerBinary();
    if (existingBinary) {
        console.log(`✅ 테라리아 서버 파일이 이미 존재합니다: ${existingBinary}`);
        return existingBinary;
    }
    
    console.log('⚠️ 테라리아 서버 파일이 없습니다. 자동 다운로드를 시작합니다...');
    
    try {
        // 2. 다운로드
        await downloadTerrariaServer();
        
        // 3. 압축 풀기
        await extractTerrariaServer();
        
        // 4. 다운로드한 zip 파일 삭제
        if (fs.existsSync(SERVER_ZIP_PATH)) {
            fs.unlinkSync(SERVER_ZIP_PATH);
            console.log('🗑️ 임시 zip 파일 삭제됨');
        }
        
        // 5. 압축 풀린 폴더 구조 확인 및 실행 파일 찾기
        const binaryPath = findServerBinary();
        if (!binaryPath) {
            // 디버깅: 현재 디렉토리 구조 출력
            console.log('📁 현재 디렉토리 구조:');
            const items = fs.readdirSync(__dirname);
            for (const item of items) {
                const stat = fs.statSync(path.join(__dirname, item));
                if (stat.isDirectory()) {
                    console.log(`  📂 ${item}/`);
                    try {
                        const subItems = fs.readdirSync(path.join(__dirname, item));
                        for (const sub of subItems) {
                            const subPath = path.join(__dirname, item, sub);
                            const subStat = fs.statSync(subPath);
                            if (subStat.isDirectory()) {
                                console.log(`    📂 ${sub}/`);
                                try {
                                    const subSubItems = fs.readdirSync(subPath);
                                    for (const subSub of subSubItems) {
                                        console.log(`      📄 ${subSub}`);
                                    }
                                } catch (e) {}
                            } else {
                                console.log(`    📄 ${sub}`);
                            }
                        }
                    } catch (e) {}
                } else {
                    console.log(`  📄 ${item}`);
                }
            }
            throw new Error('압축 풀기 후에도 실행 파일을 찾을 수 없습니다.');
        }
        
        // 6. 실행 권한 추가 (Linux 바이너리인 경우)
        if (binaryPath.endsWith('.bin.x86_64') || !binaryPath.endsWith('.exe')) {
            try {
                execSync(`chmod +x "${binaryPath}"`);
                console.log('✅ 실행 권한 설정 완료');
            } catch (err) {
                console.warn('⚠️ 실행 권한 설정 실패:', err.message);
            }
        }
        
        console.log(`✅ 테라리아 서버 파일 준비 완료: ${binaryPath}`);
        return binaryPath;
        
    } catch (error) {
        console.error('❌ 파일 준비 실패:', error.message);
        throw error;
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
let serverBinaryPath = null;

// WebSocket 연결 처리
wss.on('connection', (ws) => {
    console.log('🟢 프론트엔드 연결됨');
    wsClients.push(ws);
    
    // 4. 클라이언트가 연결되면 테라리아 서버 시작
    if (!serverProcess && serverBinaryPath) {
        console.log('🚀 테라리아 서버 시작 중...');
        startTerrariaServer(serverBinaryPath);
    } else if (!serverBinaryPath) {
        ws.send('[오류] 서버 바이너리 경로가 설정되지 않았습니다.');
        console.error('❌ 서버 바이너리 경로 없음');
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
        
        if (wsClients.length === 0 && serverProcess) {
            console.log('⏹️ 모든 클라이언트 연결 해제 - 서버 종료');
            serverProcess.kill();
            serverProcess = null;
            isServerReady = false;
        }
    });
});

// ============================================
// 7. 테라리아 서버 시작 함수 (Linux 네이티브)
// ============================================
function startTerrariaServer(binaryPath) {
    if (!fs.existsSync(binaryPath)) {
        broadcast(`[오류] 테라리아 서버 파일을 찾을 수 없습니다: ${binaryPath}`);
        console.error('❌ 서버 파일 없음:', binaryPath);
        return;
    }
    
    const cwd = path.dirname(binaryPath);
    
    console.log(`🚀 서버 실행: ${binaryPath}`);
    console.log(`📂 작업 디렉토리: ${cwd}`);
    
    // Linux 네이티브 바이너리 직접 실행
    serverProcess = spawn(binaryPath, [], {
        cwd: cwd,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    isServerReady = true;
    
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
    console.log(`📂 현재 디렉토리: ${__dirname}`);
    
    try {
        const files = fs.readdirSync(__dirname);
        console.log('📁 현재 디렉토리 파일 목록:', files.join(', '));
    } catch (e) {}
    
    try {
        serverBinaryPath = await ensureTerrariaServerFiles();
        console.log(`✅ 서버 바이너리 경로: ${serverBinaryPath}`);
    } catch (error) {
        console.error('❌ 테라리아 서버 파일 준비 실패:', error.message);
    }
    
    httpServer.listen(PORT, () => {
        console.log(`🌐 웹 서버 실행 중: http://localhost:${PORT}`);
        console.log(`🔌 WebSocket 서버도 함께 실행됨`);
        console.log('========================================');
        if (serverBinaryPath) {
            console.log('💡 프론트엔드에서 접속하면 서버가 자동 시작됩니다.');
        } else {
            console.log('⚠️ 테라리아 서버 파일이 없어 서버를 시작할 수 없습니다.');
        }
        console.log('========================================');
    });
}

startServer();

process.on('SIGINT', () => {
    console.log('\n🛑 서버 종료 신호 수신');
    if (serverProcess) serverProcess.kill();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 서버 종료 신호 수신');
    if (serverProcess) serverProcess.kill();
    process.exit(0);
});
