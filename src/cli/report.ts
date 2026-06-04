import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRegionCsv, parseWorkloadCsv } from '../domain/csv.js';
import { readPolicy } from '../domain/policy.js';
import { buildRetrospectiveReport, diagnosticReportToMarkdown, workloadReportRowsToCsv } from '../domain/report.js';
import type { Assumptions, ValidationError } from '../domain/types.js';
import { validateDataset } from '../domain/validation.js';

interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
}

interface CliOptions {
  workloads?: string;
  regions?: string;
  policy?: string;
  out?: string;
  gpuKwhAssumption?: number;
  defaultPue?: number;
}

function parseNumber(value: string | undefined, name: string, errors: string[]) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    errors.push(`${name} must be a positive number.`);
    return undefined;
  }
  return number;
}

function parseArgs(args: string[]) {
  const options: CliOptions = {};
  const errors: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];

    if (!arg.startsWith('--')) {
      errors.push(`Unexpected argument ${arg}.`);
      continue;
    }

    if (value === undefined || value.startsWith('--')) {
      errors.push(`${arg} requires a value.`);
      continue;
    }

    index += 1;

    if (arg === '--workloads') options.workloads = value;
    else if (arg === '--regions') options.regions = value;
    else if (arg === '--policy') options.policy = value;
    else if (arg === '--out') options.out = value;
    else if (arg === '--gpu-kwh-assumption') options.gpuKwhAssumption = parseNumber(value, arg, errors);
    else if (arg === '--default-pue') options.defaultPue = parseNumber(value, arg, errors);
    else errors.push(`Unknown option ${arg}.`);
  }

  for (const required of ['workloads', 'regions', 'policy', 'out'] as const) {
    if (!options[required]) errors.push(`Missing required option --${required}.`);
  }

  return { options, errors };
}

function filePath(path: string) {
  const absolute = resolve(path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    throw new Error(`Input file not found: ${path}`);
  }
  return absolute;
}

function formatErrors(errors: ValidationError[]) {
  return errors
    .map((error) => {
      const parts = [error.file, error.row ? `row ${error.row}` : '', error.field].filter(Boolean).join(' ');
      return parts ? `${parts}: ${error.message}` : error.message;
    })
    .join('\n');
}

function cliAssumptions(options: CliOptions): Assumptions {
  return {
    gpu_kwh_assumption: options.gpuKwhAssumption ?? 0.7,
    gpu_kwh_assumption_source: options.gpuKwhAssumption === undefined ? 'default' : 'user',
    default_pue: options.defaultPue ?? 1.2
  };
}

export async function runReportCli(args: string[], logger: Logger = console) {
  const { options, errors } = parseArgs(args);
  if (errors.length > 0) {
    logger.error(errors.join('\n'));
    return 1;
  }

  try {
    const workloadPath = filePath(options.workloads!);
    const regionPath = filePath(options.regions!);
    const policyPath = filePath(options.policy!);

    const workloadParse = parseWorkloadCsv(readFileSync(workloadPath, 'utf8'));
    if (workloadParse.errors.length > 0) {
      logger.error(`Workload CSV is invalid:\n${formatErrors(workloadParse.errors)}`);
      return 1;
    }

    const regionParse = parseRegionCsv(readFileSync(regionPath, 'utf8'));
    if (regionParse.errors.length > 0) {
      logger.error(`Region CSV is invalid:\n${formatErrors(regionParse.errors)}`);
      return 1;
    }

    const policyRead = readPolicy(readFileSync(policyPath, 'utf8'));
    if (policyRead.errors.length > 0) {
      logger.error(`Policy is invalid:\n${formatErrors(policyRead.errors)}`);
      return 1;
    }

    const validationErrors = validateDataset(workloadParse.rows, regionParse.rows, policyRead.policy);
    if (validationErrors.length > 0) {
      logger.error(`Input files are invalid together:\n${formatErrors(validationErrors)}`);
      return 1;
    }

    const report = buildRetrospectiveReport({
      workloads: workloadParse.rows,
      regions: regionParse.rows,
      policy: policyRead.policy,
      assumptions: cliAssumptions(options)
    });
    const outDir = resolve(options.out!);

    mkdirSync(outDir, { recursive: true });
    writeFileSync(resolve(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(resolve(outDir, 'recommendations.csv'), `${workloadReportRowsToCsv(report.rows)}\n`);
    writeFileSync(resolve(outDir, 'diagnostic.md'), diagnosticReportToMarkdown(report));

    logger.log(`Wrote report files to ${outDir}`);
    return 0;
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReportCli(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
