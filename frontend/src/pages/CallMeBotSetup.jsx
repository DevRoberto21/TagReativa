import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

export default function CallMeBotSetup() {
    const [apiKey, setApiKey] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const location = useLocation();
    const fromNewPet = location.state?.fromNewPet === true;

    async function handleSave() {
        if (!apiKey.trim()) {
            setError('Digite o código de autenticação antes de salvar.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await api.post('/users/me/callmebot-test', { apiKey });
            await api.patch('/users/me', { callMeBotApiKey: apiKey });
            navigate('/perfil', { state: { callmebotSuccess: true } });
        } catch {
            setError('Código inválido ou dispositivo WhatsApp não autorizado. Verifique os passos.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div style={styles.container}>
            {/* Fundo Orgânico/Futurista Padronizado */}
            <svg style={styles.bgSvg} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
                <path d="M-100,200 C100,250 150,450 50,600 C-50,750 -200,700 -250,550 Z" fill="url(#leafGrad)" opacity="0.4" filter="blur(40px)" />
                <path d="M1500,100 C1350,150 1200,300 1300,500 C1400,700 1550,650 1600,500 Z" fill="url(#leafGrad)" opacity="0.35" filter="blur(50px)" />
                <g stroke="#94D2BD" strokeWidth="1" opacity="0.5" fill="none">
                    <line x1="200" y1="150" x2="280" y2="110" />
                    <line x1="1200" y1="400" x2="1280" y2="350" />
                </g>
                <defs>
                    <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#40916C" />
                        <stop offset="100%" stopColor="#A9D6E5" />
                    </linearGradient>
                </defs>
            </svg>

            <div style={styles.contentWrapper}>
                <header style={styles.header}>
                    <button onClick={() => navigate('/dashboard')} style={styles.back}>Voltar</button>
                    <h1 style={styles.title}>Telemetria WhatsApp</h1>
                </header>

                {fromNewPet && (
                    <div style={styles.notice}>
                        Dispositivo vinculado com sucesso. Ative o gateway de criptografia do WhatsApp para receber alertas em tempo real sempre que a TagReativa deste pet for escaneada.
                    </div>
                )}

                <div style={styles.card}>
                    <h2 style={styles.cardTitle}>Protocolo de Ativação</h2>

                    <ol style={styles.list}>
                        <li style={styles.listItem}>Adicione o terminal automatizado aos seus contactos: <strong style={styles.strong}>+34 623 76 13 63</strong></li>
                        <li style={styles.listItem}>Transmita a seguinte mensagem de autorização: <code style={styles.code}>I allow callmebot to send me messages</code></li>
                        <li style={styles.listItem}>Aguarde o retorno do sistema com a sua chave de API pessoal.</li>
                        <li style={styles.listItem}>Insira o token gerado no campo abaixo para validar a conexão.</li>
                    </ol>

                    <input
                        type="text"
                        placeholder="Token de autenticação (Chave API)"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        style={styles.input}
                    />

                    {error && <p style={styles.error}>{error}</p>}

                    <button onClick={handleSave} disabled={loading} style={styles.button}>
                        {loading ? 'Sincronizando Canais...' : 'Validar Gateway'}
                    </button>

                    {fromNewPet && (
                        <button onClick={() => navigate('/dashboard')} style={styles.skipBtn}>
                            Pular e Ativar Depois
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: { minHeight: '100vh', position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
    bgSvg: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 },
    contentWrapper: { position: 'relative', zIndex: 2, padding: '32px 16px', width: '100%', maxWidth: '480px', boxSizing: 'border-box' },
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' },
    back: { background: 'none', border: 'none', fontSize: '14px', color: '#40665A', cursor: 'pointer', fontWeight: 600, padding: 0 },
    title: { fontSize: '20px', fontWeight: 700, color: '#1B4332', margin: 0, letterSpacing: '-0.5px' },
    card: { background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '24px', padding: '32px 24px', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(45, 106, 79, 0.04)', border: '1px solid rgba(255, 255, 255, 0.6)', display: 'flex', flexDirection: 'column', gap: '16px' },
    cardTitle: { fontSize: '14px', fontWeight: 700, color: '#1B4332', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 4px' },
    notice: { background: '#EAF7F0', border: '1px solid #C6EDD4', borderRadius: '12px', padding: '14px', fontSize: '12px', color: '#2D6A4F', lineHeight: '1.5', fontWeight: 500, marginBottom: '16px' },
    list: { lineHeight: '1.6', paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' },
    listItem: { fontSize: '13px', color: '#40665A', fontWeight: 500 },
    strong: { color: '#1B4332', fontWeight: 600 },
    code: { background: '#E6EFE9', padding: '2px 6px', borderRadius: '6px', color: '#2D6A4F', fontSize: '12px', fontWeight: 600, fontFamily: 'monospace' },
    input: { width: '100%', padding: '13px 16px', borderRadius: '12px', border: '1px solid #CBDCD0', background: '#FFF', fontSize: '14px', outline: 'none', color: '#1B4332', boxSizing: 'border-box', marginTop: '8px' },
    button: { width: '100%', padding: '14px', borderRadius: '12px', background: '#2D6A4F', color: '#FFF', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)', transition: 'background 0.2s' },
    skipBtn: { width: '100%', padding: '13px', fontSize: '13px', fontWeight: 600, background: 'transparent', border: '1px solid #CBDCD0', borderRadius: '12px', color: '#52796F', cursor: 'pointer', transition: 'all 0.2s' },
    error: { color: '#E63946', marginTop: '4px', fontSize: '13px', textAlign: 'center', fontWeight: 500, margin: 0 }
};