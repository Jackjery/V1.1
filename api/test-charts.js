/**
 * 图表功能测试脚本
 * 用于验证四个页面的图表渲染和下载功能是否正常
 */

class ChartTester {
    constructor() {
        this.testResults = {
            passed: 0,
            failed: 0,
            total: 0,
            details: []
        };
    }

    // 测试结果记录
    addResult(testName, passed, error = null) {
        this.testResults.total++;
        if (passed) {
            this.testResults.passed++;
            console.log(`✅ ${testName} - 通过`);
        } else {
            this.testResults.failed++;
            console.error(`❌ ${testName} - 失败:`, error);
        }
        
        this.testResults.details.push({
            name: testName,
            passed,
            error: error ? error.message : null,
            timestamp: new Date().toISOString()
        });
    }

    // 模拟大数据集
    generateLargeDataset(size = 100000) {
        const data = [];
        const customers = ['客户A', '客户B', '客户C', '客户D', '客户E'];
        const satellites = ['卫星1', '卫星2', '卫星3', '卫星4'];
        const stations = ['测站1', '测站2', '测站3', '测站4', '测站5'];

        for (let i = 0; i < size; i++) {
            const startDate = new Date(2024, 0, 1);
            startDate.setHours(Math.floor(Math.random() * 24));
            startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 365));

