// 测试密码哈希API
// 路径: /api/test-password

const { handleCors, handleError, sendSuccess, hashPassword, verifyPassword } = require('../lib/auth');
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
        
        const { username = 'admin', password = 'admin123', action = 'test' } = req.body;
        
        if (action === 'test') {
            // 测试密码哈希和验证
            console.log('测试密码哈希...');
            
            // 1. 创建新的哈希
            const newHash = await hashPassword(password);
            console.log('新哈希:', newHash);
            
            // 2. 验证新哈希
            const newHashVerify = await verifyPassword(password, newHash);
            console.log('新哈希验证结果:', newHashVerify);
            
            // 3. 查询数据库中的用户哈希
            const userResult = await query(
                'SELECT password_hash FROM users WHERE username = $1',
                [username]
            );
            
            let dbHashVerify = null;
            let dbHash = null;
            
            if (userResult.rows.length > 0) {
                dbHash = userResult.rows[0].password_hash;
                console.log('数据库哈希:', dbHash);
                
                // 4. 验证数据库哈希
                dbHashVerify = await verifyPassword(password, dbHash);
                console.log('数据库哈希验证结果:', dbHashVerify);
            }
            
            return sendSuccess(res, {
                testPassword: password,
                newHash,
                newHashVerify,
                dbHash,
                dbHashVerify,
                userExists: userResult.rows.length > 0
            });
            
        } else if (action === 'reset') {
            // 重置用户密码
            console.log('重置密码...');
            
            const newHash = await hashPassword(password);
            
            // 更新或创建用户
            const updateResult = await query(
                'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2',
                [newHash, username]
            );
            
            if (updateResult.rowCount === 0) {
                // 用户不存在，创建新用户
                await query(
                    'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
                    [username, newHash, 'admin']
                );
                
                return sendSuccess(res, {
                    message: `用户 ${username} 已创建，密码: ${password}`,
                    action: 'created'
                });
            } else {
                return sendSuccess(res, {
                    message: `用户 ${username} 密码已重置为: ${password}`,
                    action: 'updated'
                });
            }
        }

    } catch (error) {
        console.error('密码测试失败:', error);
        handleError(res, error, '密码测试失败');
    }
}