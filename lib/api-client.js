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
            // 过滤掉 undefined 和 null 值
            const cleanParams = {};
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null && value !== '') {
                    cleanParams[key] = value;
                }
            }
            
            const qs = new URLSearchParams(cleanParams).toString();
            console.log(`调用API: /api/records?${qs}`);
            
            const response = await fetch(`/api/records?${qs}`);
            console.log(`API响应状态: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`API错误详情:`, errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            console.log(`API返回数据:`, {
                success: result.success,
                recordCount: result.data?.records?.length || 0,
                total: result.data?.pagination?.total || 0
            });

            if (!result.success) {
                throw new Error(result.error || '获取数据失败');
            }

            // 返回数据，兼容多种格式
            const records = result.data?.records || result.records || [];
            console.log(`解析到${records.length}条记录`);
            
            return records;
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
            // 过滤掉 undefined 和 null 值
            const cleanParams = {};
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null && value !== '') {
                    cleanParams[key] = value;
                }
            }
            
            const qs = new URLSearchParams(cleanParams).toString();
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
     * 获取图表数据 - 优先尝试真实数据库连接
     */
    async fetchChartData(params = {}) {
        console.log('📈 开始获取图表数据...', params);
        
        try {
            // 优化参数，针对20万条数据进行限制
            const optimizedParams = {
                limit: Math.min(params.limit || 5000, 10000) // 限制最大获取数量
            };
            
            // 只添加有效的过滤参数
            if (params.startDate) optimizedParams.startDate = params.startDate;
            if (params.endDate) optimizedParams.endDate = params.endDate;
            if (params.taskResult) optimizedParams.taskResult = params.taskResult;
            if (params.customer) optimizedParams.customer = params.customer;
            if (params.satellite_name) optimizedParams.satellite_name = params.satellite_name;
            if (params.station_name) optimizedParams.station_name = params.station_name;
            
            console.log('🔍 尝试从数据库获取数据...', optimizedParams);
            
            // 直接使用records API连接数据库
            const records = await this.fetchRecords(optimizedParams);
            
            if (records && records.length > 0) {
                console.log(`✅ 数据库连接成功！获取到${records.length}条记录`);
                
                // 检查是否为真实数据（仅用于日志记录）
                const firstRecord = records[0];
                const isRealData = firstRecord && 
                    !firstRecord.plan_id?.startsWith('SAMPLE_') &&
                    !firstRecord.plan_id?.startsWith('LOCAL_') &&
                    !(firstRecord['计划ID'] && firstRecord['计划ID'].startsWith('LOCAL_'));
                
                console.log('🔍 数据检测结果:', {
                    isRealData,
                    firstRecordPlanId: firstRecord.plan_id || firstRecord['计划ID'],
                    recordCount: records.length
                });
                
                if (isRealData) {
                    console.log('✨ 确认为真实数据库数据！');
                } else {
                    console.log('⚠️ 检测到可能的示例数据，但仍将使用这些数据');
                }
                
                // 无论什么类型的数据，只要从数据库获取到就使用
                console.log('📊 使用数据库返回的数据');
                
                // 转换为标准格式
                const chartData = {
                    records: records.map(record => {
                        // 统一字段命名
                        const standardRecord = {
                            plan_id: record.plan_id || record['计划ID'] || record.id,
                            start_time: record.start_time || record['开始时间'],
                            task_result: record.task_result || record['任务结果状态'],
                            task_type: record.task_type || record['任务类型'],
                            customer: record.customer || record['所属客户'],
                            satellite_name: record.satellite_name || record['卫星名称'],
                            station_name: record.station_name || record['测站名称'],
                            station_id: record.station_id || record['测站ID']
                        };
                        
                        // 添加timestamp
                        if (standardRecord.start_time) {
                            standardRecord.timestamp = new Date(standardRecord.start_time).getTime();
                        }
                        
                        return standardRecord;
                    }),
                    meta: {
                        total: records.length,
                        returned: records.length,
                        source: 'database',
                        hasTimeFilter: !!(params.startDate && params.endDate)
                    }
                };
                
                // 保存数据到本地缓存
                if (chartData.records.length > 0) {
                    this.saveLocalData(chartData.records.slice(0, 1000)); // 保存前1000条作为缓存
                }
                
                return chartData;
            }
            
            // 只有在真的没有数据时才抛出异常
            console.log('⚠️ API返回数据为空，将使用回退机制');
            throw new Error('数据库无数据');
            
        } catch (error) {
            console.error('🚫 数据库连接失败:', error.message);
            console.log('🔄 尝试使用回退机制...');
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
     * 为20万条数据优化的getAllDataWithProgress方法
     * 实现高效的时间筛选和分页加载
     */
    async getAllDataWithProgress(progressCallback, options = {}) {
        console.log('🚀 开始加载数据...', options);
        
        try {
            if (progressCallback) progressCallback(10, '🔍 检查数据库连接...');
            
            // 针对20万条数据的优化策略
            const hasTimeFilter = options.startDate && options.endDate;
            let maxRecords;
            
            if (hasTimeFilter) {
                // 有时间筛选时，可以获取更多数据
                maxRecords = 15000;
                console.log(`⚙️ 检测到时间筛选，优化获取${maxRecords}条记录`);
            } else {
                // 无时间筛选时，限制数量防止渲染卡死
                maxRecords = 8000;
                console.log(`⚠️ 无时间筛选，限制获取${maxRecords}条记录`);
            }
            
            const params = {
                limit: maxRecords
            };
            
            // 只添加有效的过滤参数
            if (options.startDate) params.startDate = options.startDate;
            if (options.endDate) params.endDate = options.endDate;
            if (options.customer) params.customer = options.customer;
            if (options.satellite_name) params.satellite_name = options.satellite_name;
            if (options.station_name) params.station_name = options.station_name;
            if (options.task_result) params.task_result = options.task_result;
            
            if (progressCallback) progressCallback(30, '📀 正在查询数据库...');
            
            // 尝试获取真实数据
            const chartData = await this.fetchChartData(params);
            const records = chartData.records || [];
            
            if (progressCallback) progressCallback(60, `🔄 正在处理${records.length}条数据...`);
            
            if (records.length > 0 && chartData.meta?.source === 'database') {
                console.log(`✨ 成功从数据库获取${records.length}条真实数据！`);
                
                // 处理真实数据，严格按北京时间处理
                const processedRecords = records.map((record, index) => {
                    let startTime = record.start_time;
                    if (startTime) {
                        if (typeof startTime === 'string') {
                            startTime = startTime.replace(/[TZ]/g, ' ').replace(/[+-]\d{2}:\d{2}$/, '').trim();
                            startTime = new Date(startTime);
                        } else {
                            startTime = new Date(startTime);
                        }
                    }
                    
                    return {
                        id: record.plan_id || index,
                        timestamp: startTime ? startTime.getTime() : Date.now(),
                        // 兼容中文字段名
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
                
                if (progressCallback) progressCallback(100, `✅ 真实数据加载完成，共${processedRecords.length}条记录`);
                
                // 显示数据源提示
                this.showNotice(
                    '数据库连接成功', 
                    `已从数据库加载${processedRecords.length}条真实数据。${!hasTimeFilter ? '设置时间范围可获得更多数据。' : ''}`,
                    'success'
                );
                
                return [{ 
                    data: processedRecords, 
                    meta: {
                        ...chartData.meta,
                        dataSource: 'database',
                        totalInDb: 200000, // 标记数据库总数
                        filtered: hasTimeFilter
                    }
                }];
            }
            
            // 如果没有获取到真实数据，使用回退机制
            console.warn('⚠️ 未能获取真实数据，启动回退机制...');
            throw new Error('数据库连接失败或无数据');
            
        } catch (error) {
            console.error('🚫 数据库访问失败:', error.message);
            
            if (progressCallback) progressCallback(90, '🔄 尝试回退方案...');
            
            // 使用回退数据
            const fallbackData = await this.fetchRecordsAsFallback(options);
            const records = fallbackData.records || [];
            const meta = fallbackData.meta || {};
            
            const processedRecords = records.map((record, index) => {
                let startTime = record.start_time;
                if (startTime) {
                    if (typeof startTime === 'string') {
                        startTime = startTime.replace(/[TZ]/g, ' ').replace(/[+-]\d{2}:\d{2}$/, '').trim();
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
            
            const statusMsg = meta.fallback === 'local-cache' ? `本地数据: ${processedRecords.length}条` :
                            meta.fallback === 'sample-data' ? `示例数据: ${processedRecords.length}条` :
                            `加载完成: ${processedRecords.length}条`;
            
            if (progressCallback) progressCallback(100, statusMsg);
            
            // 显示回退提示
            if (meta.fallback === 'local-cache') {
                this.showLocalDataNotice(processedRecords.length);
            } else if (meta.fallback === 'sample-data') {
                this.showNotice(
                    '无法连接数据库', 
                    '正在使用示例数据演示功能。请检查网络连接或API服务器状态。', 
                    'warning'
                );
            }
            
            return [{ 
                data: processedRecords, 
                meta: {
                    ...meta,
                    dataSource: meta.fallback || 'fallback'
                }
            }];
        }
    }

    /**
     * 检查是否有数据 - 更积极的数据库连接检测
     */
    async hasData() {
        console.log('🔍 检查数据可用性...');
        
        try {
            // 尝试连接数据库获取数据
            console.log('尝试连接数据库...');
            const records = await this.fetchRecords({ limit: 5 });
            
            if (records && records.length > 0) {
                console.log(`✅ 数据库连接成功！找到${records.length}条记录`);
                
                // 检查是否为真实数据（不是示例数据）
                const firstRecord = records[0];
                const isRealData = firstRecord && 
                    !firstRecord.plan_id?.startsWith('SAMPLE_') &&
                    !firstRecord.plan_id?.startsWith('LOCAL_') &&
                    !(firstRecord['计划ID'] && firstRecord['计划ID'].startsWith('LOCAL_'));
                
                console.log('🔍 数据检测结果:', {
                    isRealData,
                    firstRecordPlanId: firstRecord.plan_id || firstRecord['计划ID'],
                    recordCount: records.length
                });
                
                if (isRealData) {
                    console.log('✨ 检测到真实数据！');
                } else {
                    console.log('⚠️ 检测到可能的示例数据，但数据库有数据');
                }
                
                // 保存数据库连接状态 - 只要有数据就认为连接成功
                this.databaseConnected = true;
                return true;
            }
            
            console.log('⚠️ 数据库连接成功但无数据');
            return false;
            
        } catch (error) {
            console.error('🚫 数据库连接失败:', error.message);
            
            // 检查本地数据
            const localData = this.getLocalData();
            if (localData && localData.length > 0) {
                console.log('💾 找到本地缓存数据');
                return true;
            }
            
            console.log('🎆 将使用示例数据演示功能');
            return true; // 让用户看到页面功能
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
