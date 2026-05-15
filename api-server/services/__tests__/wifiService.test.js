// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  parseWifiList,
  dedupeNetworks,
  parseSavedConnections,
  parseDeviceShow,
  parseSsidFromConnection,
} from '../wifiService.js'

// Real captured output from `nmcli -t -f IN-USE,BSSID,SSID,MODE,CHAN,FREQ,RATE,SIGNAL,SECURITY device wifi list`
// on this box (May 2026). The colons inside BSSIDs are escaped as `\:` by nmcli's
// terse mode — the parser must honor that.
const WIFI_LIST_FIXTURE = [
  ' :E2\\:48\\:24\\:4A\\:80\\:9A:HIC-GARMIN:Infra:6:2437:65 Mbit/s:100:WPA2',
  ' :9C\\:4F\\:5F\\:85\\:11\\:D3:324Discovery:Infra:1:2412:130 Mbit/s:55:WPA2',
  ' :00\\:AB\\:48\\:A7\\:4E\\:C3:12c9151:Mesh:6:2437:270 Mbit/s:52:WPA3',
  '*:00\\:AB\\:48\\:A7\\:4E\\:C5:Parrishes:Infra:6:2437:130 Mbit/s:51:WPA2',
  ' :9C\\:4F\\:5F\\:84\\:E9\\:A6:324Discovery:Infra:6:2437:130 Mbit/s:45:WPA2',
  ' :9C\\:4F\\:5F\\:85\\:11\\:CF:324Discovery:Infra:149:5745:270 Mbit/s:44:WPA2',
  ' :00\\:AB\\:48\\:A9\\:2C\\:C7::Infra:6:2437:130 Mbit/s:42:',
].join('\n') + '\n'

describe('parseWifiList', () => {
  it('parses the IN-USE marker, SSID, signal, and security', () => {
    const out = parseWifiList(WIFI_LIST_FIXTURE)
    expect(out).toHaveLength(7)
    const parrishes = out.find(n => n.ssid === 'Parrishes')
    expect(parrishes.inUse).toBe(true)
    expect(parrishes.signal).toBe(51)
    expect(parrishes.security).toBe('WPA2')
    expect(parrishes.channel).toBe(6)
    expect(parrishes.freqMhz).toBe(2437)
  })

  it('unescapes colons inside BSSIDs', () => {
    const out = parseWifiList(WIFI_LIST_FIXTURE)
    const garmin = out.find(n => n.ssid === 'HIC-GARMIN')
    expect(garmin.bssid).toBe('E2:48:24:4A:80:9A')
  })

  it('treats empty SSID as null (hidden network) and empty security as "open"', () => {
    const out = parseWifiList(WIFI_LIST_FIXTURE)
    const hidden = out.find(n => n.bssid === '00:AB:48:A9:2C:C7')
    expect(hidden.ssid).toBeNull()
    expect(hidden.security).toBe('open')
  })

  it('skips blank lines', () => {
    const out = parseWifiList('\n\n' + WIFI_LIST_FIXTURE + '\n')
    expect(out).toHaveLength(7)
  })
})

describe('dedupeNetworks', () => {
  it('collapses duplicate SSIDs to the strongest signal', () => {
    const all = parseWifiList(WIFI_LIST_FIXTURE)
    const dedup = dedupeNetworks(all)
    const ssids = dedup.map(n => n.ssid)
    // 324Discovery appeared 3 times with signals 55/45/44 — should keep 55.
    const triple = dedup.find(n => n.ssid === '324Discovery')
    expect(triple.signal).toBe(55)
    // Hidden network (null SSID) is dropped.
    expect(ssids).not.toContain(null)
    // Result is sorted strongest-first.
    for (let i = 1; i < dedup.length; i++) {
      expect(dedup[i - 1].signal).toBeGreaterThanOrEqual(dedup[i].signal)
    }
  })

  it('preserves the inUse flag even if a different BSSID has stronger signal', () => {
    // Synthetic: same SSID, the in-use AP is weaker.
    const networks = [
      { ssid: 'X', bssid: 'aa', signal: 40, inUse: true, security: 'WPA2' },
      { ssid: 'X', bssid: 'bb', signal: 80, inUse: false, security: 'WPA2' },
    ]
    const out = dedupeNetworks(networks)
    expect(out).toHaveLength(1)
    expect(out[0].signal).toBe(80)
    expect(out[0].inUse).toBe(true)
  })
})

