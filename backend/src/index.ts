import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';

import { PORT, CORS_ORIGIN } from './config/constants';
import { setupWebSocket } from './websocket/ws.handler';

import authRouter from './routes/auth.routes';
import driverRouter from './routes/driver.routes';
import tripsRouter from './routes/trips.routes';
import earningsRouter from './routes/earnings.routes';
import businessRouter from './routes/business.routes';

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ─── Health ───────────────────────────────────────────────────────────────────

const startTime = Date.now();

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor((Date.now() - startTime) / 1000),
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authRouter);
app.use('/driver', driverRouter);
app.use('/trips', tripsRouter);
app.use('/earnings', earningsRouter);
app.use('/business', businessRouter);

// ─── 404 Catch-all ───────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

server.listen(PORT, () => {
  console.log(`[Nexum Driver] REST API listening on http://localhost:${PORT}`);
  console.log(`[Nexum Driver] WebSocket listening on ws://localhost:${PORT}`);
  console.log(`[Nexum Driver] Environment: ${process.env['NODE_ENV'] ?? 'development'}`);
});

export default app;
