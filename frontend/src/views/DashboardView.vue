<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useIncidentStore } from '@/stores/incidents';
import { IncidentStatusLabels, IncidentPriorityLabels } from '@/types';
import type { Incident, ListIncidentsParams } from '@/types';

const router = useRouter();
const store = useIncidentStore();

const filterStatus = ref<string>('');
const filterPriority = ref<string>('');
const searchQuery = ref<string>('');

const statusFilters = [
  { value: '', title: 'ทั้งหมด' },
  { value: 'NEW', title: 'ใหม่' },
  { value: 'ACKNOWLEDGED', title: 'รับทราบ' },
  { value: 'IN_PROGRESS', title: 'กำลังดำเนินการ' },
  { value: 'RESOLVED', title: 'แก้ไขแล้ว' },
];

const priorityFilters = [
  { value: '', title: 'ทั้งหมด' },
  { value: 'LOW', title: 'ต่ำ', color: 'green' },
  { value: 'MEDIUM', title: 'ปานกลาง', color: 'orange' },
  { value: 'HIGH', title: 'สูง', color: 'red' },
  { value: 'CRITICAL', title: 'วิกฤต', color: 'deep-orange' },
];

const cardColors: Record<string, string> = {
  NEW: 'error-lighten-5',
  ACKNOWLEDGED: 'warning-lighten-5',
  IN_PROGRESS: 'info-lighten-5',
  RESOLVED: 'success-lighten-5',
};

const statusColors: Record<string, string> = {
  NEW: 'error',
  ACKNOWLEDGED: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
};

const priorityColors: Record<string, string> = {
  LOW: 'green',
  MEDIUM: 'orange',
  HIGH: 'red',
  CRITICAL: 'deep-orange',
};

function statusColor(status: string): string {
  return statusColors[status] || 'grey';
}

function chipColor(priority: string): string {
  return priorityColors[priority] || 'grey';
}

const filteredIncidents = computed(() => {
  let list = store.incidents;

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.location.toLowerCase().includes(q) ||
        i.incident_type.toLowerCase().includes(q)
    );
  }

  return list;
});

async function loadIncidents(params?: ListIncidentsParams) {
  const p: ListIncidentsParams = { page: 1, limit: 100 };
  if (filterStatus.value) p.status = filterStatus.value as any;
  if (filterPriority.value) p.priority = filterPriority.value as any;
  await store.fetchIncidents(p);
}

function viewIncident(id: string) {
  router.push(`/incidents/${id}`);
}

function getRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diff < 60) return 'เมื่อสักครู่';
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} วันที่แล้ว`;
  return date.toLocaleDateString('th-TH');
}

function onFilterStatusChange(val: string) {
  filterStatus.value = val;
  loadIncidents();
}

function onFilterPriorityChange(val: string) {
  filterPriority.value = val;
  loadIncidents();
}

onMounted(() => {
  loadIncidents();
});
</script>

<template>
  <div>
    <!-- Header -->
    <div class="d-flex align-center mb-4 flex-wrap ga-2">
      <v-icon start color="primary" size="large">mdi-view-dashboard</v-icon>
      <h1 class="text-h5 font-weight-bold mb-0">แดชบอร์ด / Dashboard</h1>
      <v-spacer></v-spacer>
      <v-btn color="error" variant="elevated" to="/report">
        <v-icon start>mdi-alert-plus</v-icon>
        แจ้งเหตุ
      </v-btn>
    </div>

    <!-- Summary Cards -->
    <v-row class="mb-4">
      <v-col cols="6" sm="3">
        <v-card class="pa-3 text-center" color="primary" variant="tonal">
          <v-card-text>
            <div class="text-h4 font-weight-bold">{{ store.stats.total }}</div>
            <div class="text-caption">ทั้งหมด</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card class="pa-3 text-center" color="error" variant="tonal">
          <v-card-text>
            <div class="text-h4 font-weight-bold">{{ store.stats.new }}</div>
            <div class="text-caption">ใหม่</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card class="pa-3 text-center" color="warning" variant="tonal">
          <v-card-text>
            <div class="text-h4 font-weight-bold">{{ store.stats.inProgress }}</div>
            <div class="text-caption">กำลังดำเนินการ</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="6" sm="3">
        <v-card class="pa-3 text-center" color="success" variant="tonal">
          <v-card-text>
            <div class="text-h4 font-weight-bold">{{ store.stats.resolved }}</div>
            <div class="text-caption">แก้ไขแล้ว</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Filters -->
    <v-card class="pa-3 mb-4" elevation="1">
      <v-row dense align="center">
        <v-col cols="12" sm="4">
          <v-text-field
            v-model="searchQuery"
            label="ค้นหา"
            placeholder="หัวข้อ / สถานที่ / ประเภท..."
            variant="outlined"
            density="compact"
            hide-details
            clearable
            prepend-inner-icon="mdi-magnify"
          />
        </v-col>
        <v-col cols="6" sm="3">
          <v-select
            v-model="filterStatus"
            :items="statusFilters"
            item-title="title"
            item-value="value"
            label="สถานะ"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            @update:model-value="onFilterStatusChange"
          />
        </v-col>
        <v-col cols="6" sm="3">
          <v-select
            v-model="filterPriority"
            :items="priorityFilters"
            item-title="title"
            item-value="value"
            label="ความรุนแรง"
            variant="outlined"
            density="compact"
            hide-details
            clearable
            @update:model-value="onFilterPriorityChange"
          />
        </v-col>
        <v-col cols="12" sm="2">
          <v-btn variant="text" color="primary" @click="loadIncidents" block>
            <v-icon start>mdi-refresh</v-icon>
            โหลดใหม่
          </v-btn>
        </v-col>
      </v-row>
    </v-card>

    <!-- Loading State -->
    <div v-if="store.loading" class="text-center pa-8">
      <v-progress-circular indeterminate color="primary" size="48" />
      <div class="text-body-1 mt-3 text-grey">กำลังโหลดข้อมูล...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="store.error && !store.loading" class="text-center pa-8">
      <v-icon size="64" color="error">mdi-alert-circle-outline</v-icon>
      <div class="text-h6 mt-3">เกิดข้อผิดพลาด</div>
      <div class="text-body-2 text-grey mt-1">{{ store.error }}</div>
      <v-btn color="primary" variant="outlined" class="mt-4" @click="loadIncidents">
        <v-icon start>mdi-refresh</v-icon>
        ลองอีกครั้ง
      </v-btn>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredIncidents.length === 0 && !store.error" class="text-center pa-8">
      <v-icon size="64" color="grey-lighten-1">mdi-inbox-outline</v-icon>
      <div class="text-h6 mt-3 text-grey">ไม่มีรายการแจ้งเหตุ</div>
      <div class="text-body-2 text-grey mt-1">
        {{
          filterStatus || filterPriority
            ? 'ไม่พบเหตุที่ตรงกับตัวกรองที่เลือก'
            : 'ยังไม่มีการแจ้งเหตุในระบบ'
        }}
      </div>
      <v-btn color="error" variant="elevated" class="mt-4" to="/report">
        <v-icon start>mdi-alert-plus</v-icon>
        แจ้งเหตุครั้งแรก
      </v-btn>
    </div>

    <!-- Incident Cards -->
    <div v-else>
      <v-row>
        <v-col
          v-for="incident in filteredIncidents"
          :key="incident.id"
          cols="12" sm="6" lg="4"
        >
          <v-card
            :color="cardColors[incident.status] || 'grey-lighten-4'"
            variant="tonal"
            class="cursor-pointer incident-card"
            @click="viewIncident(incident.id)"
          >
            <v-card-title class="text-subtitle-1 font-weight-bold d-flex align-center py-2">
              <span class="text-truncate">{{ incident.title }}</span>
              <v-spacer />
              <v-chip
                :color="statusColor(incident.status)"
                size="x-small"
                variant="flat"
                label
                class="ml-1"
              >
                {{ IncidentStatusLabels[incident.status] }}
              </v-chip>
            </v-card-title>

            <v-card-text class="py-1">
              <div class="d-flex align-center ga-1 text-caption text-grey mb-1">
                <v-icon size="small">mdi-map-marker</v-icon>
                <span class="text-truncate">{{ incident.location }}</span>
              </div>
              <div class="d-flex align-center ga-1 text-caption text-grey mb-1">
                <v-icon size="small">mdi-tag</v-icon>
                <span>{{ incident.incident_type }}</span>
              </div>
              <div class="d-flex align-center ga-1 text-caption">
                <v-chip :color="chipColor(incident.priority)" size="x-small" variant="flat" label>
                  {{ IncidentPriorityLabels[incident.priority] }}
                </v-chip>
                <span class="ml-auto text-grey">
                  {{ getRelativeTime(incident.created_at) }}
                </span>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
    </div>
  </div>
</template>

<style scoped>
.incident-card {
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.incident-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
}
</style>
