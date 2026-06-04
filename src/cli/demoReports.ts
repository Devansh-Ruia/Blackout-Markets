import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReportCli } from './report.js';

interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
}

interface DemoReportOptions {
  fixtureRoot?: string;
  outRoot?: string;
}

const fixtureNames = ['normal-week', 'grid-stress-week', 'policy-heavy-week'] as const;
const fixtureFiles = ['workloads.csv', 'regions.csv', 'policy.json'] as const;
const reportFiles = ['report.json', 'recommendations.csv', 'diagnostic.md'] as const;

function isFile(path: string) {
  return existsSync(path) && statSync(path).isFile();
}

function isDirectory(path: string) {
  return existsSync(path) && statSync(path).isDirectory();
}

function isNonEmptyFile(path: string) {
  return isFile(path) && statSync(path).size > 0;
}

function displayPath(path: string) {
  return path.replaceAll('\\', '/');
}

export async function generateDemoReports(options: DemoReportOptions = {}, logger: Logger = console) {
  const fixtureRoot = options.fixtureRoot ?? 'fixtures';
  const outRoot = options.outRoot ?? 'reports/demo';
  const generated: Array<{ name: string; outDir: string }> = [];

  for (const name of fixtureNames) {
    const fixtureDir = join(fixtureRoot, name);
    if (!isDirectory(fixtureDir)) {
      logger.error(`Missing fixture folder for ${name}: ${displayPath(fixtureDir)}`);
      return 1;
    }

    for (const file of fixtureFiles) {
      const path = join(fixtureDir, file);
      if (!isFile(path)) {
        logger.error(`Missing fixture file for ${name}: ${displayPath(path)}`);
        return 1;
      }
    }

    const outDir = join(outRoot, name);
    const messages: string[] = [];
    const errors: string[] = [];
    const code = await runReportCli(
      [
        '--workloads',
        join(fixtureDir, 'workloads.csv'),
        '--regions',
        join(fixtureDir, 'regions.csv'),
        '--policy',
        join(fixtureDir, 'policy.json'),
        '--out',
        outDir
      ],
      {
        log: (message) => messages.push(message),
        error: (message) => errors.push(message)
      }
    );

    if (code !== 0) {
      logger.error(`Failed to generate demo report for ${name}.`);
      logger.error(errors.length > 0 ? errors.join('\n') : messages.join('\n'));
      return code;
    }

    for (const file of reportFiles) {
      const path = join(outDir, file);
      if (!isNonEmptyFile(path)) {
        logger.error(`Demo report output is missing or empty for ${name}: ${displayPath(path)}`);
        return 1;
      }
    }

    generated.push({ name, outDir });
  }

  logger.log('Generated demo reports:');
  for (const { name, outDir } of generated) {
    const files = reportFiles.map((file) => displayPath(join(outDir, file))).join(', ');
    logger.log(`- ${name}: ${files}`);
  }

  return 0;
}

export const runDemoReports = generateDemoReports;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateDemoReports().then((code) => {
    process.exitCode = code;
  });
}
