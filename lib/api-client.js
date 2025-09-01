// 前端API客户端工具
// 统一管理所有页面的API调用

class APIClient {
    constructor() {
        this.baseURL = '';  // 使用相对路径，Vercel会自动处理
    }

    /**
     * 从后端 API 获取数据
     */
    async fetchRecords(params = {}) {
        try {
            const qs = new URLSearchParams(params).toString();
            const response = await fetch(`/api/records?${qs}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || '获取数据失败');
            }

            return result.data.records || [];
        } catch (error) {
            console.error('获取数据失败:', error);
            throw error;
        }
    }

    /**
     * 获取统计数据
     */
    async fetchStats(params = {}) {
        try {
            const qs = new URLSearchParams(params).toString();
            const response = await fetch(`/api/stats?${qs}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || '获取统计数据失败');
            }

            return result.data;
        } catch (error) {
            console.error('获取统计数据失败:', error);
            throw error;
        }
    }

    /**
     * 模拟IndexedDB的getAllDataWithProgress方法
     * 用于替换原有的IndexedDB调用
     */
    async getAllDataWithProgress(progressCallback) {
        try {
            if (progressCallback) progressCallback(10, 0, 0);
            
            const records = await this.fetchRecords({ limit: 10000 });
            
            if (progressCallback) progressCallback(50, records.length, records.length);
            
            // 转换数据格式，确保与原IndexedDB格式兼容
            const processedRecords = records.map((record, index) => ({
                id: record.plan_id || index,
                timestamp: new Date(record.start_time).getTime(),
                // 兼容原有字段名
                '计划ID': record.plan_id,
                '开始时间': record.start_time,
                '任务结果状态': record.task_result,
                '所属客户': record.customer,
                '卫星名称': record.satellite_name,
                '测站名称': record.station_name,
                '测站ID': record.station_id,
                '任务类型': record.task_type,
                // 保持原始数据
                ...record
            }));
            
            if (progressCallback) progressCallback(100, processedRecords.length, processedRecords.length);
            
            return processedRecords;
        } catch (error) {
            console.error('API获取数据失败:', error);
            if (progressCallback) progressCallback(100, 0, 0);
            return [];
        }
    }

    /**
     * 检查是否有数据
     */
    async hasData() {
        try {
            const records = await this.fetchRecords({ limit: 1 });
            return records.length > 0;
        } catch (error) {
            return false;
        }
    }

    /**
     * 获取总记录数
     */
    async getTotalCount() {
        try {
            const stats = await this.fetchStats();
            return stats.total_records || 0;
        } catch (error) {
            return 0;
        }
    }

    /**
     * 清空数据 (需要认证)
     */
    async clearData() {
        try {
            const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
            if (!token) {
                throw new Error('需要管理员权限');
            }

            const response = await fetch('/api/clear', {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || '清空数据失败');
            }

            return result.data;
        } catch (error) {
            console.error('清空数据失败:', error);
            throw error;
        }
    }

    /**
     * 获取唯一值列表（用于过滤器）
     */
    async getUniqueValues(field) {
        try {
            const records = await this.fetchRecords({ limit: 10000 });
            const values = new Set();
            
            records.forEach(record => {
                let value;
                switch (field) {
                    case 'customer':
                    case '所属客户':
                        value = record.customer || record['所属客户'];
                        break;
                    case 'satellite_name':
                    case '卫星名称':
                        value = record.satellite_name || record['卫星名称'];
                        break;
                    case 'station_name':
                    case '测站名称':
                        value = record.station_name || record['测站名称'];
                        break;
                    case 'station_id':
                    case '测站ID':
                        value = record.station_id || record['测站ID'];
                        break;
                    case 'task_type':
                    case '任务类型':
                        value = record.task_type || record['任务类型'];
                        break;
                    case 'task_result':
                    case '任务结果状态':
                        value = record.task_result || record['任务结果状态'];
                        break;
                    default:
                        value = record[field];
                }
                
                if (value && value !== '未知' && value !== '') {
                    values.add(value);
                }
            });
            
            return Array.from(values).sort();
        } catch (error) {
            console.error(`获取${field}唯一值失败:`, error);
            return [];
        }
    }
}

// 创建全局API客户端实例
if (typeof window !== 'undefined') {
    window.apiClient = new APIClient();
}

// 兼容原有的SatelliteDB类
class SatelliteDB {
    constructor() {
        this.apiClient = window.apiClient || new APIClient();
        this.initialized = false;
    }

    async init() {
        this.initialized = true;
        return Promise.resolve();
    }

    async ensureInitialized() {
        if (!this.initialized) await this.init();
        return true;
    }

    async getAllDataWithProgress(progressCallback) {
        return await this.apiClient.getAllDataWithProgress(progressCallback);
    }

    async hasData() {
        return await this.apiClient.hasData();
    }

    async getTotalCount() {
        return await this.apiClient.getTotalCount();
    }

    async clearData() {
        return await this.apiClient.clearData();
    }
}

// 导出API客户端
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { APIClient, SatelliteDB };
}