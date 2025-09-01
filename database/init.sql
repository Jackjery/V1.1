-- 卫星任务数据分析平台数据库初始化脚本
-- 适用于 PostgreSQL

-- 删除已存在的表（谨慎使用）
-- DROP TABLE IF EXISTS satellite_records CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- 创建用户认证表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建卫星记录表
CREATE TABLE IF NOT EXISTS satellite_records (
    id SERIAL,
    plan_id VARCHAR(100) PRIMARY KEY,          -- 计划ID（数据库主键）
    customer VARCHAR(100) NOT NULL,             -- 所属客户
    satellite_name VARCHAR(100) NOT NULL,       -- 卫星名称
    station_name VARCHAR(100) NOT NULL,         -- 测站名称
    station_id VARCHAR(50) NOT NULL,            -- 测站ID
    start_time TIMESTAMP NOT NULL,              -- 开始时间（北京时间，不转换时区）
    task_type VARCHAR(100) NOT NULL,            -- 任务类型
    task_result VARCHAR(100),                   -- 任务结果状态
    raw_data JSONB,                             -- 原始数据（JSON格式存储）
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建性能优化索引

-- 基础字段索引
CREATE INDEX IF NOT EXISTS idx_satellite_records_customer 
    ON satellite_records(customer);

CREATE INDEX IF NOT EXISTS idx_satellite_records_satellite_name 
    ON satellite_records(satellite_name);

CREATE INDEX IF NOT EXISTS idx_satellite_records_station_name 
    ON satellite_records(station_name);

CREATE INDEX IF NOT EXISTS idx_satellite_records_station_id 
    ON satellite_records(station_id);

CREATE INDEX IF NOT EXISTS idx_satellite_records_start_time 
    ON satellite_records(start_time);

CREATE INDEX IF NOT EXISTS idx_satellite_records_task_type 
    ON satellite_records(task_type);

CREATE INDEX IF NOT EXISTS idx_satellite_records_task_result 
    ON satellite_records(task_result);

-- 复合索引用于常见查询组合
CREATE INDEX IF NOT EXISTS idx_satellite_records_time_result 
    ON satellite_records(start_time, task_result);

CREATE INDEX IF NOT EXISTS idx_satellite_records_customer_time 
    ON satellite_records(customer, start_time);

CREATE INDEX IF NOT EXISTS idx_satellite_records_station_time 
    ON satellite_records(station_name, start_time);

CREATE INDEX IF NOT EXISTS idx_satellite_records_satellite_time 
    ON satellite_records(satellite_name, start_time);

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为 users 表添加更新时间触发器
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 为 satellite_records 表添加更新时间触发器
DROP TRIGGER IF EXISTS update_satellite_records_updated_at ON satellite_records;
CREATE TRIGGER update_satellite_records_updated_at
    BEFORE UPDATE ON satellite_records
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 插入默认管理员用户（密码: admin123）
-- 注意：实际部署时会通过应用程序创建，这里仅作为备份
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '$2b$10$rOzJTVzEF8CXyM5i7hiKHe1qLzW1e0SLbPJXFU2QBzJ6xKWaOGLYa', 'admin') 
ON CONFLICT (username) DO NOTHING;

-- 创建视图：简化常用查询
CREATE OR REPLACE VIEW v_satellite_records_summary AS
SELECT 
    plan_id,
    customer,
    satellite_name,
    station_name,
    station_id,
    start_time,
    task_type,
    task_result,
    DATE_TRUNC('day', start_time) as date_only,
    DATE_TRUNC('hour', start_time) as hour_only,
    CASE 
        WHEN task_result IN ('因设备故障失败', '因操作失误失败', '未跟踪', '因卫星方原因失败', '任务成功数据处理失误') 
        THEN 'failure'
        WHEN task_result = '正常'
        THEN 'success'
        ELSE 'unknown'
    END as result_category,
    created_at,
    updated_at
FROM satellite_records;

-- 统计查询示例（注释掉，仅供参考）
/*
-- 按客户统计
SELECT customer, COUNT(*) as total_count
FROM satellite_records 
GROUP BY customer 
ORDER BY total_count DESC;

-- 按卫星统计成功率
SELECT 
    satellite_name,
    COUNT(*) as total_count,
    COUNT(CASE WHEN task_result = '正常' THEN 1 END) as success_count,
    ROUND(COUNT(CASE WHEN task_result = '正常' THEN 1 END)::numeric / COUNT(*)::numeric * 100, 2) as success_rate
FROM satellite_records 
GROUP BY satellite_name 
ORDER BY success_rate DESC;

-- 按日期统计
SELECT 
    DATE(start_time) as date,
    COUNT(DISTINCT plan_id) as plan_count,
    COUNT(CASE WHEN task_result IN ('因设备故障失败', '因操作失误失败', '未跟踪', '因卫星方原因失败', '任务成功数据处理失误') THEN 1 END) as failure_count
FROM satellite_records 
WHERE start_time >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(start_time)
ORDER BY date DESC;
*/

-- 添加表注释
COMMENT ON TABLE users IS '用户认证表，存储管理员登录信息';
COMMENT ON TABLE satellite_records IS '卫星任务记录表，存储所有卫星任务的详细信息';

-- 添加字段注释
COMMENT ON COLUMN satellite_records.plan_id IS '计划ID，作为主键唯一标识';
COMMENT ON COLUMN satellite_records.customer IS '所属客户名称';
COMMENT ON COLUMN satellite_records.satellite_name IS '卫星名称';
COMMENT ON COLUMN satellite_records.station_name IS '测站名称';
COMMENT ON COLUMN satellite_records.station_id IS '测站ID标识';
COMMENT ON COLUMN satellite_records.start_time IS '任务开始时间，以北京时间存储，不进行时区转换';
COMMENT ON COLUMN satellite_records.task_type IS '任务类型分类';
COMMENT ON COLUMN satellite_records.task_result IS '任务结果状态';
COMMENT ON COLUMN satellite_records.raw_data IS '原始Excel数据的JSON格式存储';

-- 打印初始化完成信息
DO $$
BEGIN
    RAISE NOTICE '卫星任务数据分析平台数据库初始化完成！';
    RAISE NOTICE '默认管理员账户: admin / admin123';
    RAISE NOTICE '请及时修改默认密码以确保安全！';
END $$;