describe('parseSavedConnections', () => {
  it('keeps only 802-11-wireless profiles', () => {
    const fixture = [
      'netplan-wlp2s0-Parrishes:802-11-wireless:yes:8a61316d-db96-3a74-a379-bcfb0901d7e1',
      'netplan-wlp2s0-HIC-STARLINK:802-11-wireless:yes:c7a944d1-0271-38c4-8d45-2f35296e54a3',
      'netplan-wlp2s0-iPhone:802-11-wireless:yes:6b998035-1d0a-3e0f-883c-4e7b9685848d',
      'Wired connection 1:802-3-ethernet:yes:9e224f84-dafb-3b53-87f0-ab526990c09e',
    ].join('\n')
    const out = parseSavedConnections(fixture)
    expect(out).toHaveLength(3)
    expect(out.every(c => c.name.startsWith('netplan-wlp2s0-'))).toBe(true)
    expect(out[0].autoconnect).toBe(true)
  })
})

describe('parseDeviceShow', () => {
  it('extracts connection state, IP, gateway, DNS, MAC', () => {
    const fixture = [
      'GENERAL.HWADDR:84\\:9E\\:56\\:C5\\:DB\\:CF',
      'GENERAL.STATE:100 (connected)',
      'GENERAL.CONNECTION:netplan-wlp2s0-Parrishes',
      'IP4.ADDRESS[1]:192.168.4.111/22',
      'IP4.ADDRESS[2]:192.168.4.115/22',
      'IP4.GATEWAY:192.168.4.1',
      'IP4.DNS[1]:8.8.8.8',
      'IP4.DNS[2]:8.8.4.4',
    ].join('\n')
    const dev = parseDeviceShow(fixture)
    expect(dev.connection).toBe('netplan-wlp2s0-Parrishes')
    expect(dev.stateCode).toBe(100)
    expect(dev.state).toBe('connected')
    expect(dev.addresses).toEqual(['192.168.4.111/22', '192.168.4.115/22'])
    expect(dev.gateway).toBe('192.168.4.1')
    expect(dev.dns).toEqual(['8.8.8.8', '8.8.4.4'])
    expect(dev.mac).toBe('84:9E:56:C5:DB:CF')
  })

  it('handles "--" gateway (disconnected)', () => {
    const fixture = [
      'GENERAL.CONNECTION:--',
      'GENERAL.STATE:30 (disconnected)',
      'IP4.GATEWAY:--',
    ].join('\n')
    const dev = parseDeviceShow(fixture)
    expect(dev.connection).toBeNull()
    expect(dev.gateway).toBeNull()
    expect(dev.stateCode).toBe(30)
    expect(dev.state).toBe('disconnected')
  })
})

describe('parseSsidFromConnection', () => {
  it('returns the configured SSID for a profile', () => {
    const fixture = '802-11-wireless.ssid:Parrishes\nconnection.id:netplan-wlp2s0-Parrishes\n'
    expect(parseSsidFromConnection(fixture)).toBe('Parrishes')
  })

  it('returns null when no SSID is present', () => {
    expect(parseSsidFromConnection('connection.id:Wired connection 1\n')).toBeNull()
  })

  it('unescapes colons in SSID values', () => {
    const fixture = '802-11-wireless.ssid:My\\:Wifi\n'
    expect(parseSsidFromConnection(fixture)).toBe('My:Wifi')
  })
})
