<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useIncidentStore } from '@/stores/incidents';
import * as api from '@/api/client';
import {
  IncidentStatusLabels,
  IncidentPriorityLabels,
  type IncidentImage,
  type IncidentStatus,
  type IncidentPriority,
} from '@/types';

const route = useRoute();
const router = useRouter();
const store = useIncidentStore();

const incidentId = computed(() => route.params.id as string);
const incident = computed(() => store.currentIncident);
const isResolved = computed(() => incident.value?.status === 'RESOLVED');

// ── Images ──
const images = ref<IncidentImage[]>([]);
const imagesLoading = ref(false);

async function loadImages() {
  imagesLoading.value = true;
  try {
    const res = await api.getIncidentImages(incidentId.value);
    images.value = res.data || [];
    // Fetch full data for each image
    for (const img of images.value) {
      const full = await api.getIncidentImage(incidentId.value, img.id);
      img.data = full.data?.data;
    }
  } catch { /* ignore */ }
  imagesLoading.value = false;
}

// ── Flow state (only one section open at a time) ──
const activeAction = ref<string | null>(null); // 'assign' | 'priority' | 'status' | 'note' | 'resolve' | null
const submitting = ref(false);

// ── Form fields ──
const assignName = ref('');
const selectedPriority = ref<IncidentPriority>('MEDIUM');
const selectedStatus = ref<IncidentStatus>('NEW');
const noteAuthor = ref('');
const noteContent = ref('');
const resolveBy = ref('');
const resolveNote = ref('');
const formError = ref('');

// ── Flow step configuration ──
interface FlowStep {
  key: string;
  label: string;
  icon: string;
  color: string;
  doneIcon: string;
}

const flowSteps: FlowStep[] = [
  { key: 'assign', label: 'มอบหมาย', icon: 'mdi-account-plus', color: 'primary', doneIcon: 'mdi-account-check' },
  { key: 'priority', label: 'ความรุนแรง', icon: 'mdi-flag', color: 'orange', doneIcon: 'mdi-flag-check' },
  { key: 'status', label: 'สถานะ', icon: 'mdi-swap-horizontal', color: 'warning', doneIcon: 'mdi-check-circle' },
  { key: 'note', label: 'บันทึก', icon: 'mdi-note-plus', color: 'info', doneIcon: 'mdi-note-text' },
  { key: 'resolve', label: 'ปิดเหตุ', icon: 'mdi-check-circle', color: 'success', doneIcon: 'mdi-check-all' },
];

// Track which steps have been completed (based on data)
const completedSteps = computed(() => {
  const done = new Set<string>();
  if (!incident.value) return done;
  if (incident.value.assigned_to) done.add('assign');
  // priority is always set, so track if it changed from default
  // status tracks if it's been moved past NEW
  if (incident.value.status !== 'NEW') done.add('status');
  if (incident.value.timeline?.some(t => t.action === 'NOTE_ADDED')) done.add('note');
  if (isResolved.value) done.add('resolve');
  return done;
});

// Check if a step's action is available
function isStepAvailable(step: FlowStep): boolean {
  if (isResolved.value && step.key !== 'resolve') return false;
  if (step.key === 'resolve') return incident.value?.status === 'IN_PROGRESS';
  return true;
}

// Toggle action section
function toggleAction(key: string) {
  if (activeAction.value === key) {
    activeAction.value = null;
    return;
  }
  if (!isStepAvailable(flowSteps.find(s => s.key === key)!)) return;
  activeAction.value = key;
  formError.value = '';

  // Pre-fill form fields
  if (key === 'assign') assignName.value = incident.value?.assigned_to || '';
  if (key === 'priority') selectedPriority.value = (incident.value?.priority as IncidentPriority) || 'MEDIUM';
  if (key === 'status') {
    const transitions: Record<string, IncidentStatus[]> = {
      NEW: ['ACKNOWLEDGED'], ACKNOWLEDGED: ['NEW', 'IN_PROGRESS'],
      IN_PROGRESS: ['ACKNOWLEDGED', 'RESOLVED'], RESOLVED: [],
    };
    const avail = transitions[incident.value?.status || 'NEW'] || [];
    selectedStatus.value = avail[avail.length - 1] || 'NEW';
  }
}

