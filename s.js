const { spawn, exec, execSync } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================
// 메모리 제한 설정 (월드 생성 완료 후 적용)
// ============================================
const MEMORY_LIMIT_MB = 500;
const MEMORY_LIMIT_KB = MEMORY_LIMIT_MB * 1024;

// ============================================
// 0. 테라리아 서버 파일 자동 다운로드 함수
// ============================================
const TERRARIA_SERVER_DIR = path.join(__dirname, 'terraria-server');
const SERVER_ZIP_URL = 'https://terraria.org/api/download/pc-dedicated-server/terraria-server-1449.zip';
const SERVER_ZIP_PATH = path.join(__dirname, 'terraria-server-1449.zip');

function findServerBinary() {
    const primaryPaths = [
        path.join(__dirname, '1449', 'Linux', 'TerrariaServer.bin.x86_64'),
        path.join(__dirname, 'terraria-server-1449', 'Linux', 'TerrariaServer.bin.x86_64'),
        path.join(TERRARIA_SERVER_DIR, '1449', 'Linux', 'TerrariaServer.bin.x86_64'),
        path.join(TERRARIA_SERVER_DIR, 'Linux', 'TerrariaServer.bin.x86_64'),
    ];
    
    for (const p of primaryPaths) {
        if (fs.existsSync(p)) {
            console.log(`✅ 실행 파일 발견: ${p}`);
            return p;
        }
    }
    
    function searchDir(dir) {
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const itemPath = path.join(dir, item);
                try {
                    const stat = fs.statSync(itemPath);
                    if (stat.isDirectory()) {
                        if (item === 'Linux') {
                            const binPath = path.join(itemPath, 'TerrariaServer.bin.x86_64');
                            if (fs.existsSync(binPath)) return binPath;
                        }
                        const found = searchDir(itemPath);
                        if (found) return found;
                    }
                } catch (e) {}
            }
        } catch (e) {}
        return null;
    }
    
    if (fs.existsSync(TERRARIA_SERVER_DIR)) {
        const found = searchDir(TERRARIA_SERVER_DIR);
        if (found) {
            console.log(`✅ 실행 파일 발견: ${found}`);
            return found;
        }
    }
    
    const versionDirs = ['1449', 'terraria-server-1449'];
    for (const versionDir of versionDirs) {
        const basePath = path.join(__dirname, versionDir);
        if (!fs.existsSync(basePath)) continue;
        const linuxBin = path.join(basePath, 'Linux', 'TerrariaServer.bin.x86_64');
        if (fs.existsSync(linuxBin)) {
            console.log(`✅ 실행 파일 발견: ${linuxBin}`);
            return linuxBin;
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
            resolve();
        });
    });
}

async function ensureTerrariaServerFiles() {
    const existingBinary = findServerBinary();
    if (existingBinary) {
        console.log(`✅ 테라리아 서버 파일이 이미 존재합니다: ${existingBinary}`);
        return existingBinary;
    }
    
    console.log('⚠️ 테라리아 서버 파일이 없습니다. 자동 다운로드를 시작합니다...');
    
    try {
        await downloadTerrariaServer();
        await extractTerrariaServer();
        
        if (fs.existsSync(SERVER_ZIP_PATH)) {
            fs.unlinkSync(SERVER_ZIP_PATH);
            console.log('🗑️ 임시 zip 파일 삭제됨');
        }
        
        const binaryPath = findServerBinary();
        if (!binaryPath) {
            console.log('📁 현재 디렉토리 구조 (디버깅):');
            const items = fs.readdirSync(__dirname);
            for (const item of items) {
                const stat = fs.statSync(path.join(__dirname, item));
                if (stat.isDirectory()) {
                    console.log(`  📂 ${item}/`);
                    try {
                        const subItems = fs.readdirSync(path.join(__dirname, item));
                        for (const sub of subItems) {
                            console.log(`    📄 ${sub}`);
                        }
                    } catch (e) {}
                } else {
                    console.log(`  📄 ${item}`);
                }
            }
            throw new Error('압축 풀기 후에도 실행 파일을 찾을 수 없습니다.');
        }
        
        try {
            execSync(`chmod +x "${binaryPath}"`);
            console.log('✅ 실행 권한 설정 완료');
        } catch (err) {
            console.warn('⚠️ 실행 권한 설정 실패:', err.message);
        }
        
        console.log(`✅ 테라리아 서버 파일 준비 완료: ${binaryPath}`);
        return binaryPath;
        
    } catch (error) {
        console.error('❌ 파일 준비 실패:', error.message);
        throw error;
    }
}

