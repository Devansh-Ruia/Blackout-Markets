import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { parseRegionCsv, parseWorkloadCsv } from '../domain/csv';
import { invalidInputRecommendation, optimize } from '../domain/optimizer';
import { defaultPolicy, readPolicy } from '../domain/policy';
import { recommendationsToCsv } from '../domain/report';
import type { Assumptions, OptimizationReport, ValidationError } from '../domain/types';
import { validateDataset } from '../domain/validation';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024 } });
const port = Number(process.env.PORT ?? 3001);

app.use(express.json({ limit: '1mb' }));

function getFile(files: Express.Multer.File[] | { [fieldname: string]: Express.Multer.File[] } | undefined, field: string) {
  if (!files || Array.isArray(files)) return undefined;
  return files[field]?.[0];
}

function assumptionsFrom(raw: unknown): Assumptions {
  const number = raw === undefined || raw === '' ? NaN : Number(raw);
  if (Number.isFinite(number) && number > 0) {
    return { gpu_kwh_assumption: number, gpu_kwh_assumption_source: 'user' };
  }
  return { gpu_kwh_assumption: 0.7, gpu_kwh_assumption_source: 'default' };
}

function emptyReport(errors: ValidationError[], assumptions: Assumptions): OptimizationReport {
  return optimize([], [], defaultPolicy, assumptions, errors);
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post(
  '/api/optimize',
  upload.fields([
    { name: 'workloads', maxCount: 1 },
    { name: 'regions', maxCount: 1 }
  ]),
  (req, res) => {
    const assumptions = assumptionsFrom(req.body.gpu_kwh_assumption);
    const workloadFile = getFile(req.files, 'workloads');
    const regionFile = getFile(req.files, 'regions');

    const missing: ValidationError[] = [];
    if (!workloadFile) missing.push({ file: 'workloads', message: 'Upload workload data' });
    if (!regionFile) missing.push({ file: 'regions', message: 'Upload region data' });

    if (missing.length > 0) {
      res.status(400).json(emptyReport(missing, assumptions));
      return;
    }

    const workloadParse = parseWorkloadCsv(workloadFile!.buffer.toString('utf8'));
    const regionParse = parseRegionCsv(regionFile!.buffer.toString('utf8'));
    const policyRead = readPolicy(req.body.policy);
    const validationErrors = [
      ...workloadParse.errors,
      ...regionParse.errors,
      ...policyRead.errors,
      ...validateDataset(workloadParse.rows, regionParse.rows, policyRead.policy)
    ];

    const invalidRows = workloadParse.invalid_rows.map((row) =>
      invalidInputRecommendation({
        id: row.id ? `${row.id}` : `row-${row.row}`,
        current_region: row.current_region,
        priority: row.priority,
        reason: `Row ${row.row}: ${row.reason}`
      })
    );

    const policyInvalid = validationErrors.some((error) => error.file === 'policy');
    const regionInvalid = regionParse.errors.length > 0;

    if (policyInvalid || regionInvalid) {
      const reason = policyInvalid
        ? `Policy is invalid: ${validationErrors
            .filter((error) => error.file === 'policy')
            .map((error) => error.message)
            .join('; ')}`
        : `Region data is invalid: ${regionParse.errors.map((error) => error.message).join('; ')}`;
      const invalidWorkloads = workloadParse.rows.map((workload) =>
        invalidInputRecommendation({
          id: workload.id,
          current_region: workload.current_region,
          priority: workload.priority,
          reason
        })
      );
      res.json(optimize([], regionParse.rows, policyRead.policy, assumptions, validationErrors, [...invalidRows, ...invalidWorkloads]));
      return;
    }

    res.json(optimize(workloadParse.rows, regionParse.rows, policyRead.policy, assumptions, validationErrors, invalidRows));
  }
);

app.post('/api/export/csv', (req, res) => {
  const rows = Array.isArray(req.body?.recommendations) ? req.body.recommendations : [];
  res.header('Content-Type', 'text/csv');
  res.send(recommendationsToCsv(rows));
});

const staticDir = path.join(process.cwd(), 'dist-web');
app.use(express.static(staticDir));
app.get('*', (_req, res, next) => {
  if (!fs.existsSync(path.join(staticDir, 'index.html'))) {
    next();
    return;
  }
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(port, '127.0.0.1', () => {
  console.log(`Blackout Markets API listening on http://127.0.0.1:${port}`);
});
