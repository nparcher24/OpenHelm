#!/usr/bin/env python3
"""
Extract BlueTopo tiles for Virginia Beach area (100 mile radius)
"""
import sqlite3
import struct
import csv

# Virginia Beach coordinates
VA_BEACH_LAT = 36.85
VA_BEACH_LON = -75.98

# 100 miles = ~1.45 degrees (approximate)
RADIUS_DEG = 1.45

# Bounding box
MIN_LON = VA_BEACH_LON - RADIUS_DEG
MAX_LON = VA_BEACH_LON + RADIUS_DEG
MIN_LAT = VA_BEACH_LAT - RADIUS_DEG
MAX_LAT = VA_BEACH_LAT + RADIUS_DEG

def parse_wkb_envelope(wkb_geom):
    """Extract bounding box from WKB geometry (simplified)"""
    try:
        # Skip WKB header and extract coordinates
        # This is a simplified parser that works for MULTIPOLYGON
        # We'll just check if any part of the geometry intersects our bbox
        if not wkb_geom:
            return None, None, None, None

        # For simplicity, use SQLite's built-in rtree which has the bounds
        return None, None, None, None
    except:
        return None, None, None, None

def bbox_intersects(minx1, miny1, maxx1, maxy1, minx2, miny2, maxx2, maxy2):
    """Check if two bounding boxes intersect"""
    return not (maxx1 < minx2 or maxx2 < minx1 or maxy1 < miny2 or maxy2 < miny1)

# Connect to database
conn = sqlite3.connect('/home/hic/OpenHelm/BlueTopo_Tile_Scheme_20251219_203910.gpkg')
cursor = conn.cursor()

# Use the rtree spatial index to find intersecting tiles
query = """
SELECT t.tile, t.GeoTIFF_Link, t.Resolution, t.UTM, t.Delivered_Date,
       r.minx, r.miny, r.maxx, r.maxy
FROM BlueTopo_Tile_Scheme_20251219_203910 t
JOIN rtree_BlueTopo_Tile_Scheme_20251219_203910_geom r ON t.fid = r.id
WHERE r.minx <= ? AND r.maxx >= ?
  AND r.miny <= ? AND r.maxy >= ?
"""

tiles = []
cursor.execute(query, (MAX_LON, MIN_LON, MAX_LAT, MIN_LAT))

for row in cursor.fetchall():
    tile_id, url, resolution, utm, date, minx, miny, maxx, maxy = row
    tiles.append({
        'tile': tile_id,
        'url': url,
        'resolution': resolution,
        'utm': utm,
        'date': date,
        'minx': minx,
        'miny': miny,
        'maxx': maxx,
        'maxy': maxy
    })

conn.close()

# Save to CSV
output_file = '/home/hic/OpenHelm/va_beach_tiles.csv'
with open(output_file, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['tile', 'url', 'resolution', 'utm', 'date', 'minx', 'miny', 'maxx', 'maxy'])
    for tile in tiles:
        writer.writerow([
            tile['tile'], tile['url'], tile['resolution'],
            tile['utm'], tile['date'], tile['minx'], tile['miny'],
            tile['maxx'], tile['maxy']
        ])

# Print summary
print(f"Found {len(tiles)} tiles for Virginia Beach area (100 mile radius)")
print(f"\nBounding box:")
print(f"  Longitude: {MIN_LON:.2f} to {MAX_LON:.2f}")
print(f"  Latitude:  {MIN_LAT:.2f} to {MAX_LAT:.2f}")
print(f"\nResolution breakdown:")
resolutions = {}
for tile in tiles:
    res = tile['resolution'] or 'Unknown'
    resolutions[res] = resolutions.get(res, 0) + 1

for res in sorted(resolutions.keys(), key=lambda x: (x is None, x)):
    print(f"  {res:>8}: {resolutions[res]:>4} tiles")

print(f"\nTile list saved to: {output_file}")
