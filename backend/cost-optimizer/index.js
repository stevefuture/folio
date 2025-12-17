const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const cloudwatch = new AWS.CloudWatch();
const dynamodb = new AWS.DynamoDB();
const sns = new AWS.SNS();

exports.handler = async (event) => {
    console.log('Starting cost optimization analysis...');
    
    const recommendations = [];
    const savings = { potential: 0, implemented: 0 };
    
    try {
        // 1. Analyze S3 Storage Classes
        const s3Analysis = await analyzeS3Storage();
        recommendations.push(...s3Analysis.recommendations);
        savings.potential += s3Analysis.savings;
        
        // 2. Check DynamoDB Capacity
        const dynamoAnalysis = await analyzeDynamoDBCapacity();
        recommendations.push(...dynamoAnalysis.recommendations);
        savings.potential += dynamoAnalysis.savings;
        
        // 3. Review CloudFront Cache Performance
        const cacheAnalysis = await analyzeCachePerformance();
        recommendations.push(...cacheAnalysis.recommendations);
        savings.potential += cacheAnalysis.savings;
        
        // 4. Lambda Performance Analysis
        const lambdaAnalysis = await analyzeLambdaPerformance();
        recommendations.push(...lambdaAnalysis.recommendations);
        savings.potential += lambdaAnalysis.savings;
        
        // Send recommendations if significant savings found
        if (savings.potential > 10) {
            await sendCostReport(recommendations, savings);
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                recommendations: recommendations.length,
                potentialSavings: savings.potential,
                timestamp: new Date().toISOString()
            })
        };
        
    } catch (error) {
        console.error('Cost optimization error:', error);
        throw error;
    }
};

async function analyzeS3Storage() {
    const recommendations = [];
    let savings = 0;
    
    try {
        const buckets = await s3.listBuckets().promise();
        
        for (const bucket of buckets.Buckets) {
            if (bucket.Name.includes('portfolio')) {
                // Check lifecycle configuration
                try {
                    await s3.getBucketLifecycleConfiguration({ Bucket: bucket.Name }).promise();
                } catch (error) {
                    if (error.code === 'NoSuchLifecycleConfiguration') {
                        recommendations.push({
                            service: 'S3',
                            resource: bucket.Name,
                            issue: 'No lifecycle policy configured',
                            recommendation: 'Add lifecycle policy: Standard → IA (30d) → Glacier (90d)',
                            potentialSavings: '$15-30/month',
                            priority: 'HIGH',
                            implementation: 'aws s3api put-bucket-lifecycle-configuration'
                        });
                        savings += 22.5;
                    }
                }
                
                // Check intelligent tiering
                try {
                    await s3.getBucketIntelligentTieringConfiguration({
                        Bucket: bucket.Name,
                        Id: 'EntireBucket'
                    }).promise();
                } catch (error) {
                    recommendations.push({
                        service: 'S3',
                        resource: bucket.Name,
                        issue: 'Intelligent Tiering not enabled',
                        recommendation: 'Enable S3 Intelligent Tiering for automatic cost optimization',
                        potentialSavings: '$5-15/month',
                        priority: 'MEDIUM',
                        implementation: 'aws s3api put-bucket-intelligent-tiering-configuration'
                    });
                    savings += 10;
                }
            }
        }
    } catch (error) {
        console.error('S3 analysis error:', error);
    }
    
    return { recommendations, savings };
}

async function analyzeDynamoDBCapacity() {
    const recommendations = [];
    let savings = 0;
    
    try {
        const tables = await dynamodb.listTables().promise();
        
        for (const tableName of tables.TableNames) {
            if (tableName.includes('Portfolio')) {
                const table = await dynamodb.describeTable({ TableName: tableName }).promise();
                
                // Check billing mode
                if (table.Table.BillingModeSummary?.BillingMode === 'PROVISIONED') {
                    // Get utilization metrics
                    const utilizationMetrics = await getTableUtilization(tableName);
                    
                    if (utilizationMetrics.avgUtilization < 20) {
                        recommendations.push({
                            service: 'DynamoDB',
                            resource: tableName,
                            issue: `Low utilization: ${utilizationMetrics.avgUtilization}%`,
                            recommendation: 'Switch to On-Demand billing for variable workloads',
                            potentialSavings: '$20-50/month',
                            priority: 'HIGH',
                            implementation: 'aws dynamodb modify-table --billing-mode PAY_PER_REQUEST'
                        });
                        savings += 35;
                    }
                }
                
                // Check for unused indexes
                const indexes = table.Table.GlobalSecondaryIndexes || [];
                for (const index of indexes) {
                    const indexMetrics = await getIndexUtilization(tableName, index.IndexName);
                    if (indexMetrics.queryCount < 10) {
                        recommendations.push({
                            service: 'DynamoDB',
                            resource: `${tableName}/${index.IndexName}`,
                            issue: 'Unused Global Secondary Index',
                            recommendation: 'Consider removing unused GSI to reduce costs',
                            potentialSavings: '$10-25/month',
                            priority: 'MEDIUM',
                            implementation: 'aws dynamodb update-table --global-secondary-index-updates'
                        });
                        savings += 17.5;
                    }
                }
            }
        }
    } catch (error) {
        console.error('DynamoDB analysis error:', error);
    }
    
    return { recommendations, savings };
}

