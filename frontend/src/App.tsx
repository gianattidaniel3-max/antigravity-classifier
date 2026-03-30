import React, { useState, useEffect, useRef, memo } from 'react';
import {
  FileSearch, Upload, CheckCircle, FolderOpen, ChevronRight, ChevronLeft,
  Tag, Layers, Scale, Files, BarChart2, Settings, Eye, EyeOff, X, AlertTriangle,
} from 'lucide-react';
import axios from 'axios';
import TaxonomyPanel from './TaxonomyPanel';
import CasesView from './CasesView';
import DashboardView from './DashboardView';

const API_BASE = 'http://localhost:8000/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  pageBg:     '#f2f0eb',
  cardBg:     '#ffffff',
  sidebar:    '#faf9f6',
  sideHover:  '#ede9e1',
  sideActive: '#d6ede2',
  sideBorder: '#e4e0d8',
  border:     'rgba(0,0,0,0.08)',
  borderMed:  'rgba(0,0,0,0.14)',
  text1:      '#1a1a1a',
  text2:      '#52525b',
  text3:      '#9ca3af',
  accent:     '#2d6a4f',
  accentBg:   '#edf7f1',
  accentMid:  '#a7d3bc',
  accentDark: '#1e4d38',
  shadow:     '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
  shadowMd:   '0 4px 16px rgba(0,0,0,0.07)',
  radius:     '4px',
  radiusSm:   '4px',
  font:       '"Inter", system-ui, -apple-system, sans-serif',
};

const STATUS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  idle:           { bg: '#f4f4f5', text: '#71717a', border: 'rgba(0,0,0,0.06)', dot: '#a1a1aa' },
  'uploading...': { bg: T.accentBg, text: T.accent, border: T.accentMid, dot: T.accent },
  pending:        { bg: '#f4f4f5', text: '#71717a', border: 'rgba(0,0,0,0.06)', dot: '#a1a1aa' },
  processing:     { bg: T.accentBg, text: T.accentDark, border: T.accentMid, dot: T.accent },
  temp_classified: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd', dot: '#0ea5e9' },
  needs_review:   { bg: '#fffbeb', text: '#92400e', border: '#fde68a', dot: '#f59e0b' },
  verified:       { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0', dot: '#22c55e' },
  failed:         { bg: '#fef2f2', text: '#991b1b', border: '#fecaca', dot: '#ef4444' },
};

const FIELD_LABELS: Record<string, string> = {
  mittente: 'Mittente', destinatario: 'Destinatario', oggetto: 'Oggetto',
  importo: 'Importo', scadenza: 'Scadenza', tribunale: 'Tribunale',
  numero_decreto: 'N. Decreto', numero_rg: 'N. R.G.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderOcrText(text: string, fields: Record<string, string>, date: string): React.ReactNode {
  const values = [...Object.values(fields), date].filter(v => v && v.trim().length > 2);
  if (values.length === 0) return text;
  const escaped = values.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} style={{ background: '#fef08a', fontWeight: 600, borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
      : part
  );
}

const PdfViewer = memo(({ docId, token }: { docId: string; token: string | null }) => (
  <iframe src={`${API_BASE}/documents/${docId}/pdf?token=${token}`}
    style={{ width: '100%', height: '100%', border: 'none', display: 'block' }} title="Document Preview" />
));

// ─── Nav item ─────────────────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', padding: '9px 16px', border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '10px', borderRadius: T.radius,
        background: active ? T.sideActive : hovered ? T.sideHover : 'transparent',
        color: active ? T.accent : hovered ? T.text2 : T.text3,
        transition: 'all 0.12s', textAlign: 'left',
        fontFamily: T.font, fontSize: '0.82rem', fontWeight: active ? 700 : 500,
        position: 'relative',
      }}>
      {active && <span style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: '3px', background: T.accent, borderRadius: '0 2px 2px 0' }} />}
      <span style={{ flexShrink: 0, opacity: active ? 1 : 0.65 }}>{icon}</span>
      {label}
    </button>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] || STATUS.idle;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px 3px 8px', borderRadius: '3px', fontSize: '0.7rem',
      fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
      background: s.bg, color: s.text, border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: s.dot, display: 'inline-block' }} />
      {status === 'idle' ? 'in attesa' : status === 'temp_classified' ? 'pre-classificato' : status.replace('_', ' ')}
    </span>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: T.text3 }}>
      {children}
    </span>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────
