import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface StixObject {
  type?: string
  revoked?: boolean
  x_mitre_deprecated?: boolean
  x_mitre_is_subtechnique?: boolean
  external_references?: Array<{ source_name?: string; external_id?: string; url?: string }>
  name?: string
  description?: string
  kill_chain_phases?: Array<{ kill_chain_name?: string; phase_name?: string }>
}

interface AttackTechnique {
  id: string
  name: string
  description: string
  tactic: string
  url: string
  isSubtechnique: boolean
  parentId: string | null
}

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const sourceUrl = 'https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json'
const outputPath = resolve(projectRoot, 'src/data/attack-techniques.json')
const sqlPath = resolve(projectRoot, 'supabase/seed/attack_techniques.sql')
const csvPath = resolve(projectRoot, 'supabase/seed/attack_techniques.csv')

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function toSql(techniques: AttackTechnique[]) {
  const rows = techniques.map((technique) => {
    const parent = technique.parentId ? sqlString(technique.parentId) : 'NULL'
    return `  (${sqlString(technique.id)}, ${sqlString(technique.name)}, ${sqlString(technique.description)}, ${sqlString(technique.tactic)}, ${sqlString(technique.url)}, ${technique.isSubtechnique}, ${parent})`
  })
  return [
    '-- Generated from the official MITRE ATT&CK Enterprise STIX 2.1 data.',
    '-- Re-run `npm run attack:data` to refresh this file.',
    'INSERT INTO public.attack_techniques (id, name, description, tactic, url, is_subtechnique, parent_id)',
    'VALUES',
    rows.join(',\n'),
    'ON CONFLICT (id) DO UPDATE SET',
    '  name = EXCLUDED.name,',
    '  description = EXCLUDED.description,',
    '  tactic = EXCLUDED.tactic,',
    '  url = EXCLUDED.url,',
    '  is_subtechnique = EXCLUDED.is_subtechnique,',
    '  parent_id = EXCLUDED.parent_id;',
    '',
  ].join('\n')
}

function toCsv(techniques: AttackTechnique[]) {
  const headers = ['id', 'name', 'description', 'tactic', 'url', 'is_subtechnique', 'parent_id']
  const quote = (value: string | null) => value === null ? '' : `"${value.replaceAll('"', '""')}"`
  const rows = techniques.map((technique) => [
    quote(technique.id),
    quote(technique.name),
    quote(technique.description),
    quote(technique.tactic),
    quote(technique.url),
    technique.isSubtechnique ? 'true' : 'false',
    quote(technique.parentId),
  ].join(','))
  return `${headers.join(',')}\n${rows.join('\n')}\n`
}

async function main() {
  console.log('Downloading the official MITRE ATT&CK Enterprise STIX dataset…')
  const response = await fetch(sourceUrl)
  if (!response.ok) throw new Error(`MITRE source returned HTTP ${response.status}.`)
  const bundle = await response.json() as { objects?: StixObject[] }
  if (!Array.isArray(bundle.objects)) throw new Error('MITRE STIX bundle did not contain an objects array.')

  const techniques: AttackTechnique[] = []
  for (const object of bundle.objects) {
    if (object.type !== 'attack-pattern' || object.revoked || object.x_mitre_deprecated) continue
    const reference = object.external_references?.find((entry) => entry.source_name === 'mitre-attack')
    const id = reference?.external_id
    if (!id || !/^T\d{4}(?:\.\d{3})?$/.test(id) || !object.name) continue
    const phases = object.kill_chain_phases ?? []
    const tactic = phases.find((phase) => phase.kill_chain_name === 'mitre-attack')?.phase_name ?? 'unknown'
    const isSubtechnique = Boolean(object.x_mitre_is_subtechnique || id.includes('.'))
    techniques.push({
      id,
      name: object.name,
      description: (object.description ?? '').slice(0, 500),
      tactic,
      url: reference?.url ?? `https://attack.mitre.org/techniques/${id.replace('.', '/')}/`,
      isSubtechnique,
      parentId: isSubtechnique ? id.split('.')[0] : null,
    })
  }
  techniques.sort((left, right) => left.tactic.localeCompare(right.tactic) || left.id.localeCompare(right.id, undefined, { numeric: true }))
  if (techniques.length < 100) throw new Error(`Only ${techniques.length} active techniques were extracted; refusing to replace generated data.`)

  await mkdir(dirname(outputPath), { recursive: true })
  await mkdir(dirname(sqlPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(techniques, null, 2)}\n`)
  await writeFile(sqlPath, toSql(techniques))
  const importRows = [...techniques].sort((left, right) => left.id.localeCompare(right.id, undefined, { numeric: true }))
  await writeFile(csvPath, toCsv(importRows))
  console.log(`Wrote ${techniques.length} techniques to ${outputPath}`)
  console.log(`Wrote database upsert SQL to ${sqlPath}`)
  console.log(`Wrote Table Editor import data to ${csvPath}`)
}

await main()
