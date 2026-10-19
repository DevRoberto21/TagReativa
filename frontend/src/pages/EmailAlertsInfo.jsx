import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Page from '../components/ui/Page';
import PageHeader from '../components/ui/PageHeader';
import Panel from '../components/ui/Panel';
import Button from '../components/ui/Button';
import Icon from '../components/ui/Icon';
import styles from './Steps.module.css';

// Onboarding step shown right after sign-up. Email is the main alert channel
// and needs no setup; Telegram is offered as an optional extra.
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
        <Page>
            <PageHeader title="Alertas por e-mail" />

            <Panel className={styles.card}>
                <h2 className={styles.cardTitle}><Icon name="check" size={18} />Conta criada</h2>
                <p className={styles.text}>
                    Os alertas de resgate são enviados para {email ? <strong>{email}</strong> : 'o seu e-mail'}. Nada a configurar.
                </p>
                <ol className={styles.list}>
                    <li>Procure o e-mail da <strong>TagReativa</strong> também na caixa de spam.</li>
                    <li>Marque como "não é spam" ou adicione o remetente aos contatos para os próximos alertas chegarem na caixa de entrada.</li>
                </ol>

                <Button block onClick={finish}>Entendi, continuar</Button>
                <Button variant="secondary" block onClick={() => navigate('/configurar-notificacao')}>
                    Ativar também no Telegram (opcional)
                </Button>
            </Panel>
        </Page>
    );
}
