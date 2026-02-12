<template>
  <v-app>
    <v-app-bar color="primary" dark>
      <v-app-bar-title>
        <v-icon class="mr-2">mdi-monitor-dashboard</v-icon>
        Jobs Service Monitor
      </v-app-bar-title>
      <v-spacer></v-spacer>
      <v-chip :color="isConnected ? 'success' : 'error'" variant="flat">
        <v-icon start>{{ isConnected ? 'mdi-check-circle' : 'mdi-alert-circle' }}</v-icon>
        {{ isConnected ? 'Connected' : 'Disconnected' }}
      </v-chip>
      <v-btn
        color="white"
        variant="flat"
        @click="runTest"
        :loading="testRunning"
        :disabled="testRunning"
        class="ml-2"
      >
        <v-icon start>{{ testSuccess ? 'mdi-check-circle' : 'mdi-play' }}</v-icon>
        {{ testButtonText }}
      </v-btn>
      <v-btn icon="mdi-refresh" @click="fetchAllMetrics" :loading="loading" class="ml-2"></v-btn>
    </v-app-bar>

    <v-main>
      <v-container fluid>
        <v-row>
          <!-- System Metrics -->
          <v-col cols="12">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2">mdi-server</v-icon>
                System Metrics
              </v-card-title>
              <v-card-text>
                <v-row v-if="systemMetrics">
                  <v-col cols="12" md="4">
                    <v-list-item>
                      <v-list-item-title>Abandoned Jobs Recovered</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ systemMetrics.abandoned_jobs_recovered_total || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-list-item>
                      <v-list-item-title>Jobs Deleted</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ systemMetrics.jobs_deleted_total || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-list-item>
                      <v-list-item-title>Last Update</v-list-item-title>
                      <v-list-item-subtitle class="text-subtitle-2">
                        {{ new Date().toLocaleTimeString() }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                </v-row>
                <v-alert v-else type="info" variant="tonal">No system metrics available</v-alert>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Job Metrics -->
          <v-col cols="12" md="6">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2">mdi-briefcase</v-icon>
                Job Metrics
              </v-card-title>
              <v-card-text>
                <v-row v-if="jobMetrics">
                  <v-col cols="6" md="4">
                    <v-list-item>
                      <v-list-item-title>Total Submissions</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ jobMetrics.job_submissions_total || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="6" md="4">
                    <v-list-item>
                      <v-list-item-title>Pending</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ jobMetrics.job_status_total?.PENDING || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="6" md="4">
                    <v-list-item>
                      <v-list-item-title>Processing</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ jobMetrics.job_status_total?.PROCESSING || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="6" md="4">
                    <v-list-item>
                      <v-list-item-title>Completed</v-list-item-title>
                      <v-list-item-subtitle class="text-h6 text-success">
                        {{ jobMetrics.job_status_total?.COMPLETED || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="6" md="4">
                    <v-list-item>
                      <v-list-item-title>Failed</v-list-item-title>
                      <v-list-item-subtitle class="text-h6 text-error">
                        {{ jobMetrics.job_status_total?.FAILED || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="6" md="4">
                    <v-list-item>
                      <v-list-item-title>Cancelled</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ jobMetrics.job_status_total?.CANCELLED || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                </v-row>
                <v-alert v-else type="info" variant="tonal">No job metrics available</v-alert>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Queue Metrics -->
          <v-col cols="12" md="6">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2">mdi-format-list-bulleted</v-icon>
                Queue Metrics
              </v-card-title>
              <v-card-text>
                <v-row v-if="queueMetrics">
                  <v-col cols="12" md="4">
                    <v-list-item>
                      <v-list-item-title>Queue Depth (In Flight)</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ queueMetrics.queue_depth || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-list-item>
                      <v-list-item-title>Waiting</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ queueMetrics.queue_waiting || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-list-item>
                      <v-list-item-title>Active (Processing)</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ queueMetrics.queue_active || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                </v-row>
                <v-alert v-else type="info" variant="tonal">No queue metrics available</v-alert>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Worker Metrics Table -->
          <v-col cols="12">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2">mdi-worker</v-icon>
                Worker Metrics
                <v-spacer></v-spacer>
                <v-chip v-if="workerMetrics && workerMetrics.workers" color="success" size="small">
                  {{ workerMetrics.workers.length }} Active Workers
                </v-chip>
              </v-card-title>
              <v-card-text>
                <v-alert v-if="workerMetrics && workerMetrics.workers && workerMetrics.workers.length === 0"
                         type="info"
                         variant="tonal">
                  No active workers detected
                </v-alert>
                <v-data-table
                  v-else-if="workerMetrics && workerMetrics.workers && workerMetrics.workers.length > 0"
                  :headers="workerHeaders"
                  :items="workerMetrics.workers"
                  :items-per-page="10"
                  density="comfortable"
                  class="elevation-1"
                >
                  <template v-slot:item.workerId="{ item }">
                    <v-chip size="small" color="primary" variant="tonal">
                      {{ item.workerId }}
                    </v-chip>
                  </template>
                  <template v-slot:item.workerType="{ item }">
                    <v-chip size="small" color="success" variant="flat">
                      {{ item.workerType }}
                    </v-chip>
                  </template>
                  <template v-slot:item.worker_cpu_usage="{ item }">
                    <span>{{ item.worker_cpu_usage?.toFixed(2) || '0.00' }}%</span>
                  </template>
                  <template v-slot:item.worker_memory_usage="{ item }">
                    <span>{{ item.worker_memory_usage || 0 }} MB</span>
                  </template>
                  <template v-slot:item.worker_active_jobs="{ item }">
                    <v-chip
                      size="small"
                      :color="item.worker_active_jobs > 0 ? 'warning' : 'default'"
                    >
                      {{ item.worker_active_jobs || 0 }}
                    </v-chip>
                  </template>
                  <template v-slot:item.worker_uptime_seconds="{ item }">
                    <span>{{ formatUptime(item.worker_uptime_seconds) }}</span>
                  </template>
                  <template v-slot:item.timestamp="{ item }">
                    <span class="text-caption">{{ formatTimestamp(item.timestamp) }}</span>
                  </template>
                </v-data-table>
                <v-alert v-else type="info" variant="tonal">No worker metrics available</v-alert>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Error Display -->
        <v-snackbar v-model="showError" color="error" :timeout="5000">
          {{ errorMessage }}
          <template v-slot:actions>
            <v-btn variant="text" @click="showError = false">Close</v-btn>
          </template>
        </v-snackbar>
      </v-container>
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

const API_URL = import.meta.env.VITE_MONITOR_API_URL || 'http://localhost:3002'

const loading = ref(false)
const isConnected = ref(false)
const showError = ref(false)
const errorMessage = ref('')

const testRunning = ref(false)
const testSuccess = ref(false)
const testDuration = ref(null)

const systemMetrics = ref(null)
const jobMetrics = ref(null)
const queueMetrics = ref(null)
const workerMetrics = ref(null)

let refreshInterval = null

// Worker table headers
const workerHeaders = [
  { title: 'Worker ID', key: 'workerId', sortable: true },
  { title: 'Type', key: 'workerType', sortable: true },
  { title: 'Active Jobs', key: 'worker_active_jobs', sortable: true },
  { title: 'CPU Usage', key: 'worker_cpu_usage', sortable: true },
  { title: 'Memory', key: 'worker_memory_usage', sortable: true },
  { title: 'Processed', key: 'worker_processed_jobs_total', sortable: true },
  { title: 'Failed', key: 'worker_failed_jobs_total', sortable: true },
  { title: 'Uptime', key: 'worker_uptime_seconds', sortable: true },
  { title: 'Last Update', key: 'timestamp', sortable: true },
]

const testButtonText = computed(() => {
  if (testRunning.value) return 'Running Test...'
  if (testSuccess.value && testDuration.value) return `Test Passed (${testDuration.value}s)`
  if (testSuccess.value === false) return 'Test Failed'
  return 'Run Test'
})

const formatUptime = (seconds) => {
  if (!seconds) return '0s'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}

const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'N/A'
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

const fetchMetrics = async (endpoint, target) => {
  try {
    const response = await axios.get(`${API_URL}${endpoint}`)
    target.value = response.data
    isConnected.value = true
  } catch (error) {
    console.error(`Failed to fetch ${endpoint}:`, error)
    errorMessage.value = `Failed to fetch ${endpoint}: ${error.message}`
    showError.value = true
    isConnected.value = false
  }
}

const fetchAllMetrics = async () => {
  loading.value = true
  try {
    await Promise.all([
      fetchMetrics('/metrics/system', systemMetrics),
      fetchMetrics('/metrics/jobs', jobMetrics),
      fetchMetrics('/metrics/queue', queueMetrics),
      fetchMetrics('/metrics/workers', workerMetrics)
    ])
  } finally {
    loading.value = false
  }
}

const runTest = async () => {
  testRunning.value = true
  testSuccess.value = null
  testDuration.value = null

  try {
    const response = await axios.post(`${API_URL}/debug/run_test`)
    const result = response.data

    testSuccess.value = result.success
    testDuration.value = result.duration

    if (!result.success) {
      errorMessage.value = result.message || 'Test failed'
      showError.value = true
    }

    // Refresh metrics after test
    await fetchAllMetrics()

    // Auto-reset after 5 seconds
    setTimeout(() => {
      testSuccess.value = null
      testDuration.value = null
    }, 5000)
  } catch (error) {
    console.error('Failed to run test:', error)
    errorMessage.value = `Failed to run test: ${error.message}`
    showError.value = true
    testSuccess.value = false

    // Auto-reset after 5 seconds
    setTimeout(() => {
      testSuccess.value = null
    }, 5000)
  } finally {
    testRunning.value = false
  }
}

onMounted(() => {
  fetchAllMetrics()
  // Auto-refresh every 5 seconds
  refreshInterval = setInterval(fetchAllMetrics, 5000)
})

onUnmounted(() => {
  if (refreshInterval) {
    clearInterval(refreshInterval)
  }
})
</script>

<style scoped>
pre {
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
