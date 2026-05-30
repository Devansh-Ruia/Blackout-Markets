import { useMemo, useState } from 'react';
import { workloadReportRowsToCsv } from '../domain/report';
import { defaultPolicy } from '../domain/policy';
import type {
  Confidence,
  Policy,
  RecommendationType,
  RetrospectiveReport,
  SavingsBreakdownRow,
  WorkloadReportRow
} from '../domain/types';

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
  'move_region',
  'delay',
  'manual_review',
  'pinned',
  'invalid'
];

const confidenceTypes: Array<Confidence | 'all'> = ['all', 'high', 'medium', 'low'];

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

function percent(value: number) {
  return `${number(value)}%`;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
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

function ValidationList({ report }: { report: RetrospectiveReport | null }) {
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

function MetricCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

function ExecutiveSummary({ report }: { report: RetrospectiveReport }) {
  return (
    <section>
      <div className="section-title">
        <h2>Executive summary</h2>
        <span>{report.summary.valid_workloads} valid workload{report.summary.valid_workloads === 1 ? '' : 's'}</span>
      </div>
      <div className="summary-grid">
        <MetricCard label="total workloads" value={report.summary.total_workloads} />
        <MetricCard label="Hard savings" value={money(report.summary.hard_savings_usd)} />
        <MetricCard label="hard savings percent" value={percent(report.summary.hard_savings_percent)} />
        <MetricCard label="carbon delta" value={`${number(report.summary.carbon_delta_g)} g`} />
        <MetricCard label="movable percent" value={percent(report.summary.movable_percent)} />
        <MetricCard label="pinned percent" value={percent(report.summary.pinned_percent)} />
        <MetricCard label="manual review count" value={report.summary.manual_review_count} />
        <MetricCard label="invalid workload count" value={report.summary.invalid_workloads} />
      </div>
    </section>
  );
}

function RecommendationMix({ report }: { report: RetrospectiveReport }) {
  const rows = recTypes.filter((type): type is RecommendationType => type !== 'all');

  return (
    <section className="panel">
      <div className="section-title">
        <h2>Recommendation mix</h2>
        <span>{report.summary.average_confidence} average confidence</span>
      </div>
      <div className="mix-grid">
        {rows.map((type) => (
          <div className="mix-item" key={type}>
            <span className={`pill ${type}`}>{type}</span>
            <strong>{report.breakdowns.recommendations_by_type[type]}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: SavingsBreakdownRow[] }) {
  return (
    <section className="panel">
      <div className="section-title">
        <h2>{title}</h2>
        <span>{rows.length} row{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div className="table-wrap compact-table">
        <table>
          <thead>
            <tr>
              <th>group</th>
              <th>workloads</th>
              <th>baseline cost</th>
              <th>recommended cost</th>
              <th>Hard savings</th>
              <th>carbon delta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td>
                  <strong>{row.key}</strong>
                </td>
                <td>{row.workload_count}</td>
                <td>{money(row.baseline_cost_usd)}</td>
                <td>{money(row.recommended_cost_usd)}</td>
                <td>{money(row.hard_savings_usd)}</td>
                <td>{number(row.carbon_delta_g)} g</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="empty-state">No counted savings in this view.</div> : null}
      </div>
    </section>
  );
}

function Blockers({ report }: { report: RetrospectiveReport }) {
  return (
    <section className="panel">
      <div className="section-title">
        <h2>Blockers</h2>
        <span>Blocked by policy, latency, capacity, and data residency</span>
      </div>
      <div className="blocker-grid">
        <MetricCard label="Blocked by policy" value={report.summary.policy_violation_count} />
        <MetricCard label="capacity blocked" value={report.summary.capacity_blocked_count} />
        <MetricCard label="latency blocked" value={report.summary.latency_blocked_count} />
        <MetricCard label="data residency blocked" value={report.summary.data_residency_blocked_count} />
      </div>
      <div className="two-column">
        <div>
          <h3>Top blocked reasons</h3>
          <ul className="plain-list">
            {report.breakdowns.blocked_reasons_count.slice(0, 8).map((item) => (
              <li key={item.reason}>
                <strong>{item.reason}</strong>
                <span>{item.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Policy violations</h3>
          <ul className="plain-list">
            {report.breakdowns.policy_violations.slice(0, 8).map((item) => (
              <li key={`${item.workload_id}-${item.blocked_reasons.join('|')}`}>
                <strong>{item.workload_id}</strong>
                <span>{item.blocked_reasons.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="excluded">
        <h3>Excluded from savings</h3>
        <div className="table-wrap compact-table">
          <table>
            <thead>
              <tr>
                <th>workload</th>
                <th>action</th>
                <th>reason</th>
              </tr>
            </thead>
            <tbody>
              {report.breakdowns.workloads_excluded_from_savings.slice(0, 8).map((row, index) => (
                <tr key={`${row.id}-${index}`}>
                  <td>
                    <strong>{row.id}</strong>
                    <span>{row.workload_type || 'invalid'}</span>
                  </td>
                  <td>
                    <span className={`pill ${row.recommendation_type}`}>{row.recommendation_type}</span>
                  </td>
                  <td>{row.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.breakdowns.workloads_excluded_from_savings.length === 0 ? (
            <div className="empty-state">No excluded workloads.</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TopOpportunities({ rows }: { rows: WorkloadReportRow[] }) {
  return (
    <section className="panel">
      <div className="section-title">
        <h2>Top savings opportunities</h2>
        <span>{rows.length} counted</span>
      </div>
      <div className="table-wrap compact-table">
        <table>
          <thead>
            <tr>
              <th>workload</th>
              <th>action</th>
              <th>region</th>
              <th>Hard savings</th>
              <th>reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <strong>{row.id}</strong>
                  <span>{row.workload_type}</span>
                </td>
                <td>
                  <span className={`pill ${row.recommendation_type}`}>{row.recommendation_type}</span>
                </td>
                <td>
                  {row.current_region} {'->'} {row.recommended_region ?? 'none'}
                </td>
                <td>{money(row.hard_savings_usd)}</td>
                <td>{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="empty-state">No hard savings counted.</div> : null}
      </div>
    </section>
  );
}

function WorkloadTable({ rows }: { rows: WorkloadReportRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>workload</th>
            <th>gpu</th>
            <th>duration</th>
            <th>recommendation</th>
            <th>region</th>
            <th>baseline</th>
            <th>recommended</th>
            <th>Hard savings</th>
            <th>carbon delta</th>
            <th>confidence</th>
            <th>blocked reasons</th>
            <th>reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.id}-${index}`}>
              <td>
                <strong>{row.id}</strong>
                <span>{row.customer_id ?? 'no customer'} / {row.workload_type || 'invalid'}</span>
              </td>
              <td>
                {row.gpu_count} {row.gpu_type}
              </td>
              <td>{number(row.expected_duration_hours)} h</td>
              <td>
                <span className={`pill ${row.recommendation_type}`}>{row.recommendation_type}</span>
                <span>{row.counted_in_savings ? 'counted' : 'Excluded from savings'}</span>
              </td>
              <td>
                {row.current_region || 'unknown'} {'->'} {row.recommended_region ?? 'none'}
              </td>
              <td>{money(row.baseline_cost_usd)}</td>
              <td>{money(row.recommended_cost_usd)}</td>
              <td>{money(row.hard_savings_usd)}</td>
              <td>{number(row.carbon_delta_g)} g</td>
              <td>{row.confidence}</td>
              <td>{row.blocked_reasons.join(', ') || 'none'}</td>
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
  const [report, setReport] = useState<RetrospectiveReport | null>(null);
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
    counted: 'all',
    blocked_reason: 'all',
    confidence: 'all',
    current_region: 'all',
    recommended_region: 'all',
    workload_type: 'all'
  });

  const filterOptions = useMemo(() => {
    if (!report) {
      return {
        currentRegions: [],
        recommendedRegions: [],
        workloadTypes: [],
        blockedReasons: []
      };
    }

    return {
      currentRegions: unique(report.rows.map((row) => row.current_region)),
      recommendedRegions: unique(report.rows.map((row) => row.recommended_region)),
      workloadTypes: unique(report.rows.map((row) => row.workload_type)),
      blockedReasons: unique(report.rows.flatMap((row) => row.blocked_reasons))
    };
  }, [report]);

  const filteredRows = useMemo(() => {
    if (!report) return [];

    return report.rows.filter((row) => {
      if (filters.recommendation !== 'all' && row.recommendation_type !== filters.recommendation) return false;
      if (filters.counted === 'counted' && !row.counted_in_savings) return false;
      if (filters.counted === 'excluded' && row.counted_in_savings) return false;
      if (filters.blocked_reason !== 'all' && !row.blocked_reasons.includes(filters.blocked_reason)) return false;
      if (filters.confidence !== 'all' && row.confidence !== filters.confidence) return false;
      if (filters.current_region !== 'all' && row.current_region !== filters.current_region) return false;
      if (filters.recommended_region !== 'all' && row.recommended_region !== filters.recommended_region) return false;
      if (filters.workload_type !== 'all' && row.workload_type !== filters.workload_type) return false;
      return true;
    });
  }, [filters, report]);

  async function runReport() {
    setRunError('');
    if (!workloadFile || !regionFile) {
      setRunError('Upload workload data and region data before running the report.');
      return;
    }

    const body = new FormData();
    body.append('workloads', workloadFile);
    body.append('regions', regionFile);
    body.append('policy', JSON.stringify(toPolicy(policy)));
    body.append('gpu_kwh_assumption', policy.gpu_kwh_assumption);

    setRunning(true);
    try {
      const response = await fetch('/api/report/retrospective', { method: 'POST', body });
      const data = (await response.json()) as RetrospectiveReport;
      setReport(data);
      setStep(response.ok || data.rows.length > 0 ? 'results' : 'upload');
      if (!response.ok) {
        setRunError('The report could not run with the uploaded files.');
      }
    } catch (error) {
      setRunError(error instanceof Error ? error.message : 'Could not reach the report API.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <header className="topbar">
        <div>
          <h1>Blackout Markets</h1>
          <p>Retrospective savings report for GPU workload scheduling decisions.</p>
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
            <h2>Upload last week</h2>
            <p>Load workload logs and region energy data for the retrospective report.</p>
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
            <p>Leave allowed regions empty to use every uploaded region unless another rule blocks it.</p>
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
            <button onClick={runReport} disabled={running}>
              {running ? 'Running report' : 'Run retrospective report'}
            </button>
          </div>
        </section>
      ) : null}

      {step === 'results' && report ? (
        <section className="screen">
          <div className="screen-head row">
            <div>
              <h2>Retrospective report</h2>
              <p>
                Cost: {report.assumptions.cost_formula}. Default PUE: {report.assumptions.default_pue}. GPU assumption:{' '}
                {report.assumptions.gpu_kwh_assumption} kWh per GPU-hour ({report.assumptions.gpu_kwh_assumption_source}).
              </p>
            </div>
            <div className="actions compact">
              <button
                className="secondary"
                onClick={() => download('blackout-retrospective-report.json', JSON.stringify(report, null, 2), 'application/json')}
              >
                Export full report JSON
              </button>
              <button
                onClick={() => download('blackout-workload-report.csv', workloadReportRowsToCsv(report.rows), 'text/csv')}
              >
                Export workload report CSV
              </button>
            </div>
          </div>
          <ValidationList report={report} />
          <ExecutiveSummary report={report} />
          <RecommendationMix report={report} />
          <div className="breakdown-grid">
            <BreakdownTable title="Savings by workload type" rows={report.breakdowns.savings_by_workload_type} />
            <BreakdownTable title="Savings by current region" rows={report.breakdowns.savings_by_current_region} />
            <BreakdownTable title="Savings by recommended region" rows={report.breakdowns.savings_by_recommended_region} />
          </div>
          <Blockers report={report} />
          <TopOpportunities rows={report.breakdowns.top_savings_opportunities} />
          <section className="panel">
            <div className="section-title">
              <h2>Workload details</h2>
              <span>{filteredRows.length} shown</span>
            </div>
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
                <span>counted in savings</span>
                <select value={filters.counted} onChange={(event) => setFilters({ ...filters, counted: event.target.value })}>
                  <option value="all">all</option>
                  <option value="counted">counted</option>
                  <option value="excluded">Excluded from savings</option>
                </select>
              </label>
              <label>
                <span>blocked reason</span>
                <select
                  value={filters.blocked_reason}
                  onChange={(event) => setFilters({ ...filters, blocked_reason: event.target.value })}
                >
                  <option value="all">all</option>
                  {filterOptions.blockedReasons.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>confidence</span>
                <select
                  value={filters.confidence}
                  onChange={(event) => setFilters({ ...filters, confidence: event.target.value })}
                >
                  {confidenceTypes.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>current region</span>
                <select
                  value={filters.current_region}
                  onChange={(event) => setFilters({ ...filters, current_region: event.target.value })}
                >
                  <option value="all">all</option>
                  {filterOptions.currentRegions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>recommended region</span>
                <select
                  value={filters.recommended_region}
                  onChange={(event) => setFilters({ ...filters, recommended_region: event.target.value })}
                >
                  <option value="all">all</option>
                  {filterOptions.recommendedRegions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>workload type</span>
                <select
                  value={filters.workload_type}
                  onChange={(event) => setFilters({ ...filters, workload_type: event.target.value })}
                >
                  <option value="all">all</option>
                  {filterOptions.workloadTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <WorkloadTable rows={filteredRows} />
          </section>
        </section>
      ) : null}
    </main>
  );
}