// ── Action handlers ──
async function handleAssign() {
  if (!assignName.value.trim()) { formError.value = 'กรุณากรอกชื่อ'; return; }
  submitting.value = true; formError.value = '';
  try {
    await store.updateIncident(incidentId.value, { assigned_to: assignName.value.trim() });
    await store.fetchIncident(incidentId.value);
    activeAction.value = null;
  } catch { /* handled */ }
  submitting.value = false;
}

async function handlePriority() {
  submitting.value = true;
  try {
    await store.updateIncident(incidentId.value, { priority: selectedPriority.value });
    await store.fetchIncident(incidentId.value);
    activeAction.value = null;
  } catch { /* handled */ }
  submitting.value = false;
}

async function handleStatus() {
  submitting.value = true;
  try {
    await store.updateIncident(incidentId.value, { status: selectedStatus.value });
    // Refresh incident data to reflect new status
    await store.fetchIncident(incidentId.value);
    if (selectedStatus.value === 'RESOLVED') activeAction.value = 'resolve';
    else activeAction.value = null;
  } catch { /* handled */ }
  submitting.value = false;
}

async function handleNote() {
  if (!noteContent.value.trim()) { formError.value = 'กรุณากรอกข้อความ'; return; }
  if (!noteAuthor.value.trim()) { formError.value = 'กรุณากรอกชื่อผู้บันทึก'; return; }
  submitting.value = true; formError.value = '';
  try {
    await store.addNote(incidentId.value, { content: noteContent.value.trim(), author: noteAuthor.value.trim() });
    noteContent.value = ''; noteAuthor.value = '';
    activeAction.value = null;
  } catch { /* handled */ }
  submitting.value = false;
}

async function handleResolve() {
  if (!resolveNote.value.trim()) { formError.value = 'กรุณากรอกสรุปการแก้ไข'; return; }
  if (!resolveBy.value.trim()) { formError.value = 'กรุณากรอกชื่อผู้ปิดเหตุ'; return; }
  submitting.value = true; formError.value = '';
  try {
    await store.resolveIncident(incidentId.value, { resolution_notes: resolveNote.value.trim(), resolved_by: resolveBy.value.trim() });
    await store.fetchIncident(incidentId.value);
    resolveNote.value = ''; resolveBy.value = '';
    activeAction.value = null;
  } catch { /* handled */ }
  submitting.value = false;
}

async function handleDelete() {
  const ok = await store.deleteIncident(incidentId.value);
  if (ok) router.push('/dashboard');
}

const showDeleteDialog = ref(false);

function openImage(img: IncidentImage) {
  if (img.data) {
    window.open('data:' + img.mime_type + ';base64,' + img.data, '_blank');
  }
}
function openDeleteDialog() { showDeleteDialog.value = true; }

function goBack() { router.push('/dashboard'); }

const priorityColors: Record<string, string> = {
  LOW: 'green', MEDIUM: 'orange', HIGH: 'red', CRITICAL: 'deep-orange',
};
const priorityItems = [
  { value: 'LOW', label: 'ต่ำ', color: 'green' },
  { value: 'MEDIUM', label: 'ปานกลาง', color: 'orange' },
  { value: 'HIGH', label: 'สูง', color: 'red' },
  { value: 'CRITICAL', label: 'วิกฤต', color: 'deep-orange' },
];

