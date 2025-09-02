// 验证token API接口
// 路径: /api/verify

import { handleCors, handleError, sendSuccess, verifyAuth } from '../lib/auth.js';

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只允许GET请求' });
    }

    try {
        // 验证用户身份
        if (!verifyAuth(req, res)) {
            return; // verifyAuth已经处理了错误响应
        }

        // 返回用户信息
        sendSuccess(res, {
            userId: req.user.userId,
            username: req.user.username,
            role: req.user.role
        }, 'Token验证成功');

    } catch (error) {
        console.error('Token验证失败:', error);
        handleError(res, error, 'Token验证失败');
    }
}