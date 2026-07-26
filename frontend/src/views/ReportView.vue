<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useIncidentStore } from '@/stores/incidents';
import type { CreateIncidentData } from '@/types';

const router = useRouter();
const store = useIncidentStore();

const form = reactive<CreateIncidentData>({
  title: '',
  description: '',
  location: '',
  reporter_name: '',
  reporter_contact: '',
  incident_type: '',
  priority: 'MEDIUM',
});

const incidentTypes = [
  'อุบัติเหตุ',
  'ทะเลาะวิวาท',
  'ทรัพย์สินเสียหาย',
  'เจ็บป่วย',
  'บุกรุก',
  'อัคคีภัย',
  'เหตุร้ายแรงอื่นๆ',
];

const priorities = [
  { value: 'LOW', title: 'ต่ำ', color: 'green' },
  { value: 'MEDIUM', title: 'ปานกลาง', color: 'orange' },
  { value: 'HIGH', title: 'สูง', color: 'red' },
  { value: 'CRITICAL', title: 'วิกฤต', color: 'deep-orange' },
];

const errors = ref<Record<string, string>>({});
const formRef = ref<any>(null);

function validate(): boolean {
  const errs: Record<string, string> = {};

  if (!form.title.trim()) errs.title = 'กรุณากรอกหัวข้อ';
  else if (form.title.length > 200) errs.title = 'หัวข้อต้องไม่เกิน 200 ตัวอักษร';

  if (!form.description.trim()) errs.description = 'กรุณากรอกรายละเอียด';
  else if (form.description.length > 5000) errs.description = 'รายละเอียดต้องไม่เกิน 5000 ตัวอักษร';

  if (!form.location.trim()) errs.location = 'กรุณากรอกสถานที่';
  else if (form.location.length > 300) errs.location = 'สถานที่ต้องไม่เกิน 300 ตัวอักษร';

  if (!form.reporter_name.trim()) errs.reporter_name = 'กรุณากรอกชื่อผู้แจ้ง';
  else if (form.reporter_name.length > 100) errs.reporter_name = 'ชื่อต้องไม่เกิน 100 ตัวอักษร';

  if (!form.reporter_contact.trim()) errs.reporter_contact = 'กรุณากรอกข้อมูลติดต่อ';
  else if (form.reporter_contact.length > 100) errs.reporter_contact = 'ข้อมูลติดต่อต้องไม่เกิน 100 ตัวอักษร';

  if (!form.incident_type) errs.incident_type = 'กรุณาเลือกประเภทเหตุ';

  errors.value = errs;
  return Object.keys(errs).length === 0;
}

async function handleSubmit() {
  if (!validate()) return;

  try {
    const incident = await store.createIncident({ ...form });
    if (incident) {
      router.push(`/incidents/${incident.id}`);
    }
  } catch {
    // Toast handled by store
  }
}

function resetForm() {
  form.title = '';
  form.description = '';
  form.location = '';
  form.reporter_name = '';
  form.reporter_contact = '';
  form.incident_type = '';
  form.priority = 'MEDIUM';
  errors.value = {};
}
</script>

<template>
  <v-row justify="center">
    <v-col cols="12" md="8" lg="6">
      <v-card class="pa-4" elevation="2">
        <v-card-title class="text-h5 font-weight-bold pa-0 mb-4">
          <v-icon start color="error" size="large">mdi-alert-plus</v-icon>
          แจ้งเหตุ / Report Incident
        </v-card-title>

        <v-card-text class="pa-0">
          <v-form @submit.prevent="handleSubmit" ref="formRef">
            <!-- Title -->
            <v-text-field
              v-model="form.title"
              label="หัวข้อ *"
              placeholder="ระบุหัวข้อเหตุการณ์"
              :error-messages="errors.title"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              clearable
            />

            <!-- Description -->
            <v-textarea
              v-model="form.description"
              label="รายละเอียด *"
              placeholder="อธิบายเหตุการณ์ที่เกิดขึ้น"
              :error-messages="errors.description"
              variant="outlined"
              density="comfortable"
              rows="4"
              class="mb-3"
              clearable
            />

            <!-- Location -->
            <v-text-field
              v-model="form.location"
              label="สถานที่ *"
              placeholder="อาคาร / ชั้น / ห้อง"
              :error-messages="errors.location"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              clearable
            />

            <!-- Reporter Name -->
            <v-text-field
              v-model="form.reporter_name"
              label="ชื่อผู้แจ้ง *"
              placeholder="ชื่อ-นามสกุล"
              :error-messages="errors.reporter_name"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              clearable
            />

            <!-- Reporter Contact -->
            <v-text-field
              v-model="form.reporter_contact"
              label="ข้อมูลติดต่อ *"
              placeholder="เบอร์โทร / อีเมล"
              :error-messages="errors.reporter_contact"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              clearable
            />

            <!-- Incident Type -->
            <v-select
              v-model="form.incident_type"
              :items="incidentTypes"
              label="ประเภทเหตุ *"
              :error-messages="errors.incident_type"
              variant="outlined"
              density="comfortable"
              class="mb-3"
              clearable
            />

            <!-- Priority -->
            <v-label class="mb-2 font-weight-medium">ระดับความรุนแรง</v-label>
            <v-radio-group v-model="form.priority" inline class="mb-4">
              <v-radio
                v-for="p in priorities"
                :key="p.value"
                :label="p.title"
                :value="p.value"
                :color="p.color"
              />
            </v-radio-group>

            <!-- Actions -->
            <v-row class="mt-2">
              <v-col cols="6">
                <v-btn
                  variant="outlined"
                  block
                  size="large"
                  @click="resetForm"
                  :disabled="store.submitting"
                >
                  ล้าง
                </v-btn>
              </v-col>
              <v-col cols="6">
                <v-btn
                  color="primary"
                  variant="elevated"
                  block
                  size="large"
                  @click="handleSubmit"
                  :loading="store.submitting"
                  :disabled="store.submitting"
                >
                  <v-icon start>mdi-send</v-icon>
                  แจ้งเหตุ
                </v-btn>
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>
