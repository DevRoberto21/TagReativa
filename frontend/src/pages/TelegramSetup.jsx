import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import PageContainer from '../components/PageContainer';

const POLL_INTERVAL_MS = 3000;
// Matches the link token lifetime on the backend.
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

export default function TelegramSetup() {
    const [linked, setLinked] = useState(null);
    const [waiting, setWaiting] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const pollRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();
    // onboarding: right after sign-up, continue to the email step.
    // required: redirected by the gate from another page, go back to the app.
    const onboarding = location.state?.onboarding === true;
    const required = location.state?.required === true;

    useEffect(() => {
        api.get('/users/me')
            .then(r => setLinked(r.data.telegramLinked))
            .catch(() => setError('Erro ao carregar status do Telegram.'));
        return () => clearInterval(pollRef.current);
    }, []);

    function startPolling() {
        const startedAt = Date.now();
        clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
                clearInterval(pollRef.current);
                setWaiting(false);
                setError('O link expirou. Gere um novo para tentar de novo.');
                return;
            }
            try {
                const { data } = await api.get('/users/me');
                if (data.telegramLinked) {
                    clearInterval(pollRef.current);
                    setWaiting(false);
                    setLinked(true);
                    if (onboarding) navigate('/alertas-email', { replace: true });
                    else if (required) navigate('/dashboard', { replace: true });
                }
            } catch {
                // Transient failure; next tick retries.
            }
        }, POLL_INTERVAL_MS);
    }

    async function handleActivate() {
        setLoading(true);
        setError('');
        // Open the tab synchronously so popup blockers treat it as a user
        // action; the URL is filled in once the backend answers.
        const tab = window.open('', '_blank');
        try {
            const { data } = await api.post('/telegram/link');
            setLinkUrl(data.url);
            if (tab) tab.location.href = data.url;
            setWaiting(true);
            startPolling();
        } catch {
            if (tab) tab.close();
            setError('Não foi possível gerar o link de ativação. Tente novamente.');
        } finally {
            setLoading(false);
        }
    }

    function handleLogout() {
        localStorage.removeItem('access_token');
        navigate('/login');
    }

    return (
        <PageContainer style={styles.container}>
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
                    {linked ? (
                        <button onClick={() => navigate('/perfil')} style={styles.back}>Voltar</button>
                    ) : (
                        <button onClick={handleLogout} style={styles.back}>Sair</button>
                    )}
                    <h1 style={styles.title}>Alertas no Telegram</h1>
                </header>

                {linked === false && (
                    <div style={styles.notice}>
                        {onboarding ? 'Conta criada! ' : ''}Para usar a TagReativa, ative os alertas no Telegram. É por lá que você fica sabendo na hora, com a localização no mapa, quando a tag do seu pet perdido for escaneada.
                    </div>
                )}

                <div style={styles.card}>
                    {linked === true && (
                        <>
                            <h2 style={styles.cardTitle}>Alertas ativos</h2>
                            <p style={styles.listItem}>
                                Seu Telegram está vinculado. Quando a tag de um pet marcado como perdido for escaneada, você recebe uma mensagem com a localização.
                            </p>
                        </>
                    )}

                    {linked === false && (
                        <>
                            <h2 style={styles.cardTitle}>Como ativar</h2>
                            <ol style={styles.list}>
                                <li style={styles.listItem}>Tenha o Telegram instalado no celular ou computador.</li>
                                <li style={styles.listItem}>Toque em <strong style={styles.strong}>Ativar no Telegram</strong>. O app abre na conversa com o bot da TagReativa.</li>
                                <li style={styles.listItem}>Toque em <strong style={styles.strong}>Iniciar</strong> no Telegram. Pronto: esta página atualiza sozinha.</li>
                            </ol>

                            {waiting && (
                                <p style={styles.notice}>
                                    Aguardando confirmação no Telegram... Se o app não abriu, <a href={linkUrl} target="_blank" rel="noopener noreferrer" style={styles.strong}>toque aqui</a>.
                                </p>
                            )}

                            <button onClick={handleActivate} disabled={loading} style={styles.button}>
                                {loading ? 'Gerando link...' : waiting ? 'Gerar novo link' : 'Ativar no Telegram'}
                            </button>

                        </>
                    )}

                    {error && <p style={styles.error}>{error}</p>}
                </div>
            </div>
        </PageContainer>
    );
}

const styles = {
    container: { position: 'relative', overflowX: 'hidden', background: 'linear-gradient(135deg, #F0F4F2 0%, #E2ECE9 50%, #D4E5E0 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' },
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
    button: { width: '100%', padding: '14px', borderRadius: '12px', background: '#2D6A4F', color: '#FFF', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(45, 106, 79, 0.15)', transition: 'background 0.2s' },
    error: { color: '#E63946', marginTop: '4px', fontSize: '13px', textAlign: 'center', fontWeight: 500, margin: 0 }
};