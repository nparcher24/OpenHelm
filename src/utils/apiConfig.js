/**
 * Centralized API/service base URLs
 * Derives hostname from the browser's location so the app works
 * whether accessed locally (localhost) or remotely (e.g. 192.168.x.x).
 */

const host = window.location.hostname

export const API_BASE = `http://${host}:3002`
export const WS_BASE = `ws://${host}:3002`
export const TILE_BASE = `http://${host}:3001`
