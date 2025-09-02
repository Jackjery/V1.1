// 图表数据API接口 - 优化大数据量查询
// 路径: /api/chart-data

import { handleCors, handleError, sendSuccess, verifyAuth } from '../lib/auth.js';
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

        const {
            startDate,
            endDate,
            groupBy = 'day',
            limit = '10000',
            fields = 'basic'
        } = req.query;

        // 验证参数
        const maxLimit = 50000;
        const actualLimit = Math.min(parseInt(limit) || 10000, maxLimit);
        
        // 如果没有指定时间范围且数据量大，限制为最近30天
        let whereConditions = [];
        let params = [];
        let paramIndex = 1;

        if (!startDate || !endDate) {
            // 默认最近30天，避免查询全部数据
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            whereConditions.push(`start_time >= $${paramIndex}`);
            params.push(thirtyDaysAgo.toISOString());
            paramIndex++;
        } else {
            if (startDate) {
                whereConditions.push(`start_time >= $${paramIndex}`);
                params.push(startDate);
                paramIndex++;
            }
            
            if (endDate) {
                whereConditions.push(`start_time <= $${paramIndex}`);
                params.push(endDate + ' 23:59:59'); // 包含结束日期全天
                paramIndex++;
            }
        }

        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ')
            : '';

        // 根据fields参数选择查询字段
        let selectFields;
        if (fields === 'minimal') {
            selectFields = 'plan_id, start_time, task_result';
        } else if (fields === 'chart') {
            selectFields = 'plan_id, start_time, task_result, task_type, customer, satellite_name, station_name';
        } else {
            selectFields = '*';
        }

        const queryText = `
            SELECT ${selectFields}
            FROM satellite_records 
            ${whereClause}
            ORDER BY start_time DESC
            LIMIT $${paramIndex}
        `;
        
        params.push(actualLimit);

        console.log('Chart data query:', { queryText: queryText.substring(0, 100), params: params.length, limit: actualLimit });

        const result = await query(queryText, params);
        
        // 返回优化后的数据格式
        const records = result.rows.map(record => ({
            plan_id: record.plan_id,
            start_time: record.start_time,
            task_result: record.task_result,
            task_type: record.task_type,
            customer: record.customer,
            satellite_name: record.satellite_name,
            station_name: record.station_name,
            station_id: record.station_id,
            // 添加timestamp便于前端处理
            timestamp: new Date(record.start_time).getTime()
        }));

        // 获取数据范围信息
        const rangeQuery = `
            SELECT 
                MIN(start_time) as earliest_time,
                MAX(start_time) as latest_time,
                COUNT(*) as total_count
            FROM satellite_records 
            ${whereClause}
        `;

        const rangeResult = await query(rangeQuery, params.slice(0, -1)); // 移除limit参数
        const rangeInfo = rangeResult.rows[0];

        sendSuccess(res, {
            records,
            meta: {
                total: parseInt(rangeInfo.total_count) || 0,
                returned: records.length,
                limit: actualLimit,
                earliest_time: rangeInfo.earliest_time,
                latest_time: rangeInfo.latest_time,
                fields,
                hasTimeRange: !!(startDate && endDate)
            }
        }, `返回 ${records.length} 条图表数据`);

    } catch (error) {
        console.error('获取图表数据失败:', error);
        handleError(res, error, '获取图表数据失败');
    }
}