<template>
  <div
    class="bg-white rounded-lg border border-gray-200 p-5 cursor-pointer hover:border-primary-300 hover:shadow-md transition-all"
    @click="$emit('select', team)"
  >
    <div class="flex items-start justify-between mb-3">
      <h3 class="text-base font-semibold text-gray-900">{{ team.displayName }}</h3>
      <span class="text-sm text-gray-500">{{ uniqueCount }} members</span>
    </div>
    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="(count, specialty) in specialtyBreakdown"
        :key="specialty"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
        :class="specialtyClass(specialty)"
      >
        {{ count }} {{ specialty }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  team: { type: Object, required: true }
})
defineEmits(['select'])

const uniqueMembers = computed(() => {
  const seen = new Set()
  return props.team.members.filter(m => {
    if (seen.has(m.jiraDisplayName)) return false
    seen.add(m.jiraDisplayName)
    return true
  })
})

const uniqueCount = computed(() => uniqueMembers.value.length)

const specialtyBreakdown = computed(() => {
  const counts = {}
  for (const m of uniqueMembers.value) {
    const s = normalizeSpecialty(m.specialty)
    counts[s] = (counts[s] || 0) + 1
  }
  return counts
})

function normalizeSpecialty(s) {
  if (!s) return 'Other'
  const lower = s.toLowerCase()
  if (lower.includes('backend') || (lower.includes('engineer') && !lower.includes('staff'))) return 'Backend'
  if (lower.includes('staff')) return 'Staff'
  if (lower === 'qe') return 'QE'
  if (lower === 'ui' || lower === 'bff') return 'UI'
  if (lower.includes('manager') || lower.includes('operations')) return 'Mgmt'
  if (lower.includes('architect')) return 'Arch'
  if (lower.includes('agilist')) return 'Agile'
  return 'Other'
}

function specialtyClass(specialty) {
  switch (specialty) {
    case 'Backend': return 'bg-blue-50 text-blue-700'
    case 'Staff': return 'bg-purple-50 text-purple-700'
    case 'QE': return 'bg-teal-50 text-teal-700'
    case 'UI': return 'bg-pink-50 text-pink-700'
    case 'Mgmt': return 'bg-amber-50 text-amber-700'
    case 'Arch': return 'bg-indigo-50 text-indigo-700'
    case 'Agile': return 'bg-green-50 text-green-700'
    default: return 'bg-gray-50 text-gray-700'
  }
}
</script>
