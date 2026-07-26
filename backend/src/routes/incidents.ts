import { Hono } from 'hono';
import { z } from 'zod';
import {
  CreateIncidentSchema,
  UpdateIncidentSchema,
  AddNoteSchema,
  ResolveIncidentSchema,
  ListIncidentsQuerySchema,
  IncidentStatus,
  isValidTransition,
} from '../types';
import { rowToIncident, rowToTimeline } from '../db/schema';
import { handleError } from '../middleware/error';
import type { D1Database } from '@cloudflare/workers-types';

type Bindings = {
  DB: D1Database;
};

const router = new Hono<{ Bindings: Bindings }>();

// ── POST /api/v1/incidents ──
router.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const data = CreateIncidentSchema.parse(body);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO incidents (id, title, description, location, reporter_name, reporter_contact, incident_type, priority, status, assigned_to, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NEW', NULL, ?, ?)`
    )
      .bind(id, data.title, data.description, data.location, data.reporter_name, data.reporter_contact, data.incident_type, data.priority, now, now)
      .run();

    // Add timeline entry
    await c.env.DB.prepare(
      `INSERT INTO incident_timeline (id, incident_id, action, description, actor, created_at)
       VALUES (?, ?, 'CREATED', ?, ?, ?)`
    )
      .bind(crypto.randomUUID(), id, `Incident "${data.title}" was created`, data.reporter_name, now)
      .run();

    const incident = await c.env.DB.prepare('SELECT * FROM incidents WHERE id = ?').bind(id).first();
    const timeline = await c.env.DB.prepare(
      'SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY created_at ASC'
    ).bind(id).all();

    return c.json(
      {
        success: true,
        data: {
          ...rowToIncident(incident as any),
          timeline: timeline.results.map((t: any) => rowToTimeline(t)),
        },
      },
      201
    );
  } catch (error) {
    return handleError(c, error);
  }
});

// ── GET /api/v1/incidents ──
router.get('/', async (c) => {
  try {
    const query = ListIncidentsQuerySchema.parse(c.req.query());
    const { status, priority, incident_type, page, limit, sort, order } = query;

    let whereClauses: string[] = [];
    let params: any[] = [];

    if (status) {
      whereClauses.push('status = ?');
      params.push(status);
    }
    if (priority) {
      whereClauses.push('priority = ?');
      params.push(priority);
    }
    if (incident_type) {
      whereClauses.push('incident_type = ?');
      params.push(incident_type);
    }

    const where = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const offset = (page - 1) * limit;

    const countResult = await c.env.DB.prepare(
      `SELECT COUNT(*) as total FROM incidents ${where}`
    )
      .bind(...params)
      .first();

    const total = (countResult as any)?.total || 0;

    // Validate sort column to prevent injection
    const validSorts = ['created_at', 'updated_at', 'priority', 'status'];
    const sortCol = validSorts.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const incidents = await c.env.DB.prepare(
      `SELECT * FROM incidents ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT ? OFFSET ?`
    )
      .bind(...params, limit, offset)
      .all();

    return c.json({
      success: true,
      data: incidents.results.map((i: any) => rowToIncident(i)),
      total,
      page,
      limit,
    });
  } catch (error) {
    return handleError(c, error);
  }
});

// ── GET /api/v1/incidents/:id ──
router.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const incident = await c.env.DB.prepare('SELECT * FROM incidents WHERE id = ?').bind(id).first();

    if (!incident) {
      return c.json({ success: false, error: 'Not Found', message: 'Incident not found' }, 404);
    }

    const timeline = await c.env.DB.prepare(
      'SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY created_at ASC'
    ).bind(id).all();

    return c.json({
      success: true,
      data: {
        ...rowToIncident(incident as any),
        timeline: timeline.results.map((t: any) => rowToTimeline(t)),
      },
    });
  } catch (error) {
    return handleError(c, error);
  }
});

