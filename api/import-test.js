// 测试导入API
const { handleCors, sendSuccess, handleError } = require('../lib/auth');

export const config = {
    api: {
        bodyParser: false,
    },
}

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允许POST请求' });
    }

    try {
        // 检查Content-Type
        const contentType = req.headers['content-type'];
        console.log('Content-Type:', contentType);
        
        // 检查Authorization
        const auth = req.headers['authorization'];
        console.log('Authorization:', auth ? 'Present' : 'Missing');
        
        // 简单返回成功
        return sendSuccess(res, {
            message: 'API连接正常',
            contentType,
            hasAuth: !!auth
        }, '测试成功');

    } catch (error) {
        console.error('测试失败:', error);
        return handleError(res, error, '测试失败');
    }
}