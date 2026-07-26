import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import incidentsRouter from './routes/incidents';
import analyzeRouter from './routes/analyze';
import type { D1Database } from '@cloudflare/workers-types';

type Bindings = {
  DB: D1Database;
  AI: Ai;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Health check
app.get('/api/health', (c) => {
  return c.json({ success: true, message: 'School SOS API is running', version: '1.0.0' });
});

// Routes
app.route('/api/v1/incidents', incidentsRouter);
app.route('/api/v1/analyze', analyzeRouter);

// 404 handler
app.notFound((c) => {
  return c.json({ success: false, error: 'Not Found', message: `Route ${c.req.method} ${c.req.path} not found` }, 404);
});

// Global error handler
app.onError((err, c) => {
  console.error('Global error:', err);
  return c.json({ success: false, error: 'Internal Server Error', message: err.message }, 500);
});

export default app;
