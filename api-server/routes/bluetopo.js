import express from 'express';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NOAA BlueTopo tile scheme S3 bucket info
const S3_BUCKET_URL = 'https://noaa-ocs-nationalbathymetry-pds.s3.amazonaws.com';
const TILE_SCHEME_PREFIX = 'BlueTopo/_BlueTopo_Tile_Scheme/';
const INDEX_URL = `${S3_BUCKET_URL}/index.html#${TILE_SCHEME_PREFIX}`;

/**
 * GET /api/bluetopo/tile-scheme/latest
 * Fetches the S3 bucket index and returns the latest tile scheme file info
 */
router.get('/tile-scheme/latest', async (req, res) => {
  try {

    // Fetch the S3 bucket listing XML
    const listUrl = `${S3_BUCKET_URL}/?prefix=${TILE_SCHEME_PREFIX}&delimiter=/`;
    const response = await fetch(listUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch S3 listing: ${response.statusText}`);
    }

    const xmlText = await response.text();

    // Parse XML to find .gpkg files
    const parser = new XMLParser();
    const result = parser.parse(xmlText);

    // Extract contents
    const contents = result.ListBucketResult?.Contents;
    if (!contents) {
      return res.status(404).json({ error: 'No files found in bucket' });
    }

    // Filter for .gpkg files and find the most recent
    const gpkgFiles = (Array.isArray(contents) ? contents : [contents])
      .filter(item => item.Key && item.Key.endsWith('.gpkg'))
      .map(item => ({
        key: item.Key,
        filename: item.Key.split('/').pop(),
        lastModified: new Date(item.LastModified),
        size: parseInt(item.Size),
        url: `${S3_BUCKET_URL}/${item.Key}`
      }))
      .sort((a, b) => b.lastModified - a.lastModified);

    if (gpkgFiles.length === 0) {
      return res.status(404).json({ error: 'No .gpkg files found' });
    }

    const latest = gpkgFiles[0];

    res.json({
      filename: latest.filename,
      url: latest.url,
      lastModified: latest.lastModified.toISOString(),
      size: latest.size,
      sizeFormatted: formatBytes(latest.size),
      indexUrl: INDEX_URL
    });

  } catch (error) {
    console.error('Error fetching tile scheme info:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bluetopo/tile-scheme/local
 * Returns info about the local tile scheme file
 */
router.get('/tile-scheme/local', async (req, res) => {
  try {
    // Find local .gpkg files
    const projectRoot = path.resolve(__dirname, '../..');

    // Read all files in the project root
    const allFiles = await fs.readdir(projectRoot);

    // Filter for BlueTopo tile scheme files
    const gpkgFiles = allFiles.filter(file =>
      file.startsWith('BlueTopo_Tile_Scheme_') && file.endsWith('.gpkg')
    );

    if (gpkgFiles.length === 0) {
      return res.json({ exists: false });
    }

    // Get the most recent file
    const fileStats = await Promise.all(
      gpkgFiles.map(async (filename) => {
        const filePath = path.join(projectRoot, filename);
        const stats = await fs.stat(filePath);
        return {
          path: filePath,
          filename: filename,
          lastModified: stats.mtime,
          size: stats.size
        };
      })
    );

    const latest = fileStats.sort((a, b) => b.lastModified - a.lastModified)[0];

    res.json({
      exists: true,
      filename: latest.filename,
      lastModified: latest.lastModified.toISOString(),
      size: latest.size,
      sizeFormatted: formatBytes(latest.size),
      path: latest.path
    });

  } catch (error) {
    console.error('Error checking local tile scheme:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bluetopo/tile-scheme/download
 * Downloads the latest tile scheme file from S3
 */
router.post('/tile-scheme/download', async (req, res) => {
  const { url, filename } = req.body;

  if (!url || !filename) {
    return res.status(400).json({ error: 'Missing url or filename' });
  }

  try {
    const projectRoot = path.resolve(__dirname, '../..');
    const outputPath = path.join(projectRoot, filename);

    console.log(`Downloading tile scheme from: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download: ${response.statusText}`);
    }

    const fileStream = fsSync.createWriteStream(outputPath);

    // Pipe the response to file
    await new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', reject);
      fileStream.on('finish', resolve);
    });

    console.log(`Downloaded tile scheme to: ${outputPath}`);

    res.json({
      success: true,
      filename: filename,
      path: outputPath
    });

  } catch (error) {
    console.error('Error downloading tile scheme:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default router;
