<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useIncidentStore } from '@/stores/incidents';
import {
  IncidentStatusLabels,
  IncidentPriorityLabels,
  type Incident,
  type IncidentStatus,
  type IncidentPriority,
} from '@/types';

const route = useRoute();
const router = useRouter();
const store = useIncidentStore();

const incidentId = computed(() => route.params.id as string);

// ── Dialogs ──
const showAssignDialog = ref(false);
const assignName = ref('');
const assignError = ref('');

const showPriorityDialog = ref(false);
const selectedPriority = ref<IncidentPriority>('MEDIUM');

const showNoteDialog = ref(false);
const noteContent = ref('');
const noteAuthor = ref('');
const noteError = ref('');

const showResolveDialog = ref(false);
const resolveNote = ref('');
const resolveBy = ref('');
const resolveError = ref('');

const showStatusDialog = ref(false);
const selectedStatus = ref<IncidentStatus>('NEW');

// ── Status Flow ──
const statusFlow: IncidentStatus[] = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];
const statusFlowLabels: Record<string, string> = {
  NEW: 'สร้างเหตุ',
  ACKNOWLEDGED: 'รับทราบ',
  IN_PROGRESS: 'ดำเนินการ',
  RESOLVED: 'แก้ไขแล้ว',
};

const currentStatusIndex = computed(() => {
  if (!store.currentIncident) return 0;
  return statusFlow.indexOf(store.currentIncident.status);
});

// ── Computed ──
const incident = computed(() => store.currentIncident);

function getTimelineIcon(action: string): string {
  switch (action) {
    case 'CREATED': return 'mdi-alert-circle';
    case 'ASSIGNED': return 'mdi-account-check';
    case 'STATUS_CHANGED': return 'mdi-swap-horizontal';
    case 'PRIORITY_CHANGED': return 'mdi-flag';
    case 'NOTE_ADDED': return 'mdi-note-text';
    case 'RESOLVED': return 'mdi-check-circle';
    default: return 'mdi-circle-small';
  }
}

