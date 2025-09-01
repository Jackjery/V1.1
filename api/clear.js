// 清空数据API接口
// 路径: /api/clear

const { handleCors, handleError, sendSuccess, verifyAuth } = require('../lib/auth');
const { query, initDatabase } = require('../lib/db');

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: '只允许DELETE请求' });
    }

    try {
        // 验证用户身份
        if (!verifyAuth(req, res)) {
            return;
        }

        // 确保数据库已初始化
        await initDatabase();
        
        // 获取删除前的统计信息
        const beforeStats = await query('SELECT COUNT(*) as total FROM satellite_records');
        const totalBefore = parseInt(beforeStats.rows[0].total);
        
        if (totalBefore === 0) {
            return res.status(400).json({ error: '数据库中没有数据可清空' });
        }

        // 清空表数据并重置自增ID
        await query('TRUNCATE TABLE satellite_records RESTART IDENTITY');
        
        // 验证清空结果
        const afterStats = await query('SELECT COUNT(*) as total FROM satellite_records');
        const totalAfter = parseInt(afterStats.rows[0].total);
        
        if (totalAfter !== 0) {
            throw new Error('数据清空失败，请重试');
        }

        // 记录操作日志
        console.log(`用户 ${req.user.username} 清空了所有数据，共删除 ${totalBefore} 条记录`);

        // 返回成功响应
        sendSuccess(res, {
            deletedCount: totalBefore,
            remainingCount: totalAfter,
            operator: req.user.username,
            timestamp: new Date().toISOString()
        }, `成功清空所有数据，共删除 ${totalBefore} 条记录`);

    } catch (error) {
        console.error('清空数据失败:', error);
        handleError(res, error, '清空数据失败');
    }
}