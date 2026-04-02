<script setup>
import { ref, onMounted } from 'vue'
import { apiRequest } from '@shared/client/services/api.js'

const config = ref(null)
const editProjectKeys = ref([])
const loading = ref(true)
const saving = ref(false)
const saveError = ref(null)
const saveSuccess = ref(false)
const envSource = ref(false)
const refreshStatus = ref(null)
const refreshTriggering = ref(false)
const resetting = ref(false)

async function loadConfig() {
  loading.value = true
  try {
    const result = await apiRequest('/modules/release-analysis/config')
    config.value = result.config
    editProjectKeys.value = [...(result.config.projectKeys || [])]
    envSource.value = result.source === 'env'
  } catch {
    config.value = null
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  saveError.value = null
  saveSuccess.value = false
  try {
    const toSave = { ...config.value }
    toSave.projectKeys = editProjectKeys.value.map(s => s.trim()).filter(Boolean)
    await apiRequest('/modules/release-analysis/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toSave)
    })
    saveSuccess.value = true
    envSource.value = false
    setTimeout(() => { saveSuccess.value = false }, 3000)
  } catch (e) {
    saveError.value = e.message
  } finally {
    saving.value = false
  }
}

async function resetConfig() {
  if (!confirm('Reset configuration to defaults? Environment variable overrides will become active again.')) return
  resetting.value = true
  try {
    const result = await apiRequest('/modules/release-analysis/config', { method: 'DELETE' })
    config.value = result.config
    editProjectKeys.value = [...(result.config.projectKeys || [])]
    envSource.value = result.source === 'env'
    saveSuccess.value = false
    saveError.value = null
  } catch (e) {
    saveError.value = e.message
  } finally {
    resetting.value = false
  }
}

async function triggerRefresh() {
  refreshTriggering.value = true
  try {
    const result = await apiRequest('/modules/release-analysis/refresh', { method: 'POST' })
    refreshStatus.value = result
    if (result.status === 'started') {
      pollRefreshStatus()
    }
  } catch (e) {
    refreshStatus.value = { status: 'error', message: e.message }
  } finally {
    refreshTriggering.value = false
  }
}

async function pollRefreshStatus() {
  const poll = async () => {
    try {
      const status = await apiRequest('/modules/release-analysis/refresh/status')
      refreshStatus.value = status
      if (status.running) {
        setTimeout(poll, 3000)
      }
    } catch {
      // ignore polling errors
    }
  }
  setTimeout(poll, 2000)
}

async function checkRefreshStatus() {
  try {
    refreshStatus.value = await apiRequest('/modules/release-analysis/refresh/status')
  } catch {
    // ignore
  }
}

onMounted(() => {
  loadConfig()
  checkRefreshStatus()
})
</script>

