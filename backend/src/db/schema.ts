import { Incident, IncidentTimelineEntry } from '../types';

export interface DBIncident {
  id: string;
  title: string;
  description: string;
  location: string;
  reporter_name: string;
  reporter_contact: string;
  incident_type: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  closure_summary: string | null;
}

export interface DBTimeline {
  id: string;
  incident_id: string;
  action: string;
  description: string;
  actor: string;
  created_at: string;
}

export function rowToIncident(row: DBIncident): Incident {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    reporter_name: row.reporter_name,
    reporter_contact: row.reporter_contact,
    incident_type: row.incident_type,
    priority: row.priority as Incident['priority'],
    status: row.status as Incident['status'],
    assigned_to: row.assigned_to,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    resolution_notes: row.resolution_notes,
    resolved_by: row.resolved_by,
    closure_summary: row.closure_summary,
  };
}

export function rowToTimeline(row: DBTimeline): IncidentTimelineEntry {
  return {
    id: row.id,
    incident_id: row.incident_id,
    action: row.action,
    description: row.description,
    actor: row.actor,
    created_at: row.created_at,
  };
}