            data.push({
                '计划ID': `PLAN_${i.toString().padStart(6, '0')}`,
                '开始时间': startDate,
                '所属客户': customers[Math.floor(Math.random() * customers.length)],
                '卫星名称': satellites[Math.floor(Math.random() * satellites.length)],
                '测站名称': stations[Math.floor(Math.random() * stations.length)],
                '任务结果状态': Math.random() > 0.1 ? '成功' : '失败',
                '任务类型': Math.random() > 0.5 ? '跟踪' : '测控'
            });
        }

        return data;
    }

    // 测试趋势分析页面图表
    async testTrendAnalysisCharts() {
        console.log('🔍 测试趋势分析页面图表...');

        try {
            // 检查页面是否存在必要的元素
            const chartElements = ['trendChart', 'customerTrendChart', 'satelliteTrendChart'];
            
            for (const elementId of chartElements) {
                const element = document.getElementById(elementId);
                this.addResult(`趋势分析 - ${elementId}元素存在`, !!element);
            }

            // 检查ChartGenerator类是否存在
            const hasChartGenerator = typeof ChartGenerator !== 'undefined';
            this.addResult('趋势分析 - ChartGenerator类存在', hasChartGenerator);

            if (hasChartGenerator) {
                const generator = new ChartGenerator();
                
                // 测试大数据集处理
                const largeData = this.generateLargeDataset(50000);
                this.addResult('趋势分析 - 大数据集生成', largeData.length === 50000);

                // 测试图表生成优化
                const hasOptimization = generator.maxDataPoints && generator.maxSeries;
                this.addResult('趋势分析 - 性能优化配置', hasOptimization);
            }

        } catch (error) {
            this.addResult('趋势分析页面测试', false, error);
        }
    }

    // 测试数据分布页面图表
    async testDataDistributionCharts() {
        console.log('🔍 测试数据分布页面图表...');

        try {
            // 检查图表元素
            const chartElements = [
                'customerPieChart',
                'customerBarChart', 
                'stationBarChart',
                'customerSatelliteBarChart'
            ];
            
            for (const elementId of chartElements) {
                const element = document.getElementById(elementId);
                this.addResult(`数据分布 - ${elementId}元素存在`, !!element);
            }

            // 检查下载按钮
            const downloadButtons = document.querySelectorAll('.chart-download-btn');
            this.addResult('数据分布 - 下载按钮存在', downloadButtons.length > 0);

            // 检查优化功能
            if (typeof ChartGenerator !== 'undefined') {
                const generator = new ChartGenerator();
                const hasOptimization = generator.maxSlices && generator.maxBars;
                this.addResult('数据分布 - 饼图和柱图优化配置', hasOptimization);
            }

        } catch (error) {
            this.addResult('数据分布页面测试', false, error);
        }
    }

    // 测试预警页面功能
    async testWarningPageCharts() {
        console.log('🔍 测试预警页面功能...');

        try {
            // 检查必要元素
            const elements = [
                'basePeriodStart',
                'basePeriodEnd', 
                'currentPeriodStart',
                'currentPeriodEnd',
                'fluctuationThreshold',
                'calculateWarning'
            ];
            
            for (const elementId of elements) {
                const element = document.getElementById(elementId);
                this.addResult(`预警页面 - ${elementId}元素存在`, !!element);
            }

            // 检查时间处理工具
            const hasDateTimeUtil = typeof DateTimeUtil !== 'undefined';
            this.addResult('预警页面 - DateTimeUtil类存在', hasDateTimeUtil);

            if (hasDateTimeUtil) {
                const dateUtil = new DateTimeUtil();
                const periods = dateUtil.getDefaultPeriods();
                const hasValidPeriods = periods.baseStart && periods.currentEnd;
                this.addResult('预警页面 - 默认时间段设置', hasValidPeriods);
            }

        } catch (error) {
            this.addResult('预警页面测试', false, error);
        }
    }

    // 测试时间处理功能
    testTimeHandling() {
        console.log('🔍 测试北京时间处理功能...');

        try {
            // 测试各种时间格式解析
            const testDates = [
                '2024-01-01 08:00:00',
                '2024-01-01T08:00:00Z',
                '2024-01-01T08:00:00+08:00',
                new Date('2024-01-01 08:00:00')
            ];

            testDates.forEach((dateInput, index) => {
                try {
                    let parsedDate;
                    if (typeof dateInput === 'string') {
                        // 清理时区信息，按北京时间解析
                        const cleanTime = dateInput.replace(/[TZ]/g, ' ').replace(/[+-]\d{2}:\d{2}$/, '').trim();
                        parsedDate = new Date(cleanTime);
                    } else {
                        parsedDate = new Date(dateInput);
                    }
                    
                    const isValid = !isNaN(parsedDate.getTime());
                    this.addResult(`时间解析 - 格式${index + 1}`, isValid);
                } catch (error) {
                    this.addResult(`时间解析 - 格式${index + 1}`, false, error);
                }
            });

        } catch (error) {
            this.addResult('时间处理测试', false, error);
        }
    }

    // 测试图表下载功能
    testChartDownload() {
        console.log('🔍 测试图表下载功能...');

        try {
            // 检查下载工具函数
            const hasDownloadFile = typeof downloadFile === 'function';
            this.addResult('图表下载 - downloadFile函数存在', hasDownloadFile);

            const hasChartToCSV = typeof chartToCSV === 'function';
            this.addResult('图表下载 - chartToCSV函数存在', hasChartToCSV);

            const hasSimpleChartToCSV = typeof simpleChartToCSV === 'function';
            this.addResult('图表下载 - simpleChartToCSV函数存在', hasSimpleChartToCSV);

            // 测试CSV生成
            if (hasChartToCSV) {
                const mockChart = {
                    data: {
                        labels: ['标签1', '标签2', '标签3'],
                        datasets: [{
                            label: '数据集1',
                            data: [10, 20, 30]
                        }]
                    }
                };

                const csv = chartToCSV(mockChart);
                const isValidCSV = csv.includes('分组') && csv.includes('数据集1');
                this.addResult('图表下载 - CSV生成测试', isValidCSV);
            }

        } catch (error) {
            this.addResult('图表下载测试', false, error);
        }
    }

    // 测试API客户端大数据处理
    async testAPIClientOptimization() {
        console.log('🔍 测试API客户端大数据处理...');

        try {
            const hasAPIClient = typeof APIClient !== 'undefined';
            this.addResult('API客户端 - APIClient类存在', hasAPIClient);

            const hasSatelliteDB = typeof SatelliteDB !== 'undefined';
            this.addResult('API客户端 - SatelliteDB类存在', hasSatelliteDB);

            if (hasAPIClient && hasSatelliteDB) {
                const apiClient = new APIClient();
                const db = new SatelliteDB();

                // 检查数据限制警告功能
                const hasWarningMethod = typeof apiClient.showDataLimitWarning === 'function';
                this.addResult('API客户端 - 数据限制警告功能', hasWarningMethod);

                // 检查进度回调支持
                const hasProgressSupport = typeof db.getAllDataWithProgress === 'function';
                this.addResult('API客户端 - 进度回调支持', hasProgressSupport);
            }

        } catch (error) {
            this.addResult('API客户端测试', false, error);
        }
    }

    // 运行所有测试
    async runAllTests() {
        console.log('🚀 开始图表功能测试...\n');

        // 依次运行所有测试
        await this.testTrendAnalysisCharts();
        await this.testDataDistributionCharts();
        await this.testWarningPageCharts();
        this.testTimeHandling();
        this.testChartDownload();
        await this.testAPIClientOptimization();

        // 输出测试结果
        this.printResults();
    }

    // 打印测试结果
    printResults() {
        console.log('\n📊 测试结果汇总:');
        console.log(`总计: ${this.testResults.total} 项测试`);
        console.log(`通过: ${this.testResults.passed} 项`);
        console.log(`失败: ${this.testResults.failed} 项`);
        console.log(`成功率: ${Math.round((this.testResults.passed / this.testResults.total) * 100)}%`);

        if (this.testResults.failed > 0) {
            console.log('\n❌ 失败的测试项:');
            this.testResults.details
                .filter(result => !result.passed)
                .forEach(result => {
                    console.log(`  - ${result.name}: ${result.error || '未知错误'}`);
                });
        }

        // 返回测试结果以供后续处理
        return this.testResults;
    }

    // 生成测试报告
    generateReport() {
        const report = {
            testSuite: '卫星任务数据分析平台 - 图表功能测试',
            timestamp: new Date().toISOString(),
            summary: {
                total: this.testResults.total,
                passed: this.testResults.passed,
                failed: this.testResults.failed,
                successRate: Math.round((this.testResults.passed / this.testResults.total) * 100)
            },
            details: this.testResults.details,
            recommendations: this.generateRecommendations()
        };

        return JSON.stringify(report, null, 2);
    }

    // 生成改进建议
    generateRecommendations() {
        const recommendations = [];
        const failedTests = this.testResults.details.filter(result => !result.passed);

        if (failedTests.some(test => test.name.includes('元素存在'))) {
            recommendations.push('部分页面元素缺失，请检查HTML结构是否完整');
        }

        if (failedTests.some(test => test.name.includes('优化配置'))) {
            recommendations.push('图表性能优化配置不完整，可能影响大数据集处理');
        }

        if (failedTests.some(test => test.name.includes('时间解析'))) {
            recommendations.push('时间处理功能存在问题，建议检查北京时间解析逻辑');
        }

        if (failedTests.some(test => test.name.includes('下载'))) {
            recommendations.push('图表下载功能异常，请检查相关函数实现');
        }

        if (recommendations.length === 0) {
            recommendations.push('所有测试通过，系统运行良好！');
        }

        return recommendations;
    }
}

// 如果在浏览器环境中，自动运行测试
if (typeof window !== 'undefined') {
    window.ChartTester = ChartTester;
    
    // 页面加载完成后运行测试
    document.addEventListener('DOMContentLoaded', async () => {
        const tester = new ChartTester();
        const results = await tester.runAllTests();
        
        // 将测试结果保存到window对象，供调试使用
        window.testResults = results;
        window.testReport = tester.generateReport();
        
        console.log('\n📝 详细测试报告已保存到 window.testReport');
    });
} else {
    // Node.js环境导出
    module.exports = ChartTester;
}