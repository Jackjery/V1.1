// 调试用户表状态API
// 路径: /api/debug-users

import { handleCors, handleError, sendSuccess, hashPassword } from '../lib/auth.js';
import { query, initDatabase } from '../lib/db.js';

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只允许GET请求' });
    }

    try {
        // 确保数据库已初始化
        await initDatabase();
        
        // 查询所有用户
        const users = await query('SELECT id, username, role, created_at FROM users');
        
        // 如果没有用户，尝试创建默认用户
        if (users.rows.length === 0) {
            console.log('没有找到用户，尝试创建默认用户...');
            
            const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
            const hashedPassword = await hashPassword(defaultPassword);
            
            await query(
                'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
                ['admin', hashedPassword, 'admin']
            );
            
            console.log('默认管理员用户创建完成');
            
            // 重新查询用户
            const newUsers = await query('SELECT id, username, role, created_at FROM users');
            
            return sendSuccess(res, {
                message: '已创建默认用户',
                users: newUsers.rows,
                defaultCredentials: {
                    username: 'admin',
                    password: defaultPassword
                }
            });
        }
        
        // 返回用户信息（不包含密码）
        sendSuccess(res, {
            users: users.rows,
            defaultCredentials: {
                username: 'admin',
                password: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'
            }
        });

    } catch (error) {
        console.error('调试用户失败:', error);
        handleError(res, error, '调试用户失败');
    }
}