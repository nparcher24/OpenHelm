/**
 * UpdateManager — Settings panel for checking and applying software updates.
 * Uses GitHub Releases API via backend, with WebSocket progress tracking.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useJobProgress } from '../hooks/useJobProgress.js'
import {
  checkForUpdate,
  applyUpdate,
  getUpdateJobStatus
} from '../services/updateService.js'

function UpdateManager() {
  // Update check state
  const [checking, setChecking] = useState(false)
  const [updateInfo, setUpdateInfo] = useState(null)
  const [checkError, setCheckError] = useState(null)

  // Update apply state
  const [jobId, setJobId] = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [applyError, setApplyError] = useState(null)

  // Restart detection state
  const [restarting, setRestarting] = useState(false)
  const reconnectRef = useRef(null)

  // Job progress via WebSocket (reuses existing hook)
  const {
    progress,
    status: jobStatus,
    message: jobMessage,
    connected: wsConnected,
    isComplete,
    isError
  } = useJobProgress(jobId, !!jobId, getUpdateJobStatus)

  // Detect when the server goes down during update (expected restart)
  useEffect(() => {
    if (!jobId) return

    // If we had a connection and lost it while updating, the server is restarting
    if (jobStatus === 'running' && !wsConnected && progress >= 85) {
      setRestarting(true)
    }
  }, [jobId, jobStatus, wsConnected, progress])

  // When restarting, poll /health until the server comes back
  useEffect(() => {
    if (!restarting) return

    const pollHealth = async () => {
      try {
        const res = await fetch('http://localhost:3002/health', { signal: AbortSignal.timeout(3000) })
        if (res.ok) {
          // Server is back — reload to pick up new frontend build
          clearInterval(reconnectRef.current)
          reconnectRef.current = null
          window.location.reload()
        }
      } catch {
        // Still down, keep polling
      }
    }

    reconnectRef.current = setInterval(pollHealth, 2000)
    return () => {
      if (reconnectRef.current) {
        clearInterval(reconnectRef.current)
        reconnectRef.current = null
      }
    }
  }, [restarting])

  // Handle completed/failed jobs
  useEffect(() => {
    if (!jobId) return

    if (isError) {
      setApplyError(jobMessage || 'Update failed')
      setJobId(null)
    } else if (isComplete && !restarting) {
      // Update completed without needing restart detection
      // (Shouldn't normally happen — restart should trigger reconnect flow)
      setJobId(null)
    }
  }, [jobId, isError, isComplete, restarting, jobMessage])

  // Check for updates on mount
  useEffect(() => {
    handleCheck()
  }, [])

  const handleCheck = useCallback(async () => {
    setChecking(true)
    setCheckError(null)
    try {
      const result = await checkForUpdate()
      setUpdateInfo(result)
    } catch (err) {
      setCheckError(err.message)
    }
    setChecking(false)
  }, [])

  const handleApply = useCallback(async () => {
    if (!updateInfo?.latestTag) return
    setShowConfirm(false)
    setApplyError(null)

    try {
      const result = await applyUpdate(updateInfo.latestTag)
      setJobId(result.jobId)
    } catch (err) {
      setApplyError(err.message)
    }
  }, [updateInfo])

  const formatTimeAgo = (isoString) => {
    if (!isoString) return 'Never'
    const diff = Date.now() - new Date(isoString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const formatDate = (isoString) => {
    if (!isoString) return ''
    return new Date(isoString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  }

  // --- Restarting state ---
  if (restarting) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold text-terminal-green text-glow mb-6 uppercase tracking-wider">Software Updates</h2>
        <div className="bg-terminal-surface p-6 rounded-lg border border-terminal-green/30">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-4 h-4 bg-terminal-green rounded-full animate-pulse-glow"></div>
            <h3 className="text-lg font-bold text-terminal-green uppercase tracking-wide">Restarting</h3>
            <p className="text-terminal-green-dim text-sm text-center">
              OpenHelm is restarting with the new version.<br />
              This page will reload automatically.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // --- Updating state (progress bar) ---
  if (jobId) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold text-terminal-green text-glow mb-6 uppercase tracking-wider">Software Updates</h2>
        <div className="bg-terminal-surface p-6 rounded-lg border border-terminal-green/30">
          <h3 className="text-lg font-bold text-terminal-green uppercase tracking-wide mb-4">
            Updating to {updateInfo?.latestVersion || '...'}
          </h3>

          {/* Progress bar */}
          <div className="w-full bg-terminal-border rounded-full h-3 mb-3">
            <div
              className="bg-terminal-green h-3 rounded-full transition-all duration-500 shadow-glow-green-sm"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>

          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-terminal-green-dim font-mono">{jobMessage || 'Starting...'}</span>
            <span className="text-sm text-terminal-green font-mono">{progress}%</span>
          </div>

          <div className="flex items-center space-x-2 text-amber-400 text-sm">
            <span className="font-mono">!</span>
            <span>Do not power off the device during update.</span>
          </div>
        </div>
      </div>
    )
  }

  // --- Main view ---
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-terminal-green text-glow mb-6 uppercase tracking-wider">Software Updates</h2>
      <div className="space-y-4">

        {/* Current version + check status */}
        <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
          <h3 className="font-semibold text-terminal-green mb-3 uppercase tracking-wide">Current Version</h3>
          <div className="space-y-1 text-sm font-mono">
            <div className="text-terminal-green">
              v{updateInfo?.currentVersion || '...'}
            </div>
            {updateInfo && !updateInfo.offline && (
              <div className="text-terminal-green-dim">
                Last checked: {updateInfo ? formatTimeAgo(new Date().toISOString()) : 'Never'}
              </div>
            )}
          </div>
        </div>

        {/* Offline notice */}
        {updateInfo?.offline && (
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="flex items-center space-x-2 text-terminal-green-dim text-sm">
              <span className="font-mono">--</span>
              <span>No internet connection. Connect to check for updates.</span>
            </div>
          </div>
        )}

        {/* Check error */}
        {checkError && (
          <div className="bg-terminal-surface p-4 rounded-lg border border-red-500/30">
            <p className="text-red-400 text-sm font-mono">{checkError}</p>
          </div>
        )}

        {/* Update available */}
        {updateInfo?.available && !showConfirm && (
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-green/50">
            <h3 className="font-semibold text-terminal-green mb-3 uppercase tracking-wide">Update Available</h3>
            <div className="space-y-2 mb-4">
              <div className="text-sm font-mono">
                <span className="text-terminal-green-dim">v{updateInfo.currentVersion}</span>
                <span className="text-terminal-green mx-2">-&gt;</span>
                <span className="text-terminal-green font-bold">v{updateInfo.latestVersion}</span>
              </div>
              {updateInfo.publishedAt && (
                <div className="text-sm text-terminal-green-dim font-mono">
                  Released: {formatDate(updateInfo.publishedAt)}
                </div>
              )}
            </div>

            {/* Release notes */}
            {updateInfo.releaseNotes && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-terminal-green mb-2 uppercase tracking-wide">Release Notes</h4>
                <div className="text-sm text-terminal-green-dim font-mono whitespace-pre-wrap bg-terminal-bg p-3 rounded border border-terminal-border max-h-48 overflow-y-auto">
                  {updateInfo.releaseNotes}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowConfirm(true)}
              className="px-6 py-3 bg-terminal-green/20 hover:bg-terminal-green/40 text-terminal-green font-bold rounded-lg uppercase tracking-wide border border-terminal-green/30 hover:border-terminal-green/60 transition-colors touch-manipulation min-h-[44px] shadow-glow-green-sm"
            >
              Update Now
            </button>
          </div>
        )}

        {/* Up to date */}
        {updateInfo && !updateInfo.available && !updateInfo.offline && (
          <div className="bg-terminal-surface p-4 rounded-lg border border-terminal-border">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-terminal-green rounded-full shadow-glow-green-sm"></div>
              <span className="text-terminal-green text-sm">You're on the latest version.</span>
            </div>
          </div>
        )}

        {/* Confirmation dialog */}
        {showConfirm && (
          <div className="bg-terminal-surface p-4 rounded-lg border border-amber-500/30">
            <h3 className="font-semibold text-terminal-green mb-3 uppercase tracking-wide">Confirm Update</h3>
            <div className="space-y-3">
              <p className="text-amber-400 text-sm">
                OpenHelm will restart during the update. Navigation will be unavailable for approximately 2-5 minutes.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={handleApply}
                  className="px-6 py-3 bg-terminal-green/30 hover:bg-terminal-green/50 text-terminal-green font-bold rounded-lg uppercase tracking-wide border border-terminal-green/50 hover:border-terminal-green transition-colors touch-manipulation min-h-[44px]"
                >
                  Confirm Update
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-6 py-3 bg-terminal-surface hover:bg-terminal-green/10 text-terminal-green font-bold rounded-lg uppercase tracking-wide border border-terminal-border transition-colors touch-manipulation min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Apply error / rollback notice */}
        {applyError && (
          <div className="bg-terminal-surface p-4 rounded-lg border border-red-500/30">
            <h3 className="font-semibold text-red-400 mb-2 uppercase tracking-wide">Update Failed</h3>
            <p className="text-red-400 text-sm font-mono mb-3">{applyError}</p>
            <div className="flex space-x-3">
              <button
                onClick={() => { setApplyError(null); setShowConfirm(true) }}
                className="px-6 py-3 bg-terminal-green/20 hover:bg-terminal-green/40 text-terminal-green font-bold rounded-lg uppercase tracking-wide border border-terminal-border hover:border-terminal-green transition-colors touch-manipulation min-h-[44px]"
              >
                Try Again
              </button>
              <button
                onClick={() => setApplyError(null)}
                className="px-6 py-3 bg-terminal-surface hover:bg-terminal-green/10 text-terminal-green-dim font-bold rounded-lg uppercase tracking-wide border border-terminal-border transition-colors touch-manipulation min-h-[44px]"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Check for updates button */}
        {!showConfirm && (
          <button
            onClick={handleCheck}
            disabled={checking}
            className={`px-6 py-3 bg-terminal-surface hover:bg-terminal-green/10 text-terminal-green font-bold rounded-lg uppercase tracking-wide border border-terminal-border hover:border-terminal-green transition-colors touch-manipulation min-h-[44px] ${
              checking ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {checking ? 'Checking...' : 'Check for Updates'}
          </button>
        )}
      </div>
    </div>
  )
}

export default UpdateManager
