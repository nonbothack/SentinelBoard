import type { ParsedFinding } from '@/lib/parsers/nuclei'

interface NmapParseResult {
  findings: ParsedFinding[]
  totalHosts: number
  invalidHostCount: number
}

function attribute(element: Element | undefined, name: string) {
  return element?.getAttribute(name)?.trim() ?? ''
}

function hostLabel(host: Element) {
  const addresses = Array.from(host.getElementsByTagName('address'))
  const ipv4 = addresses.find((address) => address.getAttribute('addrtype') === 'ipv4')
  const ipv6 = addresses.find((address) => address.getAttribute('addrtype') === 'ipv6')
  const hostname = Array.from(host.getElementsByTagName('hostname')).find((element) => attribute(element, 'name'))
  return attribute(ipv4, 'addr') || attribute(ipv6, 'addr') || attribute(hostname, 'name')
}

function makeFinding(input: ParsedFinding): ParsedFinding {
  return input
}

export function parseNmapXML(content: string): NmapParseResult {
  const trimmed = content.replace(/^\uFEFF/, '').trim()
  if (!trimmed) throw new Error('Nmap XML file is empty.')
  if (/<!DOCTYPE/i.test(trimmed)) throw new Error('Nmap XML files with a document type declaration are not supported.')

  const document = new DOMParser().parseFromString(trimmed, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('Unable to parse Nmap XML. Check that the file is well formed.')
  if (document.documentElement.localName !== 'nmaprun') throw new Error('This XML file is not an Nmap scan result.')

  const hosts = Array.from(document.getElementsByTagName('host'))
  const findings: ParsedFinding[] = []
  let invalidHostCount = 0

  for (const hostElement of hosts) {
    const host = hostLabel(hostElement)
    if (!host) {
      invalidHostCount += 1
      continue
    }

    const portElements = Array.from(hostElement.getElementsByTagName('port'))
    for (const portElement of portElements) {
      const port = Number(attribute(portElement, 'portid'))
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue
      const protocol = attribute(portElement, 'protocol') || 'tcp'
      const stateElement = portElement.getElementsByTagName('state')[0]
      const serviceElement = portElement.getElementsByTagName('service')[0]
      const state = attribute(stateElement, 'state') || 'unknown'
      const service = attribute(serviceElement, 'name') || 'unknown service'
      const product = attribute(serviceElement, 'product')
      const version = attribute(serviceElement, 'version')
      const extraInfo = attribute(serviceElement, 'extrainfo')
      const serviceDetails = [product, version, extraInfo].filter(Boolean).join(' ')
      const description = [
        `Port state: ${state}`,
        serviceDetails ? `Service: ${serviceDetails}` : '',
        attribute(serviceElement, 'tunnel') ? `Tunnel: ${attribute(serviceElement, 'tunnel')}` : '',
        attribute(serviceElement, 'method') ? `Detection: ${attribute(serviceElement, 'method')}` : '',
      ].filter(Boolean).join('\n')
      const matchedAt = `${host}:${port}/${protocol}`
      findings.push(makeFinding({
        host,
        port,
        severity: 'info',
        title: `Nmap port ${port}/${protocol}: ${service} (${state})`.slice(0, 300),
        description,
        cve_ids: [],
        reference_urls: [],
        matched_at: matchedAt,
        raw_finding: {
          source: 'nmap_xml',
          host,
          port,
          protocol,
          state,
          service,
          product: product || null,
          version: version || null,
          extra_info: extraInfo || null,
        },
      }))
    }

    const osMatches = Array.from(hostElement.getElementsByTagName('osmatch'))
    for (const [index, match] of osMatches.entries()) {
      const name = attribute(match, 'name')
      if (!name) continue
      const accuracy = attribute(match, 'accuracy')
      const osClasses = Array.from(match.getElementsByTagName('osclass')).map((osClass) => [
        attribute(osClass, 'vendor'),
        attribute(osClass, 'osfamily'),
        attribute(osClass, 'osgen'),
        attribute(osClass, 'type'),
      ].filter(Boolean).join(' · ')).filter(Boolean)
      const description = [accuracy ? `Match accuracy: ${accuracy}%` : '', ...osClasses].filter(Boolean).join('\n')
      findings.push(makeFinding({
        host,
        port: null,
        severity: 'info',
        title: `Operating system: ${name}`.slice(0, 300),
        description: description || null,
        cve_ids: [],
        reference_urls: [],
        matched_at: null,
        raw_finding: {
          source: 'nmap_xml',
          host,
          os_match_index: index,
          name,
          accuracy: accuracy || null,
          classes: osClasses,
        },
      }))
    }
  }

  return { findings, totalHosts: hosts.length, invalidHostCount }
}
