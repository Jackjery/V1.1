// 统计数据API接口
// 路径: /api/stats

const { handleCors, handleError, sendSuccess } = require('../lib/auth');
const { getStats, initDatabase } = require('../lib/db');

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只允许GET请求' });
    }

    try {
        // 对于公开的统计数据，可以不要求认证
        // 但如果需要认证，可以取消下面的注释
        // if (!verifyAuth(req, res)) {
        //     return;
        // }

        // 确保数据库已初始化
        await initDatabase();
        
        // 解析查询参数
        const { startDate, endDate } = req.query;

        // 构建查询选项
        const options = {};
        
        if (startDate) {
            options.startDate = new Date(startDate);
        }
        
        if (endDate) {
            options.endDate = new Date(endDate);
        }

        // 获取统计数据
        const stats = await getStats(options);
        
        // 处理统计数据
        const processedStats = {
            total_records: parseInt(stats.total_records) || 0,
            total_plans: parseInt(stats.total_plans) || 0,
            total_failures: parseInt(stats.total_failures) || 0,
            earliest_time: stats.earliest_time,
            latest_time: stats.latest_time,
            // 计算成功率
            success_rate: stats.total_records > 0 
                ? ((stats.total_records - stats.total_failures) / stats.total_records * 100).toFixed(2)
                : 0
        };

        // 返回成功响应
        sendSuccess(res, processedStats, '获取统计数据成功');

    } catch (error) {
        console.error('获取统计数据失败:', error);
        handleError(res, error, '获取统计数据失败');
    }
}