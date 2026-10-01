import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import api from '../services/api';
import Page from '../components/ui/Page';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Notice from '../components/ui/Notice';
import Icon from '../components/ui/Icon';
import ScanLoader from '../components/ui/ScanLoader';
import { rise, reveal } from '../components/ui/motionPresets';
import styles from './Steps.module.css';

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
        <Page>
            <PageHeader
                title="Alertas no Telegram"
                backLabel={linked ? 'Voltar' : 'Sair'}
                onBack={linked ? () => navigate('/perfil') : handleLogout}
            />

            {linked === false && (
                <motion.div variants={rise}>
                    <Notice>
                        {onboarding ? 'Conta criada! ' : ''}Para usar a TagReativa, ative os alertas no Telegram. É por lá que você fica sabendo na hora, com a localização no mapa, quando a tag do seu pet perdido for escaneada.
                    </Notice>
                </motion.div>
            )}

            <Panel className={styles.card}>
                {linked === true && (
                    <>
                        <h2 className={styles.cardTitle}><Icon name="check" size={18} />Alertas ativos</h2>
                        <p className={styles.text}>
                            Seu Telegram está vinculado. Quando a tag de um pet marcado como perdido for escaneada, você recebe uma mensagem com a localização.
                        </p>
                    </>
                )}

                {linked === false && (
                    <>
                        <h2 className={styles.cardTitle}>Como ativar</h2>
                        <ol className={styles.list}>
                            <li>Tenha o Telegram instalado no celular ou computador.</li>
                            <li>Toque em <strong>Ativar no Telegram</strong>. O app abre na conversa com o bot da TagReativa.</li>
                            <li>Toque em <strong>Iniciar</strong> no Telegram. Pronto: esta página atualiza sozinha.</li>
                        </ol>

                        <AnimatePresence initial={false}>
                            {waiting && (
                                <motion.div className={styles.waiting} {...reveal}>
                                    <ScanLoader compact label="Aguardando confirmação no Telegram..." />
                                    <Notice>
                                        Se o app não abriu, <a href={linkUrl} target="_blank" rel="noopener noreferrer">toque aqui</a>.
                                    </Notice>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <Button block onClick={handleActivate} disabled={loading}>
                            {loading ? 'Gerando link...' : waiting ? 'Gerar novo link' : 'Ativar no Telegram'}
                        </Button>
                    </>
                )}

                {error && <Notice tone="error">{error}</Notice>}
            </Panel>
        </Page>
    );
}