function FieldRow({ label, value, editable, onChange }: {
  label: string; value: string; editable: boolean;
  onChange?: (v: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', alignItems: 'center', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 500, color: T.text3 }}>{label}</span>
      {editable ? (
        <input value={value || ''} onChange={e => onChange?.(e.target.value)}
          placeholder="—"
          style={{
            padding: '0.35rem 0.6rem', borderRadius: T.radiusSm,
            border: `1px solid ${T.accentMid}`, background: '#f9fcfb',
            color: T.text1, fontSize: '0.82rem', outline: 'none',
            width: '100%', boxSizing: 'border-box',
          }} />
      ) : (
        <span style={{ fontSize: '0.82rem', color: value ? T.text1 : T.text3, fontWeight: value ? 500 : 400 }}>
          {value || '—'}
        </span>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
type View = 'classifier' | 'cases' | 'taxonomy' | 'dashboard';

function App() {
  const token: string | null = null;

  // ── Settings state ───────────────────────────────────────────────────────────
  const [showSettings, setShowSettings]   = useState(false);
  const [apiKeyInput, setApiKeyInput]     = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [apiKeySet, setApiKeySet]         = useState<boolean | null>(null);
  const [apiKeyPreview, setApiKeyPreview] = useState('');
  const [apiKeySaving, setApiKeySaving]   = useState(false);
  const [apiKeyError, setApiKeyError]     = useState('');
  const [apiKeySuccess, setApiKeySuccess] = useState(false);

  const fetchSettings = async () => {
    try {
      const r = await axios.get(`${API_BASE}/settings`);
      setApiKeySet(r.data.openai_key_set);
      setApiKeyPreview(r.data.openai_key_preview);
    } catch { setApiKeySet(false); }
  };

  const saveApiKey = async () => {
    setApiKeySaving(true); setApiKeyError(''); setApiKeySuccess(false);
    try {
      // Increase timeout to 10s for this sensitive operation
      const r = await axios.post(`${API_BASE}/settings`, 
        { openai_api_key: apiKeyInput },
        { timeout: 10000 }
      );
      if (r.data.ok) {
        setApiKeySuccess(true); setApiKeyInput('');
        // Wait a bit before fetching to allow potential server reload
        setTimeout(fetchSettings, 1500);
        setTimeout(() => setApiKeySuccess(false), 3000);
      } else {
        setApiKeyError(r.data.error || 'Errore');
      }
    } catch {
      setApiKeyError('Backend non raggiungibile. Riavvia run_eco.bat e riprova.');
    }
    finally { setApiKeySaving(false); }
  };

  useEffect(() => { fetchSettings(); }, []);

  // ── App state ────────────────────────────────────────────────────────────────
  const [docId, setDocId]       = useState<string | null>(null);
  const [status, setStatus]     = useState<string>('idle');
  const [label, setLabel]       = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [date, setDate]         = useState<string>('');
  const [score, setScore]       = useState<string>('');
  const [ocrText, setOcrText]   = useState<string>('');
  const [fields, setFields]     = useState<Record<string, string>>({});
  const [startTime, setStartTime]           = useState<number>(0);
  const [pagesCompleted, setPagesCompleted] = useState<number>(0);
  const [pagesTotal, setPagesTotal]         = useState<number>(0);
  const [procStart, setProcStart]           = useState<number>(0);
  const [ocrOpen, setOcrOpen]               = useState<boolean>(false);
  const [batchQueue, setBatchQueue]         = useState<Array<{ filename: string; docId: string; status: string }>>([]);
  const [batchMode, setBatchMode]           = useState<boolean>(false);
  const [batchUploading, setBatchUploading] = useState<boolean>(false);
  const [batchFileCount, setBatchFileCount] = useState<number>(0);
  // Pre-upload case form
  const [batchPendingFiles, setBatchPendingFiles] = useState<File[] | null>(null);
  const [batchCreateCase, setBatchCreateCase]     = useState<boolean>(false);
  const [batchCaseName, setBatchCaseName]         = useState('');
  const [batchCaseClient, setBatchCaseClient]     = useState('');
  const [batchCaseDesc, setBatchCaseDesc]         = useState('');
  const [uploadPct, setUploadPct]     = useState<number>(0);
  const [uploadPhase, setUploadPhase] = useState<'idle'|'uploading'|'processing'>('idle');
  const uploadStartRef = useRef<number>(0);
  const [view, setView]             = useState<View>('classifier');

  // Split-PDF flow
  const [splitFlags, setSplitFlags]   = useState<Set<string>>(new Set());
  const [splitQueue, setSplitQueue]   = useState<File[]>([]);
  const [splitModal, setSplitModal]   = useState<{
    file: File; tempId: string; totalPages: number;
    suggestions: Array<{ after_page: number; reason: string; confidence: string }>;
    userSplits: number[];  // pages after which a split occurs (1-indexed)
  } | null>(null);
  const [splitLoading, setSplitLoading] = useState(false);
  const [splitPreviewPage, setSplitPreviewPage] = useState<number | null>(null);
  const [splitSensitivity, setSplitSensitivity] = useState<number>(0.65);
  const pendingCaseIdRef = useRef<string | null>(null);

  // Keyboard navigation for split preview
  useEffect(() => {
    if (!splitModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSplitPreviewPage(prev => {
          if (prev === null) return 1;
          return Math.min(prev + 1, splitModal.totalPages);
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSplitPreviewPage(prev => {
          if (prev === null) return splitModal.totalPages;
          return Math.max(prev - 1, 1);
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [splitModal]);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // SSE stream
  useEffect(() => {
    if (!docId) return;
    const source = new EventSource(`${API_BASE}/documents/${docId}/stream?token=${token}`);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStatus(data.status);
      if (data.label)    setLabel(data.label);
      if (data.category) setCategory(data.category);
      if (data.date)     setDate(data.date);
      if (data.score != null) setScore((data.score * 100).toFixed(1) + '%');
      if (data.fields)   setFields(data.fields);
      if (data.progress_total)    setPagesTotal(data.progress_total);
      if (data.progress_completed !== undefined) setPagesCompleted(data.progress_completed);
      if (data.progress_start && procStart === 0) setProcStart(data.progress_start * 1000);
      if (['needs_review', 'verified', 'failed'].includes(data.status)) {
        source.close();
        setStartTime(Date.now());
        if (data.status !== 'failed') {
          axios.get(`${API_BASE}/documents/${docId}/ocr`)
            .then(res => setOcrText(res.data)).catch(() => {});
        }
      }
    };
    return () => source.close();
  }, [docId]);

  // Keyboard navigation for batch queue
  useEffect(() => {
    if (!batchMode || batchQueue.length <= 1) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); goToNext(); }
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goToPrev(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [batchMode, batchQueue, docId]); // needs docId to calculate current index correctly inside goToNext/Prev if they change

  const resetState = () => {
    setStatus('idle'); setLabel(''); setCategory(''); setDate('');
    setScore(''); setOcrText(''); setFields({});
    setPagesCompleted(0); setPagesTotal(0); setProcStart(0);
  };

  const goToNext = () => {
    if (!docId || batchQueue.length <= 1) return;
    const idx = batchQueue.findIndex(q => q.docId === docId);
    if (idx < batchQueue.length - 1) {
      const next = batchQueue[idx + 1];
      if (next.docId) { resetState(); setDocId(next.docId); }
    }
  };

  const goToPrev = () => {
    if (!docId || batchQueue.length <= 1) return;
    const idx = batchQueue.findIndex(q => q.docId === docId);
    if (idx > 0) {
      const prev = batchQueue[idx - 1];
      if (prev.docId) { resetState(); setDocId(prev.docId); }
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!apiKeySet) { setShowSettings(true); e.target.value = ''; return; }
    resetState();
    const formData = new FormData();
    formData.append('file', e.target.files[0]);
    try {
      setStatus('uploading...');
      const res = await axios.post(`${API_BASE}/upload`, formData);
      setDocId(res.data.document_id);
    } catch (err: any) {
      const msg = err?.response?.data?.detail;
      setStatus('failed');
      if (msg) alert(msg);
    }
    e.target.value = '';
  };

  // Step 1: files selected → show confirmation form
  const handleBatchUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!apiKeySet) { setShowSettings(true); e.target.value = ''; return; }
    const pdfs = Array.from(e.target.files).filter(f => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return;
    setBatchPendingFiles(pdfs);
    setSplitFlags(new Set());
    setBatchCreateCase(false);
    setBatchCaseName(''); setBatchCaseClient(''); setBatchCaseDesc('');
    setBatchMode(true); setBatchQueue([]);
    e.target.value = '';
  };

  // Subscribe to SSE for a list of uploaded items
  const _subscribeItems = (items: Array<{ filename: string; docId: string; status: string }>) => {
    items.forEach(item => {
      if (!item.docId) return;
      const src = new EventSource(`${API_BASE}/documents/${item.docId}/stream?token=${token}`);
      src.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        setBatchQueue(prev => prev.map(q => q.docId === item.docId ? { ...q, status: data.status } : q));
        if (['needs_review', 'verified', 'failed'].includes(data.status)) src.close();
      };
    });
  };

  // Upload a list of normal (non-split) files
  const _uploadNormal = async (files: File[], caseId: string | null) => {
    if (!files.length) return;
    setBatchUploading(true);
    setBatchFileCount(files.length);
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    setUploadPct(0); setUploadPhase('uploading');
    uploadStartRef.current = Date.now();
    try {
      const res = await axios.post(`${API_BASE}/upload-batch${caseId ? `?case_id=${caseId}` : ''}`, formData, {
        onUploadProgress: (e) => { if (e.total) setUploadPct(Math.round((e.loaded / e.total) * 100)); },
      });
      setUploadPhase('processing');
      const items = res.data.results.map((r: any) => ({
        filename: r.filename, docId: r.document_id || '', status: r.error ? 'error' : 'pending',
      }));
      setBatchQueue(prev => [...prev, ...items]);
      _subscribeItems(items);
    } finally {
      setBatchUploading(false); setUploadPhase('idle');
    }
  };

  // Step 2: user confirms → create case, upload normals, kick off split queue
  const startBatchUpload = async () => {
    if (!batchPendingFiles?.length) return;
    const files = batchPendingFiles;
    setBatchPendingFiles(null);

    let caseId: string | null = null;
    if (batchCreateCase && batchCaseName.trim()) {
      try {
        const cr = await axios.post(`${API_BASE}/cases`, {
          name: batchCaseName.trim(),
          client_name: batchCaseClient.trim() || undefined,
          description: batchCaseDesc.trim() || undefined,
        });
        caseId = cr.data.id;
      } catch {}
    }
    pendingCaseIdRef.current = caseId;

    const normalFiles = files.filter(f => !splitFlags.has(f.name));
    const toSplit     = files.filter(f =>  splitFlags.has(f.name));

    await _uploadNormal(normalFiles, caseId);

    if (toSplit.length > 0) {
      setSplitQueue(toSplit);
      _startNextSplit(toSplit, 0);
    }
  };

  // Split queue: preview one file at a time
  const _startNextSplit = async (queue: File[], idx: number) => {
    if (idx >= queue.length) { setSplitQueue([]); return; }
    const file = queue[idx];
    setSplitLoading(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await axios.post(`${API_BASE}/split-preview`, fd);
      setSplitPreviewPage(null);
      setSplitModal({
        file,
        tempId:      res.data.temp_id,
        totalPages:  res.data.total_pages,
        suggestions: res.data.suggestions,
        userSplits:  [],          // start clean — suggestions shown as dashed lines
      });
    } catch {
      // Skip this file on error, continue with next
      _startNextSplit(queue, idx + 1);
    } finally {
      setSplitLoading(false);
    }
  };

  const toggleSplitAt = (page: number) => {
    setSplitModal(m => {
      if (!m) return m;
      const has = m.userSplits.includes(page);
      return { ...m, userSplits: has ? m.userSplits.filter(p => p !== page) : [...m.userSplits, page] };
    });
  };

  const confirmSplit = async () => {
    if (!splitModal) return;
    const { file, tempId, totalPages, userSplits } = splitModal;
    const sorted = [...userSplits].sort((a, b) => a - b);

    // Build [start, end] segments
    const segments: [number, number][] = [];
    let start = 1;
    for (const after of sorted) { segments.push([start, after]); start = after + 1; }
    segments.push([start, totalPages]);

    setSplitModal(null);
    setSplitLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/split-confirm`, {
        temp_id: tempId, filename: file.name,
        segments, case_id: pendingCaseIdRef.current,
      });
      const items = res.data.results.map((r: any) => ({
        filename: r.filename, docId: r.document_id || '', status: r.error ? 'error' : 'pending',
      }));
      setBatchQueue(prev => [...prev, ...items]);
      _subscribeItems(items);
    } finally {
      setSplitLoading(false);
    }

    // Move to next split file
    const nextIdx = splitQueue.indexOf(file) + 1;
    _startNextSplit(splitQueue, nextIdx);
  };

  const handleVisualScan = async () => {
    if (!splitModal) return;
    setSplitLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/split-scan`, {
        temp_id: splitModal.tempId,
        sensitivity: splitSensitivity
      });
      const suggestedPages = res.data.suggestions.map((s: any) => s.after_page);
      
      setSplitModal(m => {
        if (!m) return m;
        // Merge with existing manual splits, avoiding duplicates
        const nextSplits = Array.from(new Set([...m.userSplits, ...suggestedPages]));
        return { ...m, userSplits: nextSplits };
      });

      if (suggestedPages.length > 0) {
        setSplitPreviewPage(suggestedPages[0]);
      }
    } catch (err) {
      console.error("Split scan failed", err);
    } finally {
      setSplitLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docId) return;
    try {
      await axios.post(`${API_BASE}/documents/${docId}/verify`, {
        corrected_label: label, corrected_date: date,
        corrected_fields: fields, verification_time_ms: Date.now() - startTime,
      });
      setStatus('verified');
    } catch {}
  };

  // Progress calc
  const pct = pagesTotal > 0 ? Math.round((pagesCompleted / pagesTotal) * 100) : 0;
  const elapsedSec = procStart > 0 ? (Date.now() - procStart) / 1000 : 0;
  const secPerPage = pagesCompleted > 0 ? elapsedSec / pagesCompleted : 0;
  const remainingSec = secPerPage > 0 ? Math.ceil(secPerPage * (pagesTotal - pagesCompleted)) : null;
  const etaText = remainingSec === null ? '...' : remainingSec < 60 ? `${remainingSec}s` : `${Math.ceil(remainingSec / 60)}m`;

  const nav: Array<{ id: View; icon: React.ReactNode; label: string }> = [
    { id: 'classifier', icon: <FileSearch size={16} />,  label: 'Classifier' },
    { id: 'cases',      icon: <Layers size={16} />,      label: 'Fascicoli' },
    { id: 'taxonomy',   icon: <Tag size={16} />,         label: 'Tassonomia' },
    { id: 'dashboard',  icon: <BarChart2 size={16} />,   label: 'Dashboard' },
  ];

  return (
    <div style={{ display: 'flex', height: '100vh', background: T.pageBg, fontFamily: T.font, color: T.text1, overflow: 'hidden' }}>

      {/* ── Settings modal ── */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div style={{ background: 'white', borderRadius: '10px', padding: '1.75rem 2rem', width: '420px', maxWidth: '94vw', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Settings size={18} color={T.accent} />
                <span style={{ fontWeight: 800, fontSize: '1rem' }}>Impostazioni</span>
              </div>
              <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: '2px' }}>
                <X size={18} />
              </button>
            </div>

            {/* API Key section */}
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: '1rem' }}>
              <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.text3, marginBottom: '0.5rem' }}>Chiave API OpenAI</p>
              <p style={{ fontSize: '0.82rem', color: T.text2, lineHeight: 1.5, marginBottom: '0.85rem' }}>
                Necessaria per la classificazione automatica dei documenti con GPT-4o.
                Puoi ottenerla su <strong>platform.openai.com</strong>.
              </p>

              {/* Current status */}
              {apiKeySet !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', marginBottom: '0.85rem', background: apiKeySet ? '#edf7f1' : '#fef2f2', border: `1px solid ${apiKeySet ? T.accentMid : '#fecaca'}` }}>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: apiKeySet ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: apiKeySet ? T.accentDark : '#991b1b' }}>
                    {apiKeySet ? `Chiave configurata — ${apiKeyPreview}` : 'Nessuna chiave configurata'}
                  </span>
                </div>
              )}

              {/* Input */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input
                    type={apiKeyVisible ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={e => { setApiKeyInput(e.target.value); setApiKeyError(''); }}
                    onKeyDown={e => e.key === 'Enter' && apiKeyInput && saveApiKey()}
                    placeholder="sk-..."
                    style={{ width: '100%', padding: '0.55rem 2.2rem 0.55rem 0.75rem', border: `1px solid ${apiKeyError ? '#fca5a5' : T.borderMed}`, borderRadius: '6px', fontSize: '0.85rem', fontFamily: 'monospace', outline: 'none', background: '#fafafa' }}
                  />
                  <button onClick={() => setApiKeyVisible(v => !v)}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: 0, display: 'flex' }}>
                    {apiKeyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <button onClick={saveApiKey} disabled={!apiKeyInput || apiKeySaving}
                  style={{ padding: '0.55rem 1.1rem', background: apiKeyInput && !apiKeySaving ? T.accent : '#e5e7eb', color: apiKeyInput && !apiKeySaving ? 'white' : '#9ca3af', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.82rem', cursor: apiKeyInput && !apiKeySaving ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', fontFamily: T.font }}>
                  {apiKeySaving ? 'Salvo...' : 'Salva'}
                </button>
              </div>

              {apiKeyError && <p style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: '#dc2626' }}>{apiKeyError}</p>}
              {apiKeySuccess && <p style={{ marginTop: '0.45rem', fontSize: '0.78rem', color: T.accent, fontWeight: 600 }}>✓ Chiave salvata correttamente</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar ── */}
      <aside style={{
        width: '200px', flexShrink: 0, background: T.sidebar,
        display: 'flex', flexDirection: 'column',
        padding: '20px 12px', gap: '2px',
        borderRight: `1px solid ${T.sideBorder}`,
      }}>
        {/* Logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px', paddingLeft: '6px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: T.radius, flexShrink: 0,
            background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Scale size={15} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.88rem', letterSpacing: '-0.02em', color: T.text1, lineHeight: 1.1 }}>ECO</div>
            <div style={{ fontSize: '0.65rem', color: T.text3, letterSpacing: '0.04em', textTransform: 'uppercase', fontWeight: 600 }}>Extractor</div>
          </div>
        </div>

        <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.text3, paddingLeft: '6px', marginBottom: '6px' }}>Menu</div>

        {nav.map(n => (
          <NavItem key={n.id} icon={n.icon} label={n.label}
            active={view === n.id} onClick={() => setView(n.id)} />
        ))}

        {/* Bottom: settings + version */}
        <div style={{ marginTop: 'auto', paddingLeft: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ borderTop: `1px solid ${T.sideBorder}`, paddingTop: '10px' }}>
            <button onClick={() => setShowSettings(true)} style={{
              display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
              background: apiKeySet === false ? '#fef2f2' : 'none',
              border: apiKeySet === false ? '1px solid #fecaca' : 'none',
              borderRadius: '6px', cursor: 'pointer',
              color: apiKeySet === false ? '#dc2626' : T.text3,
              fontSize: '0.72rem', fontFamily: T.font,
              padding: '6px 8px', fontWeight: 600,
            }}>
              {apiKeySet === false
                ? <><AlertTriangle size={12} /> API Key mancante</>
                : <><Settings size={12} /> Impostazioni</>}
            </button>
          </div>
          <span style={{ fontSize: '0.6rem', color: T.text3, letterSpacing: '0.03em' }}>v0.1 — prototype</span>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          height: '52px', flexShrink: 0, background: T.cardBg,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', padding: '0 24px', gap: '12px',
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', letterSpacing: '-0.01em', color: T.text1 }}>
              ECO{' '}
              <span style={{ color: T.accent, fontWeight: 800 }}>Extractor</span>
            </span>
          </div>
          <span style={{ fontSize: '0.72rem', color: T.text3, borderLeft: `1px solid ${T.border}`, paddingLeft: '12px' }}>
            Legal Document Intelligence
          </span>

          {view === 'classifier' && (
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <input type="file" accept=".pdf" ref={fileInputRef} onChange={handleUpload} style={{ display: 'none' }} />
              <input type="file" accept=".pdf" multiple ref={folderInputRef} onChange={handleBatchUpload} style={{ display: 'none' }} />
              <button onClick={() => { if (!apiKeySet) { setShowSettings(true); return; } setBatchMode(false); setBatchQueue([]); setBatchUploading(false); setBatchPendingFiles(null); folderInputRef.current?.click(); }}
                style={{ ...btnSecondary, opacity: apiKeySet === false ? 0.5 : 1 }}
                title={apiKeySet === false ? 'Configura la API key prima di caricare' : ''}>
                <FolderOpen size={14} /> Batch Upload
              </button>
              <button onClick={() => { if (!apiKeySet) { setShowSettings(true); return; } setBatchMode(false); setBatchQueue([]); fileInputRef.current?.click(); }}
                style={{ ...btnPrimary, opacity: apiKeySet === false ? 0.5 : 1 }}
                title={apiKeySet === false ? 'Configura la API key prima di caricare' : ''}>
                <Upload size={14} /> Upload PDF
              </button>
            </div>
          )}
        </header>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '20px', minHeight: 0 }}>

          {/* ── Taxonomy ── */}
          {view === 'taxonomy' && (
            <div style={{ height: '100%', overflowY: 'auto' }}><TaxonomyPanel /></div>
          )}

          {/* ── Cases ── */}
          {view === 'cases' && (
            <div style={{ height: '100%', minHeight: 0 }}><CasesView /></div>
          )}

          {/* ── Dashboard ── */}
          {view === 'dashboard' && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <DashboardView />
            </div>
          )}

          {/* ── Classifier ── */}
          {view === 'classifier' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>

              {/* Batch — pre-upload confirmation form */}
              {batchPendingFiles && (
                <div style={{ background: T.cardBg, borderRadius: T.radius, border: `1px solid ${T.accentMid}`, padding: '14px 18px', boxShadow: T.shadow }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Files size={14} style={{ color: T.accent }} />
                    <SectionLabel>{batchPendingFiles.length} file selezionati</SectionLabel>
                  </div>

                  {/* File list with split toggles */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '14px', maxHeight: '160px', overflowY: 'auto' }}>
                    {batchPendingFiles.map(f => {
                      const needsSplit = splitFlags.has(f.name);
                      return (
                        <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', background: '#f8fafc', borderRadius: T.radiusSm, border: `1px solid ${needsSplit ? T.accentMid : T.border}` }}>
                          <span style={{ flex: 1, fontSize: '0.78rem', color: T.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>{f.name}</span>
                          <button
                            onClick={() => setSplitFlags(prev => {
                              const next = new Set(prev);
                              next.has(f.name) ? next.delete(f.name) : next.add(f.name);
                              return next;
                            })}
                            title="Dividi documento in più documenti"
                            style={{
                              display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0,
                              padding: '2px 8px', borderRadius: '3px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700,
                              border: `1px solid ${needsSplit ? T.accent : T.border}`,
                              background: needsSplit ? T.accentBg : 'white',
                              color: needsSplit ? T.accent : T.text3,
                              fontFamily: T.font,
                            }}>
                            ✂ {needsSplit ? 'Dividi' : 'Dividi?'}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {splitFlags.size > 0 && (
                    <p style={{ margin: '0 0 12px', fontSize: '0.75rem', color: T.accent, background: T.accentBg, padding: '6px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.accentMid}` }}>
                      {splitFlags.size} file verranno aperti nel selettore di split prima di essere caricati.
                    </p>
                  )}

                  {/* Toggle: create case? */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: batchCreateCase ? '10px' : '14px' }}>
                    <div onClick={() => setBatchCreateCase(v => !v)} style={{
                      width: '36px', height: '20px', borderRadius: '10px', flexShrink: 0,
                      background: batchCreateCase ? T.accent : '#d1d5db',
                      position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                    }}>
                      <div style={{
                        position: 'absolute', top: '3px',
                        left: batchCreateCase ? '18px' : '3px',
                        width: '14px', height: '14px', borderRadius: '50%',
                        background: 'white', transition: 'left 0.2s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      }} />
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: T.text1 }}>
                      Crea un nuovo fascicolo per questi documenti
                    </span>
                  </label>

                  {batchCreateCase && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', paddingLeft: '46px' }}>
                      <input value={batchCaseName} onChange={e => setBatchCaseName(e.target.value)}
                        placeholder="Nome fascicolo *" autoFocus
                        style={{ padding: '7px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.accentMid}`, fontSize: '0.82rem', outline: 'none', fontFamily: T.font }} />
                      <input value={batchCaseClient} onChange={e => setBatchCaseClient(e.target.value)}
                        placeholder="Nome cliente"
                        style={{ padding: '7px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, fontSize: '0.82rem', outline: 'none', fontFamily: T.font }} />
                      <input value={batchCaseDesc} onChange={e => setBatchCaseDesc(e.target.value)}
                        placeholder="Descrizione (opzionale)"
                        style={{ padding: '7px 10px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, fontSize: '0.82rem', outline: 'none', fontFamily: T.font }} />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={startBatchUpload}
                      disabled={batchCreateCase && !batchCaseName.trim()}
                      style={{
                        flex: 1, padding: '8px', border: 'none', borderRadius: T.radiusSm,
                        background: batchCreateCase && !batchCaseName.trim() ? '#e5e7eb' : T.accent,
                        color: batchCreateCase && !batchCaseName.trim() ? '#9ca3af' : 'white',
                        fontWeight: 700, fontSize: '0.82rem', cursor: batchCreateCase && !batchCaseName.trim() ? 'not-allowed' : 'pointer',
                        fontFamily: T.font,
                      }}>
                      Avvia caricamento
                    </button>
                    <button onClick={() => { setBatchPendingFiles(null); setBatchMode(false); setSplitFlags(new Set()); }}
                      style={{ padding: '8px 14px', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, background: 'white', color: T.text2, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: T.font }}>
                      Annulla
                    </button>
                  </div>
                </div>
              )}

              {/* Split loading indicator (between split files) */}
              {splitLoading && !splitModal && (
                <div style={{ background: T.cardBg, borderRadius: T.radius, border: `1px solid ${T.accentMid}`, padding: '14px 18px', boxShadow: T.shadow, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '14px', height: '14px', border: `2px solid ${T.accent}`, borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.82rem', color: T.text2 }}>Analisi pagine in corso...</span>
                </div>
              )}

              {/* Split editor modal */}
              {splitModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                  <div style={{ background: 'white', borderRadius: '6px', width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

                    {/* Modal header */}
                    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: T.text1 }}>Seleziona punti di divisione</div>
                        <div style={{ fontSize: '0.75rem', color: T.text3, marginTop: '2px' }}>{splitModal.file.name} · {splitModal.totalPages} pagine</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRight: `1px solid ${T.border}`, paddingRight: '12px' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, color: T.text3, textTransform: 'uppercase' }}>Sensibilità</span>
                          <input 
                            type="range" min="0" max="1" step="0.05" 
                            value={splitSensitivity} 
                            onChange={e => setSplitSensitivity(parseFloat(e.target.value))}
                            style={{ width: '80px', cursor: 'pointer', accentColor: T.accent }}
                          />
                          <button onClick={handleVisualScan}
                            disabled={splitLoading}
                            style={{ 
                              fontSize: '0.72rem', padding: '4px 10px', border: `1px solid ${T.accentMid}`, 
                              borderRadius: '3px', background: T.accentBg, color: T.accent, 
                              fontWeight: 700, cursor: 'pointer', fontFamily: T.font,
                              display: 'flex', alignItems: 'center', gap: '4px'
                            }}>
                            {splitLoading ? '...' : '✨ Analisi Visiva'}
                          </button>
                        </div>
                        {splitModal.suggestions.length > 0 && (
                          <button onClick={() => setSplitModal(m => m ? { ...m, userSplits: m.suggestions.map(s => s.after_page) } : m)}
                            style={{ fontSize: '0.72rem', padding: '4px 10px', border: `1px solid ${T.accentMid}`, borderRadius: '3px', background: 'white', color: T.accent, fontWeight: 600, cursor: 'pointer', fontFamily: T.font }}>
                            Usa {splitModal.suggestions.length} suggeriti (Vuote)
                          </button>
                        )}
                        <span style={{ fontSize: '0.75rem', color: T.accent, fontWeight: 600 }}>
                          {splitModal.userSplits.length + 1} documento{splitModal.userSplits.length > 0 ? 'i' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Instructions */}
                    <div style={{ padding: '10px 20px', background: T.accentBg, borderBottom: `1px solid ${T.accentMid}`, fontSize: '0.75rem', color: T.accent }}>
                      Clicca <strong>tra le pagine</strong> per dividere. Usa <strong>← →</strong> sulla tastiera per scorrere l'anteprima.
                    </div>

                    {/* Two-panel body */}
                    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

                      {/* Left: compact page grid */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', borderRight: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: '0.68rem', color: T.text3, marginBottom: '8px', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                          Clicca su | per dividere · clicca sul numero per anteprima
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', alignContent: 'flex-start' }}>
                          {Array.from({ length: splitModal.totalPages }, (_, i) => i + 1).map(page => {
                            const isSplit = splitModal.userSplits.includes(page);
                            const isAuto  = splitModal.suggestions.some(s => s.after_page === page);
                            const isSelected = splitPreviewPage === page;
                            return (
                              <div key={page} style={{ display: 'flex', alignItems: 'center' }}>
                                {/* Page number box */}
                                <div
                                  onClick={() => setSplitPreviewPage(isSelected ? null : page)}
                                  title={`Anteprima pagina ${page}`}
                                  style={{
                                    width: '36px', height: '36px', borderRadius: '3px', cursor: 'pointer',
                                    border: isSelected ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                                    background: isSelected ? T.accentBg : 'white',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.68rem', fontWeight: 700,
                                    color: isSelected ? T.accent : T.text2,
                                    userSelect: 'none',
                                  }}>
                                  {page}
                                </div>
                                {/* Clickable gap — split divider */}
                                {page < splitModal.totalPages && (
                                  <div
                                    onClick={() => toggleSplitAt(page)}
                                    title={isSplit ? 'Rimuovi divisione' : isAuto ? 'Suggerito — clicca per aggiungere' : 'Dividi qui'}
                                    style={{ width: '14px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {isSplit ? (
                                      <div style={{ width: '3px', height: '28px', background: T.accent, borderRadius: '2px' }} />
                                    ) : isAuto ? (
                                      <div style={{ width: '2px', height: '24px', borderLeft: `2px dashed ${T.accentMid}` }} />
                                    ) : (
                                      <div style={{ width: '1px', height: '18px', background: '#dde3e0' }} />
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Segments summary */}
                        {splitModal.userSplits.length > 0 && (
                          <div style={{ marginTop: '12px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                            {(() => {
                              const sorted = [...splitModal.userSplits].sort((a, b) => a - b);
                              const segs: string[] = [];
                              let s = 1;
                              sorted.forEach(after => { segs.push(`pag. ${s}–${after}`); s = after + 1; });
                              segs.push(`pag. ${s}–${splitModal.totalPages}`);
                              return segs.map((seg, i) => (
                                <span key={i} style={{ fontSize: '0.68rem', padding: '2px 7px', background: T.accentBg, color: T.accent, borderRadius: '3px', fontWeight: 600, border: `1px solid ${T.accentMid}` }}>
                                  Doc {i + 1}: {seg}
                                </span>
                              ));
                            })()}
                          </div>
                        )}
                      </div>

                      {/* Right: single page preview */}
                      <div style={{ width: '220px', flexShrink: 0, padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: splitPreviewPage ? 'flex-start' : 'center', background: '#fafaf9' }}>
                        {splitPreviewPage ? (
                          <>
                            <div style={{ fontSize: '0.7rem', color: T.text3, marginBottom: '8px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                              <span>Pagina {splitPreviewPage}</span>
                              <span style={{ fontWeight: 400 }}>{splitPreviewPage}/{splitModal.totalPages}</span>
                            </div>
                            <div style={{ position: 'relative', width: '100%' }}>
                              <img
                                key={splitPreviewPage}
                                src={`${API_BASE}/split-thumbnail/${splitModal.tempId}/${splitPreviewPage}?token=${token}`}
                                alt={`Pagina ${splitPreviewPage}`}
                                style={{ width: '100%', borderRadius: '3px', border: `1px solid ${T.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.10)' }}
                              />
                              {/* Overlay navigation arrows (visible on hover or focus) */}
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 5px', pointerEvents: 'none' }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSplitPreviewPage(prev => Math.max(1, (prev || 1) - 1)); }}
                                  style={{ pointerEvents: 'auto', background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: splitPreviewPage === 1 ? 0 : 1 }}
                                  disabled={splitPreviewPage === 1}>
                                  <ChevronLeft size={14} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSplitPreviewPage(prev => Math.min(splitModal.totalPages, (prev || 1) + 1)); }}
                                  style={{ pointerEvents: 'auto', background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: splitPreviewPage === splitModal.totalPages ? 0 : 1 }}
                                  disabled={splitPreviewPage === splitModal.totalPages}>
                                  <ChevronRight size={14} />
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div style={{ textAlign: 'center', color: T.text3, fontSize: '0.75rem', lineHeight: 1.5 }}>
                            Clicca su un numero di pagina per vedere l'anteprima
                          </div>
                        )}
                      </div>

                    </div>

                    {/* Modal footer */}
                    <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button onClick={() => { setSplitModal(null); const idx = splitQueue.indexOf(splitModal.file) + 1; _startNextSplit(splitQueue, idx); }}
                        style={{ padding: '8px 16px', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, background: 'white', color: T.text2, fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', fontFamily: T.font }}>
                        Salta questo file
                      </button>
                      <button onClick={confirmSplit}
                        style={{ padding: '8px 20px', border: 'none', borderRadius: T.radiusSm, background: T.accent, color: 'white', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: T.font, boxShadow: `0 2px 6px rgba(45,106,79,0.2)` }}>
                        Conferma e carica ({splitModal.userSplits.length + 1} doc)
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Batch — upload progress + queue */}
              {!batchPendingFiles && batchMode && (batchUploading || batchQueue.length > 0) && (
                <div style={{ background: T.cardBg, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: '12px 16px', boxShadow: T.shadow }}>

                  {/* Upload progress bar */}
                  {batchUploading && (() => {
                    const elapsed = (Date.now() - uploadStartRef.current) / 1000;
                    const eta = uploadPhase === 'uploading' && uploadPct > 2 && uploadPct < 100
                      ? Math.ceil(elapsed / uploadPct * (100 - uploadPct))
                      : null;
                    const etaLabel = eta === null ? '' : eta < 60 ? `~${eta}s` : `~${Math.ceil(eta / 60)}m`;
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '13px', height: '13px', border: `2px solid ${T.accent}`, borderTop: '2px solid transparent', borderRadius: '50%', flexShrink: 0, animation: 'spin 0.8s linear infinite' }} />
                            <SectionLabel>
                              {uploadPhase === 'uploading'
                                ? `Invio ${batchFileCount} file al server...`
                                : 'File ricevuti — avvio elaborazione...'}
                            </SectionLabel>
                          </div>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: T.accent }}>
                            {uploadPhase === 'uploading' ? `${uploadPct}%` : '✓'}
                            {etaLabel && <span style={{ fontWeight: 400, color: T.text3, marginLeft: '6px' }}>{etaLabel}</span>}
                          </span>
                        </div>
                        <div style={{ height: '4px', borderRadius: '2px', background: T.accentMid, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: '2px', background: T.accent,
                            width: uploadPhase === 'uploading' ? `${uploadPct}%` : '100%',
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                        {uploadPhase === 'processing' && (
                          <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: T.text3 }}>
                            Il server sta registrando i documenti — tra poco partiranno in coda di elaborazione.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Document chips after upload */}
                  {!batchUploading && (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Files size={14} style={{ color: T.text3 }} />
                          <SectionLabel>
                            Batch — {batchQueue.filter(q => ['needs_review','verified'].includes(q.status)).length}/{batchQueue.length} elaborati
                          </SectionLabel>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.68rem', color: T.text3 }}>
                          <span style={{ fontWeight: 600 }}>Stati:</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ color: '#a1a1aa' }}>●</span> In attesa</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ color: '#0ea5e9' }}>●</span> Pre-classificato</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ color: '#f59e0b' }}>●</span> Da revisionare</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ color: '#22c55e' }}>●</span> Verificato</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><span style={{ color: '#ef4444' }}>●</span> Errore</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {batchQueue.map(item => {
                          const s = STATUS[item.status] || STATUS.idle;
                          return (
                            <div key={item.docId} onClick={() => { if (item.docId) { resetState(); setDocId(item.docId); } }}
                              title={`${item.filename}\nStato: ${item.status === 'idle' ? 'in attesa' : item.status.replace('_', ' ')}`}
                              style={{ padding: '3px 10px 3px 8px', borderRadius: '3px', fontSize: '0.72rem', fontWeight: 600,
                                background: s.bg, color: s.text, border: `1px solid ${s.border}`,
                                cursor: item.docId ? 'pointer' : 'default',
                                maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
                              {item.filename.length > 26 ? item.filename.slice(0, 26) + '…' : item.filename}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Two-panel layout */}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 440px', gap: '16px', flex: 1, minHeight: 0 }}>

                {/* Document viewer */}
                <div style={{ background: T.cardBg, borderRadius: T.radius, border: `1px solid ${T.border}`, boxShadow: T.shadow, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                  {/* Viewer header */}
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <SectionLabel>Preview</SectionLabel>
                      {batchMode && batchQueue.length > 0 && docId && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px', background: '#f0f2f0', padding: '2px 4px', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.05)' }}>
                          <button onClick={goToPrev} disabled={batchQueue.findIndex(q => q.docId === docId) <= 0}
                            style={{ ...btnGhost, padding: '3px 8px', minWidth: '80px', justifyContent: 'center', background: 'white', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.08)', fontWeight: 700 }} title="Documento precedente">
                            <ChevronLeft size={14} /> Indietro
                          </button>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: T.text3, padding: '0 4px', minWidth: '60px', textAlign: 'center' }}>
                            {batchQueue.findIndex(q => q.docId === docId) + 1} / {batchQueue.length}
                          </span>
                          <button onClick={goToNext} disabled={batchQueue.findIndex(q => q.docId === docId) >= batchQueue.length - 1}
                            style={{ ...btnGhost, padding: '3px 8px', minWidth: '80px', justifyContent: 'center', background: 'white', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.08)', fontWeight: 700 }} title="Documento successivo">
                            Avanti <ChevronRight size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {status === 'temp_classified' && (
                        <span style={{ 
                          fontSize: '0.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: '3px',
                          background: '#0ea5e9', color: 'white', letterSpacing: '0.05em',
                          boxShadow: '0 2px 4px rgba(14,165,233,0.3)'
                        }}>
                          ⚡ PHASE 1: OCR MATCH
                        </span>
                      )}
                      <button onClick={() => setOcrOpen(o => !o)}
                        style={{ ...btnGhost, color: ocrOpen ? T.accent : T.text2, background: ocrOpen ? T.accentBg : 'transparent' }}>
                        <ChevronRight size={13} style={{ transform: ocrOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        OCR Text
                      </button>
                      {docId && <span style={{ fontSize: '0.68rem', color: T.text3, fontFamily: 'monospace' }}>{docId.slice(0, 8)}</span>}
                    </div>
                  </div>

                  {/* Viewer body */}
                  <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
                    <div style={{ flex: 1, background: '#ede9e0', overflow: 'hidden' }}>
                      {docId ? (
                        <PdfViewer docId={docId} token={token} />
                      ) : (
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: T.text3 }}>
                          <div style={{ width: '52px', height: '52px', borderRadius: T.radius, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Upload size={20} style={{ opacity: 0.4 }} />
                          </div>
                          <p style={{ margin: 0, fontSize: '0.82rem' }}>Carica un documento per iniziare</p>
                        </div>
                      )}
                    </div>

                    {/* OCR panel */}
                    {ocrOpen && (
                      <div style={{ width: '280px', borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                          <SectionLabel>OCR Extraction</SectionLabel>
                        </div>
                        <div onWheel={e => e.stopPropagation()}
                          style={{ flex: 1, overflowY: 'scroll', padding: '12px 14px', fontSize: '0.72rem', color: T.text2, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {ocrText
                            ? renderOcrText(ocrText, fields, date)
                            : ['processing','pending','uploading...'].includes(status)
                              ? <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  {[85, 72, 90, 65, 78].map((w, i) => (
                                    <div key={i} style={{ height: '10px', width: `${w}%`, background: T.border, borderRadius: '3px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                                  ))}
                                </div>
                              : <span style={{ color: T.text3, fontStyle: 'italic' }}>Nessun testo disponibile</span>
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Verification panel */}
                <div style={{ background: T.cardBg, borderRadius: T.radius, border: `1px solid ${T.border}`, boxShadow: T.shadow, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                  {/* Panel header */}
                  <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <SectionLabel>Verifica</SectionLabel>
                    <StatusPill status={status} />
                  </div>

                  <form onSubmit={handleVerify} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '16px 20px', gap: '14px' }}>

                    {/* Progress */}
                    {status === 'processing' && (
                      <div style={{ padding: '12px 14px', borderRadius: T.radius, background: T.accentBg, border: `1px solid ${T.accentMid}` }}>
                        {pagesTotal === 0 ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '14px', height: '14px', border: `2px solid ${T.accent}`, borderTop: '2px solid transparent', borderRadius: '50%', flexShrink: 0, animation: 'spin 0.8s linear infinite' }} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: T.accent }}>Conversione PDF...</span>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.77rem', fontWeight: 600, color: T.accent }}>OCR — pagina {pagesCompleted}/{pagesTotal}</span>
                              <span style={{ fontSize: '0.77rem', color: T.accent }}>~{etaText} left</span>
                            </div>
                            <div style={{ height: '3px', borderRadius: '2px', background: T.accentMid, overflow: 'hidden' }}>
                              <div style={{ width: `${pct}%`, height: '100%', background: T.accent, borderRadius: '2px', transition: 'width 0.8s ease' }} />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Classification */}
                    <div>
                      <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <SectionLabel>Tipo documento</SectionLabel>
                        {status === 'needs_review' && <span style={{ fontSize: '0.68rem', color: T.accent }}>Modificabile</span>}
                      </div>
                      <input type="text" disabled={status !== 'needs_review'} value={label || ''}
                        placeholder={status === 'processing' ? 'Classificazione in corso…' : 'In attesa del documento…'}
                        onChange={e => setLabel(e.target.value)}
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: T.radiusSm, boxSizing: 'border-box',
                          border: `1px solid ${status === 'needs_review' ? T.accentMid : T.border}`,
                          background: status === 'needs_review' ? '#f9fcfb' : '#f9f9f7',
                          color: T.text1, fontSize: '0.9rem', fontWeight: 600, outline: 'none',
                        }} />
                    </div>

                    {/* Category + Date */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ padding: '10px 12px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: '#f9f9f7' }}>
                        <SectionLabel>Categoria</SectionLabel>
                        <div style={{ marginTop: '5px', fontSize: '0.82rem', fontWeight: 600, color: category ? T.accent : T.text3 }}>
                          {category || '—'}
                        </div>
                      </div>
                      <div style={{ padding: '10px 12px', borderRadius: T.radiusSm, border: `1px solid ${status === 'needs_review' ? T.accentMid : T.border}`, background: status === 'needs_review' ? '#f9fcfb' : '#f9f9f7' }}>
                        <SectionLabel>Data</SectionLabel>
                        <input type="text" disabled={status !== 'needs_review'} value={date || ''}
                          placeholder="gg/mm/aaaa" onChange={e => setDate(e.target.value)}
                          style={{ marginTop: '4px', width: '100%', border: 'none', background: 'transparent', color: T.text1, fontSize: '0.82rem', fontWeight: 500, outline: 'none', padding: 0, boxSizing: 'border-box' }} />
                      </div>
                    </div>

                    {/* Extracted fields */}
                    {Object.keys(fields).length > 0 && (
                      <div style={{ borderRadius: T.radiusSm, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, background: '#f9f9f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <SectionLabel>Campi estratti</SectionLabel>
                          {status === 'needs_review' && <span style={{ fontSize: '0.65rem', color: T.accent }}>Click per modificare</span>}
                        </div>
                        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {Object.entries(fields).map(([key, val]) => (
                            <FieldRow key={key} label={FIELD_LABELS[key] || key} value={val || ''}
                              editable={status === 'needs_review'}
                              onChange={v => setFields(prev => ({ ...prev, [key]: v }))} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Confidence */}
                    <div style={{ padding: '10px 12px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: '#f9f9f7' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <SectionLabel>Confidenza</SectionLabel>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: T.text1 }}>{score || '—'}</span>
                      </div>
                      <div style={{ height: '3px', borderRadius: '2px', background: T.border, overflow: 'hidden' }}>
                        <div style={{ width: score || '0%', height: '100%', background: T.accent, transition: 'width 1s ease' }} />
                      </div>
                      <span style={{ display: 'block', marginTop: '5px', fontSize: '0.68rem', color: T.text3 }}>
                        {parseFloat(score) > 80 ? 'Alta confidenza' : parseFloat(score) > 0 ? 'Verificare manualmente' : 'In attesa del risultato'}
                      </span>
                    </div>

                    {/* Verify button */}
                    <div style={{ marginTop: 'auto', paddingTop: '4px' }}>
                      {status === 'verified' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '14px', borderRadius: T.radiusSm, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 600, fontSize: '0.88rem' }}>
                          <CheckCircle size={16} /> Verificato
                        </div>
                      ) : (
                        <button disabled={status !== 'needs_review'} type="submit"
                          style={{
                            width: '100%', padding: '13px', border: 'none', borderRadius: T.radiusSm,
                            background: status === 'needs_review' ? T.accent : '#e4e4e7',
                            color: status === 'needs_review' ? 'white' : '#a1a1aa',
                            fontWeight: 700, fontSize: '0.88rem', letterSpacing: '0.02em',
                            cursor: status === 'needs_review' ? 'pointer' : 'not-allowed',
                            transition: 'all 0.15s',
                            boxShadow: status === 'needs_review' ? `0 2px 8px rgba(45,106,79,0.28)` : 'none',
                            fontFamily: T.font,
                          }}>
                          Approva e salva
                        </button>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        input:focus { outline: none; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}

// ─── Shared button styles ─────────────────────────────────────────────────────
const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '6px 14px', borderRadius: '4px', border: 'none',
  background: '#2d6a4f', color: 'white',
  fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
  boxShadow: '0 1px 4px rgba(45,106,79,0.2)',
  transition: 'all 0.15s',
  fontFamily: '"Inter", system-ui, sans-serif',
};

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '6px 14px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)',
  background: 'white', color: '#52525b',
  fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  transition: 'all 0.15s',
  fontFamily: '"Inter", system-ui, sans-serif',
};

const btnGhost: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  padding: '4px 10px', borderRadius: '4px', border: 'none',
  background: 'transparent', cursor: 'pointer',
  fontWeight: 500, fontSize: '0.75rem',
  transition: 'all 0.15s',
  fontFamily: '"Inter", system-ui, sans-serif',
};

export default App;