// ── PATCH /api/v1/incidents/:id ──
router.patch('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const data = UpdateIncidentSchema.parse(body);

    const existing = await c.env.DB.prepare('SELECT * FROM incidents WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ success: false, error: 'Not Found', message: 'Incident not found' }, 404);
    }

    const inc = existing as any;

    // Validate status transition
    if (data.status && !isValidTransition(inc.status, data.status)) {
      return c.json(
        {
          success: false,
          error: 'Invalid Transition',
          message: `Cannot transition from ${inc.status} to ${data.status}`,
        },
        400
      );
    }

    const now = new Date().toISOString();
    const updates: string[] = ['updated_at = ?'];
    const params: any[] = [now];
    const timelineEntries: { action: string; description: string; actor: string }[] = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      params.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }
    if (data.location !== undefined) {
      updates.push('location = ?');
      params.push(data.location);
    }
    if (data.incident_type !== undefined) {
      updates.push('incident_type = ?');
      params.push(data.incident_type);
    }
    if (data.priority !== undefined) {
      updates.push('priority = ?');
      params.push(data.priority);
      timelineEntries.push({
        action: 'PRIORITY_CHANGED',
        description: `Priority changed from ${inc.priority} to ${data.priority}`,
        actor: data.assigned_to || inc.assigned_to || 'System',
      });
    }
    if (data.assigned_to !== undefined) {
      updates.push('assigned_to = ?');
      params.push(data.assigned_to);
      timelineEntries.push({
        action: 'ASSIGNED',
        description: data.assigned_to
          ? `Incident assigned to ${data.assigned_to}`
          : 'Incident unassigned',
        actor: data.assigned_to || 'System',
      });
    }
    if (data.status !== undefined) {
      updates.push('status = ?');
      params.push(data.status);
      timelineEntries.push({
        action: 'STATUS_CHANGED',
        description: `Status changed from ${inc.status} to ${data.status}`,
        actor: 'System',
      });
    }

    params.push(id);

    await c.env.DB.prepare(
      `UPDATE incidents SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    // Add timeline entries
    for (const entry of timelineEntries) {
      await c.env.DB.prepare(
        'INSERT INTO incident_timeline (id, incident_id, action, description, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), id, entry.action, entry.description, entry.actor, now).run();
    }

    const updated = await c.env.DB.prepare('SELECT * FROM incidents WHERE id = ?').bind(id).first();
    const timeline = await c.env.DB.prepare(
      'SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY created_at ASC'
    ).bind(id).all();

    return c.json({
      success: true,
      data: {
        ...rowToIncident(updated as any),
        timeline: timeline.results.map((t: any) => rowToTimeline(t)),
      },
    });
  } catch (error) {
    return handleError(c, error);
  }
});

// ── POST /api/v1/incidents/:id/notes ──
router.post('/:id/notes', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const data = AddNoteSchema.parse(body);

    const existing = await c.env.DB.prepare('SELECT * FROM incidents WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ success: false, error: 'Not Found', message: 'Incident not found' }, 404);
    }

    const now = new Date().toISOString();
    await c.env.DB.prepare(
      'INSERT INTO incident_timeline (id, incident_id, action, description, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), id, 'NOTE_ADDED', data.content, data.author, now).run();

    await c.env.DB.prepare('UPDATE incidents SET updated_at = ? WHERE id = ?')
      .bind(now, id).run();

    const timeline = await c.env.DB.prepare(
      'SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY created_at ASC'
    ).bind(id).all();

    return c.json({
      success: true,
      data: {
        id: crypto.randomUUID(),
        incident_id: id,
        action: 'NOTE_ADDED',
        description: data.content,
        actor: data.author,
        created_at: now,
      },
      message: 'Note added successfully',
    }, 201);
  } catch (error) {
    return handleError(c, error);
  }
});

// ── POST /api/v1/incidents/:id/resolve ──
router.post('/:id/resolve', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const data = ResolveIncidentSchema.parse(body);

    const existing = await c.env.DB.prepare('SELECT * FROM incidents WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ success: false, error: 'Not Found', message: 'Incident not found' }, 404);
    }

    const inc = existing as any;

    if (inc.status === IncidentStatus.RESOLVED) {
      return c.json({ success: false, error: 'Already Resolved', message: 'Incident is already resolved' }, 400);
    }

    if (!isValidTransition(inc.status, IncidentStatus.RESOLVED)) {
      return c.json(
        {
          success: false,
          error: 'Invalid Transition',
          message: `Cannot resolve incident from ${inc.status} status`,
        },
        400
      );
    }

    const now = new Date().toISOString();

    // Generate closure summary
    const timeline = await c.env.DB.prepare(
      'SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY created_at ASC'
    ).bind(id).all();

    const timelineCount = timeline.results.length;
    const timeToResolve = Math.round(
      (new Date(now).getTime() - new Date(inc.created_at).getTime()) / (1000 * 60)
    );

    const timeToResolveText =
      timeToResolve < 60
        ? `${timeToResolve} minutes`
        : timeToResolve < 1440
          ? `${Math.round(timeToResolve / 60)} hours`
          : `${Math.round(timeToResolve / 1440)} days`;

    const closureSummary = [
      `Incident "${inc.title}" has been resolved.`,
      `Type: ${inc.incident_type}`,
      `Priority: ${inc.priority}`,
      `Time to resolve: ${timeToResolveText}`,
      `Total timeline entries: ${timelineCount}`,
      `Resolution notes: ${data.resolution_notes}`,
      `Resolved by: ${data.resolved_by}`,
    ].join('\n');

    await c.env.DB.prepare(
      `UPDATE incidents SET status = ?, resolved_at = ?, resolution_notes = ?, resolved_by = ?, closure_summary = ?, updated_at = ? WHERE id = ?`
    )
      .bind(IncidentStatus.RESOLVED, now, data.resolution_notes, data.resolved_by, closureSummary, now, id)
      .run();

    await c.env.DB.prepare(
      'INSERT INTO incident_timeline (id, incident_id, action, description, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), id, 'RESOLVED', `Incident resolved: ${data.resolution_notes}`, data.resolved_by, now).run();

    const updated = await c.env.DB.prepare('SELECT * FROM incidents WHERE id = ?').bind(id).first();
    const updatedTimeline = await c.env.DB.prepare(
      'SELECT * FROM incident_timeline WHERE incident_id = ? ORDER BY created_at ASC'
    ).bind(id).all();

    return c.json({
      success: true,
      data: {
        ...rowToIncident(updated as any),
        timeline: updatedTimeline.results.map((t: any) => rowToTimeline(t)),
      },
      message: 'Incident resolved successfully',
    });
  } catch (error) {
    return handleError(c, error);
  }
});

// ── DELETE /api/v1/incidents/:id ──
router.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const existing = await c.env.DB.prepare('SELECT * FROM incidents WHERE id = ?').bind(id).first();
    if (!existing) {
      return c.json({ success: false, error: 'Not Found', message: 'Incident not found' }, 404);
    }

    const inc = existing as any;
    if (inc.status !== IncidentStatus.RESOLVED) {
      return c.json({
        success: false,
        error: 'Cannot Delete',
        message: 'Only resolved incidents can be deleted',
      }, 400);
    }

    // Delete timeline entries first (though FK cascade should handle this)
    await c.env.DB.prepare('DELETE FROM incident_timeline WHERE incident_id = ?').bind(id).run();
    // Delete the incident
    await c.env.DB.prepare('DELETE FROM incidents WHERE id = ?').bind(id).run();

    return c.json({
      success: true,
      message: 'Incident deleted successfully',
    });
  } catch (error) {
    return handleError(c, error);
  }
});

export default router;
