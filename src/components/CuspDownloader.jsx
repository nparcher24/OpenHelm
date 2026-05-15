import { useState, useEffect } from 'react';
import { useJobProgress } from '../hooks/useJobProgress';
import { Glass } from '../ui/primitives';
import {
  getCUSPStatus,
  getStorageInfo,
  startCUSPDownload,
  getJobStatus,
  deleteCUSPData
} from '../services/cuspDownloadService';

function CuspDownloader() {
  const [jobId, setJobId] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const [cuspExists, setCuspExists] = useState(false);
  const [cuspMetadata, setCuspMetadata] = useState(null);
  const [storageInfo, setStorageInfo] = useState(null);
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Use job progress hook for real-time updates
  const jobProgress = useJobProgress(jobId, !!jobId, getJobStatus);

  // Load CUSP status and storage info on mount
  useEffect(() => {
    loadStatus();
    loadStorageInfo();
  }, []);

  // Reload status when job completes
  useEffect(() => {
    if (jobProgress.isComplete && isStarted) {
      loadStatus();
      loadStorageInfo();
      if (jobProgress.status === 'completed') {
        setIsStarted(false);
        setJobId(null);
      }
    }
  }, [jobProgress.isComplete, jobProgress.status, isStarted]);

  async function loadStatus() {
    try {
      const status = await getCUSPStatus();
      setCuspExists(status.exists);
      setCuspMetadata(status);
    } catch (err) {
      console.error('Failed to load CUSP status:', err);
      setError(err.message);
    }
  }

  async function loadStorageInfo() {
    try {
      const info = await getStorageInfo();
      setStorageInfo(info);
    } catch (err) {
      console.error('Failed to load storage info:', err);
    }
  }

  async function handleStartDownload() {
    try {
      setError(null);
      const result = await startCUSPDownload();
      setJobId(result.jobId);
      setIsStarted(true);
    } catch (err) {
      console.error('Failed to start download:', err);
      setError(err.message);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete CUSP coastline data? This will free up disk space but require re-downloading.')) {
      return;
    }

    try {
      setIsDeleting(true);
      setError(null);
      await deleteCUSPData();
      await loadStatus();
      await loadStorageInfo();
      setCuspExists(false);
    } catch (err) {
      console.error('Failed to delete CUSP data:', err);
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  // Calculate storage bar color
  const getStorageBarColor = () => {
    if (!storageInfo) return 'var(--signal)';
    const percent = storageInfo.disk.usedPercent;
    if (percent >= 90) return 'var(--tint-red)';
    if (percent >= 75) return 'var(--tint-yellow)';
    return 'var(--signal)';
  };

  return (
    <div className="min-h-full p-6 space-y-6" style={{ color: 'var(--fg1)' }}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--fg1)' }}>
          CUSP Coastline
        </h1>
        <p style={{ color: 'var(--fg2)' }}>
          NOAA Continually Updated Shoreline Product - Continental US
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-lg p-4" style={{ background: 'rgba(229,72,72,0.1)', border: '0.5px solid rgba(229,72,72,0.5)' }}>
          <p className="font-mono text-sm" style={{ color: 'var(--tint-red)' }}>{error}</p>
        </div>
      )}

      {/* Storage Info Panel */}
      {storageInfo && (
        <Glass pad={16} radius={12}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--fg1)' }}>Storage Info</h2>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex justify-between">
              <span style={{ color: 'var(--fg2)' }}>Total Space:</span>
              <span style={{ color: 'var(--fg1)' }}>{storageInfo.disk.totalGB} GB</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--fg2)' }}>Used:</span>
              <span style={{ color: 'var(--fg1)' }}>{storageInfo.disk.usedGB} GB ({storageInfo.disk.usedPercent}%)</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--fg2)' }}>Free:</span>
              <span style={{ color: 'var(--fg1)' }}>{storageInfo.disk.freeGB} GB</span>
            </div>
          </div>

          {/* Storage bar */}
          <div className="mt-3 w-full rounded-full overflow-hidden" style={{ height: 8, background: 'var(--fill-2)' }}>
            <div
              className="h-full transition-all"
              style={{ width: `${storageInfo.disk.usedPercent}%`, borderRadius: 999, background: getStorageBarColor(), boxShadow: '0 0 8px var(--signal-glow)' }}
            />
          </div>

          {storageInfo.disk.usedPercent >= 75 && (
            <p className="text-xs mt-2 font-mono" style={{ color: 'var(--tint-yellow)' }}>
              Warning: Disk usage above 75%
            </p>
          )}
        </Glass>
      )}

      {/* CUSP Status - Not Downloaded */}
      {!cuspExists && !isStarted && (
        <Glass pad={24} radius={12}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--fg1)' }}>Download Coastline Data</h2>
          <p className="mb-4 text-sm" style={{ color: 'var(--fg2)' }}>
            Download NOAA CUSP coastline data for Continental US. This will provide high-contrast
            coastline rendering on the map.
          </p>
          <div className="space-y-2 mb-6 font-mono text-sm">
            {[
              ['Coverage', 'Continental US'],
              ['Estimated Size', '~10 MB'],
              ['Format', 'Vector Tiles (MBTiles)']
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between">
                <span style={{ color: 'var(--fg2)' }}>{label}:</span>
                <span style={{ color: 'var(--fg1)' }}>{value}</span>
              </div>
            ))}
          </div>
          <button
            onClick={handleStartDownload}
            className="w-full font-bold py-3 px-6 rounded-lg uppercase tracking-wider transition-all touch-manipulation"
            style={{ background: 'var(--signal)', color: '#fff' }}
          >
            Download Coastline Data
          </button>
        </Glass>
      )}

      {/* Download Progress */}
      {isStarted && jobProgress && (
        <Glass pad={24} radius={12}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--fg1)' }}>Downloading &amp; Processing</h2>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between mb-2 text-sm">
              <span style={{ color: 'var(--fg2)' }}>{jobProgress.message || 'Processing...'}</span>
              <span className="font-mono" style={{ color: 'var(--fg1)' }}>{jobProgress.progress}%</span>
            </div>
            <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: 'var(--fill-2)' }}>
              <div
                className="h-full transition-all duration-300"
                style={{ width: `${jobProgress.progress}%`, borderRadius: 999, background: 'var(--signal)', boxShadow: '0 0 8px var(--signal-glow)' }}
              />
            </div>
          </div>

          {/* Status Info */}
          <div className="font-mono text-sm space-y-1">
            <div className="flex justify-between">
              <span style={{ color: 'var(--fg2)' }}>Status:</span>
              <span className="uppercase" style={{ color: 'var(--fg1)' }}>{jobProgress.status}</span>
            </div>
            {jobProgress.estimatedTimeLeft && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--fg2)' }}>Time Remaining:</span>
                <span style={{ color: 'var(--fg1)' }}>{jobProgress.estimatedTimeLeft}</span>
              </div>
            )}
            {jobProgress.connected && (
              <p className="text-xs mt-2" style={{ color: 'var(--fg2)' }}>
                Real-time updates active
              </p>
            )}
          </div>

          {/* Error State */}
          {jobProgress.isError && (
            <div className="mt-4 p-3 rounded" style={{ background: 'rgba(229,72,72,0.1)', border: '0.5px solid rgba(229,72,72,0.5)' }}>
              <p className="font-mono text-sm" style={{ color: 'var(--tint-red)' }}>
                {jobProgress.message}
              </p>
            </div>
          )}

          {/* Completion State */}
          {jobProgress.isComplete && jobProgress.status === 'completed' && (
            <div className="mt-4 p-3 rounded" style={{ background: 'rgba(47,181,107,0.12)', border: '0.5px solid var(--signal)' }}>
              <p className="font-mono text-sm" style={{ color: 'var(--signal)' }}>
                Coastline data ready! Navigate to Topo view to see it.
              </p>
            </div>
          )}
        </Glass>
      )}

      {/* CUSP Status - Downloaded */}
      {cuspExists && !isStarted && cuspMetadata && (
        <Glass pad={24} radius={12}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--fg1)' }}>Coastline Data Installed</h2>
          <div className="space-y-2 mb-6 font-mono text-sm">
            <div className="flex justify-between">
              <span style={{ color: 'var(--fg2)' }}>Size:</span>
              <span style={{ color: 'var(--fg1)' }}>{cuspMetadata.sizeMB} MB</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--fg2)' }}>Last Modified:</span>
              <span style={{ color: 'var(--fg1)' }}>{cuspMetadata.version || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--fg2)' }}>Coverage:</span>
              <span style={{ color: 'var(--fg1)' }}>Continental US</span>
            </div>
          </div>
          <p className="mb-6 text-sm" style={{ color: 'var(--fg2)' }}>
            Coastline data is installed and ready. Go to the Topo view to see high-contrast
            coastlines on the map.
          </p>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full font-bold py-3 px-6 rounded-lg uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            style={{ background: 'rgba(229,72,72,0.14)', color: '#E54848', border: '0.5px solid rgba(229,72,72,0.4)' }}
          >
            {isDeleting ? 'Deleting...' : 'Delete Coastline Data'}
          </button>
        </Glass>
      )}

      {/* Info Panel */}
      <Glass pad={16} radius={12}>
        <h3 className="text-sm font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--fg1)' }}>About CUSP</h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--fg2)' }}>
          NOAA's Continually Updated Shoreline Product (CUSP) provides the most up-to-date
          shoreline data for the United States. This vector tile layer displays coastlines
          in high contrast for optimal visibility during marine navigation.
        </p>
      </Glass>
    </div>
  );
}

export default CuspDownloader;
