import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart2, CheckCircle, FileText, AlertCircle, FolderOpen, Download, RefreshCw } from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

const T = {
  pageBg:     '#f2f0eb',
  cardBg:     '#ffffff',
  border:     'rgba(0,0,0,0.08)',
  borderMed:  'rgba(0,0,0,0.14)',
  text1:      '#1a1a1a',
  text2:      '#52525b',
  text3:      '#9ca3af',
  accent:     '#2d6a4f',
  accentBg:   '#edf7f1',
  accentMid:  '#a7d3bc',
  accentDark: '#1e4d38',
  shadow:     '0 1px 3px rgba(0,0,0,0.05)',
  shadowMd:   '0 4px 16px rgba(0,0,0,0.07)',
  radius:     '4px',
  font:       '"Inter", system-ui, -apple-system, sans-serif',
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stats {
  total_documents:     number;
  by_status:           Record<string, number>;
  by_label:            Record<string, number>;
  accuracy_rate:       number | null;
  total_verifications: number;
  docs_per_day:        Array<{ date: string; count: number }>;
  total_cases:         number;
  open_cases:          number;
}

interface AuditItem {
  id:             string;
  document_id:    string;
  filename:       string | null;
  user_email:     string;
  verified_at:    string;
  original_label: string | null;
  final_label:    string | null;
  label_changed:  boolean;
  fields_changed: Record<string, { from: string; to: string }>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, accent = false }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: accent ? T.accentBg : T.cardBg,
      border: `1px solid ${accent ? T.accentMid : T.border}`,
      borderRadius: T.radius, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: '6px',
      boxShadow: T.shadow,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accent ? T.accent : T.text3 }}>
        {icon}
        <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color: accent ? T.accentDark : T.text1, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: T.text3 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.08em', color: T.text3, marginBottom: '12px' }}>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DashboardView() {
  const [stats, setStats]         = useState<Stats | null>(null);
  const [audit, setAudit]         = useState<AuditItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading]     = useState(true);
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [statsRes, auditRes] = await Promise.all([
        axios.get(`${API_BASE}/stats`),
        axios.get(`${API_BASE}/audit?limit=50`),
      ]);
      setStats(statsRes.data);
      setAudit(auditRes.data.items);
      setAuditTotal(auditRes.data.total);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function downloadExport(format: 'csv' | 'xlsx') {
    setExporting(format);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', dateFrom);
      if (dateTo)   params.append('date_to',   dateTo);
      const url = `${API_BASE}/documents/export-${format}?${params}`;
      const res = await axios.get(url, { responseType: 'blob' });
      const href = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = href;
      a.download = `documenti.${format}`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(null);
    }
  }

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: T.text3, fontSize: '0.85rem', fontFamily: T.font }}>
        Caricamento…
      </div>
    );
  }

  const s = stats!;
  const topLabels = Object.entries(s.by_label).slice(0, 8);
  const maxLabelCount = topLabels.length > 0 ? Math.max(...topLabels.map(([, v]) => v)) : 1;
  const accuracyPct = s.accuracy_rate != null ? `${(s.accuracy_rate * 100).toFixed(1)}%` : '—';

  const btnStyle = (disabled = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '8px 14px', borderRadius: T.radius, border: 'none',
    background: disabled ? T.accentBg : T.accent, color: disabled ? T.accent : 'white',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '0.78rem', fontWeight: 600, fontFamily: T.font,
  });

  return (
    <div style={{ padding: '24px', overflowY: 'auto', height: '100%', boxSizing: 'border-box', fontFamily: T.font }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: T.text1, letterSpacing: '-0.02em' }}>Dashboard</div>
          <div style={{ fontSize: '0.75rem', color: T.text3 }}>Statistiche e attività recente</div>
        </div>
        <button onClick={load} style={{ ...btnStyle(), background: T.cardBg, color: T.text2, border: `1px solid ${T.border}` }}>
          <RefreshCw size={13} /> Aggiorna
        </button>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '28px' }}>
        <StatCard icon={<FileText size={14} />}    label="Documenti totali"  value={s.total_documents} />
        <StatCard icon={<CheckCircle size={14} />} label="Verificati"        value={s.by_status['verified'] || 0} accent />
        <StatCard icon={<AlertCircle size={14} />} label="Da revisionare"    value={s.by_status['needs_review'] || 0} />
        <StatCard icon={<FolderOpen size={14} />}  label="Fascicoli aperti"  value={s.open_cases}
          sub={`${s.total_cases} totali`} />
      </div>

      {/* Accuracy + verifications */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '28px' }}>
        <StatCard icon={<BarChart2 size={14} />} label="Accuratezza previsioni"
          value={accuracyPct}
          sub={`su ${s.total_verifications} verifiche effettuate`}
          accent={s.accuracy_rate != null && s.accuracy_rate >= 0.8} />
        <StatCard icon={<CheckCircle size={14} />} label="Verifiche totali"
          value={s.total_verifications}
          sub="documenti approvati dagli utenti" />
      </div>

      {/* Document types distribution */}
      {topLabels.length > 0 && (
        <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: T.radius,
          padding: '20px', marginBottom: '28px', boxShadow: T.shadow }}>
          <SectionTitle>Tipi di documento (verificati)</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {topLabels.map(([label, count]) => (
              <div key={label} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 36px', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.78rem', color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={label}>{label}</span>
                <div style={{ height: '8px', borderRadius: '4px', background: '#e4e0d8', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '4px', background: T.accent,
                    width: `${(count / maxLabelCount) * 100}%`,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <span style={{ fontSize: '0.75rem', color: T.text3, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Batch export */}
      <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: '20px', marginBottom: '28px', boxShadow: T.shadow }}>
        <SectionTitle>Esporta documenti verificati</SectionTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.68rem', color: T.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Da</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: T.radius, border: `1px solid ${T.borderMed}`,
                fontSize: '0.82rem', color: T.text1, fontFamily: T.font, background: '#fafafa' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.68rem', color: T.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>A</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: T.radius, border: `1px solid ${T.borderMed}`,
                fontSize: '0.82rem', color: T.text1, fontFamily: T.font, background: '#fafafa' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignSelf: 'flex-end' }}>
            <button onClick={() => downloadExport('csv')} disabled={exporting === 'csv'} style={btnStyle(exporting === 'csv')}>
              <Download size={13} /> CSV
            </button>
            <button onClick={() => downloadExport('xlsx')} disabled={exporting === 'xlsx'} style={btnStyle(exporting === 'xlsx')}>
              <Download size={13} /> Excel
            </button>
          </div>
        </div>
        <div style={{ marginTop: '8px', fontSize: '0.72rem', color: T.text3 }}>
          Lascia le date vuote per esportare tutti i documenti verificati.
        </div>
      </div>

      {/* Audit trail */}
      <div style={{ background: T.cardBg, border: `1px solid ${T.border}`, borderRadius: T.radius,
        padding: '20px', boxShadow: T.shadow }}>
        <SectionTitle>Attività recente — ultime {audit.length} verifiche su {auditTotal}</SectionTitle>
        {audit.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: T.text3 }}>Nessuna verifica ancora registrata.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  {['Data', 'Utente', 'File', 'Previsione', 'Finale', 'Correzioni'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700,
                      fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: T.text3 }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map((item, i) => {
                  const changedFields = Object.keys(item.fields_changed || {});
                  const correctionText = [
                    item.label_changed ? `tipo: ${item.original_label} → ${item.final_label}` : null,
                    ...changedFields.map(k => `${k}: "${item.fields_changed[k].from || '—'}" → "${item.fields_changed[k].to}"`),
                  ].filter(Boolean).join('; ');

                  return (
                    <tr key={item.id} style={{ background: i % 2 === 0 ? '#fafaf9' : T.cardBg,
                      borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: '8px 10px', color: T.text3, whiteSpace: 'nowrap' }}>
                        {new Date(item.verified_at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ padding: '8px 10px', color: T.text2 }}>{item.user_email}</td>
                      <td style={{ padding: '8px 10px', color: T.text1, maxWidth: '180px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={item.filename || ''}>
                        {item.filename || '—'}
                      </td>
                      <td style={{ padding: '8px 10px', color: T.text3 }}>{item.original_label || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{
                          color: item.label_changed ? '#92400e' : T.accent,
                          fontWeight: item.label_changed ? 600 : 400,
                        }}>
                          {item.final_label || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: correctionText ? '#92400e' : T.text3,
                        fontSize: '0.72rem', maxWidth: '220px', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={correctionText || ''}>
                        {correctionText || <span style={{ color: T.text3 }}>nessuna</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
