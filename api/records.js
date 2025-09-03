// 记录列表API接口
// 路径: /api/records

import { handleCors, handleError, sendSuccess, verifyAuth } from '../lib/auth.js';
import { getRecords, initDatabase } from '../lib/db.js';

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

        // 仅在需要时初始化数据库（大幅减少不必要的查询）
        try {
            await initDatabase();
        } catch (error) {
            // 如果是配额限制错误，跳过初始化继续执行
            if (error.message.includes('data transfer quota')) {
                console.log('数据库配额限制，跳过初始化步骤');
            } else {
                throw error;
            }
        }
        
        // 解析查询参数
        const {
            page = 1,
            limit,
            startDate,
            endDate,
            taskResult,
            planId,
            // 支持无限制获取所有数据
            no_limit,
            fetch_all,
            ignore_filters
        } = req.query;

        // 参数验证
        const pageNum = Math.max(1, parseInt(page) || 1);
        
        // 完全不限制数据条数，支持几十万数据
        let limitNum;
        if (limit && !isNaN(parseInt(limit))) {
            limitNum = parseInt(limit);
        } else {
            // 默认不限制条数，获取所有数据
            limitNum = Number.MAX_SAFE_INTEGER;
        }

        // 构建查询选项
        const options = {
            page: pageNum,
            limit: limitNum
        };

        // 添加过滤条件
        if (startDate) {
            const parsedStartDate = new Date(startDate);
            if (!isNaN(parsedStartDate.getTime())) {
                options.startDate = parsedStartDate;
            }
        }
        
        if (endDate) {
            const parsedEndDate = new Date(endDate);
            if (!isNaN(parsedEndDate.getTime())) {
                options.endDate = parsedEndDate;
            }
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
