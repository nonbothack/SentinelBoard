import { describe, expect, it } from 'vitest'
import { validateIOC } from '@/lib/validators/ioc'

describe('validateIOC', () => {
  it('accepts and preserves a valid public IP', () => {
    expect(validateIOC('ip', '8.8.8.8')).toMatchObject({ valid: true, normalizedValue: '8.8.8.8', requiresOverride: false })
  })

  it('rejects an invalid IP', () => {
    expect(validateIOC('ip', '256.0.2.1').valid).toBe(false)
  })

  it('flags private and reserved IPs for analyst confirmation', () => {
    expect(validateIOC('ip', '192.168.1.10')).toMatchObject({ valid: true, requiresOverride: true })
  })

  it('accepts domains with or without an HTTP protocol and normalizes case', () => {
    expect(validateIOC('domain', 'Example.COM')).toMatchObject({ valid: true, normalizedValue: 'example.com' })
    expect(validateIOC('domain', 'https://Example.COM')).toMatchObject({ valid: true, normalizedValue: 'example.com' })
  })

  it('accepts MD5 and SHA-256 hashes and rejects short or non-hexadecimal values', () => {
    expect(validateIOC('hash_md5', 'D41D8CD98F00B204E9800998ECF8427E')).toMatchObject({ valid: true, normalizedValue: 'd41d8cd98f00b204e9800998ecf8427e' })
    expect(validateIOC('hash_md5', 'a'.repeat(31)).valid).toBe(false)
    expect(validateIOC('hash_sha256', 'A'.repeat(64))).toMatchObject({ valid: true, normalizedValue: 'a'.repeat(64) })
    expect(validateIOC('hash_sha256', 'g'.repeat(64)).valid).toBe(false)
  })

  it('rejects an empty value', () => {
    expect(validateIOC('url', '   ')).toMatchObject({ valid: false, error: 'Enter an IOC value.' })
  })
})
