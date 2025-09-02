import fs from 'fs'
import path from 'path'

/**
 * Simple Vite plugin to handle logging API endpoint
 * Writes logs to openhelm.log in the project root
 */
export function loggingPlugin() {
  const logFile = path.resolve(process.cwd(), 'openhelm.log')
  
  return {
    name: 'logging-plugin',
    configureServer(server) {
      server.middlewares.use('/api/log', (req, res, next) => {
        if (req.method === 'POST') {
          let body = ''
          
          req.on('data', chunk => {
            body += chunk.toString()
          })
          
          req.on('end', () => {
            try {
              // Append log entry to file
              fs.appendFileSync(logFile, body)
              
              res.writeHead(200, { 'Content-Type': 'text/plain' })
              res.end('OK')
            } catch (error) {
              console.error('Error writing to log file:', error)
              res.writeHead(500, { 'Content-Type': 'text/plain' })
              res.end('Error writing to log file')
            }
          })
        } else {
          res.writeHead(405, { 'Content-Type': 'text/plain' })
          res.end('Method not allowed')
        }
      })
    }
  }
}