import express, { Application } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import cors from 'cors';
import { createServer } from 'http';
import connectDB from './config/db';
import router from './routes';
import { initializeSocket } from './config/socket';
import { runWithTenant } from './config/tenantContext';
import { bootstrapLegacyOrganization } from './utils/bootstrapLegacyOrganization';

const allowedOrigins = ['https://app-quan-ly-thi-dua.vercel.app', 'http://localhost:5173', 'https://app-quan-ly-thi-egev778c1-lhnhidevs-projects.vercel.app'];

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app: Application = express();
const httpServer = createServer(app);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id'],
    credentials: true, // Cho phép gửi cookie/token nếu cần
  })
);
app.use(express.json());

app.use((req, _res, next) => {
  const organizationId = String(req.headers['x-organization-id'] || '').trim() || undefined;
  runWithTenant(organizationId, () => next());
});

router(app);
initializeSocket(httpServer);

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  await connectDB();
  await bootstrapLegacyOrganization();

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error('Start server error:', error);
});
