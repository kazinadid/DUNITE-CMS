/**
 * Load Testing Script for Calendar API
 * 
 * Tests calendar performance with various dataset sizes
 * to ensure it can handle production loads.
 * 
 * Usage: npx tsx scripts/load-test-calendar.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface TestResult {
  testName: string;
  datasetSize: number;
  responseTimeMs: number;
  success: boolean;
  error?: string;
  postsReturned: number;
}

/**
 * Generate test posts for load testing
 */
async function generateTestPosts(count: number, organizationId: string) {
  console.log(`📝 Generating ${count} test posts...`);
  
  const posts = [];
  const baseDate = new Date();
  
  for (let i = 0; i < count; i++) {
    const scheduledAt = new Date(baseDate.getTime() + (i * 60 * 60 * 1000)); // 1 hour apart
    
    posts.push({
      user_id: '00000000-0000-0000-0000-000000000000', // Test user
      organization_id: organizationId,
      content: `Load test post #${i + 1}`,
      status: 'scheduled',
      scheduled_at: scheduledAt.toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  
  const { data, error } = await supabase.from('posts').insert(posts).select('id');
  
  if (error) {
    throw new Error(`Failed to insert test posts: ${error.message}`);
  }
  
  console.log(`✅ Generated ${data?.length ?? 0} test posts`);
  return data?.map(p => p.id) ?? [];
}

/**
 * Clean up test posts
 */
async function cleanupTestPosts(postIds: string[]) {
  console.log(`🧹 Cleaning up ${postIds.length} test posts...`);
  
  const { error } = await supabase
    .from('posts')
    .delete()
    .in('id', postIds);
  
  if (error) {
    console.error(`⚠️  Cleanup failed: ${error.message}`);
  } else {
    console.log('✅ Cleanup complete');
  }
}

/**
 * Test calendar API performance
 */
async function testCalendarApi(
  testName: string,
  startIso: string,
  endIso: string,
  pageSize: number = 250,
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const params = new URLSearchParams({
      start: startIso,
      end: endIso,
      page: '1',
      pageSize: String(pageSize),
    });
    
    const response = await fetch(`http://localhost:3000/api/calendar/posts?${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const responseTime = Date.now() - startTime;
    const json = await response.json();
    
    return {
      testName,
      datasetSize: json.data?.total ?? 0,
      responseTimeMs: responseTime,
      success: response.ok && json.ok === true,
      postsReturned: json.data?.items?.length ?? 0,
      error: !response.ok ? json.error : undefined,
    };
  } catch (error) {
    return {
      testName,
      datasetSize: 0,
      responseTimeMs: Date.now() - startTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      postsReturned: 0,
    };
  }
}

/**
 * Run comprehensive load tests
 */
async function runLoadTests() {
  console.log('🚀 Starting Calendar API Load Tests\n');
  
  const results: TestResult[] = [];
  const organizationId = '00000000-0000-0000-0000-000000000000'; // Test org
  
  // Test with different dataset sizes
  const testSizes = [100, 500, 1000, 2500, 5000];
  
  for (const size of testSizes) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 Testing with ${size} posts`);
    console.log('='.repeat(60));
    
    // Generate test data
    const startRange = new Date();
    const endRange = new Date(startRange.getTime() + (size * 60 * 60 * 1000));
    
    const postIds = await generateTestPosts(size, organizationId);
    
    try {
      // Test 1: Full range query
      const result1 = await testCalendarApi(
        `Full Range (${size} posts)`,
        startRange.toISOString(),
        endRange.toISOString(),
      );
      results.push(result1);
      console.log(`✅ Response time: ${result1.responseTimeMs}ms`);
      
      // Test 2: Smaller range (1 week)
      const weekStart = new Date();
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const result2 = await testCalendarApi(
        `Week Range (${size} posts)`,
        weekStart.toISOString(),
        weekEnd.toISOString(),
      );
      results.push(result2);
      console.log(`✅ Response time: ${result2.responseTimeMs}ms`);
      
      // Test 3: Pagination test
      const result3 = await testCalendarApi(
        `Pagination (page=2, ${size} posts)`,
        startRange.toISOString(),
        endRange.toISOString(),
        100,
      );
      results.push(result3);
      console.log(`✅ Response time: ${result3.responseTimeMs}ms`);
      
    } finally {
      // Cleanup
      await cleanupTestPosts(postIds);
    }
  }
  
  // Print summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📈 LOAD TEST SUMMARY');
  console.log('='.repeat(80));
  
  console.log('\n| Test Name | Dataset Size | Response Time | Posts Returned | Status |');
  console.log('|-----------|--------------|---------------|----------------|--------|');
  
  for (const result of results) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    console.log(
      `| ${result.testName.padEnd(25)} | ${String(result.datasetSize).padStart(12)} | ${String(result.responseTimeMs).padStart(13)}ms | ${String(result.postsReturned).padStart(14)} | ${status} |`
    );
  }
  
  // Performance thresholds
  console.log('\n🎯 Performance Thresholds:');
  const failedThresholds = results.filter(r => r.responseTimeMs > 2000);
  
  if (failedThresholds.length === 0) {
    console.log('✅ All tests completed within 2 second threshold');
  } else {
    console.log(`❌ ${failedThresholds.length} tests exceeded 2 second threshold:`);
    for (const test of failedThresholds) {
      console.log(`   - ${test.testName}: ${test.responseTimeMs}ms`);
    }
  }
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTimeMs, 0) / results.length;
  
  if (avgResponseTime < 500) {
    console.log('✅ Excellent performance - ready for production');
  } else if (avgResponseTime < 1000) {
    console.log('⚠️  Good performance - consider adding caching for >1000 post datasets');
  } else if (avgResponseTime < 2000) {
    console.log('⚠️  Acceptable performance - database indexes recommended');
  } else {
    console.log('❌ Performance issues detected - review database indexes and query optimization');
  }
  
  console.log(`\n📊 Average response time: ${avgResponseTime.toFixed(0)}ms`);
  console.log(`📊 Total tests: ${results.length}`);
  console.log(`📊 Success rate: ${((results.filter(r => r.success).length / results.length) * 100).toFixed(1)}%`);
}

// Run tests
runLoadTests().catch(error => {
  console.error('❌ Load test failed:', error);
  process.exit(1);
});
