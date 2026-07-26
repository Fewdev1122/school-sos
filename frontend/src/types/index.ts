// ── Status ──
export type IncidentStatus = 'NEW' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED';
export type IncidentPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const IncidentStatusLabels: Record<IncidentStatus, string> = {
  NEW: 'ใหม่',
  ACKNOWLEDGED: 'รับทราบ',
  IN_PROGRESS: 'กำลังดำเนินการ',
  RESOLVED: 'แก้ไขแล้ว',
};

export const IncidentPriorityLabels: Record<IncidentPriority, string> = {
  LOW: 'ต่ำ',
  MEDIUM: 'ปานกลาง',
  HIGH: 'สูง',
  CRITICAL: 'วิกฤต',
};

// ── Incident ──
export interface Incident {
  id: string;
  title: string;
  description: string;
  location: string;
  reporter_name: string;
  reporter_contact: string;
  incident_type: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
  resolved_by: string | null;
  closure_summary: string | null;
  timeline?: IncidentTimelineEntry[];
}

// ── Timeline ──
export interface IncidentTimelineEntry {
  id: string;
  incident_id: string;
  action: string;
  description: string;
  actor: string;
  created_at: string;
}

// ── API ──
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

export interface ImageUpload {
  filename: string;
  mime_type: string;
  data: string; // base64
}

// ── Form Data ──
export interface CreateIncidentData {
  title: string;
  description: string;
  location: string;
  reporter_name: string;
  reporter_contact: string;
  incident_type: string;
  priority?: IncidentPriority;
  images?: ImageUpload[];
}

export interface UpdateIncidentData {
  title?: string;
  description?: string;
  location?: string;
  incident_type?: string;
  priority?: IncidentPriority;
  assigned_to?: string | null;
  status?: IncidentStatus;
}

export interface AddNoteData {
  content: string;
  author: string;
}

export interface ResolveIncidentData {
  resolution_notes: string;
  resolved_by: string;
}

// ── Image ──
export interface IncidentImage {
  id: string;
  incident_id: string;
  filename: string;
  mime_type: string;
  data?: string; // base64 (only when fetched individually)
  sort_order: number;
  created_at: string;
}

// ── AI Analyze ──
export interface AnalyzeResult {
  title: string;
  description: string;
  location: string;
  reporter_name: string;
  reporter_contact: string;
  incident_type: string;
  priority: IncidentPriority;
}

export interface AnalyzeResponse {
  success: boolean;
  data: AnalyzeResult;
  original_text: string;
}

// ── Query ──
export interface ListIncidentsParams {
  status?: IncidentStatus;
  priority?: IncidentPriority;
  incident_type?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

// ── Toast ──
export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}
