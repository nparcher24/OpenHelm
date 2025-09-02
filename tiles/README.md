# OpenHelm Tile Data Directory

This directory contains offline map tiles for marine navigation.

## Directory Structure

- `nautical/` - Marine navigation charts (.mbtiles format)
- `topo/` - NOAA BlueTopo topographical data
- `temperature/` - NOAA Sea Temperature imagery tiles  
- `land/` - Land map tiles for backup navigation

## Tile Formats Supported

- **MBTiles** (.mbtiles) - SQLite-based tile archives
- **PMTiles** (.pmtiles) - Modern cloud-optimized tiles
- **Directory tiles** - Standard z/x/y.png structure

## Adding Map Data

1. Place .mbtiles files in appropriate subdirectories
2. Ensure files are readable by the martin process
3. Restart the tile server to auto-discover new sources

## Performance Notes

- Keep total tile data under 32GB for optimal Pi performance
- Use appropriate zoom levels (typically 1-16 for marine use)
- Consider tile compression to save space