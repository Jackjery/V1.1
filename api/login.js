// 登录API接口
// 路径: /api/login

const { handleCors, handleError, sendSuccess, verifyPassword } = require('../lib/auth');
const { query, initDatabase } = require('../lib/db');

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允许POST请求' });
    }

    try {
        // 确保数据库已初始化
        await initDatabase();
        
        const { username, password, remember = false } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码不能为空' });
        }

        // 查询用户
        const userResult = await query(
            'SELECT id, username, password_hash, role FROM users WHERE username = $1',
            [username.trim()]
        );

        if (userResult.rows.length === 0) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        const user = userResult.rows[0];
        
        // 验证密码
        const isValidPassword = await verifyPassword(password, user.password_hash);
        if (!isValidPassword) {
            return res.status(401).json({ error: '用户名或密码错误' });
        }

        // 生成JWT token
        const { generateToken } = require('../lib/auth');
        const tokenPayload = {
            userId: user.id,
            username: user.username,
            role: user.role
        };
        
        const token = generateToken(tokenPayload);
        
        // 更新最后登录时间（可选）
        await query(
            'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // 返回成功响应
        sendSuccess(res, {
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            },
            remember
        }, '登录成功');

    } catch (error) {
        console.error('登录失败:', error);
        handleError(res, error, '登录失败，请稍后重试');
    }
}