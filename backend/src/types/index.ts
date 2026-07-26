import { z } from 'zod';

// ── Status Workflow ──
export const IncidentStatus = {
  NEW: 'NEW',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
} as const;

export type IncidentStatusType = (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const STATUS_VALUES = Object.values(IncidentStatus) as [string, ...string[]];

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  [IncidentStatus.NEW]: [IncidentStatus.ACKNOWLEDGED],
  [IncidentStatus.ACKNOWLEDGED]: [IncidentStatus.NEW, IncidentStatus.IN_PROGRESS],
  [IncidentStatus.IN_PROGRESS]: [IncidentStatus.ACKNOWLEDGED, IncidentStatus.RESOLVED],
  [IncidentStatus.RESOLVED]: [],
};

export function isValidTransition(from: string, to: string): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Priority ──
export const IncidentPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;

export type IncidentPriorityType = (typeof IncidentPriority)[keyof typeof IncidentPriority];
export const PRIORITY_VALUES = Object.values(IncidentPriority) as [string, ...string[]];

// ── Zod Schemas ──

const ImageDataSchema = z.object({
  filename: z.string().min(1).max(200),
  mime_type: z.string().min(1).max(50),
  data: z.string().min(1), // base64
});

export const CreateIncidentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title must be at most 200 characters'),
  description: z.string().min(1, 'Description is required').max(5000, 'Description must be at most 5000 characters'),
  location: z.string().min(1, 'Location is required').max(300, 'Location must be at most 300 characters'),
  reporter_name: z.string().min(1, 'Reporter name is required').max(100, 'Reporter name must be at most 100 characters'),
  reporter_contact: z.string().min(1, 'Reporter contact is required').max(100, 'Reporter contact must be at most 100 characters'),
  incident_type: z.string().min(1, 'Incident type is required').max(100),
  priority: z.enum(PRIORITY_VALUES).optional().default(IncidentPriority.MEDIUM),
  images: z.array(ImageDataSchema).max(5, 'สามารถใส่รูปได้สูงสุด 5 รูป').optional().default([]),
});

export const UpdateIncidentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  location: z.string().min(1).max(300).optional(),
  incident_type: z.string().min(1).max(100).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  assigned_to: z.string().max(100).nullable().optional(),
  status: z.enum(STATUS_VALUES).optional(),
});

export const AddNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required').max(5000, 'Note must be at most 5000 characters'),
  author: z.string().min(1, 'Author is required').max(100, 'Author must be at most 100 characters'),
});

export const ResolveIncidentSchema = z.object({
  resolution_notes: z.string().min(1, 'Resolution notes are required').max(10000),
  resolved_by: z.string().min(1, 'Resolver name is required').max(100),
});

// ── Database Types ──

export interface Incident {
  id: string;
  title: string;
  description: string;
  location: string;
  reporter_name: string;
  reporter_contact: string;
  incident_type: string;
  priority: IncidentPriorityType;
  status: IncidentStatusType;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  closure_summary: string | null;
}

export interface IncidentTimelineEntry {
  id: string;
  incident_id: string;
  action: string;
  description: string;
  actor: string;
  created_at: string;
}

// ── API Response Types ──

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
}

// ── Images ──
export interface IncidentImage {
  id: string;
  incident_id: string;
  filename: string;
  mime_type: string;
  data: string; // base64
  sort_order: number;
  created_at: string;
}

// ── Query Params ──
export const ListIncidentsQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  priority: z.enum(PRIORITY_VALUES).optional(),
  incident_type: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['created_at', 'updated_at', 'priority', 'status']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
