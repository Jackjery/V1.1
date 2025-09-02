// 首先加载环境变量
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// 动态导入API处理器
let recordsHandler = null;
let statsHandler = null;

async function loadAPIHandlers() {
    try {
        recordsHandler = await import('./api/records.js');
        console.log('✅ Records API loaded');
    } catch (err) {
        console.warn('⚠️ Records API not available:', err.message);
    }
    
    try {
        statsHandler = await import('./api/stats.js');
        console.log('✅ Stats API loaded');
    } catch (err) {
        console.warn('⚠️ Stats API not available:', err.message);
    }
}

const PORT = 3003;

// MIME类型映射
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
    console.log(`${new Date().toLocaleTimeString()} ${req.method} ${req.url}`);
    
    // 设置CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // 处理API路由
    if (pathname.startsWith('/api/')) {
        try {
            if (pathname === '/api/records' && recordsHandler) {
                req.query = parsedUrl.query;
                
                // 创建Express风格的响应适配器
                const mockRes = {
                    status: (code) => {
                        res.statusCode = code;
                        return mockRes;
                    },
                    json: (data) => {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify(data));
                    },
                    setHeader: (name, value) => res.setHeader(name, value),
                    writeHead: (code, headers) => res.writeHead(code, headers),
                    end: (data) => res.end(data)
                };
                
                await recordsHandler.default(req, mockRes);
                return;
            } else if (pathname === '/api/stats' && statsHandler) {
                req.query = parsedUrl.query;
                
                // 创建Express风格的响应适配器
                const mockRes = {
                    status: (code) => {
                        res.statusCode = code;
                        return mockRes;
                    },
                    json: (data) => {
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify(data));
                    },
                    setHeader: (name, value) => res.setHeader(name, value),
                    writeHead: (code, headers) => res.writeHead(code, headers),
                    end: (data) => res.end(data)
                };
                
                await statsHandler.default(req, mockRes);
                return;
            } else {
                // API 端点不可用时返回示例数据
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({
                    success: true,
                    data: {
                        records: [],
                        pagination: { page: 1, limit: 1000, total: 0, totalPages: 0 },
                        total: 0,
                        page: 1,
                        limit: 1000,
                        totalPages: 0
                    },
                    message: 'API暂时不可用，返回空数据'
                }));
                return;
            }
        } catch (error) {
            console.error('API Error:', error);
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: 'Internal server error: ' + error.message}));
            return;
        }
    }
    
    // 处理静态文件
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeType = mimeTypes[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(content, 'utf-8');
        }
    });
});

// 启动服务器
async function startServer() {
    // 先加载API处理器
    await loadAPIHandlers();
    
    server.listen(PORT, () => {
        console.log(`🚀 开发服务器启动成功！`);
        console.log(`🌐 访问地址: http://localhost:${PORT}`);
        console.log(`📊 数据分析系统已就绪`);
        console.log(`🔧 API状态: Records=${recordsHandler ? '✅' : '❌'}, Stats=${statsHandler ? '✅' : '❌'}`);
    });
}

process.on('SIGTERM', () => {
    console.log('服务器关闭中...');
    server.close();
});

// 启动服务器
startServer().catch(console.error);