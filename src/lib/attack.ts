import techniques from '@/data/attack-techniques.json'

export interface BundledAttackTechnique {
  id: string
  name: string
  description: string
  tactic: string
  url: string
  isSubtechnique: boolean
  parentId: string | null
}

const techniqueList = techniques as BundledAttackTechnique[]
const techniqueById = new Map(techniqueList.map((technique) => [technique.id, technique]))

export function getTechniqueById(id: string) {
  return techniqueById.get(id.toUpperCase()) ?? null
}

export function getAllTechniques() {
  return techniqueList
}

export function searchTechniques(query: string, limit = 50) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return techniqueList.slice(0, limit)
  return techniqueList
    .filter((technique) => technique.id.toLowerCase().includes(normalized)
      || technique.name.toLowerCase().includes(normalized)
      || technique.tactic.toLowerCase().includes(normalized))
    .slice(0, limit)
}

export function groupTechniquesByTactic(list: BundledAttackTechnique[] = techniqueList) {
  const groups = new Map<string, BundledAttackTechnique[]>()
  for (const technique of list) {
    const group = groups.get(technique.tactic) ?? []
    group.push(technique)
    groups.set(technique.tactic, group)
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

export function formatTacticName(tactic: string) {
  return tactic.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function toAttackTechniqueRows() {
  return techniqueList.map((technique) => ({
    id: technique.id,
    name: technique.name,
    description: technique.description,
    tactic: technique.tactic,
    url: technique.url,
    is_subtechnique: technique.isSubtechnique,
    parent_id: technique.parentId,
  }))
}
