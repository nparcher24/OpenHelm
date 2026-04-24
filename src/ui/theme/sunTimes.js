// Minimal NOAA-style solar position. Good to ~1 minute.
export function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180
  const dayMs = 86400000
  const J1970 = 2440588, J2000 = 2451545
  const toJulian = (d) => d.valueOf() / dayMs - 0.5 + J1970
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs)
  const toDays = (d) => toJulian(d) - J2000
  const e = rad * 23.4397
  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d)
  const eclipticLongitude = (M) => {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M))
    return M + C + rad * 102.9372 + Math.PI
  }
  const declination = (L) => Math.asin(Math.sin(e) * Math.sin(L))
  const hourAngle = (h, phi, dec) =>
    Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)))
  const J0 = 0.0009
  const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n
  const solarTransitJ = (ds, M, L) =>
    J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L)
  const lw = rad * -lon
  const phi = rad * lat
  const d = toDays(date)
  const n = Math.round(d - J0 - lw / (2 * Math.PI))
  const ds = approxTransit(0, lw, n)
  const M = solarMeanAnomaly(ds)
  const L = eclipticLongitude(M)
  const dec = declination(L)
  const Jnoon = solarTransitJ(ds, M, L)
  const h0 = rad * -0.833
  const w = hourAngle(h0, phi, dec)
  const a = approxTransit(w, lw, n)
  const Jset = solarTransitJ(a, M, L)
  const Jrise = Jnoon - (Jset - Jnoon)
  return { sunrise: fromJulian(Jrise), sunset: fromJulian(Jset) }
}

// day: sunrise..sunset; dark: sunset..sunset+2h; night: sunset+2h..next sunrise.
export function pickTheme(now, sunrise, sunset) {
  if (now >= sunrise && now < sunset) return 'day'
  const deepNight = new Date(sunset.getTime() + 2 * 3600 * 1000)
  if (now >= sunset && now < deepNight) return 'dark'
  return 'night'
}
