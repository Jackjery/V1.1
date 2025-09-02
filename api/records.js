// 记录列表API接口
// 路径: /api/records

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { handleCors, handleError, sendSuccess, verifyAuth } = require('../lib/auth');
const { getRecords, initDatabase } = require('../lib/db');

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只允许GET请求' });
    }

    try {
        // 对于公开的数据查询，可以不要求认证
        // 但如果需要认证，可以取消下面的注释
        // if (!verifyAuth(req, res)) {
        //     return;
        // }

        // 确保数据库已初始化
        await initDatabase();
        
        // 解析查询参数
        const {
            page = 1,
            limit = 1000,
            startDate,
            endDate,
            taskResult,
            planId
        } = req.query;

        // 参数验证
        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit) || 1000));

        // 构建查询选项
        const options = {
            page: pageNum,
            limit: limitNum
        };

        // 添加过滤条件
        if (startDate) {
            options.startDate = new Date(startDate);
        }
        
        if (endDate) {
            options.endDate = new Date(endDate);
        }
        
        if (taskResult) {
            options.taskResult = taskResult;
        }
        
        if (planId) {
            options.planId = planId;
        }

        // 获取记录数据
        const result = await getRecords(options);
        
        // 处理返回数据，确保时间格式正确
        const processedRecords = result.records.map(record => ({
            id: record.id,
            '计划ID': record.plan_id,
            '开始时间': record.start_time,
            '任务结果状态': record.task_result,
            created_at: record.created_at,
            // 兼容前端现有字段名
            plan_id: record.plan_id,
            start_time: record.start_time,
            task_result: record.task_result
        }));

        // 返回成功响应
        const response = {
            records: processedRecords,
            pagination: {
                page: result.page,
                limit: result.limit,
                total: result.total,
                totalPages: result.totalPages
            },
            // 兼容前端现有结构
            ...result
        };

        sendSuccess(res, response, '获取记录成功');

    } catch (error) {
        console.error('获取记录失败:', error);
        handleError(res, error, '获取记录失败');
    }
}
