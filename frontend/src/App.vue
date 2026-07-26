<script setup lang="ts">
import { useIncidentStore } from '@/stores/incidents';
import { useRouter, useRoute } from 'vue-router';

const store = useIncidentStore();
const router = useRouter();
const route = useRoute();

const navItems = [
  { title: 'แดชบอร์ด', icon: 'mdi-view-dashboard', to: '/dashboard' },
  { title: 'แจ้งเหตุ', icon: 'mdi-alert-plus', to: '/report' },
];

function goHome() {
  router.push('/dashboard');
}
</script>

<template>
  <v-app>
    <!-- App Bar -->
    <v-app-bar color="primary" density="compact" elevation="2">
      <v-app-bar-nav-icon @click="goHome">
        <v-icon>mdi-school</v-icon>
      </v-app-bar-nav-icon>
      <v-app-bar-title class="text-body-1 font-weight-bold cursor-pointer" @click="goHome">
        School SOS
      </v-app-bar-title>
      <template #append>
        <v-btn
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :variant="route.path === item.to ? 'flat' : 'text'"
          class="text-none"
          size="small"
        >
          <v-icon start>{{ item.icon }}</v-icon>
          {{ item.title }}
        </v-btn>
      </template>
    </v-app-bar>

    <!-- Main Content -->
    <v-main>
      <v-container fluid class="pa-4">
        <router-view />
      </v-container>
    </v-main>

    <!-- Bottom Navigation (Mobile) -->
    <v-bottom-navigation
      v-if="$vuetify.display.smAndDown"
      v-model="route.path"
      color="primary"
      grow
    >
      <v-btn value="/dashboard" to="/dashboard">
        <v-icon>mdi-view-dashboard</v-icon>
        <span>แดชบอร์ด</span>
      </v-btn>
      <v-btn value="/report" to="/report">
        <v-icon>mdi-alert-plus</v-icon>
        <span>แจ้งเหตุ</span>
      </v-btn>
    </v-bottom-navigation>

    <!-- Toast Notifications -->
    <div class="toast-container">
      <v-slide-y-reverse-transition group>
        <v-alert
          v-for="toast in store.toasts"
          :key="toast.id"
          :type="toast.type"
          closable
          variant="elevated"
          density="compact"
          class="mb-2"
          style="min-width: 300px; max-width: 450px;"
          @click:close="store.removeToast(toast.id)"
        >
          {{ toast.message }}
        </v-alert>
      </v-slide-y-reverse-transition>
    </div>
  </v-app>
</template>

<style>
body, html, #app {
  font-family: 'Kanit', sans-serif !important;
}

.toast-container {
  position: fixed;
  top: 64px;
  right: 16px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.cursor-pointer {
  cursor: pointer;
}

@media (max-width: 600px) {
  .toast-container {
    left: 16px;
    right: 16px;
  }
  .toast-container .v-alert {
    min-width: auto !important;
    max-width: none !important;
  }
}
</style>
