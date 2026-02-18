<template>
  <div class="container mx-auto px-6 py-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <button
          @click="$emit('back')"
          class="text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1"
        >
          <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h2 class="text-xl font-bold text-gray-900">{{ board?.displayName || board?.name }}</h2>
      </div>
      <div class="flex items-center gap-3">
        <SprintSelector
          v-if="sprints.length > 0"
          :sprints="sprints"
          :selectedSprintId="selectedSprint?.id"
          @select-sprint="$emit('select-sprint', $event)"
        />
        <SprintStatusBadge v-if="selectedSprint" :state="selectedSprint.state" />
        <span v-if="selectedSprint" class="text-sm text-gray-500">
          {{ formatDateRange(selectedSprint.startDate, selectedSprint.endDate) }}
        </span>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading && !sprintData" class="flex justify-center py-12">
      <svg class="animate-spin h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>

    <template v-else-if="sprintData">
      <!-- Sprint Overview -->
      <SprintOverview
        :sprintData="sprintData"
        @drill-down="openDrillDown"
      />

      <!-- Trend Charts (2-up) -->
      <div v-if="trendData && trendData.length > 1" class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div class="bg-white rounded-lg border border-gray-200 p-5">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">Velocity Trend</h3>
          <TrendChart
            :labels="trendLabels"
            :datasets="[{
              label: 'Velocity (pts)',
              data: trendData.map(d => d.velocityPoints),
              borderColor: '#2563eb',
              backgroundColor: 'rgba(37, 99, 235, 0.1)'
            }]"
          />
        </div>
        <div class="bg-white rounded-lg border border-gray-200 p-5">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">Commitment Reliability Trend</h3>
          <TrendChart
            :labels="trendLabels"
            :datasets="[{
              label: 'Reliability (%)',
              data: trendData.map(d => d.commitmentReliabilityPoints),
              borderColor: '#16a34a',
              backgroundColor: 'rgba(22, 163, 74, 0.1)'
            }]"
            :suggestedMin="0"
            :suggestedMax="120"
          />
        </div>
      </div>

      <!-- Assignee Breakdown -->
      <div class="mt-6">
        <AssigneeBreakdown
          :byAssignee="sprintData.byAssignee"
          :trendData="trendData"
          @drill-down="openAssigneeDrillDown"
        />
      </div>
    </template>

    <div v-else-if="!isLoading" class="text-center py-12 text-gray-500">
      <p>No sprint data available. Try refreshing from Jira.</p>
    </div>

    <!-- Issue drill-down modal -->
    <IssueList
      v-if="drillDownVisible"
      :title="drillDownTitle"
      :issues="drillDownIssues"
      @close="drillDownVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import SprintSelector from './SprintSelector.vue'
import SprintStatusBadge from './SprintStatusBadge.vue'
import SprintOverview from './SprintOverview.vue'
import TrendChart from './TrendChart.vue'
import AssigneeBreakdown from './AssigneeBreakdown.vue'
import IssueList from './IssueList.vue'
import { formatDate } from '../utils/metrics'

const props = defineProps({
  board: { type: Object, default: null },
  sprints: { type: Array, default: () => [] },
  selectedSprint: { type: Object, default: null },
  sprintData: { type: Object, default: null },
  trendData: { type: Array, default: null },
  isLoading: { type: Boolean, default: false }
})

defineEmits(['select-sprint', 'back'])

const drillDownVisible = ref(false)
const drillDownTitle = ref('')
const drillDownIssues = ref([])

const trendLabels = computed(() => {
  if (!props.trendData) return []
  return props.trendData.map(d => {
    const name = d.sprintName || ''
    // Shorten long sprint names
    const match = name.match(/Sprint\s*(\d+)/i)
    return match ? `S${match[1]}` : name.slice(0, 15)
  })
})

function formatDateRange(start, end) {
  if (!start || !end) return ''
  return `${formatDate(start)} - ${formatDate(end)}`
}

function openDrillDown(category) {
  if (!props.sprintData) return

  const categoryMap = {
    committed: { title: 'Committed Issues', data: props.sprintData.committed },
    delivered: { title: 'Delivered Issues', data: props.sprintData.delivered },
    addedMidSprint: { title: 'Added Mid-Sprint', data: props.sprintData.addedMidSprint },
    removed: { title: 'Removed Issues', data: props.sprintData.removed },
    incomplete: { title: 'Incomplete Issues', data: props.sprintData.incomplete }
  }

  const entry = categoryMap[category]
  if (!entry) return

  drillDownTitle.value = entry.title
  drillDownIssues.value = entry.data.issues || []
  drillDownVisible.value = true
}

function openAssigneeDrillDown(assigneeName) {
  if (!props.sprintData?.byAssignee?.[assigneeName]) return

  drillDownTitle.value = `Issues: ${assigneeName}`
  drillDownIssues.value = props.sprintData.byAssignee[assigneeName].issues || []
  drillDownVisible.value = true
}
</script>
