import { useMemo, useState } from 'react';
import { recommendationsToCsv } from '../domain/report';
import type { OptimizationReport, Policy, Recommendation, RecommendationType } from '../domain/types';
import { defaultPolicy } from '../domain/policy';

type Step = 'upload' | 'policy' | 'results';

interface PolicyForm {
  max_delay_minutes: string;
  allowed_regions: string;
  blocked_regions: string;
  carbon_ceiling_g_per_kwh: string;
  max_latency_ms: string;
  require_manual_for_low_confidence: boolean;
  gpu_kwh_assumption: string;
}

const recTypes: Array<RecommendationType | 'all'> = [
  'all',
  'run_now',
  'delay',
  'move_region',
  'manual_review',
  'pinned',
  'invalid'
];

function toList(value: string) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function toPolicy(form: PolicyForm): Policy {
  return {
    max_delay_minutes: Number(form.max_delay_minutes || defaultPolicy.max_delay_minutes),
    allowed_regions: toList(form.allowed_regions),
    blocked_regions: toList(form.blocked_regions),
    carbon_ceiling_g_per_kwh: form.carbon_ceiling_g_per_kwh === '' ? null : Number(form.carbon_ceiling_g_per_kwh),
    max_latency_ms: form.max_latency_ms === '' ? null : Number(form.max_latency_ms),
    require_manual_for_low_confidence: form.require_manual_for_low_confidence
  };
}

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function number(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function FileBox({
  label,
  file,
  accept,
  onChange
}: {
  label: string;
  file: File | null;
  accept: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="file-box">
      <span>{label}</span>
      <input
        type="file"
        accept={accept}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <strong>{file ? file.name : 'No file selected'}</strong>
    </label>
  );
}

function ValidationList({ report }: { report: OptimizationReport | null }) {
  if (!report?.validation_errors.length) return null;

  return (
    <section className="panel danger">
      <div className="section-title">
        <h2>Fix these rows</h2>
        <span>{report.validation_errors.length} issue{report.validation_errors.length === 1 ? '' : 's'}</span>
      </div>
      <ul className="error-list">
        {report.validation_errors.map((error, index) => (
          <li key={`${error.file}-${error.row}-${error.field}-${index}`}>
            <strong>{error.file ?? 'input'}</strong>
            {error.row ? ` row ${error.row}` : ''}
            {error.field ? ` / ${error.field}` : ''}: {error.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Summary({ report }: { report: OptimizationReport }) {
  const items = [
    ['total workloads', report.summary.total_workloads],
    ['workloads movable', report.summary.workloads_movable],
    ['workloads delayed', report.summary.workloads_delayed],
    ['workloads pinned', report.summary.workloads_pinned],
    ['estimated total savings', money(report.summary.estimated_total_savings_usd)],
    ['estimated carbon delta', `${number(report.summary.estimated_carbon_delta_g)} g`]
  ];

  return (
    <section className="summary-grid">
      {items.map(([label, value]) => (
        <div className="summary-card" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function ResultsTable({ rows }: { rows: Recommendation[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>workload</th>
            <th>recommendation</th>
            <th>region</th>
            <th>delay</th>
            <th>savings</th>
            <th>carbon delta</th>
            <th>confidence</th>
            <th>reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.workload_id}-${row.recommendation}-${row.recommended_region}`}>
              <td>
                <strong>{row.workload_id}</strong>
                <span>{row.priority}</span>
              </td>
              <td>
                <span className={`pill ${row.recommendation}`}>{row.recommendation}</span>
              </td>
              <td>
                {row.current_region || 'unknown'} → {row.recommended_region || 'none'}
              </td>
              <td>{row.delay_minutes} min</td>
              <td>{money(row.estimated_savings_usd)}</td>
              <td>{number(row.carbon_delta_g)} g</td>
              <td>{row.confidence}</td>
              <td>{row.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <div className="empty-state">No rows match the filters.</div> : null}
    </div>
  );
}

export function App() {
  const [step, setStep] = useState<Step>('upload');
  const [workloadFile, setWorkloadFile] = useState<File | null>(null);
  const [regionFile, setRegionFile] = useState<File | null>(null);
  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);
  const [policy, setPolicy] = useState<PolicyForm>({
    max_delay_minutes: String(defaultPolicy.max_delay_minutes),
    allowed_regions: '',
    blocked_regions: '',
    carbon_ceiling_g_per_kwh: '',
    max_latency_ms: '',
    require_manual_for_low_confidence: defaultPolicy.require_manual_for_low_confidence,
    gpu_kwh_assumption: ''
  });
  const [filters, setFilters] = useState({
    recommendation: 'all',
    region: 'all',
    priority: 'all',
    validity: 'all'
  });

  const regions = useMemo(() => {
    if (!report) return [];
    return Array.from(new Set(report.recommendations.flatMap((row) => [row.current_region, row.recommended_region]).filter(Boolean))).sort();
  }, [report]);

  const priorities = useMemo(() => {
    if (!report) return [];
    return Array.from(new Set(report.recommendations.map((row) => row.priority))).sort();
  }, [report]);

  const filteredRows = useMemo(() => {
    if (!report) return [];
    return report.recommendations.filter((row) => {
      if (filters.recommendation !== 'all' && row.recommendation !== filters.recommendation) return false;
      if (filters.region !== 'all' && row.current_region !== filters.region && row.recommended_region !== filters.region) return false;
      if (filters.priority !== 'all' && row.priority !== filters.priority) return false;
      if (filters.validity === 'valid' && !row.valid) return false;
      if (filters.validity === 'invalid' && row.valid) return false;
      return true;
    });
  }, [filters, report]);

  async function runOptimization() {
    setRunError('');
    if (!workloadFile || !regionFile) {
      setRunError('Upload workload data and region data before running optimization.');
      return;
    }

    const body = new FormData();
    body.append('workloads', workloadFile);
    body.append('regions', regionFile);
    body.append('policy', JSON.stringify(toPolicy(policy)));
    body.append('gpu_kwh_assumption', policy.gpu_kwh_assumption);

    setRunning(true);
    try {
      const response = await fetch('/api/optimize', { method: 'POST', body });
      const data = (await response.json()) as OptimizationReport;
      setReport(data);
      setStep(data.validation_errors.length > 0 ? 'upload' : 'results');
      if (!response.ok) {
        setRunError('The optimizer could not run with the uploaded files.');
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Could not reach the optimizer API.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Blackout Markets</h1>
          <p>Shadow optimizer for GPU workload scheduling decisions.</p>
        </div>
        <nav aria-label="Workflow">
          {(['upload', 'policy', 'results'] as Step[]).map((item) => (
            <button
              key={item}
              className={step === item ? 'active' : ''}
              onClick={() => setStep(item)}
              disabled={item === 'results' && !report}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      {step === 'upload' ? (
        <section className="screen">
          <div className="screen-head">
            <h2>Upload workload data</h2>
            <p>CSV files are validated before recommendations are accepted.</p>
          </div>
          <div className="upload-grid">
            <FileBox label="Workload CSV" file={workloadFile} accept=".csv,text/csv" onChange={setWorkloadFile} />
            <FileBox label="Region CSV" file={regionFile} accept=".csv,text/csv" onChange={setRegionFile} />
          </div>
          {runError ? <div className="inline-error">{runError}</div> : null}
          <ValidationList report={report} />
          <div className="actions">
            <button onClick={() => setStep('policy')} disabled={!workloadFile || !regionFile}>
              Configure policy
            </button>
          </div>
        </section>
      ) : null}

      {step === 'policy' ? (
        <section className="screen">
          <div className="screen-head">
            <h2>Policy constraints</h2>
            <p>Leave allowed regions empty to use every region in the uploaded region file.</p>
          </div>
          <div className="policy-grid">
            <label>
              <span>max delay minutes</span>
              <input
                type="number"
                min="0"
                value={policy.max_delay_minutes}
                onChange={(event) => setPolicy({ ...policy, max_delay_minutes: event.target.value })}
              />
            </label>
            <label>
              <span>allowed regions</span>
              <input
                value={policy.allowed_regions}
                onChange={(event) => setPolicy({ ...policy, allowed_regions: event.target.value })}
              />
            </label>
            <label>
              <span>blocked regions</span>
              <input
                value={policy.blocked_regions}
                onChange={(event) => setPolicy({ ...policy, blocked_regions: event.target.value })}
              />
            </label>
            <label>
              <span>carbon ceiling g/kWh</span>
              <input
                type="number"
                min="0"
                value={policy.carbon_ceiling_g_per_kwh}
                onChange={(event) => setPolicy({ ...policy, carbon_ceiling_g_per_kwh: event.target.value })}
              />
            </label>
            <label>
              <span>latency limit ms</span>
              <input
                type="number"
                min="0"
                value={policy.max_latency_ms}
                onChange={(event) => setPolicy({ ...policy, max_latency_ms: event.target.value })}
              />
            </label>
            <label>
              <span>GPU kWh assumption</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={policy.gpu_kwh_assumption}
                onChange={(event) => setPolicy({ ...policy, gpu_kwh_assumption: event.target.value })}
              />
            </label>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={policy.require_manual_for_low_confidence}
              onChange={(event) =>
                setPolicy({ ...policy, require_manual_for_low_confidence: event.target.checked })
              }
            />
            <span>Manual approval for low-confidence moves</span>
          </label>
          {runError ? <div className="inline-error">{runError}</div> : null}
          <div className="actions">
            <button className="secondary" onClick={() => setStep('upload')}>
              Back to uploads
            </button>
            <button onClick={runOptimization} disabled={running}>
              {running ? 'Running' : 'Run shadow optimization'}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'results' && report ? (
        <section className="screen">
          <div className="screen-head row">
            <div>
              <h2>Scheduling report</h2>
              <p>
                Assumption: {report.assumptions.gpu_kwh_assumption} kWh per GPU-hour (
                {report.assumptions.gpu_kwh_assumption_source}).
              </p>
            </div>
            <div className="actions compact">
              <button
                className="secondary"
                onClick={() => download('blackout-report.json', JSON.stringify(report, null, 2), 'application/json')}
              >
                Export JSON
              </button>
              <button
                onClick={() => download('blackout-recommendations.csv', recommendationsToCsv(report.recommendations), 'text/csv')}
              >
                Export CSV
              </button>
            </div>
          </div>
          <Summary report={report} />
          <ValidationList report={report} />
          <div className="filters">
            <label>
              <span>recommendation</span>
              <select
                value={filters.recommendation}
                onChange={(event) => setFilters({ ...filters, recommendation: event.target.value })}
              >
                {recTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>region</span>
              <select value={filters.region} onChange={(event) => setFilters({ ...filters, region: event.target.value })}>
                <option value="all">all</option>
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>priority</span>
              <select
                value={filters.priority}
                onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
              >
                <option value="all">all</option>
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>validity</span>
              <select
                value={filters.validity}
                onChange={(event) => setFilters({ ...filters, validity: event.target.value })}
              >
                <option value="all">all</option>
                <option value="valid">valid</option>
                <option value="invalid">invalid</option>
              </select>
            </label>
          </div>
          <ResultsTable rows={filteredRows} />
        </section>
      ) : null}
    </main>
  );
}
