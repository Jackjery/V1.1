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
     * 获取图表数据 - 优化大数据量查询，支持本地回退
     */
    async fetchChartData(params = {}) {
        try {
            const qs = new URLSearchParams(params).toString();
            const response = await fetch(`/api/chart-data?${qs}`);
            
            if (!response.ok) {
                // API不可用时回退到records接口
                console.warn('chart-data API不可用，回退到records接口');
                return await this.fetchRecordsAsFallback(params);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || '获取图表数据失败');
            }

            return result.data;
        } catch (error) {
            console.warn('图表数据API失败，尝试回退方案:', error.message);
            // 回退到records接口
            return await this.fetchRecordsAsFallback(params);
        }
    }
    
    /**
     * 回退方案：使用records接口获取数据
     */
    async fetchRecordsAsFallback(params = {}) {
        try {
            console.log('使用records接口作为回退方案');
            const records = await this.fetchRecords({
                ...params,
                limit: params.limit || 10000
            });
            
            return {
                records: records,
                meta: {
                    total: records.length,
                    returned: records.length,
                    fallback: true
                }
            };
        } catch (fallbackError) {
            console.error('回退方案也失败了:', fallbackError);
            // 最终回退：返回空数据
            return {
                records: [],
                meta: {
                    total: 0,
                    returned: 0,
                    error: '无法获取数据，请检查网络连接或联系管理员'
                }
            };
        }
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
            
            // 尝试使用localStorage中的本地数据作为最后回退
            if (progressCallback) progressCallback(90, '尝试使用本地数据...');
            
            const localData = this.getLocalData();
            if (localData && localData.length > 0) {
                console.log('找到本地数据，使用作为回退');
                if (progressCallback) progressCallback(100, `使用本地数据，共${localData.length}条记录`);
                
                // 提示用户正在使用本地数据
                this.showLocalDataNotice(localData.length);
                
                return [{ data: localData, meta: { local: true, total: localData.length } }];
            }
            
            if (progressCallback) progressCallback(100, '无法获取数据，请检查网络连接');
            
            // 显示错误提示
            this.showConnectionError();
            
            return [{ data: [], meta: { error: error.message } }];
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
