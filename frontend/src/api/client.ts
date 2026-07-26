import type {
  ApiResponse,
  PaginatedResponse,
  AnalyzeResponse,
  Incident,
  CreateIncidentData,
  UpdateIncidentData,
  AddNoteData,
  ResolveIncidentData,
  ListIncidentsParams,
} from '@/types';

const API_BASE = '/api/v1';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.error || 'An error occurred');
  }

  return data as T;
}

// ── Incidents ──

export async function createIncident(data: CreateIncidentData): Promise<ApiResponse<Incident>> {
  return request('/incidents', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listIncidents(params?: ListIncidentsParams): Promise<PaginatedResponse<Incident>> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.priority) query.set('priority', params.priority);
  if (params?.incident_type) query.set('incident_type', params.incident_type);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.sort) query.set('sort', params.sort);
  if (params?.order) query.set('order', params.order);

  const qs = query.toString();
  return request(`/incidents${qs ? `?${qs}` : ''}`);
}

export async function getIncident(id: string): Promise<ApiResponse<Incident>> {
  return request(`/incidents/${id}`);
}

export async function updateIncident(id: string, data: UpdateIncidentData): Promise<ApiResponse<Incident>> {
  return request(`/incidents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function addNote(id: string, data: AddNoteData): Promise<ApiResponse> {
  return request(`/incidents/${id}/notes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteIncident(id: string): Promise<ApiResponse> {
  return request(`/incidents/${id}`, {
    method: 'DELETE',
  });
}

export async function analyzeIncident(text: string): Promise<AnalyzeResponse> {
  return request('/analyze', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

export async function resolveIncident(id: string, data: ResolveIncidentData): Promise<ApiResponse<Incident>> {
  return request(`/incidents/${id}/resolve`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}
