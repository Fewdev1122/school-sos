import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  Incident,
  CreateIncidentData,
  UpdateIncidentData,
  AddNoteData,
  ResolveIncidentData,
  ListIncidentsParams,
  AnalyzeResult,
  Toast,
} from '@/types';
import * as api from '@/api/client';

export const useIncidentStore = defineStore('incidents', () => {
  // ── State ──
  const incidents = ref<Incident[]>([]);
  const currentIncident = ref<Incident | null>(null);
  const total = ref(0);
  const page = ref(1);
  const limit = ref(20);
  const loading = ref(false);
  const currentLoading = ref(false);
  const submitting = ref(false);
  const analyzing = ref(false);
  const error = ref<string | null>(null);
  const toasts = ref<Toast[]>([]);

  // ── Getters ──
  const totalPages = computed(() => Math.ceil(total.value / limit.value));

  const stats = computed(() => ({
    total: total.value,
    new: incidents.value.filter((i) => i.status === 'NEW').length,
    inProgress: incidents.value.filter((i) => i.status === 'IN_PROGRESS').length,
    resolved: incidents.value.filter((i) => i.status === 'RESOLVED').length,
  }));

  // ── Toast ──
  function addToast(message: string, type: Toast['type'] = 'info') {
    const id = crypto.randomUUID();
    toasts.value.push({ id, message, type });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 4000);
  }

  function removeToast(id: string) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  // ── Actions ──
  async function fetchIncidents(params?: ListIncidentsParams) {
    loading.value = true;
    error.value = null;
    try {
      const res = await api.listIncidents(params);
      incidents.value = res.data || [];
      total.value = res.total;
      page.value = res.page;
    } catch (e: any) {
      error.value = e.message;
      addToast(e.message, 'error');
    } finally {
      loading.value = false;
    }
  }

  async function fetchIncident(id: string) {
    currentLoading.value = true;
    error.value = null;
    try {
      const res = await api.getIncident(id);
      currentIncident.value = res.data || null;
    } catch (e: any) {
      error.value = e.message;
      addToast(e.message, 'error');
    } finally {
      currentLoading.value = false;
    }
  }

  async function analyzeText(text: string): Promise<AnalyzeResult | null> {
    analyzing.value = true;
    error.value = null;
    try {
      const res = await api.analyzeIncident(text);
      return res.data || null;
    } catch (e: any) {
      error.value = e.message;
      addToast(e.message, 'error');
      return null;
    } finally {
      analyzing.value = false;
    }
  }

  async function createIncident(data: CreateIncidentData) {
    submitting.value = true;
    error.value = null;
    try {
      const res = await api.createIncident(data);
      addToast('แจ้งเหตุสำเร็จ', 'success');
      return res.data;
    } catch (e: any) {
      error.value = e.message;
      addToast(e.message, 'error');
      throw e;
    } finally {
      submitting.value = false;
    }
  }

  async function updateIncident(id: string, data: UpdateIncidentData) {
    submitting.value = true;
    error.value = null;
    try {
      const res = await api.updateIncident(id, data);
      currentIncident.value = res.data || null;
      // Update in list too
      const idx = incidents.value.findIndex((i) => i.id === id);
      if (idx >= 0 && res.data) {
        incidents.value[idx] = res.data;
      }
      addToast('อัปเดตข้อมูลสำเร็จ', 'success');
      return res.data;
    } catch (e: any) {
      error.value = e.message;
      addToast(e.message, 'error');
      throw e;
    } finally {
      submitting.value = false;
    }
  }

  async function addNote(id: string, data: AddNoteData) {
    submitting.value = true;
    error.value = null;
    try {
      await api.addNote(id, data);
      await fetchIncident(id);
      addToast('บันทึกข้อความสำเร็จ', 'success');
    } catch (e: any) {
      error.value = e.message;
      addToast(e.message, 'error');
      throw e;
    } finally {
      submitting.value = false;
    }
  }

  async function resolveIncident(id: string, data: ResolveIncidentData) {
    submitting.value = true;
    error.value = null;
    try {
      const res = await api.resolveIncident(id, data);
      currentIncident.value = res.data || null;
      addToast('ปิดเหตุสำเร็จ', 'success');
      return res.data;
    } catch (e: any) {
      error.value = e.message;
      addToast(e.message, 'error');
      throw e;
    } finally {
      submitting.value = false;
    }
  }

  return {
    // State
    incidents,
    currentIncident,
    total,
    page,
    limit,
    loading,
    currentLoading,
    submitting,
    analyzing,
    error,
    toasts,
    // Getters
    totalPages,
    stats,
    // Actions
    addToast,
    removeToast,
    fetchIncidents,
    fetchIncident,
    analyzeText,
    createIncident,
    updateIncident,
    addNote,
    resolveIncident,
  };
});
