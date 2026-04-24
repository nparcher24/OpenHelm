/**
 * UpdateManager — Settings panel for checking and applying software updates.
 * Uses GitHub Releases API via backend, with WebSocket progress tracking.
 */
import { API_BASE } from '../utils/apiConfig.js'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useJobProgress } from '../hooks/useJobProgress.js'
import {
  checkForUpdate,
  applyUpdate,
  getUpdateJobStatus
} from '../services/updateService.js'
import { Glass, Badge, Pill } from '../ui/primitives'

/* ---- Local helpers ---- */

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 10,
    }}>
      {children}
    </div>
  )
}

function ActionBtn({ onClick, disabled, children, tone = 'primary' }) {
  const isPrimary = tone === 'primary'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '12px 20px', borderRadius: 10, border: 0,
        background: isPrimary ? 'var(--signal)' : 'var(--fill-1)',
        color: isPrimary ? '#fff' : 'var(--fg1)',
        fontSize: 14, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        minHeight: 44, touchAction: 'manipulation',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 150ms',
      }}
    >
      {children}
    </button>
  )
}

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
        const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) })
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

  /* --- Restarting state --- */
  if (restarting) {
    return (
      <Glass radius={14} style={{ padding: 32 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 14, height: 14, borderRadius: 999,
            background: 'var(--signal)', animation: 'pulse 1.5s ease-in-out infinite',
          }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg1)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Restarting
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg3)', textAlign: 'center', lineHeight: 1.6 }}>
            OpenHelm is restarting with the new version.<br />
            This page will reload automatically.
          </div>
        </div>
      </Glass>
    )
  }

  /* --- Updating state (progress bar) --- */
  if (jobId) {
    return (
      <Glass radius={14} style={{ padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg1)', marginBottom: 20 }}>
          Updating to {updateInfo?.latestVersion || '...'}
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%', height: 6, background: 'var(--fill-2)', borderRadius: 999, marginBottom: 10, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 999,
            background: 'var(--signal)',
            width: `${Math.max(progress, 2)}%`,
            transition: 'width 500ms ease',
          }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--fg3)', fontFamily: 'var(--font-mono, monospace)' }}>
            {jobMessage || 'Starting...'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--fg1)', fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>
            {progress}%
          </span>
        </div>

        <div style={{ fontSize: 12, color: 'var(--fg3)' }}>
          Do not power off the device during update.
        </div>
      </Glass>
    )
  }

  /* --- Main view --- */
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Current version + check status */}
      <Glass radius={14} style={{ padding: 24 }}>
        <SectionLabel>Current Version</SectionLabel>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg1)', fontFamily: 'var(--font-mono, monospace)', marginBottom: 4 }}>
          v{updateInfo?.currentVersion || '...'}
        </div>
        {updateInfo && !updateInfo.offline && (
          <div style={{ fontSize: 12, color: 'var(--fg3)' }}>
            Last checked: {formatTimeAgo(new Date().toISOString())}
          </div>
        )}
      </Glass>

      {/* Offline notice */}
      {updateInfo?.offline && (
        <Glass radius={14} style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--fg3)' }}>
            <Badge tone="neutral">Offline</Badge>
            No internet connection. Connect to check for updates.
          </div>
        </Glass>
      )}

      {/* Check error */}
      {checkError && (
        <Glass radius={14} style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: '#FF6A45', fontFamily: 'var(--font-mono, monospace)' }}>{checkError}</div>
        </Glass>
      )}

      {/* Update available */}
      {updateInfo?.available && !showConfirm && (
        <Glass radius={14} style={{ padding: 24 }}>
          <SectionLabel>Update Available</SectionLabel>
          <div style={{ fontSize: 14, fontFamily: 'var(--font-mono, monospace)', marginBottom: 12 }}>
            <span style={{ color: 'var(--fg3)' }}>v{updateInfo.currentVersion}</span>
            <span style={{ color: 'var(--fg2)', margin: '0 8px' }}>→</span>
            <span style={{ color: 'var(--fg1)', fontWeight: 700 }}>v{updateInfo.latestVersion}</span>
          </div>
          {updateInfo.publishedAt && (
            <div style={{ fontSize: 12, color: 'var(--fg3)', marginBottom: 12 }}>
              Released: {formatDate(updateInfo.publishedAt)}
            </div>
          )}
          {updateInfo.releaseNotes && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg3)', marginBottom: 8 }}>
                Release Notes
              </div>
              <div style={{
                fontSize: 12, color: 'var(--fg2)', fontFamily: 'var(--font-mono, monospace)',
                whiteSpace: 'pre-wrap', background: 'var(--fill-1)', padding: 12, borderRadius: 8,
                maxHeight: 180, overflowY: 'auto', lineHeight: 1.6,
              }}>
                {updateInfo.releaseNotes}
              </div>
            </div>
          )}
          <ActionBtn onClick={() => setShowConfirm(true)} tone="primary">Update Now</ActionBtn>
        </Glass>
      )}

      {/* Up to date */}
      {updateInfo && !updateInfo.available && !updateInfo.offline && (
        <Glass radius={14} style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge tone="safe" dot>Up to date</Badge>
            <span style={{ fontSize: 13, color: 'var(--fg2)' }}>You're on the latest version.</span>
          </div>
        </Glass>
      )}

      {/* Confirmation dialog */}
      {showConfirm && (
        <Glass radius={14} style={{ padding: 24 }}>
          <SectionLabel>Confirm Update</SectionLabel>
          <div style={{ fontSize: 13, color: 'var(--fg2)', marginBottom: 16, lineHeight: 1.6 }}>
            OpenHelm will restart during the update. Navigation will be unavailable for approximately 2–5 minutes.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <ActionBtn onClick={handleApply} tone="primary">Confirm Update</ActionBtn>
            <ActionBtn onClick={() => setShowConfirm(false)} tone="secondary">Cancel</ActionBtn>
          </div>
        </Glass>
      )}

      {/* Apply error / rollback notice */}
      {applyError && (
        <Glass radius={14} style={{ padding: 24 }}>
          <SectionLabel>Update Failed</SectionLabel>
          <div style={{ fontSize: 12, color: '#FF6A45', fontFamily: 'var(--font-mono, monospace)', marginBottom: 16 }}>
            {applyError}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <ActionBtn onClick={() => { setApplyError(null); setShowConfirm(true) }} tone="primary">Try Again</ActionBtn>
            <ActionBtn onClick={() => setApplyError(null)} tone="secondary">Dismiss</ActionBtn>
          </div>
        </Glass>
      )}

      {/* Check for updates button */}
      {!showConfirm && (
        <Pill
          onClick={handleCheck}
          active={false}
          style={{ alignSelf: 'flex-start', opacity: checking ? 0.5 : 1, pointerEvents: checking ? 'none' : 'auto', minWidth: 180 }}
        >
          {checking ? 'Checking...' : 'Check for Updates'}
        </Pill>
      )}
    </div>
  )
}

export default UpdateManager
