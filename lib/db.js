// 数据库连接和操作工具
// 支持 Vercel + Postgres

import { Pool } from 'pg';

// 数据库连接配置 - 针对Vercel限制优化
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }, // Neon需要SSL
    max: 3, // 大幅减少连接数以降低数据传输
    min: 1, // 保持最少连接
    idleTimeoutMillis: 10000, // 10秒后释放空闲连接
    connectionTimeoutMillis: 5000, // 5秒连接超时
    query_timeout: 15000, // 15秒查询超时
    statement_timeout: 15000, // 15秒语句超时
    acquireTimeoutMillis: 5000, // 5秒获取连接超时
    allowExitOnIdle: true, // 允许空闲时退出
});

/**
 * 执行查询
 */
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query:', { text: text.substring(0, 100), duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
}

/**
 * 获取数据库客户端（用于事务）
 */
async function getClient() {
    return await pool.connect();
}

// 数据库初始化状态标记
let isInitialized = false;

// 简单的内存缓存（适用于Vercel serverless）
const queryCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

/**
 * 初始化数据库表（只执行一次）
 */
async function initDatabase() {
    if (isInitialized) {
        return; // 已初始化，跳过
    }
    
    try {
        // 检查表是否已存在，避免不必要的操作
        const tableCheck = await query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('users', 'satellite_records')
        `);
        
        if (tableCheck.rows.length >= 2) {
            isInitialized = true;
            console.log('数据库已初始化，跳过创建表');
            return;
        }

        // 创建用户表
        await query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(20) DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 创建卫星记录表
        await query(`
            CREATE TABLE IF NOT EXISTS satellite_records (
                id SERIAL,
                plan_id VARCHAR(100) PRIMARY KEY,
                customer VARCHAR(100) NOT NULL,
                satellite_name VARCHAR(100) NOT NULL,
                station_name VARCHAR(100) NOT NULL,
                station_id VARCHAR(50) NOT NULL,
                start_time TIMESTAMP NOT NULL,
                task_type VARCHAR(100) NOT NULL,
                task_result VARCHAR(100),
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 只在需要时创建索引
        const indexQueries = [
            'CREATE INDEX IF NOT EXISTS idx_satellite_records_customer ON satellite_records(customer)',
            'CREATE INDEX IF NOT EXISTS idx_satellite_records_satellite_name ON satellite_records(satellite_name)',
            'CREATE INDEX IF NOT EXISTS idx_satellite_records_station_name ON satellite_records(station_name)',
            'CREATE INDEX IF NOT EXISTS idx_satellite_records_station_id ON satellite_records(station_id)',
            'CREATE INDEX IF NOT EXISTS idx_satellite_records_start_time ON satellite_records(start_time)',
            'CREATE INDEX IF NOT EXISTS idx_satellite_records_task_type ON satellite_records(task_type)',
            'CREATE INDEX IF NOT EXISTS idx_satellite_records_task_result ON satellite_records(task_result)',
            'CREATE INDEX IF NOT EXISTS idx_satellite_records_time_result ON satellite_records(start_time, task_result)',
            'CREATE INDEX IF NOT EXISTS idx_satellite_records_customer_time ON satellite_records(customer, start_time)'
        ];

        // 批量执行索引创建
        await Promise.all(indexQueries.map(sql => query(sql)));

        console.log('数据库表初始化完成');
        
        // 检查是否需要创建默认管理员用户
        await createDefaultUser();
        
        isInitialized = true;
        
    } catch (error) {
        console.error('数据库初始化失败:', error);
        throw error;
    }
}

/**
 * 创建默认管理员用户
 */
async function createDefaultUser() {
    try {
        const { hashPassword } = await import('./auth.js');
        
        // 检查是否已有用户
        const existingUsers = await query('SELECT COUNT(*) FROM users');
        if (parseInt(existingUsers.rows[0].count) > 0) {
            return; // 已有用户，跳过
        }
        
        // 创建默认管理员用户
        const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
        const hashedPassword = await hashPassword(defaultPassword);
        
        await query(
            'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
            ['admin', hashedPassword, 'admin']
        );
        
        console.log('默认管理员用户创建完成 - 用户名: admin');
    } catch (error) {
        console.error('创建默认用户失败:', error);
    }
}

/**
 * 批量插入记录（用于数据导入）
 */
async function batchInsertRecords(records) {
    const client = await getClient();
    
    try {
        await client.query('BEGIN');
        
        const insertQuery = `
            INSERT INTO satellite_records (
                plan_id, customer, satellite_name, station_name, station_id, 
                start_time, task_type, task_result, raw_data
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (plan_id) DO UPDATE SET
                customer = EXCLUDED.customer,
                satellite_name = EXCLUDED.satellite_name,
                station_name = EXCLUDED.station_name,
                station_id = EXCLUDED.station_id,
                start_time = EXCLUDED.start_time,
                task_type = EXCLUDED.task_type,
                task_result = EXCLUDED.task_result,
                raw_data = EXCLUDED.raw_data,
                updated_at = CURRENT_TIMESTAMP
        `;
        
        let inserted = 0;
        for (const record of records) {
            try {
                // 确保时间不进行时区转换，直接作为北京时间存储
                const startTime = parseFileTime(record['开始时间'] || record.start_time);
                
                await client.query(insertQuery, [
                    record['计划ID'] || record.plan_id,
                    record['所属客户'] || record.customer || '未知客户',
                    record['卫星名称'] || record.satellite_name || '未知卫星',
                    record['测站名称'] || record.station_name || '未知测站',
                    record['测站ID'] || record.station_id || '未知ID',
                    startTime,
                    record['任务类型'] || record.task_type || '未知类型',
                    record['任务结果状态'] || record.task_result || '未知状态',
                    JSON.stringify(record)
                ]);
                inserted++;
            } catch (error) {
                console.warn('插入单条记录失败:', error.message);
            }
        }
        
        await client.query('COMMIT');
        return inserted;
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * 解析文件时间（不转换时区，视为北京时间）
 */
function parseFileTime(timeValue) {
    if (!timeValue) return null;
    
    if (timeValue instanceof Date) {
        return timeValue;
    }
    
    if (typeof timeValue === 'string') {
        // 直接解析字符串时间，不进行时区转换
        const date = new Date(timeValue);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    
    if (typeof timeValue === 'number') {
        // Excel 时间戳转换
        const date = new Date((timeValue - 25569) * 86400000);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    
    return null;
}

/**
 * 获取记录列表（支持分页和过滤，带缓存）
 */
async function getRecords(options = {}) {
    // 生成缓存键
    const cacheKey = JSON.stringify(options);
    const cached = queryCache.get(cacheKey);
    
    // 检查缓存
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        console.log('使用缓存数据，减少数据库查询');
        return cached.data;
    }
    
    const { 
        page = 1, 
        limit = Number.MAX_SAFE_INTEGER, // 不限制条数
        startDate, 
        endDate, 
        taskResult,
        planId,
        customer,
        satelliteName,
        stationName,
        stationId,
        taskType
    } = options;
    
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;
    
    // 时间范围过滤
    if (startDate) {
        whereConditions.push(`start_time >= $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
    }
    
    if (endDate) {
        whereConditions.push(`start_time <= $${paramIndex}`);
        params.push(endDate);
        paramIndex++;
    }
    
    // 各字段过滤
    if (taskResult) {
        whereConditions.push(`task_result = $${paramIndex}`);
        params.push(taskResult);
        paramIndex++;
    }
    
    if (planId) {
        whereConditions.push(`plan_id = $${paramIndex}`);
        params.push(planId);
        paramIndex++;
    }
    
    if (customer) {
        whereConditions.push(`customer = $${paramIndex}`);
        params.push(customer);
        paramIndex++;
    }
    
    if (satelliteName) {
        whereConditions.push(`satellite_name = $${paramIndex}`);
        params.push(satelliteName);
        paramIndex++;
    }
    
    if (stationName) {
        whereConditions.push(`station_name = $${paramIndex}`);
        params.push(stationName);
        paramIndex++;
    }
    
    if (stationId) {
        whereConditions.push(`station_id = $${paramIndex}`);
        params.push(stationId);
        paramIndex++;
    }
    
    if (taskType) {
        whereConditions.push(`task_type = $${paramIndex}`);
        params.push(taskType);
        paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 
        ? 'WHERE ' + whereConditions.join(' AND ')
        : '';
    
    // 分页
    const offset = (page - 1) * limit;
    
    const queryText = `
        SELECT 
            id, plan_id, customer, satellite_name, station_name, station_id,
            start_time, task_type, task_result, raw_data, created_at
        FROM satellite_records 
        ${whereClause}
        ORDER BY start_time DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, offset);
    
    // 获取总数
    const countQuery = `
        SELECT COUNT(*) as total
        FROM satellite_records 
        ${whereClause}
    `;
    
    const [records, count] = await Promise.all([
        query(queryText, params),
        query(countQuery, params.slice(0, -2)) // 移除limit和offset参数
    ]);
    
    const result = {
        records: records.rows,
        total: parseInt(count.rows[0].total),
        page,
        limit,
        totalPages: Math.ceil(parseInt(count.rows[0].total) / limit)
    };
    
    // 缓存结果（清理旧缓存）
    if (queryCache.size > 50) {
        queryCache.clear(); // 简单的缓存清理
    }
    queryCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
    });
    
    return result;
}

/**
 * 获取统计数据
 */
async function getStats(options = {}) {
    const { startDate, endDate } = options;
    
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;
    
    if (startDate) {
        whereConditions.push(`start_time >= $${paramIndex}`);
        params.push(startDate);
        paramIndex++;
    }
    
    if (endDate) {
        whereConditions.push(`start_time <= $${paramIndex}`);
        params.push(endDate);
        paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 
        ? 'WHERE ' + whereConditions.join(' AND ')
        : '';
    
    const statsQuery = `
        SELECT 
            COUNT(DISTINCT plan_id) as total_plans,
            COUNT(*) as total_records,
            COUNT(CASE WHEN task_result IN ('因设备故障失败', '因操作失误失败', '未跟踪', '因卫星方原因失败', '任务成功数据处理失误') THEN 1 END) as total_failures,
            MIN(start_time) as earliest_time,
            MAX(start_time) as latest_time
        FROM satellite_records 
        ${whereClause}
    `;
    
    const result = await query(statsQuery, params);
    return result.rows[0];
}

/**
 * 关闭数据库连接池
 */
async function closePool() {
    await pool.end();
}

export {
    query,
    getClient,
    initDatabase,
    batchInsertRecords,
    getRecords,
    getStats,
    parseFileTime,
    closePool
};
