#!/usr/bin/env node

/**
 * 2K QPS Load Test
 *
 * Tests the job processing system at 2000 queries per second.
 *
 * Test Configuration:
 * - Target: 2000 QPS
 * - Duration: 60 seconds
 * - Total jobs: ~120,000
 * - Job execution time: 100ms (fast to ensure processing keeps up)
 * - Failure probability: 0% (focus on throughput, not retry logic)
 *
 * Prerequisites:
 * - API server running on localhost:3000
 * - Worker(s) running with sufficient concurrency
 * - HF_MODE=true recommended to reduce logging overhead
 * - Monitor service running on localhost:3002
 *
 * Usage:
 *   node tests/load-test-2k-qps.js [options]
 *
 * Options:
 *   --qps <number>        Target queries per second (default: 2000)
 *   --duration <seconds>  Test duration in seconds (default: 60)
 *   --execution-time <ms> Job execution time in ms (default: 100)
 *   --concurrency <num>   Number of concurrent workers (default: 50)
 *   --warmup <seconds>    Warmup period before test (default: 5)
 *   --docker              Use Docker Compose ports (API: 3010, Monitor: 3012)
 */

const http = require('http');
const { performance } = require('perf_hooks');

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? parseInt(args[index + 1], 10) : defaultValue;
};
const hasFlag = (name) => args.indexOf(name) !== -1;

// Check if --docker flag is present
const isDockerMode = hasFlag('--docker');

// Test configuration
const CONFIG = {
  apiUrl: 'localhost',
  apiPort: isDockerMode ? 3010 : 3000,
  monitorUrl: 'localhost',
  monitorPort: isDockerMode ? 3012 : 3002,
  targetQps: getArg('--qps', 2000),
  durationSeconds: getArg('--duration', 60),
  jobExecutionTimeMs: getArg('--execution-time', 100),
  concurrentWorkers: getArg('--concurrency', 50),
  warmupSeconds: getArg('--warmup', 5),
};

// Metrics tracking
const metrics = {
  requestsSent: 0,
  requestsCompleted: 0,
  requestsFailed: 0,
  responseTimeMs: [],
  startTime: null,
  endTime: null,
  latencyBuckets: {
    '0-10ms': 0,
    '10-50ms': 0,
    '50-100ms': 0,
    '100-200ms': 0,
    '200-500ms': 0,
    '500ms+': 0,
  },
};

// Initial metrics snapshot
let initialMetrics = null;
let finalMetrics = null;

/**
 * Make HTTP request to submit a job
 */
