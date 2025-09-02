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
     * 获取图表数据 - 直接使用records API，防止404错误
     */
    async fetchChartData(params = {}) {
        console.log('使用records API获取图表数据');
        
        try {
            // 直接使用records API，防止chart-data 404错误
            const records = await this.fetchRecords({
                limit: params.limit || 10000,
                startDate: params.startDate,
                endDate: params.endDate
            });
            
            // 转换为chart-data格式
            const chartData = {
                records: records.map(record => ({
                    plan_id: record.plan_id || record.id,
                    start_time: record.start_time,
                    task_result: record.task_result,
                    task_type: record.task_type,
                    customer: record.customer,
                    satellite_name: record.satellite_name,
                    station_name: record.station_name,
                    station_id: record.station_id,
                    timestamp: record.start_time ? new Date(record.start_time).getTime() : Date.now()
                })),
                meta: {
                    total: records.length,
                    returned: records.length,
                    fallback: 'records-api'
                }
            };
            
            console.log(`成功获取${records.length}条记录`);
            return chartData;
            
        } catch (error) {
            console.warn('无法获取数据，尝试本地回退:', error.message);
            return await this.fetchRecordsAsFallback(params);
        }
    }
    
    /**
     * 回退方案：使用本地数据或模拟数据
     */
    async fetchRecordsAsFallback(params = {}) {
        console.log('尝试使用本地回退方案');
        
        // 先尝试使用本地缓存数据
        const localData = this.getLocalData();
        if (localData && localData.length > 0) {
            console.log('使用本地缓存数据');
            return {
                records: localData.map(record => ({
                    plan_id: record.plan_id || record['计划ID'] || 'LOCAL_' + Math.random(),
                    start_time: record.start_time || record['开始时间'],
                    task_result: record.task_result || record['任务结果状态'] || '成功',
                    task_type: record.task_type || record['任务类型'] || '跟踪',
                    customer: record.customer || record['所属客户'] || '未知',
                    satellite_name: record.satellite_name || record['卫星名称'] || '未知',
                    station_name: record.station_name || record['测站名称'] || '未知',
                    station_id: record.station_id || record['测站ID'] || 'UNKNOWN',
                    timestamp: record.timestamp || (record.start_time ? new Date(record.start_time).getTime() : Date.now())
                })),
                meta: {
                    total: localData.length,
                    returned: localData.length,
                    fallback: 'local-cache'
                }
            };
        }
        
        // 如果没有本地数据，生成示例数据
        console.log('无本地数据，生成示例数据');
        const sampleData = this.generateSampleData();
        
        return {
            records: sampleData,
            meta: {
                total: sampleData.length,
                returned: sampleData.length,
                fallback: 'sample-data',
                message: '无法连接到数据库，正在显示示例数据。请在admin.html中导入真实数据。'
            }
        };
    }
    
    /**
     * 生成示例数据用于测试
     */
    generateSampleData() {
        const customers = ['客户A', '客户B', '客户C', '客户D'];
        const satellites = ['卫星1', '卫星2', '卫星3'];
        const stations = ['测站001', '测站002', '测站003'];
        const taskTypes = ['跟踪', '测控', '数据传输'];
        
        const sampleData = [];
        const now = new Date();
        
        // 生成30天内的示例数据
        for (let i = 0; i < 100; i++) {
            const startDate = new Date(now.getTime() - Math.random() * 30 * 24 * 60 * 60 * 1000);
            
            sampleData.push({
                plan_id: `SAMPLE_${String(i).padStart(4, '0')}`,
                start_time: startDate.toISOString(),
                task_result: Math.random() > 0.1 ? '成功' : '失败',
                task_type: taskTypes[Math.floor(Math.random() * taskTypes.length)],
                customer: customers[Math.floor(Math.random() * customers.length)],
                satellite_name: satellites[Math.floor(Math.random() * satellites.length)],
                station_name: stations[Math.floor(Math.random() * stations.length)],
                station_id: `ST${String(Math.floor(Math.random() * 10)).padStart(3, '0')}`,
                timestamp: startDate.getTime()
            });
        }
        
        return sampleData.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * 模拟IndexedDB的getAllDataWithProgress方法
     * 用于替换原有的IndexedDB调用 - 优化版本，支持大数据量处理
     */
    async getAllDataWithProgress(progressCallback, options = {}) {
        try {
            if (progressCallback) progressCallback(10, '正在检查数据量...');
            
            // 先获取总数据量
            const stats = await this.fetchStats();
            const totalRecords = stats.total_records || 0;
            
            // 检查是否有时间范围参数
            const hasTimeFilter = options.startDate && options.endDate;
            
            let maxRecords;
            if (totalRecords > 1000000) {
                // 百万级数据，采用采样策略
                maxRecords = hasTimeFilter ? 100000 : 50000;
                console.warn(`数据量过大（${totalRecords}条），将采用数据采样策略`);
            } else if (totalRecords > 100000) {
                // 十万级数据，限制获取数量
                maxRecords = hasTimeFilter ? 80000 : 30000;
            } else {
                // 数据量较小，可以获取更多
                maxRecords = hasTimeFilter ? 50000 : 20000;
            }
            
            const params = {
                fields: 'chart',
                limit: maxRecords,
                sampling: totalRecords > 500000, // 大数据量启用采样
                ...options
            };
            
            if (progressCallback) progressCallback(30, '正在获取数据...');
            
            const chartData = await this.fetchChartData(params);
            const records = chartData.records || [];
            
            if (progressCallback) progressCallback(60, '正在处理数据...');
            
            // 转换数据格式，确保时间格式严格按照北京时间处理
            const processedRecords = records.map((record, index) => {
                // 确保开始时间按北京时间处理
                let startTime = record.start_time;
                if (startTime) {
                    // 如果是字符串，确保按本地时间解析
                    if (typeof startTime === 'string') {
                        // 移除时区标识，按本地时间处理
                        startTime = startTime.replace(/[TZ]/g, ' ').replace(/\+\d{2}:\d{2}$/, '').trim();
                        startTime = new Date(startTime);
                    } else {
                        startTime = new Date(startTime);
                    }
                }
                
                return {
                    id: record.plan_id || index,
                    timestamp: startTime ? startTime.getTime() : Date.now(),
                    // 兼容原有字段名
                    '计划ID': record.plan_id,
                    '开始时间': startTime,
                    '任务结果状态': record.task_result,
                    '所属客户': record.customer,
                    '卫星名称': record.satellite_name,
                    '测站名称': record.station_name,
                    '测站ID': record.station_id,
                    '任务类型': record.task_type,
                    // 保持原始数据
                    ...record
                };
            });
            
            if (progressCallback) progressCallback(100, `数据处理完成，共${processedRecords.length}条记录`);
            
            // 显示数据处理情况
            if (chartData.meta) {
                const { total, returned } = chartData.meta;
                if (returned < total) {
                    const message = `大数据处理：共${total}条记录，已优化处理${returned}条记录用于图表显示`;
                    console.warn(message);
                    this.showDataLimitWarning(total, returned, !hasTimeFilter);
                }
            }
            
            return [{ data: processedRecords, meta: chartData.meta }];
        } catch (error) {
            console.error('API获取数据失败:', error);
            
            // 尝试使用回退机制
            if (progressCallback) progressCallback(90, '尝试回退方案...');
            
            const fallbackData = await this.fetchRecordsAsFallback(options);
            const records = fallbackData.records || [];
            const meta = fallbackData.meta || {};
            
            // 转换数据格式
            const processedRecords = records.map((record, index) => {
                let startTime = record.start_time;
                if (startTime) {
                    if (typeof startTime === 'string') {
                        startTime = startTime.replace(/[TZ]/g, ' ').replace(/\+\d{2}:\d{2}$/, '').trim();
                        startTime = new Date(startTime);
                    } else {
                        startTime = new Date(startTime);
                    }
                }
                
                return {
                    id: record.plan_id || index,
                    timestamp: startTime ? startTime.getTime() : Date.now(),
                    '计划ID': record.plan_id,
                    '开始时间': startTime,
                    '任务结果状态': record.task_result,
                    '所属客户': record.customer,
                    '卫星名称': record.satellite_name,
                    '测站名称': record.station_name,
                    '测站ID': record.station_id,
                    '任务类型': record.task_type,
                    ...record
                };
            });
            
            if (progressCallback) {
                const statusMsg = meta.fallback === 'local-cache' ? `使用本地数据，共${processedRecords.length}条记录` :
                                meta.fallback === 'sample-data' ? `显示示例数据，共${processedRecords.length}条记录` :
                                `处理完成，共${processedRecords.length}条记录`;
                progressCallback(100, statusMsg);
            }
            
            // 显示适当的提示
            if (meta.fallback === 'local-cache') {
                this.showLocalDataNotice(processedRecords.length);
            } else if (meta.fallback === 'sample-data') {
                this.showNotice('使用示例数据', meta.message || '无法连接数据库，正在显示示例数据', 'warning');
            }
            
            return [{ data: processedRecords, meta: meta }];
        }
    }

    /**
     * 检查是否有数据 - 支持回退机制
     */
    async hasData() {
        try {
            // 先尝试API
            const records = await this.fetchRecords({ limit: 1 });
            return records.length > 0;
        } catch (error) {
            console.log('API不可用，检查本地数据');
            
            // 检查本地数据
            const localData = this.getLocalData();
            if (localData && localData.length > 0) {
                return true;
            }
            
            // 即使没有数据，也返回true让用户看到示例数据
            console.log('无数据但将显示示例数据');
            return true;
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
     * 显示数据限制警告
     */
    showDataLimitWarning(total, returned, needTimeFilter) {
        // 寻找现有的警告元素或创建新的
        let warningEl = document.getElementById('dataLimitWarning');
        if (!warningEl) {
            warningEl = document.createElement('div');
            warningEl.id = 'dataLimitWarning';
            warningEl.className = 'mb-6 p-4 bg-warning/10 text-warning rounded-lg border-l-4 border-warning';
            
            // 插入到页面适当位置
            const main = document.querySelector('main');
            if (main && main.children.length > 0) {
                main.insertBefore(warningEl, main.children[1]);
            }
        }
        
        warningEl.innerHTML = `
            <div class="flex items-start">
                <i class="fa fa-exclamation-triangle mr-2 mt-1"></i>
                <div class="flex-1">
                    <h4 class="font-medium mb-2">大数据量处理提示</h4>
                    <p class="text-sm mb-2">检测到大量数据（共 ${total.toLocaleString()} 条记录），系统已自动优化为 ${returned.toLocaleString()} 条记录用于图表显示。</p>
                    ${needTimeFilter ? '<p class="text-xs text-warning-600">💡 建议设置具体的时间范围以获取更精确的分析结果</p>' : ''}
                </div>
                <button onclick="this.parentElement.parentElement.remove()" class="text-warning hover:text-warning-dark">
                    <i class="fa fa-times"></i>
                </button>
            </div>
        `;
        
        // 5秒后自动隐藏
        setTimeout(() => {
            if (warningEl && warningEl.parentElement) {
                warningEl.remove();
            }
        }, 10000);
    }

    /**
     * 获取本地存储的数据
     */
    getLocalData() {
        try {
            const localDataStr = localStorage.getItem('satelliteData');
            if (localDataStr) {
                const localData = JSON.parse(localDataStr);
                // 检查数据是否过时（7天内的数据才使用）
                const dataAge = Date.now() - (localData.timestamp || 0);
                if (dataAge < 7 * 24 * 60 * 60 * 1000) { // 7天
                    return localData.data || [];
                }
            }
        } catch (error) {
            console.warn('读取本地数据失败:', error);
        }
        return null;
    }
    
    /**
     * 保存数据到本地存储
     */
    saveLocalData(data) {
        try {
            const localData = {
                data: data,
                timestamp: Date.now()
            };
            localStorage.setItem('satelliteData', JSON.stringify(localData));
            console.log('数据已保存到本地存储');
        } catch (error) {
            console.warn('保存本地数据失败:', error);
        }
    }
    
    /**
     * 显示本地数据提示
     */
    showLocalDataNotice(recordCount) {
        this.showNotice(
            '使用本地数据', 
            `网络不可用，正在使用本地缓存数据（${recordCount.toLocaleString()}条记录）。请检查网络连接以获取最新数据。`,
            'info'
        );
    }
    
    /**
     * 显示连接错误提示
     */
    showConnectionError() {
        this.showNotice(
            '无法获取数据',
            '无法连接到服务器，请检查网络连接或在admin.html页面先导入数据。',
            'error'
        );
    }
    
    /**
     * 通用提示显示方法
     */
    showNotice(title, message, type = 'info') {
        // 寻找现有的提示元素或创建新的
        let noticeEl = document.getElementById('apiClientNotice');
        if (!noticeEl) {
            noticeEl = document.createElement('div');
            noticeEl.id = 'apiClientNotice';
            noticeEl.className = 'fixed top-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-lg';
            document.body.appendChild(noticeEl);
        }
        
        const typeStyles = {
            info: 'bg-blue-100 border-blue-500 text-blue-800',
            warning: 'bg-yellow-100 border-yellow-500 text-yellow-800',
            error: 'bg-red-100 border-red-500 text-red-800'
        };
        
        const icons = {
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle',
            error: 'fa-exclamation-circle'
        };
        
        noticeEl.className = `fixed top-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-lg border-l-4 ${typeStyles[type] || typeStyles.info}`;
        noticeEl.innerHTML = `
            <div class="flex items-start">
                <i class="fa ${icons[type] || icons.info} mr-2 mt-1 flex-shrink-0"></i>
                <div class="flex-1">
                    <h4 class="font-medium mb-1">${title}</h4>
                    <p class="text-sm">${message}</p>
                </div>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-gray-500 hover:text-gray-700 flex-shrink-0">
                    <i class="fa fa-times"></i>
                </button>
            </div>
        `;
        
        // 10秒后自动隐藏
        setTimeout(() => {
            if (noticeEl && noticeEl.parentElement) {
                noticeEl.remove();
            }
        }, 10000);
    }
    
    /**
     * 获取唯一值列表（用于过滤器）- 支持回退机制
     */
    async getUniqueValues(field) {
        try {
            // 先尝试使用正常API
            let records = [];
            try {
                records = await this.fetchRecords({ limit: 5000 });
            } catch (apiError) {
                console.warn('API不可用，使用回退数据获取唯一值');
                
                // 使用回退数据
                const fallbackData = await this.fetchRecordsAsFallback({ limit: 1000 });
                records = fallbackData.records || [];
            }
            
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
                
                if (value && value !== '未知' && value !== '' && value !== 'UNKNOWN') {
                    values.add(value.toString().trim());
                }
            });
            
            const uniqueValues = Array.from(values).sort();
            console.log(`获取${field}唯一值: ${uniqueValues.length}个`);
            return uniqueValues;
            
        } catch (error) {
            console.error(`获取${field}唯一值失败:`, error);
            
            // 返回默认值
            const defaultValues = {
                'customer': ['客户A', '客户B', '客户C'],
                '所属客户': ['客户A', '客户B', '客户C'],
                'satellite_name': ['卫星1', '卫星2', '卫星3'],
                '卫星名称': ['卫星1', '卫星2', '卫星3'],
                'station_name': ['测站001', '测站002', '测站003'],
                '测站名称': ['测站001', '测站002', '测站003'],
                'task_type': ['跟踪', '测控', '数据传输'],
                '任务类型': ['跟踪', '测控', '数据传输'],
                'task_result': ['成功', '失败'],
                '任务结果状态': ['成功', '失败']
            };
            
            return defaultValues[field] || [];
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

    async getAllDataWithProgress(progressCallback, options = {}) {
        const result = await this.apiClient.getAllDataWithProgress(progressCallback, options);
        
        // 如果成功获取了数据，保存到本地存储
        if (result && result.length > 0 && result[0].data && result[0].data.length > 0 && !result[0].meta?.error) {
            this.apiClient.saveLocalData(result[0].data);
        }
        
        return result;
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
