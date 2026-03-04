import { ref, computed } from 'vue'
import { getRoster } from '../services/api'

const rosterData = ref(null)
const loading = ref(false)
const error = ref(null)

export function useRoster() {
  const teams = computed(() => {
    if (!rosterData.value?.teams) return []
    return Object.entries(rosterData.value.teams).map(([key, team]) => ({
      key,
      displayName: team.displayName,
      members: team.members
    }))
  })

  const multiTeamMembers = computed(() => {
    const nameCounts = {}
    for (const team of teams.value) {
      for (const member of team.members) {
        const name = member.jiraDisplayName
        nameCounts[name] = (nameCounts[name] || 0) + 1
      }
    }
    return new Set(
      Object.entries(nameCounts)
        .filter(([, count]) => count > 1)
        .map(([name]) => name)
    )
  })

  function getTeamsForPerson(jiraDisplayName) {
    return teams.value.filter(t =>
      t.members.some(m => m.jiraDisplayName === jiraDisplayName)
    )
  }

  const uniqueMemberCount = computed(() => {
    const names = new Set()
    for (const team of teams.value) {
      for (const member of team.members) {
        names.add(member.jiraDisplayName)
      }
    }
    return names.size
  })

  async function loadRoster() {
    if (rosterData.value) return
    loading.value = true
    error.value = null
    try {
      rosterData.value = await getRoster()
    } catch (err) {
      error.value = err.message
      console.error('Failed to load roster:', err)
    } finally {
      loading.value = false
    }
  }

  return {
    rosterData,
    teams,
    loading,
    error,
    multiTeamMembers,
    getTeamsForPerson,
    uniqueMemberCount,
    loadRoster
  }
}
