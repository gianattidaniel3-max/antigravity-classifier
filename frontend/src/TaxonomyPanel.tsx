import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ChevronRight, Plus, Trash2, MoveRight, Settings } from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

type Taxonomy = Record<string, string[]>;
type FieldSchema = Record<string, string[]>;

const FIELD_DISPLAY: Record<string, string> = {
  importo:        'Importo €',
  mittente:       'Mittente',
  destinatario:   'Destinatario',
  oggetto:        'Oggetto',
  scadenza:       'Scadenza',
  tribunale:      'Tribunale',
  numero_decreto: 'N. Decreto',
  numero_rg:      'N. R.G.',
};

export default function TaxonomyPanel() {
  const [taxonomy, setTaxonomy]           = useState<Taxonomy>({});
  const [fieldSchema, setFieldSchema]     = useState<FieldSchema>({});
  const [availableFields, setAvailFields] = useState<string[]>([]);
  const [expanded, setExpanded]           = useState<Record<string, boolean>>({});
  const [editingFields, setEditingFields] = useState<string | null>(null); // label being edited
  const [newCatName, setNewCatName]       = useState('');
  const [newLabels, setNewLabels]         = useState<Record<string, string>>({});
  const [moving, setMoving]               = useState<{ label: string; from: string } | null>(null);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(true);
  const [customFieldInput, setCustomFieldInput] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const token = localStorage.getItem('eco_token');
    const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

    Promise.all([
      axios.get(`${API_BASE}/taxonomy`, config),
      axios.get(`${API_BASE}/field-schema`, config)
    ])
    .then(([taxRes, schemaRes]) => {
      if (taxRes.data && typeof taxRes.data === 'object' && !taxRes.data.detail) {
        setTaxonomy(taxRes.data);
      } else if (taxRes.data?.detail) {
        throw new Error(taxRes.data.detail);
      } else {
        throw new Error("Invalid taxonomy format received from server");
      }
      setFieldSchema(schemaRes.data.schema);
      setAvailFields(schemaRes.data.available_fields);
      setError('');
    })
    .catch(err => {
      console.error("Taxonomy load error:", err);
      setError(err.response?.data?.detail || err.message || "Failed to load taxonomy data");
    })
    .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleField = async (label: string, field: string) => {
    const current = fieldSchema[label] || [];
    const updated = current.includes(field)
      ? current.filter(f => f !== field)
      : [...current, field];
    try {
      const r = await axios.put(`${API_BASE}/field-schema/${encodeURIComponent(label)}`, { fields: updated });
      setFieldSchema(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error updating fields');
    }
  };

  const toggle = (cat: string) =>
    setExpanded(p => ({ ...p, [cat]: !p[cat] }));

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const r = await axios.post(`${API_BASE}/taxonomy/category`, { name: newCatName.trim() });
      setTaxonomy(r.data);
      setNewCatName('');
      setError('');
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error adding category');
    }
  };

  const deleteCategory = async (cat: string) => {
    if (!window.confirm(`Delete category "${cat}"? It must be empty.`)) return;
    try {
      const r = await axios.delete(`${API_BASE}/taxonomy/category/${encodeURIComponent(cat)}`);
      setTaxonomy(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error deleting category');
    }
  };

  const addLabel = async (cat: string) => {
    const label = (newLabels[cat] || '').trim();
    if (!label) return;
    try {
      const r = await axios.post(`${API_BASE}/taxonomy/label`, { category: cat, label });
      setTaxonomy(r.data);
      setNewLabels(p => ({ ...p, [cat]: '' }));
      setError('');
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error adding label');
    }
  };

  const deleteLabel = async (cat: string, label: string) => {
    try {
      const r = await axios.delete(`${API_BASE}/taxonomy/label`, { data: { category: cat, label } });
      setTaxonomy(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error deleting label');
    }
  };

  const moveLabel = async (toCat: string) => {
    if (!moving) return;
    try {
      const r = await axios.post(`${API_BASE}/taxonomy/label/move`, {
        label: moving.label,
        from_category: moving.from,
        to_category: toCat,
      });
      setTaxonomy(r.data);
      setMoving(null);
      setError('');
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Error moving label');
    }
  };

  const categories = Object.keys(taxonomy);

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#18181b', letterSpacing: '-0.01em' }}>Taxonomy</h2>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#a1a1aa' }}>
            {categories.length} categories · {Object.values(taxonomy).flat().length} labels
          </p>
        </div>

        {/* Add category */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            placeholder="New category…"
            style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.82rem', width: '200px', outline: 'none', background: 'white' }}
          />
          <button onClick={addCategory}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#2d6a4f', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', boxShadow: '0 1px 4px rgba(45,106,79,0.2)' }}>
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '0.65rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', color: '#991b1b', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {loading && !error && (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#a1a1aa', fontSize: '0.85rem' }}>
          Caricamento tassonomia in corso...
        </div>
      )}

      {moving && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '4px', fontSize: '0.82rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <MoveRight size={16} />
          Moving <strong>"{moving.label}"</strong> from <strong>{moving.from}</strong> — click a category below to move it there
          <button onClick={() => setMoving(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontWeight: 700 }}>Cancel</button>
        </div>
      )}

      {/* Category list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {categories.map(cat => {
          const isOpen = !!expanded[cat];
          const labels = taxonomy[cat] || [];
          const isMovingTarget = moving && moving.from !== cat;

          return (
            <div key={cat} style={{ background: 'white', borderRadius: '4px', border: isMovingTarget ? '2px dashed #2d6a4f' : '1px solid rgba(0,0,0,0.07)', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', overflow: 'hidden' }}>

              {/* Category header */}
              <div
                onClick={() => isMovingTarget ? moveLabel(cat) : toggle(cat)}
                style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', cursor: 'pointer', background: isMovingTarget ? '#f0f0ff' : 'white', userSelect: 'none' }}>
                <ChevronRight size={14} style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: '#a1a1aa', marginRight: '0.6rem', flexShrink: 0 }} />
                <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1, color: '#18181b' }}>{cat}</span>
                <span style={{ fontSize: '0.7rem', color: '#a1a1aa', marginRight: '0.75rem' }}>{labels.length}</span>
                {isMovingTarget ? (
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2d6a4f' }}>Move here →</span>
                ) : (
                  <button onClick={e => { e.stopPropagation(); deleteCategory(cat); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d4d4d8', padding: '0.2rem' }}
                    title="Delete category (must be empty)">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Labels */}
              {isOpen && (
                <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', padding: '0.6rem 0.85rem 0.85rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.6rem' }}>
                    {labels.map(label => {
                      const labelFields = fieldSchema[label] || [];
                      const isEditing = editingFields === label;
                      return (
                        <div key={label} style={{ background: '#f9f9f9', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
                          {/* Label row */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.6rem' }}>
                            <span style={{ flex: 1, fontSize: '0.8rem', color: '#3f3f46', fontWeight: 500 }}>{label}</span>
                            {/* Field tags preview */}
                            <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                              {labelFields.map(f => (
                                <span key={f} style={{ fontSize: '0.65rem', padding: '1px 6px', background: '#edf7f1', color: '#2d6a4f', borderRadius: '4px', fontWeight: 600 }}>
                                  {FIELD_DISPLAY[f] || f}
                                </span>
                              ))}
                              {labelFields.length === 0 && <span style={{ fontSize: '0.65rem', color: '#d4d4d8', fontStyle: 'italic' }}>no fields</span>}
                            </div>
                            <button onClick={() => setEditingFields(isEditing ? null : label)}
                              title="Edit extracted fields"
                              style={{ background: isEditing ? '#edf7f1' : 'none', border: 'none', cursor: 'pointer', color: isEditing ? '#2d6a4f' : '#a1a1aa', padding: '2px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                              <Settings size={12} />
                            </button>
                            <button onClick={() => setMoving({ label, from: cat })}
                              title="Move to another category"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: 0, display: 'flex', alignItems: 'center' }}>
                              <MoveRight size={12} />
                            </button>
                            <button onClick={() => deleteLabel(cat, label)}
                              title="Delete label"
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d4d4d8', padding: 0, display: 'flex', alignItems: 'center' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                          {/* Field editor — inline checkboxes */}
                          {isEditing && (
                            <div style={{ padding: '0.5rem 0.6rem 0.6rem', borderTop: '1px solid rgba(0,0,0,0.06)', background: '#f0f0ff' }}>
                              <p style={{ margin: '0 0 0.4rem', fontSize: '0.68rem', color: '#2d6a4f', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Extract for "{label}":
                              </p>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                {availableFields.map(field => {
                                  const checked = labelFields.includes(field);
                                  return (
                                    <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.75rem', padding: '3px 8px', borderRadius: '4px', background: checked ? '#edf7f1' : 'white', border: `1px solid ${checked ? '#a7d3bc' : 'rgba(0,0,0,0.08)'}`, color: checked ? '#1e4d38' : '#71717a', fontWeight: checked ? 600 : 400 }}>
                                      <input type="checkbox" checked={checked} onChange={() => toggleField(label, field)}
                                        style={{ accentColor: '#2d6a4f', cursor: 'pointer' }} />
                                      {FIELD_DISPLAY[field] || field}
                                    </label>
                                  );
                                })}

                                {/* Custom Field Input */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginLeft: '0.2rem' }}>
                                  <input 
                                    placeholder="Add custom field..."
                                    value={customFieldInput}
                                    onChange={e => setCustomFieldInput(e.target.value)}
                                    onKeyDown={e => {
                                      if (e.key === 'Enter' && customFieldInput.trim()) {
                                        toggleField(label, customFieldInput.trim());
                                        setCustomFieldInput('');
                                        // Refresh available fields list from server
                                        setTimeout(load, 500);
                                      }
                                    }}
                                    style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', border: '1px solid #d4d4d8', outline: 'none', background: 'white', width: '130px' }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {labels.length === 0 && <span style={{ fontSize: '0.78rem', color: '#a1a1aa', fontStyle: 'italic' }}>No labels yet</span>}
                  </div>

                  {/* Add label input */}
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input
                      value={newLabels[cat] || ''}
                      onChange={e => setNewLabels(p => ({ ...p, [cat]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && addLabel(cat)}
                      placeholder="Add label…"
                      style={{ flex: 1, padding: '5px 10px', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.1)', fontSize: '0.8rem', outline: 'none', background: 'white' }}
                    />
                    <button onClick={() => addLabel(cat)}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'white', border: '1px solid rgba(0,0,0,0.1)', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: '#52525b' }}>
                      <Plus size={12} /> Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
