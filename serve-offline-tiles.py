#!/usr/bin/env python3
"""
Simple offline tile server for OpenHelm
Serves tiles from the local tiles directory
"""

import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import mimetypes

class TileHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Parse the request path
        path = urlparse(self.path).path
        
        # Handle tile requests: /tiles/{z}/{x}/{y}.png
        if path.startswith('/tiles/'):
            parts = path.split('/')
            if len(parts) == 5:  # ['', 'tiles', z, x, y.png]
                z, x, y_ext = parts[2], parts[3], parts[4]
                if y_ext.endswith('.png'):
                    y = y_ext[:-4]  # Remove .png extension
                    
                    tile_path = f'tiles/sample-tiles/{z}/{x}/{y}.png'
                    
                    if os.path.exists(tile_path):
                        self.send_response(200)
                        self.send_header('Content-type', 'image/png')
                        self.send_header('Access-Control-Allow-Origin', '*')
                        self.end_headers()
                        
                        with open(tile_path, 'rb') as f:
                            self.wfile.write(f.read())
                        return
        
        # Return 404 for other requests
        self.send_response(404)
        self.end_headers()
        self.wfile.write(b'Tile not found')
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass

if __name__ == '__main__':
    port = 3002  # Use different port from Martin
    server = HTTPServer(('0.0.0.0', port), TileHandler)
    print(f'Serving offline tiles on http://0.0.0.0:{port}')
    print('Access tiles at: http://localhost:3002/tiles/{z}/{x}/{y}.png')
    server.serve_forever()