<template>
  <div class="space-y-6">
    <div v-if="loading" class="text-gray-500 dark:text-gray-400">Loading configuration...</div>

    <template v-else-if="config">
      <div v-if="envSource" class="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md p-3 text-sm text-blue-700 dark:text-blue-300">
        Configuration loaded from environment variables. Save to persist.
      </div>

      <!-- Section 1: Jira Configuration -->
      <div>
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Jira Configuration</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Project Keys</label>
            <div class="space-y-2 mb-2">
              <div v-for="(key, idx) in editProjectKeys" :key="'pk-' + idx" class="flex items-center gap-2">
                <input
                  v-model="editProjectKeys[idx]"
                  placeholder="e.g. RHOAIENG"
                  class="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <button
                  @click="editProjectKeys.splice(idx, 1)"
                  class="p-1 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Remove"
                >
                  <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <button
              @click="editProjectKeys.push('')"
              class="text-sm text-primary-600 hover:text-primary-700 dark:hover:text-primary-400 font-medium flex items-center gap-1"
            >
              <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Add project key
            </button>
          </div>

          <div class="md:col-span-2">
            <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                v-model="config.jiraAllProjects"
                type="checkbox"
                class="rounded border-gray-300 dark:border-gray-600"
              />
              Search all Jira projects
            </label>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">When enabled, JQL does not filter by project keys (slower, broader search)</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Story Points Field</label>
            <input
              v-model="config.storyPointsField"
              type="text"
              placeholder="customfield_10028"
              class="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Feature Weight Field</label>
            <input
              v-model="config.featureWeightField"
              type="text"
              placeholder="Defaults to Story Points field"
              class="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Version Field</label>
            <input
              v-model="config.targetVersionField"
              type="text"
              placeholder="customfield_10855"
              class="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Version JQL Fragment</label>
            <input
              v-model="config.targetVersionJqlFragment"
              type="text"
              placeholder="Auto-derived if empty"
              class="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
            />
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Advanced — raw JQL WHERE clause fragment</p>
          </div>
        </div>
      </div>

      <!-- Section 2: Analysis Parameters -->
      <div>
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Analysis Parameters</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Baseline Days</label>
            <input
              v-model.number="config.baselineDays"
              type="number"
              min="1"
              max="730"
              class="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
            />
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Number of days of historical data used to calculate team throughput baselines (1–730)</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Baseline Mode</label>
            <select
              v-model="config.baselineMode"
              class="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
            >
              <option value="avg">Average</option>
              <option value="p90">90th Percentile</option>
            </select>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">How monthly throughput is aggregated — average smooths variance, p90 reflects peak capacity</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Risk Threshold Green (issues/day)</label>
            <input
              v-model.number="config.riskIssuesPerDayGreen"
              type="number"
              min="0.01"
              step="0.1"
              class="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
            />
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Maximum open issues per remaining day to stay green (low risk)</p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Risk Threshold Yellow (issues/day)</label>
            <input
              v-model.number="config.riskIssuesPerDayYellow"
              type="number"
              min="0.01"
              step="0.1"
              class="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-300"
            />
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Maximum open issues per remaining day before escalating to red (high risk). Must be greater than the green threshold.</p>
          </div>
        </div>
      </div>

      <!-- Section 3: Product Pages -->
      <div>
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Product Pages</h4>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Releases URL</label>
          <input
            v-model="config.productPagesReleasesUrl"
            type="text"
            placeholder="https://..."
            class="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
          />
        </div>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-2">Product Pages token is configured via environment variable (PRODUCT_PAGES_TOKEN)</p>
      </div>

      <!-- Save / Reset buttons -->
      <div class="flex items-center gap-3">
        <button
          @click="saveConfig"
          :disabled="saving"
          class="px-4 py-2 bg-primary-600 text-white rounded-md text-sm hover:bg-primary-700 disabled:opacity-50"
        >
          {{ saving ? 'Saving...' : 'Save Configuration' }}
        </button>
        <button
          @click="resetConfig"
          :disabled="resetting"
          class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
        >
          {{ resetting ? 'Resetting...' : 'Reset to Defaults' }}
        </button>
        <span v-if="saveSuccess" class="text-green-600 dark:text-green-400 text-sm">Saved successfully</span>
        <span v-if="saveError" class="text-red-600 dark:text-red-400 text-sm">{{ saveError }}</span>
      </div>

      <!-- Section 4: Data Refresh -->
      <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
      <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Data Refresh</h4>
      <div class="flex items-center gap-3">
        <button
          @click="triggerRefresh"
          :disabled="refreshTriggering || refreshStatus?.running"
          class="px-4 py-2 bg-gray-800 text-white rounded-md text-sm hover:bg-gray-900 disabled:opacity-50"
        >
          {{ refreshStatus?.running ? 'Refreshing...' : 'Refresh Analysis' }}
        </button>
        <div v-if="refreshStatus?.lastResult" class="text-sm text-gray-500 dark:text-gray-400">
          Last refresh:
          <span :class="refreshStatus.lastResult.status === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
            {{ refreshStatus.lastResult.status }}
          </span>
          <span v-if="refreshStatus.lastResult.message"> &mdash; {{ refreshStatus.lastResult.message }}</span>
          <span v-if="refreshStatus.lastResult.completedAt">
            at {{ new Date(refreshStatus.lastResult.completedAt).toLocaleString() }}
          </span>
        </div>
      </div>
      </div>
    </template>
  </div>
</template>
