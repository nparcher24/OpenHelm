#!/usr/bin/env python3
"""
Extract ALL BlueTopo tiles from the tile scheme GeoPackage
No geographic filtering - includes global coverage
"""
import sqlite3
import csv
import glob
import os

def find_latest_gpkg():
    """Find the most recent BlueTopo tile scheme file"""
    pattern = 'BlueTopo_Tile_Scheme_*.gpkg'
    files = glob.glob(pattern)

    if not files:
        raise FileNotFoundError(f"No BlueTopo tile scheme files found matching: {pattern}")

    # Sort by modification time, most recent first
    files.sort(key=os.path.getmtime, reverse=True)
    return files[0]

def extract_all_tiles(gpkg_file):
    """Extract all tiles from the GeoPackage"""
    print(f"Opening {gpkg_file}...")

    # Connect to database
    conn = sqlite3.connect(gpkg_file)
    cursor = conn.cursor()

    # Get table name (it includes the date in the name)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'BlueTopo_Tile_Scheme_%'")
    table_result = cursor.fetchone()

    if not table_result:
        raise ValueError("Could not find BlueTopo tile scheme table")

    table_name = table_result[0]
    print(f"Found table: {table_name}")

    # Query ALL tiles using the rtree spatial index
    query = f"""
    SELECT t.tile, t.GeoTIFF_Link, t.Resolution, t.UTM, t.Delivered_Date,
           r.minx, r.miny, r.maxx, r.maxy
    FROM {table_name} t
    JOIN rtree_{table_name}_geom r ON t.fid = r.id
    ORDER BY t.tile
    """

    print("Extracting all tiles...")
    cursor.execute(query)

    tiles = []
    for row in cursor.fetchall():
        tile_id, url, resolution, utm, date, minx, miny, maxx, maxy = row
        tiles.append({
            'tile': tile_id,
            'url': url,
            'resolution': resolution or 'Unknown',
            'utm': utm,
            'date': date,
            'minx': minx,
            'miny': miny,
            'maxx': maxx,
            'maxy': maxy
        })

    conn.close()

    return tiles

def save_to_csv(tiles, output_file):
    """Save tiles to CSV file"""
    print(f"Saving {len(tiles)} tiles to {output_file}...")

    with open(output_file, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['tile', 'url', 'resolution', 'utm', 'date', 'minx', 'miny', 'maxx', 'maxy'])

        for tile in tiles:
            writer.writerow([
                tile['tile'],
                tile['url'],
                tile['resolution'],
                tile['utm'],
                tile['date'],
                tile['minx'],
                tile['miny'],
                tile['maxx'],
                tile['maxy']
            ])

    print(f"✓ Saved to {output_file}")

def print_summary(tiles):
    """Print summary statistics"""
    print(f"\n{'='*60}")
    print(f"BlueTopo Tile Extraction Summary")
    print(f"{'='*60}")
    print(f"Total tiles: {len(tiles)}")

    # Resolution breakdown
    resolutions = {}
    for tile in tiles:
        res = tile['resolution']
        resolutions[res] = resolutions.get(res, 0) + 1

    print(f"\nResolution breakdown:")
    for res in sorted(resolutions.keys(), key=lambda x: (x == 'Unknown', x)):
        print(f"  {res:>8}: {resolutions[res]:>6} tiles")

    # Geographic extents
    if tiles:
        min_lon = min(t['minx'] for t in tiles)
        max_lon = max(t['maxx'] for t in tiles)
        min_lat = min(t['miny'] for t in tiles)
        max_lat = max(t['maxy'] for t in tiles)

        print(f"\nGeographic coverage:")
        print(f"  Longitude: {min_lon:.2f}° to {max_lon:.2f}°")
        print(f"  Latitude:  {min_lat:.2f}° to {max_lat:.2f}°")

if __name__ == '__main__':
    try:
        # Find latest tile scheme file
        gpkg_file = find_latest_gpkg()
        print(f"Using: {gpkg_file}")
        print()

        # Extract all tiles
        tiles = extract_all_tiles(gpkg_file)

        # Save to CSV files
        save_to_csv(tiles, 'bluetopo_tiles_global.csv')
        save_to_csv(tiles, 'public/bluetopo_tiles_global.csv')

        # Print summary
        print_summary(tiles)

        print(f"\n{'='*60}")
        print("✓ Extraction complete!")
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
