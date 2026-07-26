# School SOS 🏫🚨

ระบบแจ้งเหตุและจัดการเหตุการณ์ในโรงเรียน (School Incident Reporting & Management System)

## Features

- 📝 **รายงานเหตุ** — แจ้งเหตุการณ์ผ่านฟอร์มพร้อมข้อมูลครบถ้วน
- 📊 **แดชบอร์ด** — ภาพรวมสถิติและรายการเหตุการณ์ทั้งหมด
- 🔄 **Status Workflow** — จัดการสถานะ: ใหม่ → รับทราบ → ดำเนินการ → แก้ไข
- 👤 **มอบหมายงาน** — ระบุผู้รับผิดชอบ
- 🏷️ **ระดับความรุนแรง** — กำหนด priority: ต่ำ, ปานกลาง, สูง, วิกฤต
- 📋 **Timeline** — บันทึกเหตุการณ์ทั้งหมดอัตโนมัติ
- 📝 **บันทึกการดำเนินงาน** — เพิ่มบันทึกระหว่างดำเนินการ
- ✅ **ปิดเหตุ** — สรุปการแก้ไขพร้อม Closure Summary อัตโนมัติ

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + TypeScript + Vuetify 3 + Pinia + Vite |
| Backend | Hono + TypeScript + Zod (Cloudflare Workers) |
| Database | Cloudflare D1 (SQLite) |

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Wrangler CLI (for backend dev)

### Backend Setup

```bash
cd backend
npm install
npm run db:migrate    # Apply D1 migrations locally
npm run dev           # Start dev server at localhost:8787
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev           # Start dev server at localhost:5173
```

The frontend proxies `/api` requests to the backend at `localhost:8787`.

### Build

```bash
# Backend
cd backend && npm run build

# Frontend
cd frontend && npm run build
```

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/v1/incidents` | Create incident |
| GET | `/api/v1/incidents` | List incidents |
| GET | `/api/v1/incidents/:id` | Get incident detail |
| PATCH | `/api/v1/incidents/:id` | Update incident |
| POST | `/api/v1/incidents/:id/notes` | Add note |
| POST | `/api/v1/incidents/:id/resolve` | Resolve incident |

## Project Structure

```
school-sos/
├── backend/           # Cloudflare Workers API
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/incidents.ts
│   │   ├── types/index.ts
│   │   ├── db/schema.ts
│   │   └── middleware/error.ts
│   ├── migrations/
│   ├── wrangler.toml
│   └── package.json
├── frontend/          # Vue 3 SPA
│   ├── src/
│   │   ├── views/       # Dashboard, Report, IncidentDetail
│   │   ├── stores/      # Pinia store
│   │   ├── api/         # API client
│   │   ├── router/      # Vue Router
│   │   └── types/       # TypeScript types
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── llms.txt
├── README.md
└── deploy-plan.md
```

## Golden Flow

1. ผู้ใช้แจ้งเหตุ → `/report`
2. Dashboard แสดง Incident → `/dashboard`
3. เปิด Incident Detail → `/incidents/:id`
4. ระบุผู้รับผิดชอบ → Assign dialog
5. กำหนด Priority → Priority dialog
6. เปลี่ยน Status → Status dialog
7. เพิ่มบันทึก → Note dialog
8. ปิด Incident → Resolve dialog
9. แสดง Timeline → อัตโนมัติ
10. แสดง Closure Summary → อัตโนมัติเมื่อปิดเหตุ

## Out of Scope (P0 Only)
- ❌ AI / Machine Learning
- ❌ Login / Authentication / OAuth
- ❌ LINE Bot / Notifications / WebSocket
- ❌ GPS / Location Tracking
- ❌ Multi-School Support
- ❌ PDF Reports / Analytics
