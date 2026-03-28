/**
 * Software Update Service
 * Checks GitHub Releases for new versions and orchestrates self-update process.
 */

import fs from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'

const PROJECT_ROOT = process.cwd()
const GITHUB_REPO = 'nparcher24/OpenHelm'
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const CHECK_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes

let cachedCheck = null
let lastCheckTime = 0
let activeUpdateJobId = null

/**
 * Read current version from package.json
 */
export async function getCurrentVersion() {
  const pkgPath = path.join(PROJECT_ROOT, 'package.json')
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
  return pkg.version
}

/**
 * Compare two semver strings. Returns:
 *  -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareSemver(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
}

/**
 * Check GitHub for the latest release and compare to current version.
 * Caches result for 5 minutes to avoid hitting rate limits.
 */
export async function checkForUpdate(force = false) {
  const now = Date.now()
  if (!force && cachedCheck && (now - lastCheckTime) < CHECK_COOLDOWN_MS) {
    return cachedCheck
  }

  const currentVersion = await getCurrentVersion()

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'OpenHelm-Updater'
    }
    // Private repos need a token — set GITHUB_TOKEN env var on target machines
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const response = await fetch(GITHUB_API_URL, {
      headers,
      signal: controller.signal
    })
    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}`)
    }

    const release = await response.json()
    const latestVersion = release.tag_name.replace(/^v/, '')
    const available = compareSemver(currentVersion, latestVersion) < 0

    cachedCheck = {
      available,
      currentVersion,
      latestVersion,
      latestTag: release.tag_name,
      releaseNotes: release.body || '',
      publishedAt: release.published_at,
      prerelease: release.prerelease,
      offline: false
    }
    lastCheckTime = now
    return cachedCheck
  } catch (err) {
    console.error('[Update] Failed to check GitHub:', err.message)
    return {
      available: false,
      currentVersion,
      latestVersion: null,
      latestTag: null,
      releaseNotes: null,
      publishedAt: null,
      prerelease: false,
      offline: true,
      error: err.message
    }
  }
}

/**
 * Get current update status (version + last check info)
 */
export async function getUpdateStatus() {
  const currentVersion = await getCurrentVersion()
  return {
    currentVersion,
    lastChecked: lastCheckTime ? new Date(lastCheckTime).toISOString() : null,
    activeJobId: activeUpdateJobId,
    cached: cachedCheck
  }
}

/**
 * Spawn the self-update shell script and track progress via WebSocket.
 * Returns a jobId that the frontend can subscribe to.
 */
export function startUpdate(targetTag) {
  if (activeUpdateJobId) {
    throw new Error('An update is already in progress')
  }

  const jobId = `update-${Date.now()}`
  activeUpdateJobId = jobId

  // Register in global progress tracking (same pattern as download services)
  if (!global.progressTrackers.has(jobId)) {
    global.progressTrackers.set(jobId, { progress: 0, status: 'running', clients: new Set() })
  }
  global.activeJobs.set(jobId, { startTime: Date.now(), status: 'running' })

  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'self-update.sh')

  // Spawn detached so it survives API server restart
  const child = spawn('setsid', ['bash', scriptPath, targetTag], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  console.log(`[Update] Started update job ${jobId} (PID: ${child.pid}) targeting ${targetTag}`)

  // Parse stdout for PROGRESS markers
  let stdoutBuffer = ''
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    const lines = stdoutBuffer.split('\n')
    stdoutBuffer = lines.pop() // Keep incomplete last line in buffer

    for (const line of lines) {
      console.log(`[Update] ${line}`)
      const match = line.match(/^PROGRESS (\-?\d+) (.+)$/)
      if (match) {
        const progress = parseInt(match[1])
        const message = match[2]

        if (progress < 0) {
          // Negative progress = rollback/error
          global.broadcastProgress(jobId, 0, 'failed', message)
        } else {
          global.broadcastProgress(jobId, progress, 'running', message)
        }
      }
    }
  })

  child.stderr.on('data', (chunk) => {
    console.error(`[Update] stderr: ${chunk.toString().trim()}`)
  })

  child.on('close', (code) => {
    console.log(`[Update] Script exited with code ${code}`)
    activeUpdateJobId = null

    if (code === 0) {
      global.broadcastProgress(jobId, 100, 'completed', 'Update complete')
      if (global.activeJobs.has(jobId)) {
        global.activeJobs.get(jobId).status = 'completed'
      }
    } else {
      // Script failed — it should have already sent a rollback PROGRESS message
      const failMsg = code === 1 ? 'Git operation failed'
        : code === 2 ? 'Dependency install failed'
        : code === 3 ? 'Build failed'
        : code === 4 ? 'Rolled back to previous version'
        : `Update failed (exit code ${code})`
      global.broadcastProgress(jobId, 0, 'failed', failMsg)
      if (global.activeJobs.has(jobId)) {
        global.activeJobs.get(jobId).status = 'failed'
      }
    }

    // Invalidate cached version check
    cachedCheck = null
    lastCheckTime = 0
  })

  // Don't let the child keep the parent alive (in case API server wants to exit)
  child.unref()

  return { jobId }
}

/**
 * Get status of an update job (for polling fallback)
 */
export function getUpdateJobStatus(jobId) {
  const tracker = global.progressTrackers.get(jobId)
  const job = global.activeJobs.get(jobId)

  if (!tracker && !job) {
    return { status: 'not_found', progress: 0, message: 'Job not found' }
  }

  return {
    status: tracker?.status || job?.status || 'unknown',
    progress: tracker?.progress || 0,
    message: '',
    startTime: job?.startTime
  }
}
