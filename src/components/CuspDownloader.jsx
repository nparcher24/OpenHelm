import { useState, useEffect } from 'react';
import { useJobProgress } from '../hooks/useJobProgress';
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

  // Calculate storage warning level
  const getStorageWarningClass = () => {
    if (!storageInfo) return '';
    const percent = storageInfo.disk.usedPercent;
    if (percent >= 90) return 'bg-red-500';
    if (percent >= 75) return 'bg-yellow-500';
    return 'bg-terminal-green';
  };

  return (
    <div className="bg-terminal-bg min-h-full p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-terminal-green text-glow uppercase tracking-wider mb-2">
          [/] CUSP COASTLINE
        </h1>
        <p className="text-terminal-green opacity-80">
          NOAA Continually Updated Shoreline Product - Continental US
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-500 bg-opacity-20 border border-red-500 rounded p-4 mb-6">
          <p className="text-red-400 font-mono">[ERROR] {error}</p>
        </div>
      )}

      {/* Storage Info Panel */}
      {storageInfo && (
        <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4 mb-6">
          <h2 className="text-lg font-bold text-terminal-green mb-3">[*] STORAGE INFO</h2>
          <div className="space-y-2 font-mono text-sm">
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Total Space:</span>
              <span className="text-terminal-green">{storageInfo.disk.totalGB} GB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Used:</span>
              <span className="text-terminal-green">{storageInfo.disk.usedGB} GB ({storageInfo.disk.usedPercent}%)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Free:</span>
              <span className="text-terminal-green">{storageInfo.disk.freeGB} GB</span>
            </div>
          </div>

          {/* Storage bar */}
          <div className="mt-3 w-full bg-terminal-border rounded-full h-3">
            <div
              className={`h-full rounded-full ${getStorageWarningClass()} shadow-glow-green-sm transition-all`}
              style={{ width: `${storageInfo.disk.usedPercent}%` }}
            />
          </div>

          {storageInfo.disk.usedPercent >= 75 && (
            <p className="text-yellow-400 text-xs mt-2 font-mono">
              [!] Warning: Disk usage above 75%
            </p>
          )}
        </div>
      )}

      {/* CUSP Status - Not Downloaded */}
      {!cuspExists && !isStarted && (
        <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-bold text-terminal-green mb-4">[&gt;] DOWNLOAD COASTLINE DATA</h2>
          <p className="text-terminal-green opacity-80 mb-4 font-mono text-sm">
            Download NOAA CUSP coastline data for Continental US. This will provide high-contrast
            coastline rendering on a black background.
          </p>
          <div className="space-y-2 mb-4 font-mono text-sm">
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Coverage:</span>
              <span className="text-terminal-green">Continental US</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Estimated Size:</span>
              <span className="text-terminal-green">~10 MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Format:</span>
              <span className="text-terminal-green">Vector Tiles (MBTiles)</span>
            </div>
          </div>
          <button
            onClick={handleStartDownload}
            className="w-full bg-terminal-green text-terminal-bg font-bold py-3 px-6 rounded-lg hover:shadow-glow-green transition-all duration-200 uppercase tracking-wider"
          >
            [&gt;] Download Coastline Data
          </button>
        </div>
      )}

      {/* Download Progress */}
      {isStarted && jobProgress && (
        <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-bold text-terminal-green mb-4">[~] DOWNLOADING & PROCESSING</h2>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between mb-2 font-mono text-sm">
              <span className="text-terminal-green">{jobProgress.message || 'Processing...'}</span>
              <span className="text-terminal-green">{jobProgress.progress}%</span>
            </div>
            <div className="w-full bg-terminal-border rounded-full h-4">
              <div
                className="h-full bg-terminal-green shadow-glow-green-sm rounded-full transition-all duration-300"
                style={{ width: `${jobProgress.progress}%` }}
              />
            </div>
          </div>

          {/* Status Info */}
          <div className="font-mono text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Status:</span>
              <span className="text-terminal-green uppercase">{jobProgress.status}</span>
            </div>
            {jobProgress.estimatedTimeLeft && (
              <div className="flex justify-between">
                <span className="text-terminal-green opacity-70">Time Remaining:</span>
                <span className="text-terminal-green">{jobProgress.estimatedTimeLeft}</span>
              </div>
            )}
            {jobProgress.connected && (
              <p className="text-terminal-green opacity-60 text-xs mt-2">
                [WS] Real-time updates active
              </p>
            )}
          </div>

          {/* Error State */}
          {jobProgress.isError && (
            <div className="mt-4 p-3 bg-red-500 bg-opacity-20 border border-red-500 rounded">
              <p className="text-red-400 font-mono text-sm">
                [ERROR] {jobProgress.message}
              </p>
            </div>
          )}

          {/* Completion State */}
          {jobProgress.isComplete && jobProgress.status === 'completed' && (
            <div className="mt-4 p-3 bg-terminal-green bg-opacity-20 border border-terminal-green rounded">
              <p className="text-terminal-green font-mono text-sm">
                [✓] Coastline data ready! Navigate to Topo view to see it.
              </p>
            </div>
          )}
        </div>
      )}

      {/* CUSP Status - Downloaded */}
      {cuspExists && !isStarted && cuspMetadata && (
        <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-bold text-terminal-green mb-4">[✓] COASTLINE DATA INSTALLED</h2>
          <div className="space-y-2 mb-6 font-mono text-sm">
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Size:</span>
              <span className="text-terminal-green">{cuspMetadata.sizeMB} MB</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Last Modified:</span>
              <span className="text-terminal-green">
                {cuspMetadata.version || 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-green opacity-70">Coverage:</span>
              <span className="text-terminal-green">Continental US</span>
            </div>
          </div>
          <p className="text-terminal-green opacity-80 mb-4 font-mono text-sm">
            Coastline data is installed and ready. Go to the Topo view to see high-contrast
            coastlines on black background.
          </p>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full bg-red-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-red-600 transition-all duration-200 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? '[...] DELETING' : '[X] DELETE COASTLINE DATA'}
          </button>
        </div>
      )}

      {/* Info Panel */}
      <div className="bg-terminal-surface border border-terminal-border rounded-lg p-4">
        <h3 className="text-sm font-bold text-terminal-green mb-2">[i] ABOUT CUSP</h3>
        <p className="text-terminal-green opacity-70 font-mono text-xs leading-relaxed">
          NOAA's Continually Updated Shoreline Product (CUSP) provides the most up-to-date
          shoreline data for the United States. This vector tile layer displays coastlines
          in high contrast for optimal visibility during marine navigation.
        </p>
      </div>
    </div>
  );
}

export default CuspDownloader;
