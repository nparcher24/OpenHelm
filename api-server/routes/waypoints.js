/**
 * Waypoints API Routes
 * CRUD operations for managing navigation waypoints
 */

import { Router } from 'express'
import waypointService from '../services/waypointService.js'

const router = Router()

/**
 * GET /api/waypoints - Get all waypoints
 */
router.get('/', async (req, res) => {
  try {
    const waypoints = await waypointService.getAllWaypoints()
    res.json({
      success: true,
      count: waypoints.length,
      waypoints
    })
  } catch (error) {
    console.error('[Waypoints API] Error getting waypoints:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get waypoints',
      message: error.message
    })
  }
})

/**
 * GET /api/waypoints/export/csv - Export waypoints as CSV
 */
router.get('/export/csv', async (req, res) => {
  try {
    const csv = await waypointService.exportToCSV()

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="waypoints_${new Date().toISOString().split('T')[0]}.csv"`)
    res.send(csv)
  } catch (error) {
    console.error('[Waypoints API] Error exporting CSV:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to export waypoints',
      message: error.message
    })
  }
})

/**
 * GET /api/waypoints/:id - Get single waypoint by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid waypoint ID'
      })
    }

    const waypoint = await waypointService.getWaypointById(id)

    if (!waypoint) {
      return res.status(404).json({
        success: false,
        error: 'Waypoint not found'
      })
    }

    res.json({
      success: true,
      waypoint
    })
  } catch (error) {
    console.error('[Waypoints API] Error getting waypoint:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to get waypoint',
      message: error.message
    })
  }
})

/**
 * POST /api/waypoints - Create a new waypoint
 */
router.post('/', async (req, res) => {
  try {
    const { name, description, latitude, longitude, icon, color } = req.body

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      })
    }

    if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        error: 'Valid latitude (-90 to 90) is required'
      })
    }

    if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        error: 'Valid longitude (-180 to 180) is required'
      })
    }

    // Valid icons
    const validIcons = ['map-pin', 'anchor', 'lighthouse', 'sailboat', 'fishing', 'buoy', 'lifebuoy', 'star']
    const waypointIcon = validIcons.includes(icon) ? icon : 'map-pin'

    // Validate color format (hex)
    const colorRegex = /^#[0-9A-Fa-f]{6}$/
    const waypointColor = colorRegex.test(color) ? color : '#00ff00'

    const waypoint = await waypointService.createWaypoint({
      name: name.trim(),
      description: description?.trim() || null,
      latitude,
      longitude,
      icon: waypointIcon,
      color: waypointColor
    })

    res.status(201).json({
      success: true,
      message: 'Waypoint created',
      waypoint
    })
  } catch (error) {
    console.error('[Waypoints API] Error creating waypoint:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to create waypoint',
      message: error.message
    })
  }
})

/**
 * PUT /api/waypoints/:id - Update a waypoint
 */
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid waypoint ID'
      })
    }

    // Check if waypoint exists
    const existing = await waypointService.getWaypointById(id)
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Waypoint not found'
      })
    }

    const { name, description, latitude, longitude, icon, color } = req.body
    const updateData = {}

    // Validate and set fields
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Name cannot be empty'
        })
      }
      updateData.name = name.trim()
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null
    }

    if (latitude !== undefined) {
      if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
        return res.status(400).json({
          success: false,
          error: 'Valid latitude (-90 to 90) is required'
        })
      }
      updateData.latitude = latitude
    }

    if (longitude !== undefined) {
      if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
        return res.status(400).json({
          success: false,
          error: 'Valid longitude (-180 to 180) is required'
        })
      }
      updateData.longitude = longitude
    }

    if (icon !== undefined) {
      const validIcons = ['map-pin', 'anchor', 'lighthouse', 'sailboat', 'fishing', 'buoy', 'lifebuoy', 'star']
      updateData.icon = validIcons.includes(icon) ? icon : 'map-pin'
    }

    if (color !== undefined) {
      const colorRegex = /^#[0-9A-Fa-f]{6}$/
      updateData.color = colorRegex.test(color) ? color : '#00ff00'
    }

    const result = await waypointService.updateWaypoint(id, updateData)
    const updated = await waypointService.getWaypointById(id)

    res.json({
      success: true,
      message: 'Waypoint updated',
      waypoint: updated
    })
  } catch (error) {
    console.error('[Waypoints API] Error updating waypoint:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update waypoint',
      message: error.message
    })
  }
})

/**
 * DELETE /api/waypoints/:id - Delete a waypoint
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)

    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid waypoint ID'
      })
    }

    const result = await waypointService.deleteWaypoint(id)

    if (!result.deleted) {
      return res.status(404).json({
        success: false,
        error: 'Waypoint not found'
      })
    }

    res.json({
      success: true,
      message: 'Waypoint deleted',
      id
    })
  } catch (error) {
    console.error('[Waypoints API] Error deleting waypoint:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete waypoint',
      message: error.message
    })
  }
})

/**
 * POST /api/waypoints/delete-batch - Delete multiple waypoints
 */
router.post('/delete-batch', async (req, res) => {
  try {
    const { ids } = req.body

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ids array is required'
      })
    }

    // Validate all IDs are numbers
    const validIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id))

    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid IDs provided'
      })
    }

    const result = await waypointService.deleteWaypointsBatch(validIds)

    res.json({
      success: true,
      message: `Deleted ${result.deleted.length} waypoint(s)`,
      deleted: result.deleted,
      failed: result.failed
    })
  } catch (error) {
    console.error('[Waypoints API] Error batch deleting waypoints:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to delete waypoints',
      message: error.message
    })
  }
})

export default router
