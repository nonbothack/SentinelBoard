import type { IOCType } from '@/types/database'

export interface ValidIOC {
  valid: true
  normalizedValue: string
  warning?: string
  requiresOverride: boolean
}

export interface InvalidIOC {
  valid: false
  normalizedValue: string
  error: string
}

export type IOCValidationResult = ValidIOC | InvalidIOC

function parseIPv4(value: string): number[] | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null

  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith('0'))) return Number.NaN
    const octet = Number(part)
    return octet >= 0 && octet <= 255 ? octet : Number.NaN
  })

  return octets.every(Number.isInteger) ? octets : null
}

function ipv4Number(parts: number[]) {
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0
}

function isInIPv4Subnet(parts: number[], base: number[], prefix: number) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0
  return (ipv4Number(parts) & mask) === (ipv4Number(base) & mask)
}

const reservedIPv4Ranges: Array<[number[], number]> = [
  [[0, 0, 0, 0], 8],
  [[10, 0, 0, 0], 8],
  [[100, 64, 0, 0], 10],
  [[127, 0, 0, 0], 8],
  [[169, 254, 0, 0], 16],
  [[172, 16, 0, 0], 12],
  [[192, 0, 0, 0], 24],
  [[192, 0, 2, 0], 24],
  [[192, 88, 99, 0], 24],
  [[192, 168, 0, 0], 16],
  [[198, 18, 0, 0], 15],
  [[198, 51, 100, 0], 24],
  [[203, 0, 113, 0], 24],
  [[224, 0, 0, 0], 4],
  [[240, 0, 0, 0], 4],
]

function isReservedIPv4(parts: number[]) {
  return reservedIPv4Ranges.some(([base, prefix]) => isInIPv4Subnet(parts, base, prefix))
}

function expandIPv6(value: string): number[] | null {
  let normalized = value.toLowerCase()
  if (normalized.includes('%')) return null

  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':')
    const embeddedV4 = parseIPv4(normalized.slice(lastColon + 1))
    if (!embeddedV4) return null
    const upper = ((embeddedV4[0] << 8) | embeddedV4[1]).toString(16)
    const lower = ((embeddedV4[2] << 8) | embeddedV4[3]).toString(16)
    normalized = `${normalized.slice(0, lastColon + 1)}${upper}:${lower}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const specified = [...left, ...right]
  if (specified.some((part) => !/^[\da-f]{1,4}$/.test(part))) return null

  const missing = 8 - specified.length
  if (halves.length === 1 && missing !== 0) return null
  if (halves.length === 2 && missing < 1) return null

  const values = halves.length === 1
    ? specified
    : [...left, ...Array.from({ length: missing }, () => '0'), ...right]
  return values.map((part) => Number.parseInt(part, 16))
}

function isReservedIPv6(value: string) {
  let parsed: URL
  try {
    parsed = new URL(`http://[${value}]/`)
  } catch {
    return false
  }
  if (!parsed.hostname.startsWith('[') || !parsed.hostname.endsWith(']')) return false

  const groups = expandIPv6(value)
  if (!groups) return false
  const allZeroExceptLast = groups.slice(0, 7).every((group) => group === 0)
  if (groups.every((group) => group === 0) || (allZeroExceptLast && groups[7] === 1)) return true
  if ((groups[0] & 0xfe00) === 0xfc00) return true // Unique local (fc00::/7)
  if ((groups[0] & 0xffc0) === 0xfe80) return true // Link local (fe80::/10)
  if ((groups[0] & 0xff00) === 0xff00) return true // Multicast (ff00::/8)
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true // Documentation (2001:db8::/32)

  const ipv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff
  const ipv4Compatible = groups.slice(0, 6).every((group) => group === 0)
  if (ipv4Mapped || ipv4Compatible) {
    const embedded = [(groups[6] >> 8) & 255, groups[6] & 255, (groups[7] >> 8) & 255, groups[7] & 255]
    return isReservedIPv4(embedded)
  }

  return false
}

function invalid(normalizedValue: string, error: string): InvalidIOC {
  return { valid: false, normalizedValue, error }
}

function valid(normalizedValue: string, warning?: string, requiresOverride = false): ValidIOC {
  return { valid: true, normalizedValue, warning, requiresOverride }
}

export function validateIOC(type: IOCType, input: string): IOCValidationResult {
  const value = input.trim()
  if (!value) return invalid(value, 'Enter an IOC value.')

  if (type === 'ip') {
    const ipv4 = parseIPv4(value)
    if (!ipv4) {
      const ipv6 = expandIPv6(value)
      let validIPv6 = false
      if (ipv6) {
        try {
          const parsed = new URL(`http://[${value}]/`)
          validIPv6 = parsed.hostname.startsWith('[') && parsed.hostname.endsWith(']')
        } catch {
          validIPv6 = false
        }
      }
      if (!validIPv6) return invalid(value, 'Enter a valid IPv4 or IPv6 address.')
      if (isReservedIPv6(value)) {
        return valid(value.toLowerCase(), 'This IP is private or reserved and may not have a public reputation record. Confirm before continuing.', true)
      }
      return valid(value.toLowerCase())
    }

    if (isReservedIPv4(ipv4)) {
      return valid(value, 'This IP is private or reserved and may not have a public reputation record. Confirm before continuing.', true)
    }
    return valid(value)
  }

  if (type === 'domain') {
    const withoutProtocol = value.replace(/^https?:\/\//i, '')
    const normalized = withoutProtocol.toLowerCase().replace(/\.$/, '')
    const labels = normalized.split('.')
    const validDomain = normalized.length <= 253 && labels.length >= 2 && labels.every((label) =>
      label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    ) && labels[labels.length - 1].length >= 2
    if (!validDomain) return invalid(normalized, 'Enter a valid domain name without a path, port, or protocol.')
    return valid(normalized)
  }

  if (type === 'url') {
    if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
      return invalid(value, 'Use an HTTP or HTTPS URL.')
    }

    const hasProtocol = /^https?:\/\//i.test(value)
    const normalized = hasProtocol ? value : `https://${value.replace(/^\/\//, '')}`
    try {
      const parsed = new URL(normalized)
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
        return invalid(normalized, 'Enter a valid HTTP or HTTPS URL without embedded credentials.')
      }
      return valid(parsed.toString(), hasProtocol ? undefined : 'No protocol was provided; https:// was added.', false)
    } catch {
      return invalid(normalized, 'Enter a valid HTTP or HTTPS URL.')
    }
  }

  if (type === 'hash_md5') {
    return /^[\da-f]{32}$/i.test(value)
      ? valid(value.toLowerCase())
      : invalid(value, 'MD5 hashes must contain exactly 32 hexadecimal characters.')
  }

  return /^[\da-f]{64}$/i.test(value)
    ? valid(value.toLowerCase())
    : invalid(value, 'SHA-256 hashes must contain exactly 64 hexadecimal characters.')
}
