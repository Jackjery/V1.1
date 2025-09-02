// 数据导出API接口
// 路径: /api/export

import { handleCors, handleError, verifyAuth } from '../lib/auth.js';
import { getRecords, initDatabase } from '../lib/db.js';
import XLSX from 'xlsx';

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只允许GET请求' });
    }

    try {
        // 验证用户身份
        if (!verifyAuth(req, res)) {
            return;
        }

        // 确保数据库已初始化
        await initDatabase();
        
        // 解析查询参数
        const {
            startDate,
            endDate,
            taskResult,
            planId,
            format = 'xlsx'
        } = req.query;

        // 构建查询选项
        const options = {
            page: 1,
            limit: 10000 // 导出时获取更多数据
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

        // 获取数据
        const result = await getRecords(options);
        
        if (result.records.length === 0) {
            return res.status(404).json({ error: '没有数据可导出' });
        }

        // 处理导出数据
        const exportData = result.records.map(record => ({
            '计划ID': record.plan_id,
            '开始时间': new Date(record.start_time).toLocaleString('zh-CN', { 
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }),
            '任务结果状态': record.task_result,
            '创建时间': new Date(record.created_at).toLocaleString('zh-CN', { 
                timeZone: 'Asia/Shanghai'
            })
        }));

        if (format === 'json') {
            // JSON格式导出
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename=satellite-data-${new Date().toISOString().slice(0, 10)}.json`);
            return res.json({
                success: true,
                data: exportData,
                total: result.total,
                exportTime: new Date().toISOString()
            });
        } else {
            // Excel格式导出
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            
            // 设置列宽
            const colWidths = [
                { wch: 20 }, // 计划ID
                { wch: 20 }, // 开始时间
                { wch:25 }, // 任务结果状态
                { wch: 20 }  // 创建时间
            ];
            worksheet['!cols'] = colWidths;
            
            XLSX.utils.book_append_sheet(workbook, worksheet, '卫星任务数据');
            
            // 生成Excel文件
            const excelBuffer = XLSX.write(workbook, { 
                type: 'buffer', 
                bookType: 'xlsx' 
            });
            
            // 设置响应头
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=satellite-data-${new Date().toISOString().slice(0, 10)}.xlsx`);
            res.setHeader('Content-Length', excelBuffer.length);
            
            return res.end(excelBuffer);
        }

    } catch (error) {
        console.error('数据导出失败:', error);
        handleError(res, error, '数据导出失败');
    }
}
