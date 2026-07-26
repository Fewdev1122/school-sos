<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useIncidentStore } from '@/stores/incidents';
import type { AnalyzeResult, CreateIncidentData } from '@/types';

const router = useRouter();
const store = useIncidentStore();

const rawText = ref('');
const analyzing = ref(false);
const analyzed = ref(false);
const analysisResult = ref<AnalyzeResult | null>(null);
const errors = ref('');

const incidentTypes = [
  'อุบัติเหตุ',
  'ทะเลาะวิวาท',
  'ทรัพย์สินเสียหาย',
  'เจ็บป่วย',
  'บุกรุก',
  'อัคคีภัย',
  'ภัยธรรมชาติ',
  'ไฟฟ้าขัดข้อง',
  'เหตุร้ายแรงอื่นๆ',
];

const priorities = [
  { value: 'LOW', title: 'ต่ำ', color: 'green' },
  { value: 'MEDIUM', title: 'ปานกลาง', color: 'orange' },
  { value: 'HIGH', title: 'สูง', color: 'red' },
  { value: 'CRITICAL', title: 'วิกฤต', color: 'deep-orange' },
];

async function handleAnalyze() {
  if (!rawText.value.trim()) {
    errors.value = 'กรุณากรอกรายละเอียดเหตุการณ์';
    return;
  }
  errors.value = '';
  analyzing.value = true;
  analyzed.value = false;
  analysisResult.value = null;

  const result = await store.analyzeText(rawText.value.trim());
  if (result) {
    analysisResult.value = result;
    analyzed.value = true;
  } else {
    errors.value = 'ไม่สามารถวิเคราะห์เหตุการณ์ได้ กรุณาลองใหม่อีกครั้ง';
  }
  analyzing.value = false;
}

async function handleApprove() {
  if (!analysisResult.value) return;

  const data: CreateIncidentData = {
    title: analysisResult.value.title,
    description: analysisResult.value.description,
    location: analysisResult.value.location,
    reporter_name: analysisResult.value.reporter_name,
    reporter_contact: analysisResult.value.reporter_contact,
    incident_type: analysisResult.value.incident_type,
    priority: analysisResult.value.priority,
  };

  try {
    const incident = await store.createIncident(data);
    if (incident) {
      router.push(`/incidents/${incident.id}`);
    }
  } catch {
    // Toast handled by store
  }
}

function handleEdit() {
  analyzed.value = false;
}

function handleReset() {
  rawText.value = '';
  analyzed.value = false;
  analysisResult.value = null;
  errors.value = '';
}