function getTimelineColor(action: string): string {
  switch (action) {
    case 'CREATED': return 'error';
    case 'RESOLVED': return 'success';
    case 'NOTE_ADDED': return 'info';
    case 'ASSIGNED': return 'primary';
    case 'STATUS_CHANGED': return 'warning';
    case 'PRIORITY_CHANGED': return 'orange';
    default: return 'grey';
  }
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Actions ──
async function handleAssign() {
  if (!assignName.value.trim()) {
    assignError.value = 'กรุณากรอกชื่อผู้รับผิดชอบ';
    return;
  }
  assignError.value = '';
  try {
    await store.updateIncident(incidentId.value, { assigned_to: assignName.value.trim() });
    showAssignDialog.value = false;
    assignName.value = '';
  } catch { /* handled by store */ }
}

async function handleChangePriority() {
  try {
    await store.updateIncident(incidentId.value, { priority: selectedPriority.value });
    showPriorityDialog.value = false;
  } catch { /* handled by store */ }
}

async function handleChangeStatus() {
  try {
    await store.updateIncident(incidentId.value, { status: selectedStatus.value });
    showStatusDialog.value = false;
  } catch { /* handled by store */ }
}

async function handleAddNote() {
  if (!noteContent.value.trim()) {
    noteError.value = 'กรุณากรอกข้อความ';
    return;
  }
  if (!noteAuthor.value.trim()) {
    noteError.value = 'กรุณากรอกชื่อผู้บันทึก';
    return;
  }
  noteError.value = '';
  try {
    await store.addNote(incidentId.value, {
      content: noteContent.value.trim(),
      author: noteAuthor.value.trim(),
    });
    showNoteDialog.value = false;
    noteContent.value = '';
    noteAuthor.value = '';
  } catch { /* handled by store */ }
}

async function handleResolve() {
  if (!resolveNote.value.trim()) {
    resolveError.value = 'กรุณากรอกสรุปการแก้ไข';
    return;
  }
  if (!resolveBy.value.trim()) {
    resolveError.value = 'กรุณากรอกชื่อผู้ปิดเหตุ';
    return;
  }
  resolveError.value = '';
  try {
    await store.resolveIncident(incidentId.value, {
      resolution_notes: resolveNote.value.trim(),
      resolved_by: resolveBy.value.trim(),
    });
    showResolveDialog.value = false;
    resolveNote.value = '';
    resolveBy.value = '';
  } catch { /* handled by store */ }
}

function openAssignDialog() {
  assignName.value = incident.value?.assigned_to || '';
  assignError.value = '';
  showAssignDialog.value = true;
}

function openPriorityDialog() {
  selectedPriority.value = (incident.value?.priority as IncidentPriority) || 'MEDIUM';
  showPriorityDialog.value = true;
}

function openNoteDialog() {
  noteContent.value = '';
  noteAuthor.value = '';
  noteError.value = '';
  showNoteDialog.value = true;
}

function openStatusDialog() {
  selectedStatus.value = (incident.value?.status as IncidentStatus) || 'NEW';
  showStatusDialog.value = true;
}

function openResolveDialog() {
  resolveNote.value = '';
  resolveBy.value = '';
  resolveError.value = '';
  showResolveDialog.value = true;
}

function goBack() {
  router.push('/dashboard');
}

const priorityColors: Record<string, string> = {
  LOW: 'green', MEDIUM: 'orange', HIGH: 'red', CRITICAL: 'deep-orange',
};

const availableStatuses = computed(() => {
  if (!incident.value) return [];
  const current = incident.value.status;
  const transitions: Record<string, IncidentStatus[]> = {
    NEW: ['ACKNOWLEDGED'],
    ACKNOWLEDGED: ['NEW', 'IN_PROGRESS'],
    IN_PROGRESS: ['ACKNOWLEDGED', 'RESOLVED'],
    RESOLVED: [],
  };
  return transitions[current] || [];
});

const canResolve = computed(() => {
  if (!incident.value) return false;
  return incident.value.status !== 'RESOLVED';
});

const showDeleteDialog = ref(false);

async function handleDelete() {
  const ok = await store.deleteIncident(incidentId.value);
  if (ok) {
    showDeleteDialog.value = false;
    router.push('/dashboard');
  }
}

function openDeleteDialog() {
  showDeleteDialog.value = true;
}

const isResolved = computed(() => {
  return incident.value?.status === 'RESOLVED';
});

onMounted(() => {
  store.fetchIncident(incidentId.value);
});
</script>

<template>
  <div>
    <!-- Back Button -->
    <v-btn variant="text" color="primary" class="mb-3" @click="goBack">
      <v-icon start>mdi-arrow-left</v-icon>
      กลับไปแดชบอร์ด
    </v-btn>

    <!-- Loading State -->
    <div v-if="store.currentLoading" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" />
      <div class="text-body-1 mt-3 text-grey">กำลังโหลด...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="store.error && !incident" class="text-center pa-8">
      <v-icon size="64" color="error">mdi-alert-circle-outline</v-icon>
      <div class="text-h6 mt-3">ไม่พบข้อมูล</div>
      <div class="text-body-2 text-grey mt-1">{{ store.error }}</div>
      <v-btn color="primary" variant="outlined" class="mt-4" @click="store.fetchIncident(incidentId)">
        ลองอีกครั้ง
      </v-btn>
    </div>

    <!-- Incident Detail -->
    <div v-else-if="incident">
      <v-row>
        <!-- Main Info -->
        <v-col cols="12" lg="8">
          <v-card class="pa-4 mb-4" elevation="2">
            <div class="d-flex align-start ga-2 mb-3">
              <div>
                <v-chip
                  :color="incident.status === 'RESOLVED' ? 'success' : (incident.status === 'NEW' ? 'error' : 'warning')"
                  label
                  size="small"
                  class="mb-1"
                >
                  {{ IncidentStatusLabels[incident.status] }}
                </v-chip>
                <v-chip
                  :color="priorityColors[incident.priority]"
                  label
                  size="small"
                  variant="outlined"
                  class="ml-1 mb-1"
                >
                  {{ IncidentPriorityLabels[incident.priority] }}
                </v-chip>
              </div>
              <v-spacer />
              <small class="text-grey">{{ formatDateTime(incident.created_at) }}</small>
            </div>

            <h2 class="text-h5 font-weight-bold mb-2">{{ incident.title }}</h2>
            <p class="text-body-1 mb-4" style="white-space: pre-wrap;">{{ incident.description }}</p>

            <v-divider class="mb-3" />

            <v-row class="text-body-2">
              <v-col cols="6" sm="3" class="text-grey">สถานที่</v-col>
              <v-col cols="6" sm="3">{{ incident.location }}</v-col>
              <v-col cols="6" sm="3" class="text-grey">ประเภทเหตุ</v-col>
              <v-col cols="6" sm="3">{{ incident.incident_type }}</v-col>
              <v-col cols="6" sm="3" class="text-grey">ผู้แจ้ง</v-col>
              <v-col cols="6" sm="3">{{ incident.reporter_name }}</v-col>
              <v-col cols="6" sm="3" class="text-grey">ติดต่อ</v-col>
              <v-col cols="6" sm="3">{{ incident.reporter_contact }}</v-col>
              <v-col cols="6" sm="3" class="text-grey">ผู้รับผิดชอบ</v-col>
              <v-col cols="6" sm="3">
                <span v-if="incident.assigned_to">{{ incident.assigned_to }}</span>
                <span v-else class="text-grey">—</span>
              </v-col>
            </v-row>

            <!-- Action Buttons -->
            <v-divider class="my-3" />
            <div class="d-flex flex-wrap ga-2">
              <v-btn
                size="small"
                variant="outlined"
                color="primary"
                @click="openAssignDialog"
                :disabled="isResolved"
              >
                <v-icon start>mdi-account</v-icon>
                มอบหมาย
              </v-btn>
              <v-btn
                size="small"
                variant="outlined"
                color="orange"
                @click="openPriorityDialog"
                :disabled="isResolved"
              >
                <v-icon start>mdi-flag</v-icon>
                เปลี่ยนความรุนแรง
              </v-btn>
              <v-btn
                size="small"
                variant="outlined"
                color="warning"
                @click="openStatusDialog"
                :disabled="isResolved || availableStatuses.length === 0"
              >
                <v-icon start>mdi-swap-horizontal</v-icon>
                เปลี่ยนสถานะ
              </v-btn>
              <v-btn
                size="small"
                variant="outlined"
                color="info"
                @click="openNoteDialog"
                :disabled="isResolved"
              >
                <v-icon start>mdi-note-plus</v-icon>
                เพิ่มบันทึก
              </v-btn>
              <v-btn
                size="small"
                variant="elevated"
                color="success"
                @click="openResolveDialog"
                :disabled="!canResolve"
              >
                <v-icon start>mdi-check-circle</v-icon>
                ปิดเหตุ
              </v-btn>
              <v-btn
                v-if="isResolved"
                size="small"
                variant="outlined"
                color="error"
                @click="openDeleteDialog"
              >
                <v-icon start>mdi-delete</v-icon>
                ลบเหตุ
              </v-btn>
            </div>
          </v-card>

          <!-- Closure Summary -->
          <v-card v-if="isResolved && incident.closure_summary" class="pa-4 mb-4" color="success-lighten-5" elevation="2">
            <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-2">
              <v-icon start color="success">mdi-check-circle</v-icon>
              สรุปการปิดเหตุ / Closure Summary
            </v-card-title>
            <v-card-text class="pa-0">
              <div v-for="line in incident.closure_summary.split('\n')" :key="line" class="text-body-2 py-1">
                {{ line }}
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Timeline -->
        <v-col cols="12" lg="4">
          <v-card class="pa-4" elevation="2">
            <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-3">
              <v-icon start>mdi-timeline</v-icon>
              Timeline / เหตุการณ์
            </v-card-title>

            <v-card-text class="pa-0">
              <!-- Status Flow Steps -->
              <div class="mb-4">
                <v-row no-gutters class="status-stepper">
                  <v-col
                    v-for="(label, idx) in statusFlow"
                    :key="idx"
                    class="text-center"
                  >
                    <div
                      :class="[
                        'step-indicator',
                        idx <= currentStatusIndex ? 'step-active' : 'step-inactive'
                      ]"
                    >
                      <v-icon small>
                        {{ idx < currentStatusIndex ? 'mdi-check-circle' : (idx === currentStatusIndex ? 'mdi-circle-slice-8' : 'mdi-circle-outline') }}
                      </v-icon>
                    </div>
                    <div class="text-caption mt-1" :class="idx <= currentStatusIndex ? 'font-weight-bold' : 'text-grey'">
                      {{ statusFlowLabels[label] }}
                    </div>
                    <div v-if="idx < statusFlow.length - 1" class="step-line"
                      :class="idx < currentStatusIndex ? 'line-active' : 'line-inactive'" />
                  </v-col>
                </v-row>
              </div>

              <v-divider class="mb-3" />

              <div v-if="!incident.timeline || incident.timeline.length === 0" class="text-center pa-4">
                <v-icon size="40" color="grey-lighten-1">mdi-timeline-outline</v-icon>
                <div class="text-body-2 text-grey mt-2">ไม่มีเหตุการณ์</div>
              </div>

              <v-timeline v-else density="compact" side="end">
                <v-timeline-item
                  v-for="entry in incident.timeline"
                  :key="entry.id"
                  :dot-color="getTimelineColor(entry.action)"
                  :icon="getTimelineIcon(entry.action)"
                  size="small"
                >
                  <div class="text-caption text-grey">{{ formatDateTime(entry.created_at) }}</div>
                  <div class="text-body-2 font-weight-medium">{{ entry.action === 'NOTE_ADDED' ? 'บันทึก' : entry.actor }}</div>
                  <div class="text-caption" style="white-space: pre-wrap;">{{ entry.description }}</div>
                </v-timeline-item>
              </v-timeline>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>

    <!-- ── Dialogs ── -->
    <!-- Assign Dialog -->
    <v-dialog v-model="showAssignDialog" max-width="480">
      <v-card class="pa-4">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-3">มอบหมายผู้รับผิดชอบ</v-card-title>
        <v-text-field
          v-model="assignName"
          label="ชื่อผู้รับผิดชอบ"
          placeholder="ชื่อ-นามสกุล"
          :error-messages="assignError"
          variant="outlined"
          density="comfortable"
          autofocus
          @keyup.enter="handleAssign"
        />
        <v-card-actions class="pa-0 mt-2">
          <v-btn variant="text" @click="showAssignDialog = false">ยกเลิก</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" @click="handleAssign" :loading="store.submitting">ยืนยัน</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Priority Dialog -->
    <v-dialog v-model="showPriorityDialog" max-width="480">
      <v-card class="pa-4">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-3">เปลี่ยนระดับความรุนแรง</v-card-title>
        <v-radio-group v-model="selectedPriority">
          <v-radio label="ต่ำ" value="LOW" color="green" />
          <v-radio label="ปานกลาง" value="MEDIUM" color="orange" />
          <v-radio label="สูง" value="HIGH" color="red" />
          <v-radio label="วิกฤต" value="CRITICAL" color="deep-orange" />
        </v-radio-group>
        <v-card-actions class="pa-0 mt-2">
          <v-btn variant="text" @click="showPriorityDialog = false">ยกเลิก</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" @click="handleChangePriority" :loading="store.submitting">ยืนยัน</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Status Dialog -->
    <v-dialog v-model="showStatusDialog" max-width="480">
      <v-card class="pa-4">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-3">เปลี่ยนสถานะ</v-card-title>
        <p class="text-body-2 text-grey mb-2">สถานะปัจจุบัน: {{ IncidentStatusLabels[incident?.status || 'NEW'] }}</p>
        <v-radio-group v-model="selectedStatus">
          <v-radio v-for="s in availableStatuses" :key="s" :label="IncidentStatusLabels[s]" :value="s" />
        </v-radio-group>
        <v-card-actions class="pa-0 mt-2">
          <v-btn variant="text" @click="showStatusDialog = false">ยกเลิก</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" @click="handleChangeStatus" :loading="store.submitting">ยืนยัน</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Note Dialog -->
    <v-dialog v-model="showNoteDialog" max-width="560">
      <v-card class="pa-4">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-3">เพิ่มบันทึกการดำเนินงาน</v-card-title>
        <v-text-field
          v-model="noteAuthor"
          label="ชื่อผู้บันทึก *"
          placeholder="ชื่อ-นามสกุล"
          variant="outlined"
          density="comfortable"
          class="mb-3"
        />
        <v-textarea
          v-model="noteContent"
          label="ข้อความ *"
          placeholder="รายละเอียดการดำเนินงาน..."
          :error-messages="noteError"
          variant="outlined"
          density="comfortable"
          rows="3"
          autofocus
        />
        <v-card-actions class="pa-0 mt-2">
          <v-btn variant="text" @click="showNoteDialog = false">ยกเลิก</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="elevated" @click="handleAddNote" :loading="store.submitting">บันทึก</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Resolve Dialog -->
    <v-dialog v-model="showResolveDialog" max-width="560">
      <v-card class="pa-4">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-3">
          <v-icon start color="success">mdi-check-circle</v-icon>
          ปิดเหตุ / Resolve Incident
        </v-card-title>
        <v-text-field
          v-model="resolveBy"
          label="ชื่อผู้ปิดเหตุ *"
          placeholder="ชื่อ-นามสกุล"
          variant="outlined"
          density="comfortable"
          class="mb-3"
        />
        <v-textarea
          v-model="resolveNote"
          label="สรุปการแก้ไข *"
          placeholder="ระบุวิธีการแก้ไขและผลลัพธ์..."
          :error-messages="resolveError"
          variant="outlined"
          density="comfortable"
          rows="4"
          autofocus
        />
        <v-card-actions class="pa-0 mt-2">
          <v-btn variant="text" @click="showResolveDialog = false">ยกเลิก</v-btn>
          <v-spacer />
          <v-btn color="success" variant="elevated" @click="handleResolve" :loading="store.submitting">ยืนยันการปิดเหตุ</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Confirm Dialog -->
    <v-dialog v-model="showDeleteDialog" max-width="480">
      <v-card class="pa-4">
        <v-card-title class="text-subtitle-1 font-weight-bold pa-0 mb-3">
          <v-icon start color="error">mdi-alert</v-icon>
          ยืนยันการลบ / Confirm Delete
        </v-card-title>
        <p class="text-body-2 mb-2">
          คุณแน่ใจหรือไม่ที่จะลบเหตุ
          <strong>"{{ incident?.title }}"</strong>?
          การกระทำนี้ไม่สามารถย้อนกลับได้
        </p>
        <p class="text-caption text-grey mb-3">
          ข้อมูลทั้งหมดรวมถึง timeline จะถูกลบออกจากระบบ
        </p>
        <v-card-actions class="pa-0 mt-2">
          <v-btn variant="text" @click="showDeleteDialog = false" :disabled="store.submitting">ยกเลิก</v-btn>
          <v-spacer />
          <v-btn color="error" variant="elevated" @click="handleDelete" :loading="store.submitting">
            <v-icon start>mdi-delete</v-icon>
            ยืนยันการลบ
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.status-stepper {
  position: relative;
}
.step-indicator {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 32px;
  height: 32px;
  margin: 0 auto;
  border-radius: 50%;
  background: transparent;
}
.step-active {
  color: rgb(var(--v-theme-primary));
}
.step-inactive {
  color: rgba(0,0,0,0.38);
}
.step-line {
  position: absolute;
  top: 16px;
  left: 50%;
  width: 100%;
  height: 2px;
  z-index: -1;
}
.line-active {
  background: rgb(var(--v-theme-primary));
}
.line-inactive {
  background: rgba(0,0,0,0.12);
}
.v-col {
  position: relative;
}
</style>
