import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import PageContainer from '../components/PageContainer';

// Onboarding step shown after the Telegram link. Email alerts need no setup,
// so this only tells the owner where they arrive; skipping changes nothing.
export default function EmailAlertsInfo() {
    const [email, setEmail] = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        api.get('/users/me').then(r => setEmail(r.data.email)).catch(() => { });
    }, []);

    function finish() {
        navigate('/dashboard', { replace: true });
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
                    <h1 style={styles.title}>Alertas por e-mail</h1>
                </header>

                <div style={styles.card}>
                    <h2 style={styles.cardTitle}>Telegram ativado ✅</h2>
                    <p style={styles.listItem}>
                        Além do Telegram, cada alerta também é enviado para {email ? <strong style={styles.strong}>{email}</strong> : 'o seu e-mail'}. Nada a configurar.
                    </p>
                    <ol style={styles.list}>
                        <li style={styles.listItem}>Procure o e-mail da <strong style={styles.strong}>TagReativa</strong> também na caixa de spam.</li>
                        <li style={styles.listItem}>Marque como "não é spam" ou adicione o remetente aos contatos para os próximos alertas chegarem na caixa de entrada.</li>
                    </ol>

                    <button onClick={finish} style={styles.button}>Entendi, continuar</button>
                    <button onClick={finish} style={styles.skipBtn}>Pular</button>
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
    skipBtn: { width: '100%', padding: '13px', fontSize: '13px', fontWeight: 600, background: 'transparent', border: '1px solid #CBDCD0', borderRadius: '12px', color: '#52796F', cursor: 'pointer', transition: 'all 0.2s' },
    error: { color: '#E63946', marginTop: '4px', fontSize: '13px', textAlign: 'center', fontWeight: 500, margin: 0 }
};