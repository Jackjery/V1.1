// 分批数据导入API接口
// 路径: /api/import-batch

const { handleCors, handleError, sendSuccess, verifyAuth } = require('../lib/auth');
const { batchInsertRecords, initDatabase, query } = require('../lib/db');

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允许POST请求' });
    }

    try {
        // 验证用户身份
        if (!verifyAuth(req, res)) {
            return;
        }

        // 确保数据库已初始化
        await initDatabase();

        const { data, mode, validate } = req.body;

        if (!data || !Array.isArray(data)) {
            return res.status(400).json({ error: '请提供有效的数据数组' });
        }

        if (data.length === 0) {
            return res.status(400).json({ error: '数据数组不能为空' });
        }

        // 数据验证和清洗
        let validRecords = [];
        let errors = [];

        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const rowNum = i + 1;
            
            try {
                // 验证必填字段
                const planId = row['计划ID'] || row.plan_id || row['Plan ID'] || '';
                const startTime = row['开始时间'] || row.start_time || row['Start Time'] || '';
                const taskResult = row['任务结果状态'] || row.task_result || row['Task Result'] || '';

                if (!planId.toString().trim()) {
                    if (validate) {
                        errors.push(`批次第${rowNum}行：计划ID不能为空`);
                        continue;
                    }
                }

                if (!startTime) {
                    if (validate) {
                        errors.push(`批次第${rowNum}行：开始时间不能为空`);
                        continue;
                    }
                }

                // 时间格式验证和转换
                let parsedTime = null;
                if (startTime) {
                    if (typeof startTime === 'number') {
                        // Excel时间戳
                        parsedTime = new Date((startTime - 25569) * 86400000);
                    } else if (typeof startTime === 'string') {
                        // 字符串时间
                        parsedTime = new Date(startTime);
                    } else if (startTime instanceof Date) {
                        parsedTime = startTime;
                    }

                    if (!parsedTime || isNaN(parsedTime.getTime())) {
                        if (validate) {
                            errors.push(`批次第${rowNum}行：时间格式无效 "${startTime}"`);
                            continue;
                        }
                        parsedTime = null;
                    }
                }

                // 构造标准记录
                const record = {
                    '计划ID': planId.toString().trim(),
                    '开始时间': parsedTime,
                    '任务结果状态': taskResult.toString().trim(),
                    // 保留原始数据中的其他字段
                    '所属客户': row['所属客户'] || row.customer || '未知客户',
                    '卫星名称': row['卫星名称'] || row.satellite_name || '未知卫星',
                    '测站名称': row['测站名称'] || row.station_name || '未知测站',
                    '测站ID': row['测站ID'] || row.station_id || '未知ID',
                    '任务类型': row['任务类型'] || row.task_type || '未知类型',
                    ...row
                };

                validRecords.push(record);

            } catch (error) {
                errors.push(`批次第${rowNum}行：处理失败 - ${error.message}`);
            }
        }

        // 如果有验证错误且启用了验证
        if (validate && errors.length > 0) {
            return res.status(400).json({
                error: '数据验证失败',
                details: errors.slice(0, 5), // 只显示前5个错误
                totalErrors: errors.length,
                validRecords: validRecords.length
            });
        }

        if (validRecords.length === 0) {
            return res.status(400).json({ error: '没有有效的记录可以导入' });
        }

        // 处理不同的导入模式 (只在第一批时清空)
        if (mode === 'replace') {
            // 清空现有数据
            await query('TRUNCATE TABLE satellite_records RESTART IDENTITY');
        }

        // 批量插入数据
        const inserted = await batchInsertRecords(validRecords);

        // 返回成功响应
        sendSuccess(res, {
            imported: inserted,
            total: data.length,
            valid: validRecords.length,
            errors: errors.length,
            mode
        }, `成功导入批次 ${inserted} 条记录`);

    } catch (error) {
        console.error('分批数据导入失败:', error);
        handleError(res, error, '分批数据导入失败');
    }
}