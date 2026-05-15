import express from 'express'
import {
  getStatus,
  scanAndList,
  getSaved,
  connect,
  disconnect,
  forget,
} from '../services/wifiService.js'

const router = express.Router()

router.get('/status', async (req, res, next) => {
  try {
    res.json(await getStatus())
  } catch (err) { next(err) }
})

router.get('/networks', async (req, res, next) => {
  try {
    // ?scan=false skips the rescan and returns cached scan results — useful
    // for fast initial page loads. Default is to rescan.
    const force = req.query.scan !== 'false'
    res.json({ networks: await scanAndList({ force }) })
  } catch (err) { next(err) }
})

router.post('/scan', async (req, res, next) => {
  try {
    res.json({ networks: await scanAndList({ force: true }) })
  } catch (err) { next(err) }
})

router.get('/saved', async (req, res, next) => {
  try {
    res.json({ saved: await getSaved() })
  } catch (err) { next(err) }
})

router.post('/connect', async (req, res, next) => {
  try {
    const { ssid, password } = req.body || {}
    if (!ssid) return res.status(400).json({ error: 'ssid is required' })
    res.json(await connect({ ssid, password }))
  } catch (err) {
    // nmcli surfaces useful messages on stderr (e.g. "Secrets were required").
    const msg = err.stderr || err.message || 'connect failed'
    res.status(400).json({ error: String(msg).trim() })
  }
})

router.post('/disconnect', async (req, res, next) => {
  try {
    res.json(await disconnect())
  } catch (err) {
    const msg = err.stderr || err.message || 'disconnect failed'
    res.status(400).json({ error: String(msg).trim() })
  }
})

router.delete('/saved/:ssid', async (req, res, next) => {
  try {
    res.json(await forget({ ssid: req.params.ssid }))
  } catch (err) {
    res.status(400).json({ error: err.message || 'forget failed' })
  }
})

export default router