function updateAnalyzedField(field: keyof AnalyzeResult, value: string) {
  if (analysisResult.value) {
    (analysisResult.value as any)[field] = value;
  }
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
          <!-- Step 1: Raw text input -->
          <template v-if="!analyzed">
            <p class="text-body-2 text-medium-emphasis mb-3">
              เล่ารายละเอียดเหตุการณ์ที่เกิดขึ้น ระบบ AI จะวิเคราะห์และแยกข้อมูลให้อัตโนมัติ
            </p>

            <v-textarea
              v-model="rawText"
              label="เล่าเหตุการณ์ *"
              placeholder="เช่น: เมื่อเวลา 10.00 น. มีนักเรียนทะเลาะวิวาทกันที่หน้าอาคารเรียน ชั้น ม.5/2 ..."
              :error-messages="errors"
              variant="outlined"
              density="comfortable"
              rows="6"
              class="mb-3"
              clearable
              auto-grow
            />

            <v-alert
              v-if="errors && !rawText.trim()"
              type="warning"
              variant="tonal"
              class="mb-3"
              density="compact"
            >
              {{ errors }}
            </v-alert>

            <v-row class="mt-2">
              <v-col cols="6">
                <v-btn
                  variant="outlined"
                  block
                  size="large"
                  @click="handleReset"
                  :disabled="analyzing"
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
                  @click="handleAnalyze"
                  :loading="analyzing"
                  :disabled="analyzing || !rawText.trim()"
                >
                  <v-icon start>mdi-robot</v-icon>
                  วิเคราะห์ด้วย AI
                </v-btn>
              </v-col>
            </v-row>
          </template>

          <!-- Step 2: AI analysis preview -->
          <template v-else-if="analysisResult">
            <v-alert
              type="success"
              variant="tonal"
              class="mb-4"
              density="compact"
              closable
            >
              ✅ AI วิเคราะห์เหตุการณ์เรียบร้อย — กรุณาตรวจสอบข้อมูลก่อนส่ง
            </v-alert>

            <v-form @submit.prevent="handleApprove">
              <!-- Title -->
              <v-text-field
                :model-value="analysisResult.title"
                @update:model-value="(v: string) => updateAnalyzedField('title', v)"
                label="หัวข้อ"
                variant="outlined"
                density="comfortable"
                class="mb-3"
                clearable
              />

              <!-- Description -->
              <v-textarea
                :model-value="analysisResult.description"
                @update:model-value="(v: string) => updateAnalyzedField('description', v)"
                label="รายละเอียด"
                variant="outlined"
                density="comfortable"
                rows="3"
                class="mb-3"
                auto-grow
              />

              <!-- Location -->
              <v-text-field
                :model-value="analysisResult.location"
                @update:model-value="(v: string) => updateAnalyzedField('location', v)"
                label="สถานที่"
                variant="outlined"
                density="comfortable"
                class="mb-3"
                clearable
              />

              <!-- Reporter Name -->
              <v-text-field
                :model-value="analysisResult.reporter_name"
                @update:model-value="(v: string) => updateAnalyzedField('reporter_name', v)"
                label="ชื่อผู้แจ้ง"
                variant="outlined"
                density="comfortable"
                class="mb-3"
                clearable
              />

              <!-- Reporter Contact -->
              <v-text-field
                :model-value="analysisResult.reporter_contact"
                @update:model-value="(v: string) => updateAnalyzedField('reporter_contact', v)"
                label="ข้อมูลติดต่อ"
                variant="outlined"
                density="comfortable"
                class="mb-3"
                clearable
              />

              <!-- Incident Type -->
              <v-select
                :model-value="analysisResult.incident_type"
                @update:model-value="(v: any) => updateAnalyzedField('incident_type', v || 'เหตุร้ายแรงอื่นๆ')"
                :items="incidentTypes"
                label="ประเภทเหตุ"
                variant="outlined"
                density="comfortable"
                class="mb-3"
              />

              <!-- Priority -->
              <v-label class="mb-2 font-weight-medium">ระดับความรุนแรง</v-label>
              <v-radio-group
                :model-value="analysisResult.priority"
                @update:model-value="(v: any) => updateAnalyzedField('priority', v || 'MEDIUM')"
                inline
                class="mb-4"
              >
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
                <v-col cols="4">
                  <v-btn
                    variant="outlined"
                    block
                    size="large"
                    @click="handleEdit"
                    :disabled="store.submitting"
                  >
                    <v-icon start>mdi-pencil</v-icon>
                    แก้ไข
                  </v-btn>
                </v-col>
                <v-col cols="4">
                  <v-btn
                    variant="outlined"
                    block
                    size="large"
                    @click="handleReset"
                    :disabled="store.submitting"
                  >
                    ยกเลิก
                  </v-btn>
                </v-col>
                <v-col cols="4">
                  <v-btn
                    color="primary"
                    variant="elevated"
                    block
                    size="large"
                    @click="handleApprove"
                    :loading="store.submitting"
                    :disabled="store.submitting"
                  >
                    <v-icon start>mdi-check-circle</v-icon>
                    อนุมัติ
                  </v-btn>
                </v-col>
              </v-row>
            </v-form>
          </template>
        </v-card-text>
      </v-card>
    </v-col>
  </v-row>
</template>
