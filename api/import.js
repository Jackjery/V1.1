// 数据导入API接口
// 路径: /api/import

import { handleCors, handleError, sendSuccess, verifyAuth } from '../lib/auth.js';
import { batchInsertRecords, initDatabase } from '../lib/db.js';
import XLSX from 'xlsx';
import { IncomingForm } from 'formidable';
import fs from 'fs';

// 配置 API 路由以支持文件上传
export const config = {
    api: {
        bodyParser: false,
    },
}

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

        // 使用formidable解析文件上传
        const form = new IncomingForm({
            maxFileSize: 4.5 * 1024 * 1024, // 4.5MB - Vercel限制
            keepExtensions: true,
            multiples: false
        });

        const [fields, files] = await form.parse(req);

        // 检查是否有文件上传
        if (!files.file || !files.file[0]) {
            return res.status(400).json({ error: '请上传Excel文件' });
        }

        const file = files.file[0];
        const mode = fields.mode ? fields.mode[0] : 'append';
        const validate = fields.validate ? fields.validate[0] === 'true' : false;
        const batch = fields.batch ? fields.batch[0] === 'true' : false;

        // 验证文件类型
        if (!file.originalFilename.match(/\.(xlsx|xls)$/)) {
            // 清理临时文件
            if (file.filepath && fs.existsSync(file.filepath)) {
                fs.unlinkSync(file.filepath);
            }
            return res.status(400).json({ error: '仅支持Excel文件格式(.xlsx, .xls)' });
        }

        // 读取Excel文件
        const fileBuffer = fs.readFileSync(file.filepath);
        const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // 转换为JSON数据
        const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        
        // 清理临时文件
        if (file.filepath && fs.existsSync(file.filepath)) {
            fs.unlinkSync(file.filepath);
        }
        
        if (rawData.length === 0) {
            return res.status(400).json({ error: 'Excel文件中没有数据' });
        }

        // 数据验证和清洗
        let validRecords = [];
        let errors = [];

        for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i];
            const rowNum = i + 2; // Excel行号从2开始（第1行是标题）
            
            try {
                // 验证必填字段
                const planId = row['计划ID'] || row.plan_id || row['Plan ID'] || '';
                const startTime = row['开始时间'] || row.start_time || row['Start Time'] || '';
                const taskResult = row['任务结果状态'] || row.task_result || row['Task Result'] || '';

                if (!planId.toString().trim()) {
                    if (validate) {
                        errors.push(`第${rowNum}行：计划ID不能为空`);
                        continue;
                    }
                }

                if (!startTime) {
                    if (validate) {
                        errors.push(`第${rowNum}行：开始时间不能为空`);
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
                            errors.push(`第${rowNum}行：时间格式无效 "${startTime}"`);
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
                    // 保留原始数据
                    ...row
                };

                validRecords.push(record);

            } catch (error) {
                errors.push(`第${rowNum}行：处理失败 - ${error.message}`);
            }
        }

        // 如果有验证错误且启用了验证
        if (validate && errors.length > 0) {
            return res.status(400).json({
                error: '数据验证失败',
                details: errors.slice(0, 10), // 只显示前10个错误
                totalErrors: errors.length,
                validRecords: validRecords.length
            });
        }

        if (validRecords.length === 0) {
            return res.status(400).json({ error: '没有有效的记录可以导入' });
        }

        // 处理不同的导入模式
        if (mode === 'replace') {
            // 清空现有数据
            const { query } = await import('../lib/db.js');
            await query('TRUNCATE TABLE satellite_records RESTART IDENTITY');
        } else if (mode === 'update') {
            // TODO: 实现更新模式（根据计划ID更新现有记录）
            // 这里暂时使用追加模式
        }

        // 批量插入数据
        let inserted = 0;
        if (batch && validRecords.length > 100) {
            // 分批处理大量数据
            const batchSize = 100;
            for (let i = 0; i < validRecords.length; i += batchSize) {
                const batch = validRecords.slice(i, i + batchSize);
                const batchInserted = await batchInsertRecords(batch);
                inserted += batchInserted;
            }
        } else {
            // 一次性插入
            inserted = await batchInsertRecords(validRecords);
        }

        // 返回成功响应
        sendSuccess(res, {
            imported: inserted,
            total: rawData.length,
            valid: validRecords.length,
            errors: errors.length,
            mode,
            file: {
                name: file.originalFilename,
                size: file.size
            }
        }, `成功导入 ${inserted} 条记录`);

    } catch (error) {
        console.error('数据导入失败:', error);
        handleError(res, error, '数据导入失败');
    }
}