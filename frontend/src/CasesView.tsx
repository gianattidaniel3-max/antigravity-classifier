import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Plus, Trash2, Play, Download, ChevronRight,
  FolderOpen, FileText, X, AlertTriangle, CheckCircle2,
  Sparkles, Loader, Table2, List, Layers, FileSpreadsheet, FileType2,
  PanelLeftClose, PanelRightClose, PanelLeft, PanelRight,
} from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

// ─── Types ───────────────────────────────────────────────────────────────────

type Case = {
  id: string; name: string; description?: string; client_name?: string;
  status: string; created_at: string; doc_count: number;
  documents?: Doc[];
};

type Doc = {
  id: string; filename: string; extracted_label?: string;
  extracted_category?: string; extracted_date?: string;
  confidence_score?: number; status: string; human_verified: boolean;
  extracted_fields?: Record<string, string>;
  llm_notes?: string;
  llm_classification_match?: boolean;
};

type Rule = {
  field: string; op: string; value: string; flag_label: string;
};

type Template = {
  id: string; name: string; description?: string;
  rules: Rule[]; global_prompts?: Array<{ name: string; prompt: string }>; created_at: string;
};

type RunResult = {
  run_id: string; run_at: string;
  summary: { total: number; flagged: number; by_rule: Record<string, number> };
  global_insights?: Array<{ name: string; insight: string }>;
  results: Array<{
    document_id: string; filename: string; label: string;
    category: string; date: string;
    extracted_fields?: Record<string, string>;
    triggered_rules: Array<{
      flag_label: string; field: string; op: string; value: string;
      found_value?: string;
    }>;
  }>;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const FIELDS = [
  'label', 'category', 'date',
  'importo', 'mittente', 'destinatario', 'oggetto',
  'scadenza', 'tribunale', 'numero_decreto', 'numero_rg',
];
const FIELD_LABELS: Record<string, string> = {
  label: 'Label', category: 'Category', date: 'Date',
  importo: 'Importo €', mittente: 'Mittente', destinatario: 'Destinatario',
  oggetto: 'Oggetto', scadenza: 'Scadenza', tribunale: 'Tribunale',
  numero_decreto: 'N. Decreto', numero_rg: 'N. R.G.',
};
const OPS = [
  { value: 'eq',       label: '= equals' },
  { value: 'neq',      label: '≠ not equals' },
  { value: 'contains', label: '∋ contains' },
  { value: 'in',       label: '∈ one of (comma-sep)' },
  { value: 'gt',       label: '> greater than' },
  { value: 'lt',       label: '< less than' },
  { value: 'is_null',  label: '∅ is empty' },
  { value: 'not_null', label: '✓ is present' },
];

const STATUS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  open:     { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  closed:   { bg: '#f4f4f5', color: '#52525b', border: 'rgba(0,0,0,0.08)' },
  archived: { bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Badge({ text, bg = '#edf7f1', color = '#2d6a4f' }: { text: string; bg?: string; color?: string }) {
  return (
    <span style={{ fontSize: '0.65rem', padding: '1px 7px', background: bg, color, borderRadius: '4px', fontWeight: 700, letterSpacing: '0.01em' }}>
      {text}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CasesView() {
  const [cases, setCases]           = useState<Case[]>([]);
  const [selectedCase, setSelected] = useState<Case | null>(null);
  const [templates, setTemplates]   = useState<Template[]>([]);
  const [unassigned, setUnassigned] = useState<Doc[]>([]);
  const [runResult, setRunResult]   = useState<RunResult | null>(null);
  const [activeTemplate, setActiveTmpl] = useState<Template | null>(null);
  const [error, setError]           = useState('');

  // PDF viewer
  const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string } | null>(null);

  // Dataset view mode
  const [viewMode, setViewMode] = useState<'list' | 'table' | 'categorie'>('list');
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  // New case form
  const [newName, setNewName]     = useState('');
  const [newClient, setNewClient] = useState('');
  const [newDesc, setNewDesc]     = useState('');

  // Template editor state
  const [editingTmpl, setEditingTmpl] = useState<Template | null>(null);
  const [tmplName, setTmplName]       = useState('');
  const [tmplDesc, setTmplDesc]       = useState('');
  const [tmplRules, setTmplRules]     = useState<Rule[]>([]);
  const [tmplGlobalPrompts, setTmplGlobalPrompts] = useState<Array<{ name: string; prompt: string }>>([]);
  const [nlpText, setNlpText]         = useState('');
  const [nlpLoading, setNlpLoading]   = useState(false);
  const [nlpError, setNlpError]       = useState('');
  const [showManual, setShowManual]   = useState(false);

  // Panel visibility
  const [leftPanelVisible, setLeftPanelVisible]   = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);

  // Auto-hide right panel when in table or categorie mode
  useEffect(() => {
    if (viewMode === 'table' || viewMode === 'categorie') {
      setRightPanelVisible(false);
    } else {
      setRightPanelVisible(true);
    }
  }, [viewMode]);

  // Inline editing
  const [editingCell, setEditingCell] = useState<{ docId: string, field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadCases = useCallback(async () => {
    const token = localStorage.getItem('eco_token');
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    const r = await axios.get(`${API_BASE}/cases`);
    setCases(r.data);
  }, []);

  const loadTemplates = useCallback(async () => {
    const token = localStorage.getItem('eco_token');
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    const r = await axios.get(`${API_BASE}/templates`);
    setTemplates(r.data);
  }, []);

  const loadUnassigned = useCallback(async () => {
    const token = localStorage.getItem('eco_token');
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    const r = await axios.get(`${API_BASE}/documents-unassigned`);
    setUnassigned(r.data);
  }, []);

  const loadCase = useCallback(async (id: string) => {
    const token = localStorage.getItem('eco_token');
    if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    const r = await axios.get(`${API_BASE}/cases/${id}`);
    setSelected(r.data);
  }, []);

  useEffect(() => { loadCases(); loadTemplates(); loadUnassigned(); }, []);

  // ── Cases CRUD ────────────────────────────────────────────────────────────

  const createCase = async () => {
    if (!newName.trim()) return;
    try {
      await axios.post(`${API_BASE}/cases`, { name: newName.trim(), client_name: newClient.trim() || undefined, description: newDesc.trim() || undefined });
      setNewName(''); setNewClient(''); setNewDesc('');
      loadCases();
    } catch (e: any) { setError(e.response?.data?.detail || 'Error creating case'); }
  };

  const deleteCase = async (id: string) => {
    if (!window.confirm('Delete this case? Documents will be detached.')) return;
    try {
      await axios.delete(`${API_BASE}/cases/${id}`);
      if (selectedCase?.id === id) setSelected(null);
      loadCases(); loadUnassigned();
    } catch (e: any) { setError(e.response?.data?.detail || 'Error'); }
  };

  // ── Document assignment ───────────────────────────────────────────────────

  const assignDoc = async (docId: string) => {
    if (!selectedCase) return;
    await axios.post(`${API_BASE}/cases/${selectedCase.id}/documents/${docId}`);
    loadCase(selectedCase.id); loadUnassigned();
  };

  const unassignDoc = async (docId: string) => {
    if (!selectedCase) return;
    await axios.delete(`${API_BASE}/cases/${selectedCase.id}/documents/${docId}`);
    loadCase(selectedCase.id); loadUnassigned();
  };

  // ── Template CRUD ─────────────────────────────────────────────────────────

  const _resetEditorState = () => { setNlpText(''); setNlpError(''); setNlpLoading(false); setShowManual(false); };

  const startNewTemplate = () => {
    setEditingTmpl({ id: '', name: '', rules: [], created_at: '' });
    setTmplName(''); setTmplDesc(''); setTmplRules([]); _resetEditorState();
  };

  const startEditTemplate = (t: Template) => {
    setEditingTmpl(t);
    setTmplName(t.name); setTmplDesc(t.description || '');
    setTmplRules(t.rules.map(r => ({ ...r })));
    setTmplGlobalPrompts(t.global_prompts || []);
    _resetEditorState();
  };

  const saveTemplate = async () => {
    if (!tmplName.trim()) return;
    const payload = { 
      name: tmplName, 
      description: tmplDesc, 
      rules: tmplRules, 
      global_prompts: tmplGlobalPrompts 
    };
    try {
      if (editingTmpl?.id) {
        await axios.put(`${API_BASE}/templates/${editingTmpl.id}`, payload);
      } else {
        await axios.post(`${API_BASE}/templates`, payload);
      }
      setEditingTmpl(null);
      setTmplName(''); setTmplDesc(''); setTmplRules([]); setTmplGlobalPrompts([]);
      loadTemplates();
    } catch (e: any) { setError(e.response?.data?.detail || 'Error saving template'); }
  };

  const deleteTemplate = async (id: string) => {
    await axios.delete(`${API_BASE}/templates/${id}`);
    if (activeTemplate?.id === id) setActiveTmpl(null);
    loadTemplates();
  };

  const nlpConvert = async () => {
    if (!nlpText.trim()) return;
    setNlpLoading(true); setNlpError('');
    try {
      const res = await axios.post(`${API_BASE}/nlp-to-rule`, { text: nlpText });
      setTmplRules(r => [...r, res.data]);
      setNlpText('');
    } catch (e: any) {
      setNlpError(e.response?.data?.detail || 'Errore nella conversione AI');
    } finally {
      setNlpLoading(false);
    }
  };

  const removeRule = (i: number) => setTmplRules(r => r.filter((_, idx) => idx !== i));

  // ── Run analysis ──────────────────────────────────────────────────────────

  const runAnalysis = async () => {
    if (!selectedCase || !activeTemplate) return;
    try {
      const r = await axios.post(`${API_BASE}/cases/${selectedCase.id}/run/${activeTemplate.id}`);
      setRunResult(r.data);
    } catch (e: any) { setError(e.response?.data?.detail || 'Analysis failed'); }
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const token = localStorage.getItem('eco_token');
      const res = await axios.get(url, {
        responseType: 'blob',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      setError('Errore durante il download del file');
    }
  };

  const exportAs = (fmt: string) => {
    if (runResult) {
      const url = `${API_BASE}/runs/${runResult.run_id}/export-${fmt}`;
      const ext = fmt === 'excel' ? 'xlsx' : fmt;
      const baseName = selectedCase?.name || `analisi_${runResult.run_id.slice(0, 8)}`;
      const safeName = baseName.replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, '_').slice(0, 50);
      downloadFile(url, `${safeName}.${ext}`);
    }
  };

  const exportDataset = (caseId: string, fmt: 'excel' | 'docx') => {
    const url = `${API_BASE}/cases/${caseId}/export-dataset-${fmt}`;
    const ext = fmt === 'excel' ? 'xlsx' : fmt;
    const baseName = selectedCase?.id === caseId ? selectedCase.name : `dataset_${caseId.slice(0, 8)}`;
    const safeName = baseName.replace(/[^a-z0-9 _-]/gi, '').replace(/\s+/g, '_').slice(0, 50);
    downloadFile(url, `${safeName}.${ext}`);
  };

  const updateDocInfo = async (docId: string, field: string, value: string) => {
    try {
      let payload: any = {};
      const directFields = ['extracted_label', 'extracted_category', 'extracted_date', 'llm_notes'];
      if (directFields.includes(field)) {
        payload[field] = value;
      } else {
        payload.extracted_fields = { [field]: value };
      }
      await axios.patch(`${API_BASE}/documents/${docId}`, payload);
      if (selectedCase) loadCase(selectedCase.id);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Errore aggiornamento');
    }
    setEditingCell(null);
  };

  const renderEditableCell = (docId: string, field: string, value: string, style: React.CSSProperties = {}) => {
    const isEditing = editingCell?.docId === docId && editingCell?.field === field;
    
    if (isEditing) {
      return (
        <td style={{ padding: '0.4rem 0.6rem', ...style }}>
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={() => updateDocInfo(docId, field, editValue)}
            onKeyDown={e => {
              if (e.key === 'Enter') updateDocInfo(docId, field, editValue);
              if (e.key === 'Escape') setEditingCell(null);
            }}
            style={{ 
              width: '100%', 
              fontSize: '0.75rem', 
              padding: '2px 4px', 
              border: '1px solid #2d6a4f', 
              borderRadius: '2px',
              outline: 'none',
              background: 'white'
            }}
          />
        </td>
      );
    }

    return (
      <td 
        style={{ padding: '0.6rem 0.6rem', cursor: 'pointer', position: 'relative', ...style }}
        onClick={() => {
          setEditingCell({ docId, field });
          setEditValue(value || '');
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'rgba(45,106,79,0.05)';
          const icon = e.currentTarget.querySelector('.edit-hint');
          if (icon) (icon as HTMLElement).style.opacity = '1';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'transparent';
          const icon = e.currentTarget.querySelector('.edit-hint');
          if (icon) (icon as HTMLElement).style.opacity = '0';
        }}
        title="Clicca per modificare"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {field === 'llm_notes' && value ? (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <Sparkles size={11} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span style={{ fontSize: '0.7rem', fontStyle: 'italic', lineHeight: 1.3 }}>{value}</span>
              </div>
            ) : (value || '—')}
          </div>
          <span className="edit-hint" style={{ opacity: 0, transition: 'opacity 0.2s', fontSize: '0.65rem', color: '#2d6a4f', flexShrink: 0 }}>✎</span>
        </div>
      </td>
    );
  };

  const openPdf = async (doc: Doc) => {
    try {
      const res = await axios.get(`${API_BASE}/documents/${doc.id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      setPdfViewer({ url, name: doc.filename });
    } catch {
      setError('Impossibile aprire il PDF');
    }
  };

  const closePdf = () => {
    if (pdfViewer) URL.revokeObjectURL(pdfViewer.url);
    setPdfViewer(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // Dynamic grid setup
  const gridTemplateColumns = `${leftPanelVisible ? '280px' : '0px'} 1fr ${rightPanelVisible ? '380px' : '0px'}`;

  return (
    <div style={{ 
      display: 'grid', 
      gridTemplateColumns, 
      gap: (leftPanelVisible || rightPanelVisible) ? '1.25rem' : '0', 
      height: '100%', 
      minHeight: 0,
      transition: 'grid-template-columns 0.25s ease-out'
    }}>

      {/* ── PDF Viewer Modal ─────────────────────────────────────── */}
      {pdfViewer && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(9, 9, 11, 0.85)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column', padding: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', background: 'rgba(24, 24, 27, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderBottom: 'none', borderTopLeftRadius: '12px', borderTopRightRadius: '12px', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(45, 106, 79, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(45, 106, 79, 0.3)' }}>
                <FileText size={18} color="#52b788" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: 'white', fontSize: '0.9rem', fontWeight: 700, letterSpacing: '-0.01em' }}>{pdfViewer.name}</span>
                <span style={{ color: '#a1a1aa', fontSize: '0.7rem', fontWeight: 500 }}>Document Viewer</span>
              </div>
            </div>
            <button onClick={closePdf} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', color: '#f4f4f5', padding: '0.5rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
              <X size={16} /> Chiudi
            </button>
          </div>
          <iframe
            src={pdfViewer.url}
            style={{ flex: 1, border: '1px solid rgba(255,255,255,0.1)', background: 'white', width: '100%', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
            title={pdfViewer.name}
          />
        </div>
      )}

      {/* ── LEFT: Cases list ─────────────────────────────────── */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '0.75rem', 
        overflowY: 'auto',
        visibility: leftPanelVisible ? 'visible' : 'hidden',
        minWidth: 0,
        opacity: leftPanelVisible ? 1 : 0,
        transition: 'opacity 0.2s',
      }}>

        {/* Create case form */}
        <div style={{ background: 'white', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.07)', padding: '1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <p style={{ margin: '0 0 0.6rem', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: '0.07em' }}>New Case</p>
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createCase()}
            placeholder="Case name *" style={inputStyle} />
          <input value={newClient} onChange={e => setNewClient(e.target.value)}
            placeholder="Client name" style={{ ...inputStyle, marginTop: '0.4rem' }} />
          <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
            placeholder="Description" style={{ ...inputStyle, marginTop: '0.4rem' }} />
          <button onClick={createCase}
            style={{ marginTop: '0.6rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', background: '#2d6a4f', color: 'white', border: 'none', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', boxShadow: '0 1px 4px rgba(45,106,79,0.2)', fontFamily: 'inherit' }}>
            <Plus size={13} /> Create Case
          </button>
        </div>

        {/* Cases list */}
        {cases.map(c => {
          const sc = STATUS_COLORS[c.status] || STATUS_COLORS.open;
          const isSelected = selectedCase?.id === c.id;
          return (
            <div key={c.id} onClick={() => loadCase(c.id)}
              style={{ background: 'white', borderRadius: '4px', border: isSelected ? '2px solid #2d6a4f' : '1px solid rgba(0,0,0,0.07)', padding: '0.85rem 1rem', cursor: 'pointer', boxShadow: isSelected ? '0 0 0 3px rgba(45,106,79,0.12)' : '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  {c.client_name && <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.1rem' }}>{c.client_name}</div>}
                  <div style={{ marginTop: '0.4rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <Badge text={c.status} bg={sc.bg} color={sc.color} />
                    <span style={{ fontSize: '0.68rem', color: '#a1a1aa' }}>{c.doc_count} docs</span>
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteCase(c.id); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px', flexShrink: 0 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          );
        })}
        {cases.length === 0 && <p style={{ fontSize: '0.82rem', color: '#a1a1aa', fontStyle: 'italic', textAlign: 'center', margin: '0.5rem 0' }}>No cases yet</p>}
      </div>

      {/* ── CENTER: Case detail + document management ─────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', minHeight: 0 }}>

        {error && (
          <div style={{ padding: '0.6rem 1rem', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '4px', color: '#991b1b', fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between' }}>
            {error}
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
          </div>
        )}

        {!selectedCase ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa' }}>
            <FolderOpen size={48} style={{ opacity: 0.3, marginBottom: '0.75rem' }} />
            <p style={{ margin: 0, fontStyle: 'italic' }}>Select a case to view details</p>
          </div>
        ) : (
          <>
            {/* Case header */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.07)', padding: '1.1rem 1.25rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{selectedCase.name}</h2>
                  {selectedCase.client_name && <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#71717a' }}>Client: {selectedCase.client_name}</p>}
                  {selectedCase.description && <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#a1a1aa', fontStyle: 'italic' }}>{selectedCase.description}</p>}
                </div>
                <Badge text={selectedCase.status} bg={STATUS_COLORS[selectedCase.status]?.bg} color={STATUS_COLORS[selectedCase.status]?.color} />
              </div>
            </div>

            {/* Assigned documents */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.07)', padding: '1rem 1.25rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', color: '#2d6a4f', letterSpacing: '0.07em' }}>
                  Documenti nel fascicolo ({(selectedCase.documents || []).length})
                </p>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  {/* Dataset download buttons */}
                  {(selectedCase.documents || []).length > 0 && <>
                    <button onClick={() => exportDataset(selectedCase.id, 'excel')}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: '1px solid rgba(0,0,0,0.1)', padding: '0.28rem 0.55rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, color: '#166534' }} title="Scarica dataset Excel">
                      <FileSpreadsheet size={12} /> XLS
                    </button>
                    <button onClick={() => exportDataset(selectedCase.id, 'docx')}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: '1px solid rgba(0,0,0,0.1)', padding: '0.28rem 0.55rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, color: '#1d4ed8' }} title="Scarica dataset Word">
                      <FileType2 size={12} /> DOC
                    </button>
                    <div style={{ width: '1px', height: '16px', background: 'rgba(0,0,0,0.1)', margin: '0 0.1rem' }} />
                  </>}
                  {/* View mode toggle */}
                  <button onClick={() => setViewMode('list')}
                    style={{ background: viewMode === 'list' ? '#edf7f1' : 'none', border: `1px solid ${viewMode === 'list' ? '#a7d3bc' : 'rgba(0,0,0,0.1)'}`, padding: '0.28rem 0.45rem', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'list' ? '#2d6a4f' : '#a1a1aa', display: 'flex' }} title="Vista lista">
                    <List size={13} />
                  </button>
                  <button onClick={() => setViewMode('table')}
                    style={{ background: viewMode === 'table' ? '#edf7f1' : 'none', border: `1px solid ${viewMode === 'table' ? '#a7d3bc' : 'rgba(0,0,0,0.1)'}`, padding: '0.28rem 0.45rem', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'table' ? '#2d6a4f' : '#a1a1aa', display: 'flex' }} title="Vista tabella">
                    <Table2 size={13} />
                  </button>
                  <button onClick={() => {
                    setViewMode('categorie');
                    // expand all categories by default
                    const cats = [...new Set((selectedCase?.documents || []).map(d => d.extracted_category || 'Senza categoria'))];
                    setOpenCategories(new Set(cats));
                  }}
                    style={{ background: viewMode === 'categorie' ? '#edf7f1' : 'none', border: `1px solid ${viewMode === 'categorie' ? '#a7d3bc' : 'rgba(0,0,0,0.1)'}`, padding: '0.28rem 0.45rem', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'categorie' ? '#2d6a4f' : '#a1a1aa', display: 'flex' }} title="Vista per categorie">
                    <Layers size={13} />
                  </button>

                  <div style={{ width: '1px', height: '16px', background: 'rgba(0,0,0,0.1)', margin: '0 0.1rem' }} />

                  {/* Panel toggles */}
                  <button onClick={() => setLeftPanelVisible(v => !v)}
                    style={{ background: !leftPanelVisible ? '#edf7f1' : 'none', border: `1px solid ${!leftPanelVisible ? '#a7d3bc' : 'rgba(0,0,0,0.1)'}`, padding: '0.28rem 0.45rem', borderRadius: '4px', cursor: 'pointer', color: !leftPanelVisible ? '#2d6a4f' : '#a1a1aa', display: 'flex' }} title={leftPanelVisible ? "Nascondi lista fascicoli" : "Mostra lista fascicoli"}>
                    {leftPanelVisible ? <PanelLeftClose size={13} /> : <PanelLeft size={13} />}
                  </button>
                  <button onClick={() => setRightPanelVisible(v => !v)}
                    style={{ background: !rightPanelVisible ? '#edf7f1' : 'none', border: `1px solid ${!rightPanelVisible ? '#a7d3bc' : 'rgba(0,0,0,0.1)'}`, padding: '0.28rem 0.45rem', borderRadius: '4px', cursor: 'pointer', color: !rightPanelVisible ? '#2d6a4f' : '#a1a1aa', display: 'flex' }} title={rightPanelVisible ? "Nascondi pannello analisi" : "Mostra pannello analisi"}>
                    {rightPanelVisible ? <PanelRightClose size={13} /> : <PanelRight size={13} />}
                  </button>
                </div>
              </div>

              {(selectedCase.documents || []).length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#a1a1aa', fontStyle: 'italic' }}>Nessun documento assegnato</p>
              ) : viewMode === 'list' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {(selectedCase.documents || []).map(doc => (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.7rem', background: 'white', borderRadius: '4px', border: '1px solid #d1fae5', borderLeft: '3px solid #2d6a4f' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <button onClick={() => openPdf(doc)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, minWidth: 0, width: '100%' }}
                          title="Apri PDF">
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#2d6a4f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textDecoration: 'underline', textDecorationColor: 'rgba(45,106,79,0.3)' }}>
                            {doc.filename}
                          </span>
                        </button>
                        {doc.llm_notes && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.15rem' }}>
                            <Sparkles size={11} color="#d97706" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '0.72rem', color: '#92400e', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.llm_notes}>{doc.llm_notes}</span>
                          </div>
                        )}
                      </div>
                      {doc.extracted_label && <Badge text={doc.extracted_label} />}
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button onClick={() => window.open(`${API_BASE}/documents/${doc.id}/ocr`, '_blank')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px', display: 'flex' }} title="Scarica Testo OCR">
                          <FileText size={13} />
                        </button>
                        {doc.llm_classification_match === false && <span title="Discrepanza OCR/LLM"><AlertTriangle size={13} color="#d97706" /></span>}
                        {doc.human_verified && <span title="Verificato"><CheckCircle2 size={13} color="#10b981" /></span>}
                      </div>
                      <button onClick={() => unassignDoc(doc.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0, flexShrink: 0 }}
                        title="Rimuovi dal fascicolo"><X size={13} /></button>
                    </div>
                  ))}
                </div>
              ) : viewMode === 'categorie' ? (
                /* ── CATEGORIE VIEW ── */
                (() => {
                  const docs = selectedCase.documents || [];
                  // Group by category
                  const grouped: Record<string, Doc[]> = {};
                  docs.forEach(doc => {
                    const cat = doc.extracted_category || 'Senza categoria';
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push(doc);
                  });
                  const categories = Object.keys(grouped).sort((a, b) => {
                    if (a === 'Senza categoria') return 1;
                    if (b === 'Senza categoria') return -1;
                    return grouped[b].length - grouped[a].length;
                  });
                  // Color palette per category index
                  const palette = [
                    { bg: '#edf7f1', border: '#a7d3bc', accent: '#2d6a4f', text: '#1e4d38' },
                    { bg: '#eff6ff', border: '#bfdbfe', accent: '#2563eb', text: '#1e3a8a' },
                    { bg: '#fefce8', border: '#fde68a', accent: '#d97706', text: '#78350f' },
                    { bg: '#fdf2f8', border: '#f9a8d4', accent: '#db2777', text: '#831843' },
                    { bg: '#f0fdf4', border: '#86efac', accent: '#16a34a', text: '#14532d' },
                    { bg: '#f5f3ff', border: '#c4b5fd', accent: '#7c3aed', text: '#4c1d95' },
                    { bg: '#fff7ed', border: '#fdba74', accent: '#ea580c', text: '#7c2d12' },
                    { bg: '#f0f9ff', border: '#7dd3fc', accent: '#0284c7', text: '#0c4a6e' },
                  ];
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {categories.map((cat, idx) => {
                        const catDocs = grouped[cat];
                        const isOpen = openCategories.has(cat);
                        const c = palette[idx % palette.length];
                        return (
                          <div key={cat} style={{ border: `1px solid ${c.border}`, borderRadius: '6px', overflow: 'hidden' }}>
                            {/* Category header */}
                            <button
                              onClick={() => setOpenCategories(prev => {
                                const next = new Set(prev);
                                if (next.has(cat)) next.delete(cat); else next.add(cat);
                                return next;
                              })}
                              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.85rem', background: c.bg, border: 'none', cursor: 'pointer', textAlign: 'left', gap: '0.6rem' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                <Layers size={13} color={c.accent} style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: c.text, textTransform: 'capitalize' }}>{cat}</span>
                                <span style={{ fontSize: '0.68rem', background: c.accent, color: 'white', borderRadius: '10px', padding: '1px 7px', fontWeight: 700 }}>{catDocs.length}</span>
                              </div>
                              <ChevronRight size={14} color={c.accent} style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s', flexShrink: 0 }} />
                            </button>
                            {/* Documents list */}
                            {isOpen && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0.5rem 0.85rem 0.7rem' }}>
                                {catDocs.map(doc => (
                                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.65rem', background: 'white', borderRadius: '4px', border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.accent}` }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <button onClick={() => openPdf(doc)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, width: '100%' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: c.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', textDecoration: 'underline', textDecorationColor: `${c.accent}44` }}>
                                          {doc.filename}
                                        </span>
                                      </button>
                                      {doc.extracted_label && (
                                        <span style={{ fontSize: '0.68rem', color: c.text, fontWeight: 500, opacity: 0.8 }}>{doc.extracted_label}</span>
                                      )}
                                      {doc.extracted_date && (
                                        <span style={{ fontSize: '0.68rem', color: '#9ca3af', marginLeft: '0.5rem' }}>{doc.extracted_date}</span>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexShrink: 0 }}>
                                      {doc.llm_classification_match === false && <AlertTriangle size={12} color="#d97706" />}
                                      {doc.human_verified && <CheckCircle2 size={12} color="#10b981" />}
                                      <button onClick={() => unassignDoc(doc.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0 }} title="Rimuovi">
                                        <X size={12} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              ) : (
                /* ── TABLE VIEW ── */
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                    <thead>
                      <tr style={{ background: '#2d6a4f' }}>
                        {['File', 'Tipo', 'Categoria', 'Data', 'Importo', 'Mittente', 'Destinatario', 'Ragionamento / Note', ''].map(h => (
                          <th key={h} style={{ padding: '0.5rem 0.6rem', color: 'white', fontWeight: 700, textAlign: h === 'Ragionamento / Note' ? 'center' : 'left', whiteSpace: 'nowrap', fontSize: '0.68rem', letterSpacing: '0.03em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(selectedCase.documents || []).map((doc, i) => {
                        const f = doc.extracted_fields || {};
                        return (
                          <tr key={doc.id} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '0.6rem 0.6rem' }}>
                              <button onClick={() => openPdf(doc)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <FileText size={12} color="#166534" style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2d6a4f', textDecoration: 'underline', textDecorationColor: 'rgba(45,106,79,0.35)', display: 'block' }} title={doc.filename}>
                                  {doc.filename}
                                </span>
                              </button>
                            </td>
                            {renderEditableCell(doc.id, 'extracted_label', doc.extracted_label || '', { whiteSpace: 'nowrap' })}
                            {renderEditableCell(doc.id, 'extracted_category', doc.extracted_category || '')}
                            {renderEditableCell(doc.id, 'extracted_date', doc.extracted_date || '', { whiteSpace: 'nowrap' })}
                            {renderEditableCell(doc.id, 'importo', f.importo || '', { color: '#166534', fontWeight: 600, whiteSpace: 'nowrap' })}
                            {renderEditableCell(doc.id, 'mittente', f.mittente || '')}
                            {renderEditableCell(doc.id, 'destinatario', f.destinatario || '')}
                            {renderEditableCell(doc.id, 'llm_notes', doc.llm_notes || '', { color: '#92400e', minWidth: '200px' })}
                            
                            <td style={{ padding: '0.6rem 0.6rem', textAlign: 'right' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                <button onClick={() => window.open(`${API_BASE}/documents/${doc.id}/ocr`, '_blank')}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0 }} title="Testo OCR">
                                  <FileText size={12} />
                                </button>
                                {doc.human_verified && (
                                  <span title="Verificato">
                                    <CheckCircle2 size={13} color="#10b981" />
                                  </span>
                                )}
                                <button onClick={() => unassignDoc(doc.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0 }} title="Rimuovi"><X size={13} /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Unassigned document picker */}
            {unassigned.length > 0 && (
              <div style={{ background: '#fafaf8', borderRadius: '4px', border: '1px dashed rgba(0,0,0,0.12)', padding: '1rem 1.25rem' }}>
                <p style={{ margin: '0 0 0.75rem', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', color: '#9ca3af', letterSpacing: '0.07em' }}>
                  Aggiungi al fascicolo
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto' }}>
                  {unassigned.map(doc => (
                    <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0.7rem', background: 'white', borderRadius: '4px', border: '1px dashed #d1d5db', cursor: 'pointer' }}
                      onClick={() => assignDoc(doc.id)}>
                      <Plus size={13} style={{ color: '#9ca3af', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: '0.8rem', color: '#71717a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.filename}>{doc.filename}</span>
                      {doc.extracted_label && <Badge text={doc.extracted_label} bg="#f3f4f6" color="#6b7280" />}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Run Analysis */}
            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.07)', padding: '1rem 1.25rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <p style={{ margin: '0 0 0.75rem', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: '0.07em' }}>
                Esegui Analisi
              </p>
              {templates.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#a1a1aa', fontStyle: 'italic' }}>Nessun template — creane uno nella colonna a destra.</p>
              ) : (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    value={activeTemplate?.id || ''}
                    onChange={e => setActiveTmpl(templates.find(t => t.id === e.target.value) || null)}
                    style={{ ...selectStyle, flex: 1 }}>
                    <option value="">Seleziona template…</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.rules.length} regole)</option>
                    ))}
                  </select>
                  <button onClick={runAnalysis} disabled={!activeTemplate}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: activeTemplate ? '#2d6a4f' : '#e5e7eb', color: activeTemplate ? 'white' : '#9ca3af', border: 'none', padding: '0.5rem 0.9rem', borderRadius: '4px', cursor: activeTemplate ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap', fontFamily: 'inherit', boxShadow: activeTemplate ? '0 1px 4px rgba(45,106,79,0.2)' : 'none' }}>
                    <Play size={13} /> Esegui
                  </button>
                </div>
              )}
            </div>

            {/* Run results (inline, after running) */}
            {runResult && (
              <div style={{ background: 'white', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.07)', padding: '1rem 1.25rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: '0.07em' }}>Risultati Analisi</p>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {([['csv', '#475569'], ['pdf', '#dc2626'], ['docx', '#2563eb']] as const).map(([fmt, color]) => (
                      <button key={fmt} onClick={() => exportAs(fmt)}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: '1px solid rgba(0,0,0,0.1)', padding: '0.3rem 0.55rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, color }}>
                        <Download size={11} /> {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div style={{ padding: '0.6rem', background: '#f8fafc', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.07)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#18181b' }}>{runResult.summary.total}</div>
                    <div style={{ fontSize: '0.7rem', color: '#71717a' }}>Documenti</div>
                  </div>
                  <div style={{ padding: '0.6rem', background: runResult.summary.flagged > 0 ? '#fef3c7' : '#dcfce7', borderRadius: '4px', border: `1px solid ${runResult.summary.flagged > 0 ? '#fde68a' : '#bbf7d0'}`, textAlign: 'center' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: runResult.summary.flagged > 0 ? '#92400e' : '#166534' }}>{runResult.summary.flagged}</div>
                    <div style={{ fontSize: '0.7rem', color: runResult.summary.flagged > 0 ? '#92400e' : '#166534' }}>Segnalati</div>
                  </div>
                </div>
                {runResult.global_insights?.map((insight, idx) => (
                  <div key={idx} style={{ marginBottom: '1rem', padding: '1rem', background: '#f4faf7', border: '1px solid #a7d3bc', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                      <Sparkles size={14} color="#2d6a4f" />
                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#2d6a4f', textTransform: 'uppercase' }}>{insight.name}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#18181b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      {insight.insight}
                    </div>
                  </div>
                ))}
                
                {Object.keys(runResult.summary.by_rule).length > 0 && (
                  <div style={{ marginBottom: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {Object.entries(runResult.summary.by_rule).map(([k, v]) => (
                      <span key={k} style={{ fontSize: '0.7rem', padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontWeight: 700 }}>{k}: {v}</span>
                    ))}
                  </div>
                )}
                {runResult.results.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem', background: '#dcfce7', borderRadius: '4px' }}>
                    <CheckCircle2 size={16} color="#166534" />
                    <span style={{ fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>Nessun documento corrisponde alle regole</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {runResult.results.map(row => (
                      <div key={row.document_id} style={{ padding: '0.65rem 0.8rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
                          <AlertTriangle size={13} color="#d97706" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#18181b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.filename}>{row.filename}</span>
                        </div>
                        {row.label && <div style={{ fontSize: '0.72rem', color: '#71717a', marginBottom: '0.3rem' }}>{row.label}</div>}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {row.triggered_rules.map((tr, i) => (
                            <span key={i} style={{ fontSize: '0.68rem', padding: '1px 7px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontWeight: 700, border: '1px solid #fde68a' }}>
                              {tr.flag_label || `${tr.field} ${tr.op}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── RIGHT: Templates + Run results ───────────────────── */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1rem', 
        overflowY: 'auto', 
        minHeight: 0,
        visibility: rightPanelVisible ? 'visible' : 'hidden',
        minWidth: 0,
        opacity: rightPanelVisible ? 1 : 0,
        transition: 'opacity 0.2s',
      }}>

        {/* Template list */}
        <div style={{ background: 'white', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.07)', padding: '1rem 1.25rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <p style={{ margin: 0, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', color: '#a1a1aa', letterSpacing: '0.07em' }}>Analysis Templates</p>
            <button onClick={startNewTemplate}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#2d6a4f', color: 'white', border: 'none', padding: '0.35rem 0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem' }}>
              <Plus size={12} /> New
            </button>
          </div>

          {templates.length === 0 && <p style={{ margin: 0, fontSize: '0.82rem', color: '#a1a1aa', fontStyle: 'italic' }}>No templates yet</p>}

          {templates.map(t => (
            <div key={t.id}
              onClick={() => setActiveTmpl(activeTemplate?.id === t.id ? null : t)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.7rem', borderRadius: '4px', marginBottom: '0.35rem', background: activeTemplate?.id === t.id ? '#edf7f1' : '#f8fafc', border: `1px solid ${activeTemplate?.id === t.id ? '#a7d3bc' : '#e2e8f0'}`, cursor: 'pointer' }}>
              <ChevronRight size={13} style={{ color: activeTemplate?.id === t.id ? '#2d6a4f' : '#a1a1aa', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: activeTemplate?.id === t.id ? 700 : 500, color: activeTemplate?.id === t.id ? '#2d6a4f' : '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              <span style={{ fontSize: '0.68rem', color: '#a1a1aa' }}>{t.rules.length} rules</span>
              <button onClick={e => { e.stopPropagation(); startEditTemplate(t); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.68rem', color: '#a1a1aa', padding: '1px 3px' }}>✎</button>
              <button onClick={e => { e.stopPropagation(); deleteTemplate(t.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: 0 }}><Trash2 size={12} /></button>
            </div>
          ))}

          {!selectedCase && activeTemplate && (
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#f59e0b', fontStyle: 'italic' }}>Seleziona un fascicolo per eseguire l'analisi</p>
          )}
        </div>

        {/* Template editor */}
        {editingTmpl !== null && (
          <div style={{ background: 'white', borderRadius: '4px', border: '2px solid #a7d3bc', padding: '1.1rem 1.25rem', boxShadow: '0 4px 12px rgba(45,106,79,0.12)' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: '0.88rem', color: '#2d6a4f' }}>
                {editingTmpl.id ? 'Modifica Template' : 'Nuovo Template'}
              </p>
              <button onClick={() => setEditingTmpl(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa' }}><X size={16} /></button>
            </div>

            <input value={tmplName} onChange={e => setTmplName(e.target.value)} placeholder="Nome template *" style={inputStyle} />
            <input value={tmplDesc} onChange={e => setTmplDesc(e.target.value)} placeholder="Descrizione" style={{ ...inputStyle, marginTop: '0.4rem' }} />

            {/* ── AI Rule Builder (primary) ── */}
            <div style={{ margin: '1rem 0 0.5rem', padding: '0.85rem', background: '#f4faf7', border: '1px solid #a7d3bc', borderRadius: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.55rem' }}>
                <Sparkles size={13} color="#2d6a4f" />
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2d6a4f', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Aggiungi regola con AI</span>
              </div>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: '#52525b', lineHeight: 1.5 }}>
                Descrivi in italiano cosa vuoi segnalare — l'AI creerà la regola automaticamente.
              </p>
              <textarea
                value={nlpText}
                onChange={e => setNlpText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) nlpConvert(); }}
                placeholder='Es: "Segnalami tutti i decreti ingiuntivi con importo superiore a 10.000 euro"'
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontSize: '0.8rem', fontFamily: 'inherit' }}
              />
              {nlpError && <p style={{ margin: '0.3rem 0 0', fontSize: '0.75rem', color: '#dc2626' }}>{nlpError}</p>}
              <button
                onClick={nlpConvert}
                disabled={nlpLoading || !nlpText.trim()}
                style={{
                  marginTop: '0.5rem', width: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: '0.4rem',
                  background: nlpLoading || !nlpText.trim() ? '#e5e7eb' : '#2d6a4f',
                  color: nlpLoading || !nlpText.trim() ? '#9ca3af' : 'white',
                  border: 'none', padding: '0.55rem', borderRadius: '4px',
                  cursor: nlpLoading || !nlpText.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 700, fontSize: '0.8rem', fontFamily: 'inherit',
                }}>
                {nlpLoading
                  ? <><Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> Conversione in corso...</>
                  : <><Sparkles size={13} /> Converti con AI</>
                }
              </button>
            </div>

            {/* ── Global Analysis Prompts ── */}
            <div style={{ margin: '0.75rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileType2 size={13} color="#0369a1" />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>Analisi Globali (Cross-Doc)</span>
                </div>
                <button 
                  onClick={() => setTmplGlobalPrompts([...tmplGlobalPrompts, { name: 'Analisi ' + (tmplGlobalPrompts.length + 1), prompt: '' }])}
                  style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.65rem', fontWeight: 700, color: '#0369a1', cursor: 'pointer' }}
                >
                  + Aggiungi Analisi
                </button>
              </div>
              
              {tmplGlobalPrompts.length === 0 && (
                <p style={{ margin: '0.5rem 0', fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '1rem', border: '1px dashed #e2e8f0', borderRadius: '4px' }}>
                  Nessuna analisi globale definita. Aggiungine una per fare domande al fascicolo.
                </p>
              )}

              {tmplGlobalPrompts.map((p, idx) => (
                <div key={idx} style={{ marginBottom: '0.75rem', padding: '0.85rem', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input 
                      value={p.name}
                      onChange={e => {
                        const next = [...tmplGlobalPrompts];
                        next[idx].name = e.target.value;
                        setTmplGlobalPrompts(next);
                      }}
                      placeholder="Nome analisi (es: Riassunto Scadenze)"
                      style={{ flex: 1, padding: '0.35rem 0.5rem', fontSize: '0.75rem', fontWeight: 700, border: '1px solid #bae6fd', borderRadius: '4px', background: 'white' }}
                    />
                    <button 
                      onClick={() => setTmplGlobalPrompts(tmplGlobalPrompts.filter((_, i) => i !== idx))}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <textarea
                    value={p.prompt}
                    onChange={e => {
                      const next = [...tmplGlobalPrompts];
                      next[idx].prompt = e.target.value;
                      setTmplGlobalPrompts(next);
                    }}
                    placeholder='Es: "Qual è il documento più recente?"'
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5, fontSize: '0.8rem', fontFamily: 'inherit', borderColor: '#bae6fd' }}
                  />
                </div>
              ))}
            </div>

            {/* ── Active rules list ── */}
            {tmplRules.length > 0 && (
              <div style={{ margin: '0.75rem 0 0.5rem' }}>
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Regole attive ({tmplRules.length})
                </p>
                {tmplRules.map((rule, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.55rem 0.7rem', background: '#f4faf7', border: '1px solid #a7d3bc', borderRadius: '4px', marginBottom: '0.35rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                        {/* Editable flag_label */}
                        <input
                          value={rule.flag_label || ''}
                          onChange={e => setTmplRules(r => r.map((rl, idx) => idx === i ? { ...rl, flag_label: e.target.value } : rl))}
                          placeholder="Nome etichetta (es. Importo elevato)"
                          style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1a1a1a', border: '1px solid transparent', borderRadius: '3px', padding: '2px 5px', background: 'transparent', outline: 'none', fontFamily: 'inherit', width: '100%', transition: 'border-color 0.15s' }}
                          onFocus={e => e.target.style.borderColor = '#a7d3bc'}
                          onBlur={e => e.target.style.borderColor = 'transparent'}
                        />
                        {/* Editable field + op + value */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                          <select
                            value={rule.field}
                            onChange={e => setTmplRules(r => r.map((rl, idx) => idx === i ? { ...rl, field: e.target.value } : rl))}
                            style={{ fontSize: '0.7rem', color: '#71717a', border: '1px solid transparent', borderRadius: '3px', padding: '1px 4px', background: 'transparent', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
                            onFocus={e => e.target.style.borderColor = '#a7d3bc'}
                            onBlur={e => e.target.style.borderColor = 'transparent'}
                          >
                            {FIELDS.map(f => <option key={f} value={f}>{FIELD_LABELS[f] || f}</option>)}
                          </select>
                          <select
                            value={rule.op}
                            onChange={e => setTmplRules(r => r.map((rl, idx) => idx === i ? { ...rl, op: e.target.value } : rl))}
                            style={{ fontSize: '0.7rem', color: '#71717a', border: '1px solid transparent', borderRadius: '3px', padding: '1px 4px', background: 'transparent', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}
                            onFocus={e => e.target.style.borderColor = '#a7d3bc'}
                            onBlur={e => e.target.style.borderColor = 'transparent'}
                          >
                            {OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {!['is_null', 'not_null'].includes(rule.op) && (
                            <input
                              value={rule.value}
                              onChange={e => setTmplRules(r => r.map((rl, idx) => idx === i ? { ...rl, value: e.target.value } : rl))}
                              placeholder="valore"
                              style={{ fontSize: '0.7rem', color: '#71717a', border: '1px solid transparent', borderRadius: '3px', padding: '1px 5px', background: 'transparent', outline: 'none', fontFamily: 'inherit', flex: 1, minWidth: '60px' }}
                              onFocus={e => e.target.style.borderColor = '#a7d3bc'}
                              onBlur={e => e.target.style.borderColor = 'transparent'}
                            />
                          )}
                        </div>
                      </div>
                      <button onClick={() => removeRule(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', flexShrink: 0, padding: 0 }}><X size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Manual rule builder (secondary/advanced) ── */}
            <button
              onClick={() => setShowManual(m => !m)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#9ca3af', padding: '0.3rem 0', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600, fontFamily: 'inherit' }}>
              <ChevronRight size={12} style={{ transform: showManual ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
              Aggiungi regola manualmente
            </button>

            {showManual && (
              <div style={{ marginTop: '0.4rem', padding: '0.75rem', background: '#f9f9f7', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '4px' }}>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <select id="m-field" style={selectStyle} defaultValue="label">
                    {FIELDS.map(f => <option key={f} value={f}>{FIELD_LABELS[f] || f}</option>)}
                  </select>
                  <select id="m-op" style={selectStyle} defaultValue="eq">
                    {OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <input id="m-value" placeholder="Valore" style={{ ...inputStyle, fontSize: '0.78rem', marginBottom: '0.3rem' }} />
                <input id="m-label" placeholder="Etichetta flag (es. Importo elevato)" style={{ ...inputStyle, fontSize: '0.75rem', marginBottom: '0.5rem' }} />
                <button onClick={() => {
                  const field = (document.getElementById('m-field') as HTMLSelectElement).value;
                  const op    = (document.getElementById('m-op')    as HTMLSelectElement).value;
                  const value = (document.getElementById('m-value') as HTMLInputElement).value;
                  const flag  = (document.getElementById('m-label') as HTMLInputElement).value;
                  setTmplRules(r => [...r, { field, op, value, flag_label: flag }]);
                  (document.getElementById('m-value') as HTMLInputElement).value = '';
                  (document.getElementById('m-label') as HTMLInputElement).value = '';
                  setShowManual(false);
                }} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: '1px dashed #a7d3bc', color: '#2d6a4f', padding: '0.35rem 0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.76rem', fontFamily: 'inherit' }}>
                  <Plus size={12} /> Aggiungi
                </button>
              </div>
            )}

            <button onClick={saveTemplate}
              style={{ marginTop: '0.85rem', width: '100%', background: '#2d6a4f', color: 'white', border: 'none', padding: '0.6rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', fontFamily: 'inherit' }}>
              Salva Template
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Shared micro-styles ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', borderRadius: '4px',
  border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.8rem', boxSizing: 'border-box',
  outline: 'none', color: '#18181b', background: 'white',
  fontFamily: '"Inter", system-ui, sans-serif',
};

const selectStyle: React.CSSProperties = {
  flex: 1, padding: '5px 8px', borderRadius: '4px',
  border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.75rem', color: '#18181b',
  background: 'white', cursor: 'pointer',
  fontFamily: '"Inter", system-ui, sans-serif',
};
