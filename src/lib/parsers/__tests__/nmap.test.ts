import { describe, expect, it } from 'vitest'
import { parseNmapXML } from '@/lib/parsers/nmap'

describe('parseNmapXML', () => {
  it('parses host, port, protocol, service, and OS matches', () => {
    const xml = '<nmaprun><host><status state="up"/><address addr="192.0.2.10" addrtype="ipv4"/><ports><port protocol="tcp" portid="443"><state state="open"/><service name="https" product="nginx" version="1.25"/></port></ports><os><osmatch name="Linux 5.x" accuracy="98"><osclass vendor="Linux" osfamily="Linux" osgen="5"/></osmatch></os></host></nmaprun>'
    const result = parseNmapXML(xml)
    expect(result.totalHosts).toBe(1)
    expect(result.findings).toHaveLength(2)
    expect(result.findings[0]).toMatchObject({ host: '192.0.2.10', port: 443, severity: 'info', title: 'Nmap port 443/tcp: https (open)' })
    expect(result.findings[1].title).toBe('Operating system: Linux 5.x')
  })

  it('rejects an empty file', () => {
    expect(() => parseNmapXML('  ')).toThrow('Nmap XML file is empty.')
  })

  it('accepts an empty host list', () => {
    expect(parseNmapXML('<nmaprun></nmaprun>')).toMatchObject({ findings: [], totalHosts: 0, invalidHostCount: 0 })
  })

  it('returns no findings for hosts without ports or OS matches', () => {
    expect(parseNmapXML('<nmaprun><host><address addr="192.0.2.15" addrtype="ipv4"/></host></nmaprun>').findings).toHaveLength(0)
  })

  it('rejects malformed XML and non-Nmap XML', () => {
    expect(() => parseNmapXML('<nmaprun><host>')).toThrow('Unable to parse Nmap XML.')
    expect(() => parseNmapXML('<root/>')).toThrow('This XML file is not an Nmap scan result.')
  })
})
