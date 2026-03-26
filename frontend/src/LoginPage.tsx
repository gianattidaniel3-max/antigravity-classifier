import React, { useState } from 'react';
import { Scale } from 'lucide-react';
import axios from 'axios';

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
  accentDark: '#1e4d38',
  radius:     '4px',
  font:       '"Inter", system-ui, -apple-system, sans-serif',
};

interface Props {
  onLogin: (token: string, email: string) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        // Registration expects JSON
        await axios.post(`${API_BASE}/auth/register`, {
          email: email.trim().toLowerCase(),
          password: password,
          role: 'admin'
        });
        // After registration, toggle back to login
        setIsRegister(false);
        setError('Registrazione completata! Ora puoi accedere.');
      } else {
        // OAuth2PasswordRequestForm expects form-encoded body
        const params = new URLSearchParams();
        params.append('username', email.trim().toLowerCase());
        params.append('password', password);

        const res = await axios.post(`${API_BASE}/auth/login`, params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        onLogin(res.data.access_token, email.trim().toLowerCase());
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Operazione fallita. Controlla i dati.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.pageBg, fontFamily: T.font,
    }}>
      <div style={{
        width: '340px', background: T.cardBg, borderRadius: '6px',
        border: `1px solid ${T.border}`, boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        padding: '36px 32px',
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: T.radius,
            background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Scale size={16} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '-0.02em', color: T.text1, lineHeight: 1.1 }}>ECO</div>
            <div style={{ fontSize: '0.62rem', color: T.text3, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}>Extractor</div>
          </div>
        </div>

        <div style={{ fontSize: '1rem', fontWeight: 700, color: T.text1, marginBottom: '4px' }}>
          {isRegister ? 'Crea Account' : 'Accedi'}
        </div>
        <div style={{ fontSize: '0.78rem', color: T.text3, marginBottom: '24px' }}>
          {isRegister ? 'Registra il primo utente (Admin).' : 'Inserisci le tue credenziali per continuare.'}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: T.text2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Email
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required autoFocus placeholder="nome@studio.it"
              style={{
                padding: '9px 12px', borderRadius: T.radius,
                border: `1px solid ${T.borderMed}`, fontSize: '0.85rem',
                color: T.text1, outline: 'none', background: '#fafafa',
                fontFamily: T.font,
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: T.text2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Password
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••"
              style={{
                padding: '9px 12px', borderRadius: T.radius,
                border: `1px solid ${T.borderMed}`, fontSize: '0.85rem',
                color: T.text1, outline: 'none', background: '#fafafa',
                fontFamily: T.font,
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '9px 12px', borderRadius: T.radius,
              background: error.includes('completata') ? T.accentBg : '#fef2f2', 
              border: `1px solid ${error.includes('completata') ? T.accent : '#fecaca'}`,
              color: error.includes('completata') ? T.accent : '#991b1b', 
              fontSize: '0.78rem',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            style={{
              marginTop: '4px', padding: '10px', borderRadius: T.radius,
              background: loading ? T.accentBg : T.accent, color: loading ? T.accent : 'white',
              border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 700, fontSize: '0.85rem', fontFamily: T.font,
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Elaborazione…' : (isRegister ? 'Registrati' : 'Accedi')}
          </button>

          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            style={{
              background: 'none', border: 'none', color: T.text3, fontSize: '0.75rem',
              cursor: 'pointer', textDecoration: 'underline', marginTop: '8px'
            }}
          >
            {isRegister ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}
          </button>
        </form>
      </div>
    </div>
  );
}
