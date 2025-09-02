/**
 * Browser-compatible logger that writes to both console and a log file
 * via a simple logging service endpoint
 */

// Simple timestamp function
const getTimestamp = () => {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

// Send log to a simple endpoint that writes to file
const writeToLogFile = async (level, message) => {
  const logEntry = `${getTimestamp()} [${level.toUpperCase()}] ${message}`
  
  try {
    // Use navigator.sendBeacon for reliable logging (works even on page unload)
    if (navigator.sendBeacon) {
      const blob = new Blob([logEntry + '\n'], { type: 'text/plain' })
      navigator.sendBeacon('/api/log', blob)
    } else {
      // Fallback to fetch
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: logEntry + '\n'
      })
    }
  } catch (err) {
    // If logging fails, just use console - don't throw
    console.warn('Failed to write to log file:', err.message)
  }
}

// Logger functions
export const logInfo = (message) => {
  console.log(`[INFO] ${message}`)
  writeToLogFile('info', message)
}

export const logError = (message, error = null) => {
  const fullMessage = error ? `${message} - ${error.toString()}` : message
  console.error(`[ERROR] ${fullMessage}`)
  writeToLogFile('error', fullMessage)
}

export const logWarn = (message) => {
  console.warn(`[WARN] ${message}`)
  writeToLogFile('warn', message)
}

export const logDebug = (message) => {
  console.debug(`[DEBUG] ${message}`)
  writeToLogFile('debug', message)
}