// ============================================
// 1. HTTP 서버 생성
// ============================================
const httpServer = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    let filePath = '';
    let contentType = '';
    
    if (req.url === '/' || req.url === '/index.html') {
        filePath = path.join(__dirname, 'index.html');
        contentType = 'text/html; charset=utf-8';
    } else if (req.url === '/style.css') {
        filePath = path.join(__dirname, 'style.css');
        contentType = 'text/css; charset=utf-8';
    } else if (req.url === '/script.js') {
        filePath = path.join(__dirname, 'script.js');
        contentType = 'application/javascript; charset=utf-8';
    } else {
        res.writeHead(404);
        res.end('Not Found');
        return;
    }
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(500);
            res.end(`Error loading ${path.basename(filePath)}`);
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// ============================================
// 2. WebSocket 서버 생성
// ============================================
const wss = new WebSocket.Server({ 
    server: httpServer,
    path: '/'
});

// ============================================
// 3. 테라리아 서버 프로세스 관리
// ============================================
let serverProcess = null;
let wsClients = [];
let serverBinaryPath = null;
let memoryLimitApplied = false; // 메모리 제한 적용 여부

wss.on('connection', (ws) => {
    console.log('🟢 프론트엔드 연결됨 (클라이언트 수: ' + (wsClients.length + 1) + ')');
    wsClients.push(ws);
    
    ws.send('[시스템] WebSocket 연결이 성공적으로 확립되었습니다.');
    
    if (!serverProcess && serverBinaryPath) {
        console.log('🚀 테라리아 서버 시작 중...');
        startTerrariaServer(serverBinaryPath);
    } else if (!serverBinaryPath) {
        ws.send('[오류] 서버 바이너리 경로가 설정되지 않았습니다.');
        console.error('❌ 서버 바이너리 경로 없음');
    } else if (serverProcess) {
        ws.send('[시스템] 테라리아 서버가 이미 실행 중입니다.');
    }
    
    ws.on('message', (message) => {
        const command = message.toString().trim();
        console.log(`📝 명령어 수신: "${command}"`);
        
        if (serverProcess) {
            serverProcess.stdin.write(command + '\n');
            ws.send(`[시스템] 명령어 전송됨: ${command}`);
        } else {
            ws.send('[오류] 서버가 실행 중이 아닙니다.');
        }
    });
    
    ws.on('close', () => {
        console.log('🔴 프론트엔드 연결 종료 (남은 클라이언트: ' + (wsClients.length - 1) + ')');
        wsClients = wsClients.filter(client => client !== ws);
        
        if (wsClients.length === 0 && serverProcess) {
            console.log('⏹️ 모든 클라이언트 연결 해제 - 서버 종료');
            serverProcess.kill();
            serverProcess = null;
            memoryLimitApplied = false;
        }
    });
    
    ws.on('error', (error) => {
        console.error('⚠️ WebSocket 오류:', error.message);
    });
});

// ============================================
// 4. 테라리아 서버 시작 함수 (메모리 제한: Resetting game objects 이후)
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
    console.log(`🔓 초기: 메모리 제한 없이 실행 (월드 생성 중에는 메모리 많이 사용)`);
    
    const env = {
        ...process.env,
        LD_LIBRARY_PATH: cwd + ':' + (process.env.LD_LIBRARY_PATH || ''),
        HOME: process.env.HOME || '/tmp'
    };
    
    // ✅ 메모리 제한 없이 실행 (월드 생성 중 메모리 확보)
    serverProcess = spawn(binaryPath, [], {
        cwd: cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env
    });
    
    memoryLimitApplied = false;
    
    serverProcess.stdout.on('data', (data) => {
        const log = data.toString();
        console.log(`[서버 로그] ${log.trim()}`);
        broadcast(log);
        
        // 🎯 "Resetting game objects" 감지 -> 메모리 제한 적용
        if (log.includes('Resetting game objects') && !memoryLimitApplied) {
            console.log(`🔒 "Resetting game objects" 감지! 메모리 제한 ${MEMORY_LIMIT_MB}MB 적용 중...`);
            memoryLimitApplied = true;
            
            // 서버 프로세스에 메모리 제한 적용
            applyMemoryLimitToProcess(serverProcess.pid);
            broadcast(`[시스템] 메모리 제한이 적용되었습니다. (${MEMORY_LIMIT_MB}MB)`);
        }
        
        // 월드 생성 완료 감지 (참고용)
        if (log.includes('World generated') || 
            log.includes('done!') ||
            log.includes('Listening on port')) {
            console.log('✅ 월드 생성 완료! 서버가 정상적으로 실행 중입니다.');
        }
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
        memoryLimitApplied = false;
    });
    
    serverProcess.on('error', (err) => {
        console.error('❌ 서버 프로세스 오류:', err.message);
        broadcast(`[오류] 서버 프로세스 오류: ${err.message}`);
        serverProcess = null;
        memoryLimitApplied = false;
    });
}