function getTimelineIcon(action: string): string {
  const map: Record<string, string> = {
    CREATED: 'mdi-alert-circle', ASSIGNED: 'mdi-account-check',
    STATUS_CHANGED: 'mdi-swap-horizontal', PRIORITY_CHANGED: 'mdi-flag',
    NOTE_ADDED: 'mdi-note-text', RESOLVED: 'mdi-check-circle',
  };
  return map[action] || 'mdi-circle-small';
}

function getTimelineColor(action: string): string {
  const map: Record<string, string> = {
    CREATED: 'error', RESOLVED: 'success', NOTE_ADDED: 'info',
    ASSIGNED: 'primary', STATUS_CHANGED: 'warning', PRIORITY_CHANGED: 'orange',
  };
  return map[action] || 'grey';
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

onMounted(() => {
  store.fetchIncident(incidentId.value);
  loadImages();
});
</script>

<template>
  <div>
    <v-btn variant="text" color="primary" class="mb-3" @click="goBack">
      <v-icon start>mdi-arrow-left</v-icon> กลับ
    </v-btn>

    <!-- Loading -->
    <div v-if="store.currentLoading" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" />
      <div class="mt-3 text-grey">กำลังโหลด...</div>
    </div>

    <!-- Error -->
    <div v-else-if="store.error && !incident" class="text-center pa-8">
      <v-icon size="64" color="error">mdi-alert-circle-outline</v-icon>
      <div class="text-h6 mt-3">ไม่พบข้อมูล</div>
      <v-btn color="primary" variant="outlined" class="mt-4" @click="store.fetchIncident(incidentId)">ลองอีกครั้ง</v-btn>
    </div>

    <div v-else-if="incident">
      <!-- ── Incident Header ── -->
      <v-card class="pa-4 mb-3" elevation="2">
        <div class="d-flex align-start ga-2 mb-2">
          <v-chip :color="isResolved ? 'success' : (incident.status === 'NEW' ? 'error' : 'warning')" label size="small">
            {{ IncidentStatusLabels[incident.status] }}
          </v-chip>
          <v-chip :color="priorityColors[incident.priority]" label size="small" variant="outlined">
            {{ IncidentPriorityLabels[incident.priority] }}
          </v-chip>
          <v-spacer />
          <small class="text-grey">{{ formatDateTime(incident.created_at) }}</small>
        </div>
        <h2 class="text-h5 font-weight-bold mb-1">{{ incident.title }}</h2>
        <p class="text-body-2 mb-0" style="white-space: pre-wrap;">{{ incident.description }}</p>
        <v-row class="text-caption text-grey mt-2">
          <v-col cols="6"><strong>สถานที่:</strong> {{ incident.location }}</v-col>
          <v-col cols="6"><strong>ประเภท:</strong> {{ incident.incident_type }}</v-col>
          <v-col cols="6"><strong>ผู้แจ้ง:</strong> {{ incident.reporter_name }}</v-col>
          <v-col cols="6"><strong>ติดต่อ:</strong> {{ incident.reporter_contact }}</v-col>
          <v-col cols="6">
            <strong>ผู้รับผิดชอบ:</strong>
            <span v-if="incident.assigned_to" class="font-weight-medium text-primary">{{ incident.assigned_to }}</span>
            <span v-else class="text-grey">—</span>
          </v-col>
        </v-row>
      </v-card>

      <!-- ── Images ── -->
      <v-card v-if="images.length > 0" class="pa-3 mb-3" elevation="2">
        <div class="text-body-2 font-weight-medium mb-2">
          <v-icon start size="small">mdi-image-multiple</v-icon>
          รูปภาพ ({{ images.length }})
        </div>
        <v-row>
          <v-col v-for="img in images" :key="img.id" cols="4" sm="3" md="2">
            <v-img
              :src="'data:' + img.mime_type + ';base64,' + img.data"
              aspect-ratio="1"
              cover
              class="rounded cursor-pointer"
              @click="openImage(img)"
            />
          </v-col>
        </v-row>
      </v-card>

      <!-- ── Flow Actions ── -->
      <v-card class="pa-3 mb-3" elevation="2">
        <div class="d-flex ga-2 flex-wrap mb-1">
          <v-btn
            v-for="step in flowSteps"
            :key="step.key"
            size="small"
            :variant="activeAction === step.key ? 'elevated' : (completedSteps.has(step.key) ? 'tonal' : 'outlined')"
            :color="completedSteps.has(step.key) ? 'success' : step.color"
            @click="toggleAction(step.key)"
            :disabled="!isStepAvailable(step) || submitting"
          >
            <v-icon start>{{ completedSteps.has(step.key) ? step.doneIcon : step.icon }}</v-icon>
            {{ step.label }}
          </v-btn>
          <v-spacer />
          <v-btn v-if="isResolved" size="small" variant="text" color="error" @click="openDeleteDialog">
            <v-icon start>mdi-delete</v-icon> ลบ
          </v-btn>
        </div>

        <!-- ── Assign Panel ── -->
        <v-expand-transition>
          <div v-if="activeAction === 'assign'" class="mt-2 pa-3 bg-grey-lighten-4 rounded">
            <div class="d-flex ga-2">
              <v-text-field v-model="assignName" label="ชื่อผู้รับผิดชอบ" placeholder="ชื่อ-นามสกุล"
                variant="outlined" density="compact" hide-details class="flex-grow-1" autofocus
                :error-messages="activeAction === 'assign' ? formError : ''"
                @keyup.enter="handleAssign" />
              <v-btn color="primary" variant="elevated" @click="handleAssign" :loading="submitting" class="mt-1">ยืนยัน</v-btn>
            </div>
          </div>
        </v-expand-transition>

        <!-- ── Priority Panel ── -->
        <v-expand-transition>
          <div v-if="activeAction === 'priority'" class="mt-2 pa-3 bg-grey-lighten-4 rounded">
            <div class="d-flex ga-2 align-center">
              <span class="text-body-2 mr-2">ระดับความรุนแรง:</span>
              <v-btn-toggle v-model="selectedPriority" color="orange" mandatory density="compact" variant="outlined" divided>
                <v-btn v-for="p in priorityItems" :key="p.value" :value="p.value" size="small">
                  {{ p.label }}
                </v-btn>
              </v-btn-toggle>
              <v-btn color="primary" variant="elevated" @click="handlePriority" :loading="submitting" size="small">ยืนยัน</v-btn>
            </div>
          </div>
        </v-expand-transition>

        <!-- ── Status Panel ── -->
        <v-expand-transition>
          <div v-if="activeAction === 'status'" class="mt-2 pa-3 bg-grey-lighten-4 rounded">
            <div class="d-flex ga-2 align-center">
              <span class="text-body-2 mr-2">เปลี่ยนเป็น:</span>
              <v-btn-toggle v-model="selectedStatus" color="warning" mandatory density="compact" variant="outlined" divided>
                <v-btn v-for="st in (incident.status === 'NEW' ? ['ACKNOWLEDGED'] : incident.status === 'ACKNOWLEDGED' ? ['NEW', 'IN_PROGRESS'] : ['ACKNOWLEDGED', 'RESOLVED'])" :key="st" :value="st" size="small">
                  {{ st === 'NEW' ? 'ใหม่' : st === 'ACKNOWLEDGED' ? 'รับทราบ' : st === 'IN_PROGRESS' ? 'ดำเนินการ' : 'แก้ไขแล้ว' }}
                </v-btn>
              </v-btn-toggle>
              <v-btn color="primary" variant="elevated" @click="handleStatus" :loading="submitting" size="small">ยืนยัน</v-btn>
            </div>
          </div>
        </v-expand-transition>

        <!-- ── Note Panel ── -->
        <v-expand-transition>
          <div v-if="activeAction === 'note'" class="mt-2 pa-3 bg-grey-lighten-4 rounded">
            <v-text-field v-model="noteAuthor" label="ชื่อผู้บันทึก *" placeholder="ชื่อ-นามสกุล"
              variant="outlined" density="compact" hide-details class="mb-2" />
            <div class="d-flex ga-2">
              <v-textarea v-model="noteContent" label="ข้อความ *" placeholder="รายละเอียดการดำเนินงาน..."
                variant="outlined" density="compact" rows="2" hide-details class="flex-grow-1"
                :error-messages="activeAction === 'note' ? formError : ''" />
              <v-btn color="primary" variant="elevated" @click="handleNote" :loading="submitting" class="mt-1">บันทึก</v-btn>
            </div>
          </div>
        </v-expand-transition>

        <!-- ── Resolve Panel ── -->
        <v-expand-transition>
          <div v-if="activeAction === 'resolve'" class="mt-2 pa-3 bg-grey-lighten-4 rounded">
            <v-text-field v-model="resolveBy" label="ชื่อผู้ปิดเหตุ *" placeholder="ชื่อ-นามสกุล"
              variant="outlined" density="compact" hide-details class="mb-2" />
            <div class="d-flex ga-2">
              <v-textarea v-model="resolveNote" label="สรุปการแก้ไข *" placeholder="วิธีการแก้ไขและผลลัพธ์..."
                variant="outlined" density="compact" rows="2" hide-details class="flex-grow-1"
                :error-messages="activeAction === 'resolve' ? formError : ''" />
              <v-btn color="success" variant="elevated" @click="handleResolve" :loading="submitting" class="mt-1">ปิดเหตุ</v-btn>
            </div>
          </div>
        </v-expand-transition>
      </v-card>

      <!-- ── Closure Summary ── -->
      <v-card v-if="isResolved && incident.closure_summary" class="pa-4 mb-3" color="success-lighten-5" elevation="2">
        <div class="text-subtitle-2 font-weight-bold mb-2">
          <v-icon start color="success">mdi-check-circle</v-icon> สรุปการปิดเหตุ
        </div>
        <div v-for="line in incident.closure_summary.split('\n')" :key="line" class="text-body-2 py-1">{{ line }}</div>
      </v-card>

      <!-- ── Timeline ── -->
      <v-card class="pa-4" elevation="2">
        <div class="text-subtitle-2 font-weight-bold mb-3">
          <v-icon start>mdi-timeline</v-icon> Timeline
        </div>
        <div v-if="!incident.timeline?.length" class="text-center pa-4 text-grey">ไม่มีเหตุการณ์</div>
        <v-timeline v-else density="compact" side="end">
          <v-timeline-item v-for="entry in incident.timeline" :key="entry.id"
            :dot-color="getTimelineColor(entry.action)" :icon="getTimelineIcon(entry.action)" size="small">
            <div class="text-caption text-grey">{{ formatDateTime(entry.created_at) }}</div>
            <div class="text-body-2 font-weight-medium">{{ entry.actor }}</div>
            <div class="text-caption" style="white-space: pre-wrap;">{{ entry.description }}</div>
          </v-timeline-item>
        </v-timeline>
      </v-card>
    </div>

    <!-- Delete Dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="400">
      <v-card class="pa-4">
        <div class="text-subtitle-1 font-weight-bold mb-2">
          <v-icon start color="error">mdi-alert</v-icon> ยืนยันการลบ
        </div>
        <p class="text-body-2 mb-2">ลบเหตุ <strong>"{{ incident?.title }}"</strong>? ไม่สามารถกู้คืนได้</p>
        <v-card-actions class="pa-0 mt-2">
          <v-btn variant="text" @click="showDeleteDialog = false">ยกเลิก</v-btn>
          <v-spacer />
          <v-btn color="error" variant="elevated" @click="handleDelete" :loading="store.submitting">
            <v-icon start>mdi-delete</v-icon> ยืนยันการลบ
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
