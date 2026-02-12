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
                      <v-list-item-title>Database Connection Pool</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ systemMetrics.database_connection_pool_size || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="12" md="4">
                    <v-list-item>
                      <v-list-item-title>Redis Connection Errors</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ systemMetrics.redis_connection_errors_total || 0 }}
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
                  <v-col cols="12">
                    <v-list-item>
                      <v-list-item-title>Total Submissions</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ jobMetrics.job_submissions_total || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="12">
                    <v-list-item>
                      <v-list-item-title>Job Status</v-list-item-title>
                      <v-list-item-subtitle>
                        <pre class="text-caption">{{ JSON.stringify(jobMetrics.job_status_total || {}, null, 2) }}</pre>
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
                  <v-col cols="12">
                    <v-list-item>
                      <v-list-item-title>Queue Depth</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ queueMetrics.queue_depth || 0 }}
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                  <v-col cols="12">
                    <v-list-item>
                      <v-list-item-title>Processing Rate</v-list-item-title>
                      <v-list-item-subtitle class="text-h6">
                        {{ queueMetrics.queue_processing_rate || 0 }} jobs/sec
                      </v-list-item-subtitle>
                    </v-list-item>
                  </v-col>
                </v-row>
                <v-alert v-else type="info" variant="tonal">No queue metrics available</v-alert>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Worker Metrics -->
          <v-col cols="12">
            <v-card>
              <v-card-title class="d-flex align-center">
                <v-icon class="mr-2">mdi-worker</v-icon>
                Worker Metrics
              </v-card-title>
              <v-card-text>
                <v-alert v-if="workerMetrics && workerMetrics.workers && workerMetrics.workers.length === 0"
                         type="info"
                         variant="tonal">
                  No active workers detected
                </v-alert>
                <v-row v-else-if="workerMetrics && workerMetrics.workers">
                  <v-col cols="12">
                    <v-list>
                      <v-list-item v-for="(worker, index) in workerMetrics.workers" :key="index">
                        <v-list-item-title>Worker {{ index + 1 }}</v-list-item-title>
                        <v-list-item-subtitle>
                          <pre class="text-caption">{{ JSON.stringify(worker, null, 2) }}</pre>
                        </v-list-item-subtitle>
                      </v-list-item>
                    </v-list>
                  </v-col>
                </v-row>
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
import { ref, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

const API_URL = import.meta.env.VITE_MONITOR_API_URL || 'http://localhost:3002'

const loading = ref(false)
const isConnected = ref(false)
const showError = ref(false)
const errorMessage = ref('')

const systemMetrics = ref(null)
const jobMetrics = ref(null)
const queueMetrics = ref(null)
const workerMetrics = ref(null)

let refreshInterval = null

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

onMounted(() => {
  fetchAllMetrics()
  // Auto-refresh every 10 seconds
  refreshInterval = setInterval(fetchAllMetrics, 10000)
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
