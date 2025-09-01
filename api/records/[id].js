// 单条记录CRUD API接口
// 路径: /api/records/[id]

const { handleCors, handleError, sendSuccess, verifyAuth } = require('../../lib/auth');
const { query, initDatabase } = require('../../lib/db');

export default async function handler(req, res) {
    // 处理CORS
    if (handleCors(req, res)) return;
    
    // 验证用户身份（增删改操作需要认证）
    if (req.method !== 'GET' && !verifyAuth(req, res)) {
        return;
    }

    try {
        // 确保数据库已初始化
        await initDatabase();
        
        const { id } = req.query;
        
        if (!id || isNaN(parseInt(id))) {
            return res.status(400).json({ error: '无效的记录ID' });
        }

        const recordId = parseInt(id);

        switch (req.method) {
            case 'GET':
                await handleGetRecord(req, res, recordId);
                break;
            case 'PUT':
                await handleUpdateRecord(req, res, recordId);
                break;
            case 'DELETE':
                await handleDeleteRecord(req, res, recordId);
                break;
            default:
                res.status(405).json({ error: '不支持的请求方法' });
        }

    } catch (error) {
        console.error('记录操作失败:', error);
        handleError(res, error, '记录操作失败');
    }
}

// 获取单条记录
async function handleGetRecord(req, res, recordId) {
    const result = await query(
        'SELECT id, plan_id, start_time, task_result, raw_data, created_at, updated_at FROM satellite_records WHERE id = $1',
        [recordId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: '记录不存在' });
    }

    const record = result.rows[0];
    
    // 处理返回数据
    const processedRecord = {
        id: record.id,
        plan_id: record.plan_id,
        start_time: record.start_time,
        task_result: record.task_result,
        created_at: record.created_at,
        updated_at: record.updated_at,
        raw_data: record.raw_data
    };

    sendSuccess(res, processedRecord, '获取记录成功');
}

// 更新记录
async function handleUpdateRecord(req, res, recordId) {
    const { plan_id, start_time, task_result } = req.body;
    
    if (!plan_id || !start_time || !task_result) {
        return res.status(400).json({ error: '计划ID、开始时间和任务结果状态不能为空' });
    }

    // 验证时间格式
    const parsedTime = new Date(start_time);
    if (isNaN(parsedTime.getTime())) {
        return res.status(400).json({ error: '无效的时间格式' });
    }

    // 检查记录是否存在
    const existingRecord = await query(
        'SELECT id FROM satellite_records WHERE id = $1',
        [recordId]
    );

    if (existingRecord.rows.length === 0) {
        return res.status(404).json({ error: '记录不存在' });
    }

    // 更新记录
    const updateResult = await query(`
        UPDATE satellite_records 
        SET plan_id = $1, start_time = $2, task_result = $3, updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING id, plan_id, start_time, task_result, updated_at
    `, [plan_id.trim(), parsedTime, task_result.trim(), recordId]);

    const updatedRecord = updateResult.rows[0];

    sendSuccess(res, updatedRecord, '记录更新成功');
}

// 删除记录
async function handleDeleteRecord(req, res, recordId) {
    // 检查记录是否存在
    const existingRecord = await query(
        'SELECT id, plan_id FROM satellite_records WHERE id = $1',
        [recordId]
    );

    if (existingRecord.rows.length === 0) {
        return res.status(404).json({ error: '记录不存在' });
    }

    // 删除记录
    await query('DELETE FROM satellite_records WHERE id = $1', [recordId]);

    sendSuccess(res, { 
        id: recordId, 
        plan_id: existingRecord.rows[0].plan_id 
    }, '记录删除成功');
}