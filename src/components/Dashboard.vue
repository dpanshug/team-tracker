<template>
  <div class="container mx-auto px-6 py-6">
    <!-- Filter bar -->
    <div class="flex items-center justify-between mb-6">
      <FilterSelector
        :filters="filters"
        :activeFilterId="activeFilterId"
        @select-filter="$emit('select-filter', $event)"
        @create-filter="$emit('create-filter')"
        @edit-filter="$emit('edit-filter', $event)"
        @delete-filter="$emit('delete-filter', $event)"
      />
    </div>

    <!-- Summary row -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <MetricCard
        label="Aggregate Velocity"
        :value="summaryMetrics.totalVelocity"
        unit="pts"
        subtitle="Across filtered teams (latest sprint)"
        tooltip="Sum of delivered story points across all filtered teams for their most recent sprint"
      />
      <MetricCard
        label="Avg Commitment Reliability"
        :value="summaryMetrics.avgReliability"
        unit="%"
        :colorThresholds="{ good: 80, warn: 60 }"
        tooltip="Average of each team's commitment reliability (delivered points / committed points * 100)"
      />
      <MetricCard
        label="Teams"
        :value="filteredBoards.length"
        subtitle="Enabled and filtered"
      />
      <MetricCard
        label="Last Updated"
        :value="lastUpdatedDisplay"
      />
    </div>

    <!-- Aggregate trend chart -->
    <div v-if="aggregateTrendData.length > 0" class="bg-white rounded-lg border border-gray-200 p-5 mb-6">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">Aggregate Velocity Trend (Monthly)</h3>
      <TrendChart
        :labels="aggregateTrendData.map(d => d.label)"
        :datasets="[{
          label: 'Velocity (pts)',
          data: aggregateTrendData.map(d => d.velocityPoints),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)'
        }]"
      />
    </div>

    <!-- Team grid -->
    <div v-if="filteredBoards.length === 0 && !isLoading" class="text-center py-12">
      <svg class="h-12 w-12 mx-auto text-gray-300 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
      <p class="text-gray-500">No teams found. Go to Board Settings to discover and enable boards.</p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <TeamCard
        v-for="board in filteredBoards"
        :key="board.id"
        :board="board"
        :summaryData="getSummaryForBoard(board.id)"
        @select="$emit('select-team', board)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import FilterSelector from './FilterSelector.vue'
import MetricCard from './MetricCard.vue'
import TeamCard from './TeamCard.vue'
import TrendChart from './TrendChart.vue'
import { getAggregateTrend } from '../services/api'
import { formatMonthLabel } from '../utils/metrics'

const props = defineProps({
  boards: { type: Array, default: () => [] },
  dashboardSummary: { type: Object, default: null },
  filters: { type: Array, default: () => [] },
  activeFilterId: { type: String, default: null },
  activeFilter: { type: Object, default: null },
  isLoading: { type: Boolean, default: false }
})

defineEmits(['select-team', 'select-filter', 'create-filter', 'edit-filter', 'delete-filter'])

const aggregateTrendData = ref([])

const filteredBoards = computed(() => {
  if (!props.activeFilter) return props.boards
  const filterBoardIds = new Set(props.activeFilter.boardIds)
  return props.boards.filter(b => filterBoardIds.has(b.id))
})

const summaryMetrics = computed(() => {
  const boards = props.dashboardSummary?.boards || {}
  let totalVelocity = 0
  let reliabilitySum = 0
  let reliabilityCount = 0

  for (const board of filteredBoards.value) {
    const data = boards[board.id]
    if (!data?.metrics) continue
    totalVelocity += data.metrics.velocityPoints || 0
    if (data.metrics.commitmentReliabilityPoints != null) {
      reliabilitySum += data.metrics.commitmentReliabilityPoints
      reliabilityCount++
    }
  }

  return {
    totalVelocity,
    avgReliability: reliabilityCount > 0 ? Math.round(reliabilitySum / reliabilityCount) : null
  }
})

const lastUpdatedDisplay = computed(() => {
  if (!props.dashboardSummary?.lastUpdated) return '--'
  return new Date(props.dashboardSummary.lastUpdated).toLocaleString()
})

function getSummaryForBoard(boardId) {
  return props.dashboardSummary?.boards?.[boardId] || null
}

// Fetch aggregate trend data when filtered boards change
watch(filteredBoards, async (boards) => {
  if (boards.length === 0) {
    aggregateTrendData.value = []
    return
  }

  try {
    const boardIds = boards.map(b => b.id)
    const data = await getAggregateTrend(boardIds)
    aggregateTrendData.value = (data.months || []).map(m => ({
      ...m,
      label: formatMonthLabel(m.month)
    }))
  } catch (error) {
    console.error('Failed to load aggregate trend:', error)
    aggregateTrendData.value = []
  }
}, { immediate: true })
</script>