function submitJob() {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const payload = JSON.stringify({
      class: 'test',
      type: 'delay',
      payload: {
        executionTime: CONFIG.jobExecutionTimeMs,
        failureProb: 0,
      },
    });

    const options = {
      hostname: CONFIG.apiUrl,
      port: CONFIG.apiPort,
      path: '/jobs',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const endTime = performance.now();
        const latency = endTime - startTime;

        metrics.requestsCompleted++;
        metrics.responseTimeMs.push(latency);

        // Update latency buckets
        if (latency < 10) metrics.latencyBuckets['0-10ms']++;
        else if (latency < 50) metrics.latencyBuckets['10-50ms']++;
        else if (latency < 100) metrics.latencyBuckets['50-100ms']++;
        else if (latency < 200) metrics.latencyBuckets['100-200ms']++;
        else if (latency < 500) metrics.latencyBuckets['200-500ms']++;
        else metrics.latencyBuckets['500ms+']++;

        if (res.statusCode === 201) {
          resolve({ success: true, latency, jobId: JSON.parse(data).jobId });
        } else {
          metrics.requestsFailed++;
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      metrics.requestsFailed++;
      reject(error);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Fetch metrics from monitor service
 */
function fetchMetrics() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CONFIG.monitorUrl,
      port: CONFIG.monitorPort,
      path: '/metrics/jobs',
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Failed to fetch metrics: HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Wait for specified milliseconds
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[index];
}

/**
 * Run load test worker
 */
async function loadTestWorker(workerId, stopSignal) {
  const intervalMs = (1000 / CONFIG.targetQps) * CONFIG.concurrentWorkers;

  while (!stopSignal.stop) {
    try {
      metrics.requestsSent++;
      await submitJob();
    } catch (error) {
      // Error already counted in submitJob
    }

    // Rate limiting
    await sleep(intervalMs);
  }
}

/**
 * Display progress
 */
function displayProgress(elapsedSeconds) {
  const currentQps = metrics.requestsCompleted / elapsedSeconds;
  const successRate = ((metrics.requestsCompleted - metrics.requestsFailed) / metrics.requestsCompleted * 100).toFixed(2);

  process.stdout.write(`\r[${elapsedSeconds}s] Sent: ${metrics.requestsSent} | Completed: ${metrics.requestsCompleted} | Failed: ${metrics.requestsFailed} | Current QPS: ${currentQps.toFixed(0)} | Success: ${successRate}%`);
}

/**
 * Main test execution
 */
async function runLoadTest() {
  console.log('='.repeat(80));
  console.log('2K QPS Load Test');
  console.log('='.repeat(80));
  console.log(`Configuration:`);
  console.log(`  Mode:                 ${isDockerMode ? 'Docker Compose' : 'Development'}`);
  console.log(`  API URL:              http://${CONFIG.apiUrl}:${CONFIG.apiPort}`);
  console.log(`  Monitor URL:          http://${CONFIG.monitorUrl}:${CONFIG.monitorPort}`);
  console.log(`  Target QPS:           ${CONFIG.targetQps}`);
  console.log(`  Duration:             ${CONFIG.durationSeconds}s`);
  console.log(`  Job Execution Time:   ${CONFIG.jobExecutionTimeMs}ms`);
  console.log(`  Concurrent Workers:   ${CONFIG.concurrentWorkers}`);
  console.log(`  Warmup Period:        ${CONFIG.warmupSeconds}s`);
  console.log(`  Expected Total Jobs:  ~${Math.floor(CONFIG.targetQps * CONFIG.durationSeconds)}`);
  console.log('='.repeat(80));

  // Fetch initial metrics
  console.log('\nFetching initial metrics...');
  try {
    initialMetrics = await fetchMetrics();
    console.log(`Initial job submissions: ${initialMetrics.job_submissions_total || 0}`);
  } catch (error) {
    console.log(`Warning: Could not fetch initial metrics: ${error.message}`);
  }

  // Warmup phase
  if (CONFIG.warmupSeconds > 0) {
    console.log(`\nWarmup phase (${CONFIG.warmupSeconds}s)...`);
    const warmupStopSignal = { stop: false };
    const warmupWorkers = [];

    for (let i = 0; i < CONFIG.concurrentWorkers; i++) {
      warmupWorkers.push(loadTestWorker(i, warmupStopSignal));
    }

    await sleep(CONFIG.warmupSeconds * 1000);
    warmupStopSignal.stop = true;
    await Promise.all(warmupWorkers);

    // Reset metrics after warmup
    metrics.requestsSent = 0;
    metrics.requestsCompleted = 0;
    metrics.requestsFailed = 0;
    metrics.responseTimeMs = [];
    metrics.latencyBuckets = {
      '0-10ms': 0,
      '10-50ms': 0,
      '50-100ms': 0,
      '100-200ms': 0,
      '200-500ms': 0,
      '500ms+': 0,
    };

    console.log('Warmup complete. Starting test...\n');
  }

  // Start test
  metrics.startTime = Date.now();
  const stopSignal = { stop: false };
  const workers = [];

  // Start concurrent workers
  for (let i = 0; i < CONFIG.concurrentWorkers; i++) {
    workers.push(loadTestWorker(i, stopSignal));
  }

  // Progress reporting
  const progressInterval = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - metrics.startTime) / 1000);
    displayProgress(elapsedSeconds);
  }, 1000);

  // Wait for test duration
  await sleep(CONFIG.durationSeconds * 1000);

  // Stop workers
  stopSignal.stop = true;
  clearInterval(progressInterval);

  console.log('\n\nStopping workers and waiting for in-flight requests...');
  await Promise.all(workers);

  metrics.endTime = Date.now();

  // Wait a bit for final requests to complete
  await sleep(2000);

  // Fetch final metrics
  console.log('\nFetching final metrics...');
  try {
    finalMetrics = await fetchMetrics();
  } catch (error) {
    console.log(`Warning: Could not fetch final metrics: ${error.message}`);
  }

  // Display results
  displayResults();
}

/**
 * Display test results
 */