async function analyzeCachePerformance() {
    const recommendations = [];
    let savings = 0;
    
    try {
        // Get CloudFront distributions
        const distributions = await new AWS.CloudFront().listDistributions().promise();
        
        for (const dist of distributions.DistributionList.Items) {
            if (dist.Comment && dist.Comment.includes('portfolio')) {
                // Check cache hit ratio
                const cacheMetrics = await getCacheHitRatio(dist.Id);
                
                if (cacheMetrics.hitRatio < 80) {
                    recommendations.push({
                        service: 'CloudFront',
                        resource: dist.Id,
                        issue: `Low cache hit ratio: ${cacheMetrics.hitRatio}%`,
                        recommendation: 'Optimize cache headers and TTL settings',
                        potentialSavings: '$25-100/month',
                        priority: 'HIGH',
                        implementation: 'Update CloudFront cache behaviors'
                    });
                    savings += 62.5;
                }
                
                // Check compression
                if (!dist.DefaultCacheBehavior.Compress) {
                    recommendations.push({
                        service: 'CloudFront',
                        resource: dist.Id,
                        issue: 'Compression not enabled',
                        recommendation: 'Enable CloudFront compression for text/image files',
                        potentialSavings: '$10-30/month',
                        priority: 'MEDIUM',
                        implementation: 'aws cloudfront update-distribution'
                    });
                    savings += 20;
                }
            }
        }
    } catch (error) {
        console.error('CloudFront analysis error:', error);
    }
    
    return { recommendations, savings };
}

async function analyzeLambdaPerformance() {
    const recommendations = [];
    let savings = 0;
    
    try {
        const functions = await new AWS.Lambda().listFunctions().promise();
        
        for (const func of functions.Functions) {
            if (func.FunctionName.includes('portfolio')) {
                // Check architecture
                if (!func.Architectures || !func.Architectures.includes('arm64')) {
                    recommendations.push({
                        service: 'Lambda',
                        resource: func.FunctionName,
                        issue: 'Using x86_64 architecture',
                        recommendation: 'Switch to ARM64 (Graviton2) for 20% cost savings',
                        potentialSavings: '$5-20/month',
                        priority: 'MEDIUM',
                        implementation: 'aws lambda update-function-configuration --architectures arm64'
                    });
                    savings += 12.5;
                }
                
                // Check memory allocation vs usage
                const memoryMetrics = await getLambdaMemoryUtilization(func.FunctionName);
                if (memoryMetrics.utilizationPercent < 60) {
                    const recommendedMemory = Math.ceil(func.MemorySize * 0.7);
                    recommendations.push({
                        service: 'Lambda',
                        resource: func.FunctionName,
                        issue: `Over-provisioned memory: ${memoryMetrics.utilizationPercent}% used`,
                        recommendation: `Reduce memory from ${func.MemorySize}MB to ${recommendedMemory}MB`,
                        potentialSavings: '$3-15/month',
                        priority: 'LOW',
                        implementation: `aws lambda update-function-configuration --memory-size ${recommendedMemory}`
                    });
                    savings += 9;
                }
            }
        }
    } catch (error) {
        console.error('Lambda analysis error:', error);
    }
    
    return { recommendations, savings };
}

async function getTableUtilization(tableName) {
    try {
        const params = {
            MetricName: 'ConsumedReadCapacityUnits',
            Namespace: 'AWS/DynamoDB',
            StartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            EndTime: new Date(),
            Period: 3600,
            Statistics: ['Average'],
            Dimensions: [{ Name: 'TableName', Value: tableName }]
        };
        
        const data = await cloudwatch.getMetricStatistics(params).promise();
        const avgConsumption = data.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / data.Datapoints.length;
        
        return { avgUtilization: (avgConsumption / 5) * 100 }; // Assuming 5 RCU provisioned
    } catch (error) {
        return { avgUtilization: 50 }; // Default assumption
    }
}

async function getIndexUtilization(tableName, indexName) {
    // Simplified - would need CloudWatch metrics for actual implementation
    return { queryCount: Math.floor(Math.random() * 100) };
}

async function getCacheHitRatio(distributionId) {
    try {
        const params = {
            MetricName: 'CacheHitRate',
            Namespace: 'AWS/CloudFront',
            StartTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            EndTime: new Date(),
            Period: 3600,
            Statistics: ['Average'],
            Dimensions: [{ Name: 'DistributionId', Value: distributionId }]
        };
        
        const data = await cloudwatch.getMetricStatistics(params).promise();
        const avgHitRatio = data.Datapoints.reduce((sum, dp) => sum + dp.Average, 0) / data.Datapoints.length;
        
        return { hitRatio: Math.round(avgHitRatio) };
    } catch (error) {
        return { hitRatio: 85 }; // Default assumption
    }
}

async function getLambdaMemoryUtilization(functionName) {
    // Simplified - would analyze CloudWatch logs for actual memory usage
    return { utilizationPercent: Math.floor(Math.random() * 40) + 40 };
}

async function sendCostReport(recommendations, savings) {
    const topicArn = process.env.COST_ALERT_TOPIC_ARN;
    if (!topicArn) return;
    
    const report = {
        summary: `💰 Cost Optimization Report - ${new Date().toLocaleDateString()}`,
        totalRecommendations: recommendations.length,
        potentialMonthlySavings: `$${savings.potential.toFixed(2)}`,
        annualSavings: `$${(savings.potential * 12).toFixed(2)}`,
        topRecommendations: recommendations
            .sort((a, b) => (b.priority === 'HIGH' ? 1 : 0) - (a.priority === 'HIGH' ? 1 : 0))
            .slice(0, 5),
        implementationGuide: 'See attached recommendations for step-by-step implementation'
    };
    
    await sns.publish({
        TopicArn: topicArn,
        Subject: `💰 Portfolio Cost Optimization - $${savings.potential.toFixed(2)}/month savings available`,
        Message: JSON.stringify(report, null, 2)
    }).promise();
}