// ============================================
// 4-1. 프로세스에 메모리 제한 적용 함수
// ============================================
function applyMemoryLimitToProcess(pid) {
    if (!pid) {
        console.warn('⚠️ PID가 없어 메모리 제한을 적용할 수 없습니다.');
        return;
    }
    
    console.log(`🔧 PID ${pid}에 메모리 제한 적용 시도...`);
    
    // 방법 1: prlimit (가장 정확함)
    try {
        execSync(`prlimit --pid ${pid} --rss=${MEMORY_LIMIT_KB}:${MEMORY_LIMIT_KB} --data=${MEMORY_LIMIT_KB}:${MEMORY_LIMIT_KB} 2>/dev/null`);
        console.log(`✅ prlimit 메모리 제한 적용 완료: ${MEMORY_LIMIT_MB}MB`);
        return;
    } catch (err) {
        // prlimit 실패 시 무시
    }
    
    // 방법 2: ulimit (쉘을 통해 적용)
    try {
        execSync(`bash -c "ulimit -v ${MEMORY_LIMIT_KB} && echo 'ulimit applied'"`);
        console.log(`✅ ulimit 메모리 제한 적용 완료: ${MEMORY_LIMIT_MB}MB`);
        return;
    } catch (err) {
        // ulimit 실패 시 무시
    }
    
    // 방법 3: cgroups (Docker 환경)
    try {
        const cgroupPath = `/sys/fs/cgroup/memory/terraria_${pid}`;
        if (fs.existsSync('/sys/fs/cgroup/memory')) {
            execSync(`mkdir -p ${cgroupPath} 2>/dev/null`);
            execSync(`echo ${MEMORY_LIMIT_KB * 1024} > ${cgroupPath}/memory.limit_in_bytes 2>/dev/null`);
            execSync(`echo ${pid} > ${cgroupPath}/tasks 2>/dev/null`);
            console.log(`✅ cgroups 메모리 제한 적용 완료: ${MEMORY_LIMIT_MB}MB`);
            return;
        }
    } catch (err) {
        // cgroups 실패 시 무시
    }
    
    console.warn(`⚠️ 메모리 제한 적용 실패. (PID: ${pid})`);
}

// ============================================
// 5. 모든 클라이언트에 메시지 브로드캐스트
// ============================================
function broadcast(message) {
    wsClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            try {
                client.send(message);
            } catch (e) {
                console.error('브로드캐스트 오류:', e.message);
            }
        }
    });
}

// ============================================
// 6. 서버 시작
// ============================================
const PORT = process.env.PORT || 10000;

async function startServer() {
    console.log('========================================');
    console.log('⚔️ 테라리아 웹 콘솔 서버');
    console.log(`🔒 메모리 제한: ${MEMORY_LIMIT_MB}MB (월드 생성 완료 후 적용)`);
    console.log('========================================');
    console.log(`📂 현재 디렉토리: ${__dirname}`);
    console.log(`🔌 포트: ${PORT}`);
    
    try {
        const files = fs.readdirSync(__dirname);
        console.log('📁 현재 디렉토리 파일 목록:', files.join(', '));
    } catch (e) {}
    
    try {
        serverBinaryPath = await ensureTerrariaServerFiles();
        console.log(`✅ 서버 바이너리 경로: ${serverBinaryPath}`);
    } catch (error) {
        console.error('❌ 테라리아 서버 파일 준비 실패:', error.message);
        console.log('⚠️ 웹 서버는 계속 실행됩니다 (테라리아 서버 없이)');
    }
    
    httpServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 웹 서버 실행 중: http://0.0.0.0:${PORT}`);
        console.log(`🔌 WebSocket 서버도 함께 실행됨`);
        console.log('========================================');
        if (serverBinaryPath) {
            console.log(`💡 프론트엔드에서 접속하면 서버가 자동 시작됩니다.`);
            console.log(`📌 "Resetting game objects" 로그 후 메모리 제한 ${MEMORY_LIMIT_MB}MB 적용`);
        } else {
            console.log('⚠️ 테라리아 서버 파일이 없어 서버를 시작할 수 없습니다.');
        }
        console.log('========================================');
    });
    
    httpServer.on('error', (error) => {
        console.error('❌ HTTP 서버 오류:', error.message);
        if (error.code === 'EADDRINUSE') {
            console.error(`⚠️ 포트 ${PORT}가 이미 사용 중입니다.`);
        }
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

process.on('uncaughtException', (error) => {
    console.error('💥 예외 발생:', error.message);
    console.error(error.stack);
});
