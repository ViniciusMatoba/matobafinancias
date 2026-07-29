import { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useToast } from '../shared/Toast';

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none',
        background: value ? '#10b981' : 'var(--border)',
        position: 'relative', cursor: 'pointer',
        transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3,
        left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
      }} />
    </button>
  );
}

export default function WebhookSettings({ user }) {
  const [webhookEnabled, setWebhookEnabled] = useState(false);
  const [webhookToken, setWebhookToken] = useState('');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!user?.uid || !db) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setWebhookEnabled(data.webhookEnabled || false);
        setWebhookToken(data.webhookToken || '');
      }
    });
    return unsub;
  }, [user?.uid]);

  const generateToken = () => {
    return Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('').toUpperCase();
  };

  const handleToggle = async (val) => {
    if (!user?.uid) return;
    try {
      const updates = { webhookEnabled: val };
      if (val && !webhookToken) {
        updates.webhookToken = generateToken();
      }
      await updateDoc(doc(db, 'users', user.uid), updates);
      showToast(val ? 'Integração via Webhook ativada!' : 'Integração via Webhook desativada.');
    } catch (err) {
      console.error('[handleToggleWebhook]', err);
      showToast('Erro ao atualizar configurações.', 'error');
    }
  };

  const handleRegenerateToken = async () => {
    if (!user?.uid) return;
    if (!window.confirm('Aviso: Ao gerar um novo token, a URL atual configurada no seu celular deixará de funcionar. Deseja prosseguir?')) {
      return;
    }
    try {
      const newToken = generateToken();
      await updateDoc(doc(db, 'users', user.uid), { webhookToken: newToken });
      showToast('Novo token gerado com sucesso!');
    } catch (err) {
      console.error('[handleRegenerateToken]', err);
      showToast('Erro ao regerar token.', 'error');
    }
  };

  const webhookUrl = `https://us-central1-matobafinancas.cloudfunctions.net/smsWebhook?token=${webhookToken}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    showToast('URL copiada para a área de transferência! 📋');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Principal Toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12,
      }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Automação de Gastos (MacroDroid / Tasker)
          </p>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)' }}>
            Cadastre gastos enviando notificações do seu celular
          </p>
        </div>
        <Toggle
          value={webhookEnabled}
          onChange={handleToggle}
        />
      </div>

      {webhookEnabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Campo com a URL */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8
          }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Sua URL de Webhook Exclusiva
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                readOnly
                value={webhookUrl}
                style={{
                  flex: 1, padding: '8px 10px', fontSize: 11, borderRadius: 8,
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontFamily: 'monospace'
                }}
              />
              <button
                onClick={copyToClipboard}
                style={{
                  padding: '8px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8,
                  background: 'var(--primary)', color: '#fff', border: 'none', cursor: 'pointer'
                }}
              >
                Copiar
              </button>
            </div>
            <button
              onClick={handleRegenerateToken}
              style={{
                alignSelf: 'flex-start', background: 'none', border: 'none',
                color: 'var(--saida)', fontSize: 11, cursor: 'pointer', padding: '2px 0',
                textDecoration: 'underline'
              }}
            >
              Regerar Token de Segurança
            </button>
          </div>

          {/* Guia de Configurações */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden'
          }}>
            <button
              onClick={() => setInstructionsOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: 'var(--text-primary)'
              }}
            >
              <span>📖 Guia de Instalação Rápida</span>
              <span>{instructionsOpen ? '▲' : '▼'}</span>
            </button>

            {instructionsOpen && (
              <div style={{
                padding: '0 14px 14px', fontSize: 12, color: 'var(--text-secondary)',
                lineHeight: 1.5, display: 'flex', flexDirection: 'column', gap: 10,
                borderTop: '1px solid var(--border)', paddingTop: 10
              }}>
                <p style={{ margin: 0 }}>
                  Com esta integração ativa, sempre que você receber uma notificação de compra de um banco no celular, 
                  o bot do Telegram enviará botões para você escolher em qual categoria salvar a despesa ou ignorar.
                </p>

                <h4 style={{ margin: '8px 0 4px', fontSize: 12, color: 'var(--text-primary)', fontWeight: 700 }}>
                  Como configurar no MacroDroid (Android):
                </h4>
                <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <li>Instale o app gratuito <strong>MacroDroid</strong> na Google Play Store.</li>
                  <li>Clique em <strong>Adicionar Macro</strong>.</li>
                  <li>
                    <strong>Gatilho (Vermelho):</strong> Clique no + &gt; Dispositivo &gt; Notificação &gt; 
                    Notificação Recebida &gt; Selecionar Aplicativos &gt; Marque seus aplicativos de bancos 
                    (Nubank, Inter, Itaú, etc.). Deixe "Qualquer Conteúdo".
                  </li>
                  <li>
                    <strong>Ações (Azul):</strong> Clique no + &gt; Conectividade &gt; Requisição HTTP POST.
                  </li>
                  <li>No campo <strong>URL</strong>, cole a sua URL exclusiva gerada acima.</li>
                  <li>
                    No campo <strong>Content Type</strong>, selecione <code>application/json</code>.
                  </li>
                  <li>
                    No campo <strong>Texto do Conteúdo (Body)</strong>, cole exatamente o seguinte código:
                    <pre style={{
                      background: 'var(--bg-surface)', padding: 8, borderRadius: 6,
                      fontSize: 11, overflowX: 'auto', border: '1px solid var(--border)',
                      marginTop: 4, fontFamily: 'monospace', color: 'var(--text-secondary)'
                    }}>
                      {`{\n  "text": "[notification_text]"\n}`}
                    </pre>
                  </li>
                  <li>Dê um nome para a Macro (ex: "Matoba Webhook") e salve.</li>
                </ol>

                <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
                  💡 <strong>Segurança:</strong> Suas notificações bancárias são enviadas diretamente para a sua conta 
                  e só disparam a mensagem no seu próprio bot do Telegram. Nenhum data é compartilhado.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
