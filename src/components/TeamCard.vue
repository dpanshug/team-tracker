<template>
  <div
    class="bg-white rounded-lg border border-gray-200 p-5 cursor-pointer hover:border-primary-300 hover:shadow-md transition-all"
    @click="$emit('select')"
  >
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-semibold text-gray-900 truncate">{{ displayName }}</h3>
      <SprintStatusBadge v-if="latestSprint" :state="latestSprint.state" />
    </div>

    <p v-if="latestSprint" class="text-xs text-gray-400 mb-3">{{ latestSprint.name }}</p>

    <div v-if="metrics" class="grid grid-cols-2 gap-3">
      <div>
        <p class="text-xs text-gray-500">Velocity</p>
        <p class="text-lg font-bold text-gray-900">{{ metrics.velocityPoints }} <span class="text-xs font-normal text-gray-400">pts</span></p>
      </div>
      <div>
        <p class="text-xs text-gray-500">Reliability</p>
        <p class="text-lg font-bold" :class="reliabilityColor">{{ metrics.commitmentReliabilityPoints }}%</p>
      </div>
      <div>
        <p class="text-xs text-gray-500">Scope Change</p>
        <p class="text-lg font-bold text-gray-900">{{ metrics.scopeChangeCount }}</p>
      </div>
      <div v-if="unestimatedCount > 0">
        <p class="text-xs text-amber-600">Unestimated</p>
        <p class="text-lg font-bold text-amber-600">{{ unestimatedCount }}</p>
      </div>
    </div>

    <div v-else class="text-sm text-gray-400 italic">No sprint data available</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import SprintStatusBadge from './SprintStatusBadge.vue'

const props = defineProps({
  board: { type: Object, required: true },
  summaryData: { type: Object, default: null }
})

defineEmits(['select'])

const displayName = computed(() =>
  props.board.displayName || props.board.name
)

const latestSprint = computed(() =>
  props.summaryData?.sprint || null
)

const metrics = computed(() =>
  props.summaryData?.metrics || null
)

const unestimatedCount = computed(() => {
  if (!props.summaryData) return 0
  // Will be populated when we have full sprint data
  return 0
})

const reliabilityColor = computed(() => {
  const val = metrics.value?.commitmentReliabilityPoints
  if (val == null) return 'text-gray-900'
  if (val >= 80) return 'text-green-600'
  if (val >= 60) return 'text-amber-600'
  return 'text-red-600'
})
</script>