function displayResults() {
  const durationMs = metrics.endTime - metrics.startTime;
  const durationSeconds = durationMs / 1000;
  const actualQps = metrics.requestsCompleted / durationSeconds;
  const successRate = ((metrics.requestsCompleted - metrics.requestsFailed) / metrics.requestsCompleted * 100).toFixed(2);

  console.log('\n' + '='.repeat(80));
  console.log('LOAD TEST RESULTS');
  console.log('='.repeat(80));

  console.log('\n📊 Request Statistics:');
  console.log(`  Total Sent:           ${metrics.requestsSent}`);
  console.log(`  Total Completed:      ${metrics.requestsCompleted}`);
  console.log(`  Total Failed:         ${metrics.requestsFailed}`);
  console.log(`  Success Rate:         ${successRate}%`);
  console.log(`  Actual Duration:      ${durationSeconds.toFixed(2)}s`);
  console.log(`  Achieved QPS:         ${actualQps.toFixed(2)} (target: ${CONFIG.targetQps})`);
  console.log(`  QPS Achievement:      ${((actualQps / CONFIG.targetQps) * 100).toFixed(2)}%`);

  if (metrics.responseTimeMs.length > 0) {
    const avgLatency = metrics.responseTimeMs.reduce((a, b) => a + b, 0) / metrics.responseTimeMs.length;
    const minLatency = Math.min(...metrics.responseTimeMs);
    const maxLatency = Math.max(...metrics.responseTimeMs);

    console.log('\n⏱️  Latency Statistics (API Response Time):');
    console.log(`  Min:                  ${minLatency.toFixed(2)}ms`);
    console.log(`  Max:                  ${maxLatency.toFixed(2)}ms`);
    console.log(`  Average:              ${avgLatency.toFixed(2)}ms`);
    console.log(`  P50:                  ${percentile(metrics.responseTimeMs, 50).toFixed(2)}ms`);
    console.log(`  P95:                  ${percentile(metrics.responseTimeMs, 95).toFixed(2)}ms`);
    console.log(`  P99:                  ${percentile(metrics.responseTimeMs, 99).toFixed(2)}ms`);

    console.log('\n📈 Latency Distribution:');
    Object.entries(metrics.latencyBuckets).forEach(([bucket, count]) => {
      const percentage = ((count / metrics.responseTimeMs.length) * 100).toFixed(2);
      const bar = '█'.repeat(Math.floor(percentage / 2));
      console.log(`  ${bucket.padEnd(12)} ${count.toString().padStart(7)} (${percentage.toString().padStart(6)}%) ${bar}`);
    });
  }

  if (initialMetrics && finalMetrics) {
    const jobsSubmitted = (finalMetrics.job_submissions_total || 0) - (initialMetrics.job_submissions_total || 0);
    const jobsCompleted = (finalMetrics.job_status_total?.COMPLETED || 0) - (initialMetrics.job_status_total?.COMPLETED || 0);
    const jobsFailed = (finalMetrics.job_status_total?.FAILED || 0) - (initialMetrics.job_status_total?.FAILED || 0);
    const jobsPending = (finalMetrics.job_status_total?.PENDING || 0) - (initialMetrics.job_status_total?.PENDING || 0);
    const jobsProcessing = (finalMetrics.job_status_total?.PROCESSING || 0) - (initialMetrics.job_status_total?.PROCESSING || 0);

    console.log('\n🔄 Job Processing Statistics (from Monitor):');
    console.log(`  Jobs Submitted:       ${jobsSubmitted}`);
    console.log(`  Jobs Completed:       ${jobsCompleted}`);
    console.log(`  Jobs Failed:          ${jobsFailed}`);
    console.log(`  Jobs Pending:         ${jobsPending}`);
    console.log(`  Jobs Processing:      ${jobsProcessing}`);
    console.log(`  Completion Rate:      ${jobsSubmitted > 0 ? ((jobsCompleted / jobsSubmitted) * 100).toFixed(2) : 0}%`);
  }

  console.log('\n' + '='.repeat(80));

  // Test pass/fail criteria
  const qpsAchievement = (actualQps / CONFIG.targetQps) * 100;
  const passed = qpsAchievement >= 95 && parseFloat(successRate) >= 99;

  if (passed) {
    console.log('✅ LOAD TEST PASSED');
    console.log(`   - Achieved ${qpsAchievement.toFixed(2)}% of target QPS`);
    console.log(`   - Success rate: ${successRate}%`);
  } else {
    console.log('❌ LOAD TEST FAILED');
    if (qpsAchievement < 95) {
      console.log(`   - Only achieved ${qpsAchievement.toFixed(2)}% of target QPS (minimum: 95%)`);
    }
    if (parseFloat(successRate) < 99) {
      console.log(`   - Success rate ${successRate}% below threshold (minimum: 99%)`);
    }
  }

  console.log('='.repeat(80));

  process.exit(passed ? 0 : 1);
}

// Run the test
runLoadTest().catch((error) => {
  console.error('\n❌ Load test failed with error:', error);
  process.exit(1);
});
