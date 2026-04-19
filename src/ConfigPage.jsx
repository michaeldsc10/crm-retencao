// ConfigPage.jsx
// Aba de Configurações do CRM Retenção.
// Recebe T, bp, empresaId e config como props — mesma assinatura das outras seções.
// Exibe: slug público, snippets de captura (HTML/React/API), botão regenerar slug
// e modal com guia passo a passo do Zapier.

import { useState, useEffect } from "react";
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { SNIPPET_HTML, SNIPPET_REACT, SNIPPET_API } from "./capturaSnippets";
import { RADAR_PADRAO } from "./useCRM";

// ─── Helper: gera novo slug ───────────────────────────────────────────────────
function gerarSlug(nomeEmpresa = "") {
  const base = nomeEmpresa
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "empresa";
  const sufixo = Math.random().toString(36).slice(2, 6);
  return `${base}-${sufixo}`;
}

// ─── Seção título (padrão do app) ─────────────────────────────────────────────
function SecaoTitulo({ T, children }) {
  return (
    <p style={{
      fontSize: 10, fontWeight: 700, color: T.textDim,
      letterSpacing: "0.12em", textTransform: "uppercase",
      marginBottom: 10, marginTop: 0,
    }}>{children}</p>
  );
}

// ─── Bloco de código copiável ─────────────────────────────────────────────────
function CodeBlock({ codigo, T }) {
  const [copiado, setCopiado] = useState(false);

  function copiar() {
    navigator.clipboard.writeText(codigo).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <pre style={{
        background: T.bg, border: `1px solid ${T.border}`,
        borderRadius: 8, padding: "14px 16px",
        fontSize: 11, color: T.textMid, lineHeight: 1.7,
        overflowX: "auto", margin: 0,
        fontFamily: "ui-monospace, monospace",
        maxHeight: 260, overflowY: "auto",
      }}>
        {codigo}
      </pre>
      <button
        onClick={copiar}
        style={{
          position: "absolute", top: 8, right: 8,
          fontSize: 10, fontWeight: 700,
          padding: "4px 10px", borderRadius: 5,
          background: copiado ? T.greenDim : T.surfaceAlt,
          color: copiado ? T.green : T.textMid,
          border: `1px solid ${copiado ? T.green : T.border}`,
          cursor: "pointer", fontFamily: "inherit",
          letterSpacing: "0.04em", textTransform: "uppercase",
          transition: "all 0.15s ease",
        }}
      >
        {copiado ? "✓ Copiado" : "Copiar"}
      </button>
    </div>
  );
}

// ─── Modal: Guia Zapier ───────────────────────────────────────────────────────
function ModalZapier({ T, onFechar }) {
  const [passo, setPasso] = useState(0);

  const passos = [
    {
      num: "1",
      titulo: "Crie uma conta no Zapier",
      descricao: `Acesse zapier.com e clique em "Sign up free". Use seu e-mail ou entre com o Google. Escolha o plano gratuito (Free) — é suficiente para até 100 leads/mês.`,
      dica: null,
    },
    {
      num: "2",
      titulo: "Crie um novo Zap",
      descricao: `Clique no botão laranja "+ Create Zap" no canto superior esquerdo. Você verá dois blocos: "Trigger" (gatilho) e "Action" (ação).`,
      dica: null,
    },
    {
      num: "3",
      titulo: "Configure o gatilho (Trigger)",
      descricao: 'Clique no bloco "Trigger". Na busca, digite "Webhooks by Zapier" e selecione. Escolha o evento "Catch Hook" e clique em "Continue". O Zapier vai gerar uma URL única para você — copie ela.',
      dica: "Não feche essa janela ainda — você vai voltar aqui no passo 5.",
    },
    {
      num: "4",
      titulo: "Cole a URL no Assent CRM",
      descricao: 'No CRM, vá em Gestão de Leads → Automações. Clique em "+ Nova automação", escolha o gatilho (ex: "Score acima de 30"), selecione a ação "Disparar webhook (Zapier / Make)" e cole a URL copiada.',
      dica: null,
    },
    {
      num: "5",
      titulo: "Teste o gatilho no Zapier",
      descricao: 'Volte para o Zapier e clique em "Test trigger". O Zapier vai aguardar um sinal. No CRM, adicione um lead manualmente para disparar agora. Quando os dados aparecerem no Zapier, clique em "Continue".',
      dica: null,
    },
    {
      num: "6",
      titulo: "Configure a ação — WhatsApp",
      descricao: 'Clique no bloco "Action". Busque por "WhatsApp by Zapier", escolha o evento "Send Message" e conecte seu número. No campo "Message", monte sua mensagem com os dados do lead:',
      exemplo: "Novo lead quente! 🔥\nNome: {{lead.nome}}\nScore: {{lead.score}}\nTelefone: {{lead.telefone}}",
      dica: null,
    },
    {
      num: "7",
      titulo: "Publique o Zap",
      descricao: 'Clique em "Publish Zap" ou ative o toggle no topo. Pronto — sua automação está ativa 24h por dia.',
      dica: "Dúvida? Fale com nosso suporte.",
    },
  ];

  const CAMPOS = [
    ["lead.nome",         "João Silva",      "Nome do lead"],
    ["lead.email",        "joao@email.com",  "E-mail"],
    ["lead.telefone",     "11999990000",     "Telefone com DDD"],
    ["lead.score",        "55",              "Pontuação"],
    ["lead.temperatura",  "quente",          "quente / morno / frio"],
    ["lead.status",       "novo",            "Status no CRM"],
    ["lead.origem",       "google",          "UTM source"],
    ["lead.utm.campaign", "promo-maio",      "Campanha"],
    ["lead.landingPage",  "https://...",     "URL da página de origem"],
    ["evento",            "form_submit",     "Gatilho que disparou"],
  ];

  const atual = passos[passo];
  const ultimo = passo === passos.length - 1;

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100, padding: 16,
      }}
      onClick={onFechar}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#111113", border: "1px solid #222226",
          borderRadius: 14, width: "100%", maxWidth: 520,
          maxHeight: "90vh", overflowY: "auto",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "20px 22px 16px",
          borderBottom: "1px solid #222226",
          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
              Guia de integração
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
              Conectar ao Zapier
            </div>
          </div>
          <button onClick={onFechar} style={{ background: "none", border: "none", color: T.textDim, fontSize: 18, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
        </div>

        {/* Indicador de progresso */}
        <div style={{ padding: "14px 22px 0", display: "flex", gap: 5 }}>
          {passos.map((_, i) => (
            <div
              key={i}
              onClick={() => setPasso(i)}
              style={{
                flex: 1, height: 3, borderRadius: 2, cursor: "pointer",
                background: i <= passo ? T.gold : T.border,
                transition: "background 0.2s ease",
              }}
            />
          ))}
        </div>

        {/* Conteúdo do passo */}
        <div style={{ padding: "20px 22px", flex: 1 }}>
          <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "flex-start" }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: T.goldDim, color: T.gold,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700,
            }}>
              {atual.num}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, paddingTop: 6 }}>
              {atual.titulo}
            </div>
          </div>

          <p style={{ fontSize: 13, color: T.textMid, lineHeight: 1.7, margin: "0 0 14px" }}>
            {atual.descricao}
          </p>

          {atual.exemplo && (
            <pre style={{
              background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: 7, padding: "10px 14px",
              fontSize: 12, color: T.green, lineHeight: 1.6,
              fontFamily: "ui-monospace, monospace", margin: "0 0 14px",
            }}>
              {atual.exemplo}
            </pre>
          )}

          {atual.dica && (
            <div style={{
              background: T.blueDim, border: `1px solid ${T.blue}22`,
              borderRadius: 7, padding: "10px 14px",
              fontSize: 12, color: T.blue, lineHeight: 1.6,
            }}>
              💡 {atual.dica}
            </div>
          )}

          {/* Tabela de campos — só no último passo */}
          {ultimo && (
            <div style={{ marginTop: 20 }}>
              <SecaoTitulo T={T}>Campos disponíveis no Zapier</SecaoTitulo>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                {CAMPOS.map(([campo, exemplo, desc], i) => (
                  <div key={campo} style={{
                    display: "grid", gridTemplateColumns: "1.2fr 0.8fr 1fr",
                    padding: "8px 12px", fontSize: 11,
                    borderBottom: i < CAMPOS.length - 1 ? `1px solid ${T.border}` : "none",
                    background: i % 2 === 0 ? "transparent" : T.surfaceAlt,
                  }}>
                    <span style={{ color: T.gold, fontFamily: "ui-monospace, monospace" }}>{campo}</span>
                    <span style={{ color: T.textDim }}>{exemplo}</span>
                    <span style={{ color: T.textMid }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navegação */}
        <div style={{
          padding: "14px 22px",
          borderTop: "1px solid #222226",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <button
            onClick={() => setPasso(p => Math.max(0, p - 1))}
            disabled={passo === 0}
            style={{
              fontSize: 12, padding: "8px 16px", borderRadius: 7,
              background: "none", border: `1px solid ${T.border}`,
              color: passo === 0 ? T.textDim : T.textMid,
              cursor: passo === 0 ? "not-allowed" : "pointer",
              fontFamily: "inherit", opacity: passo === 0 ? 0.4 : 1,
            }}
          >← Anterior</button>

          <span style={{ fontSize: 11, color: T.textDim }}>
            {passo + 1} de {passos.length}
          </span>

          {ultimo ? (
            <button
              onClick={onFechar}
              style={{
                fontSize: 12, fontWeight: 700, padding: "8px 18px", borderRadius: 7,
                background: T.green, color: "#fff", border: "none",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >Entendido ✓</button>
          ) : (
            <button
              onClick={() => setPasso(p => Math.min(passos.length - 1, p + 1))}
              style={{
                fontSize: 12, fontWeight: 700, padding: "8px 18px", borderRadius: 7,
                background: T.gold, color: "#000", border: "none",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >Próximo →</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ConfigPage principal ─────────────────────────────────────────────────────
export default function ConfigPage({ T, bp, empresaId, config }) {
  const [snippetAtivo, setSnippetAtivo] = useState("html");
  const [regenerando, setRegenerando]   = useState(false);
  const [confirmarRegen, setConfirmarRegen] = useState(false);
  const [zapierAberto, setZapierAberto] = useState(false);
  const [feedbackRegen, setFeedbackRegen] = useState(null); // "ok" | "erro"
  const [gerandoSlug, setGerandoSlug]   = useState(false);

  // Slug vem do dadosCRM — subscrição própria independente do useCRM
  const [crmConfig, setCrmConfig] = useState(null); // null = carregando

  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(doc(db, "dadosCRM", empresaId), (snap) => {
      setCrmConfig(snap.exists() ? (snap.data().config || {}) : {});
    });
    return () => unsub();
  }, [empresaId]);

  // ── Radar: dadosCRM/{empresaId}/radar/risco ───────────────────────────────
  const [radarConfig, setRadarConfig] = useState(null);   // null = carregando
  const [radarForm,   setRadarForm]   = useState(null);   // valores do formulário
  const [salvandoRadar, setSalvandoRadar] = useState(false);
  const [feedbackRadar, setFeedbackRadar] = useState(null); // "ok" | "erro"

  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(
      doc(db, "dadosCRM", empresaId, "radar", "risco"),
      (snap) => {
        const dados = snap.exists() ? snap.data() : RADAR_PADRAO;
        const merged = { ...RADAR_PADRAO, ...dados };
        setRadarConfig(merged);
        setRadarForm(merged);
      },
      () => {
        // Doc ainda não existe — usa padrão
        setRadarConfig(RADAR_PADRAO);
        setRadarForm({ ...RADAR_PADRAO });
      }
    );
    return () => unsub();
  }, [empresaId]);

  async function salvarRadar() {
    if (!empresaId || salvandoRadar) return;

    // Validação: ordem dos limiares
    if (radarForm.diasMedio >= radarForm.diasAlto) {
      setFeedbackRadar("erro_ordem_dias");
      return;
    }
    if (radarForm.multMedio >= radarForm.multAlto) {
      setFeedbackRadar("erro_ordem_mult");
      return;
    }

    setSalvandoRadar(true);
    setFeedbackRadar(null);
    try {
      const payload = {
        diasMedio: radarForm.diasMedio,
        diasAlto:  radarForm.diasAlto,
        multMedio: radarForm.multMedio,
        multAlto:  radarForm.multAlto,
      };
      await setDoc(doc(db, "dadosCRM", empresaId, "radar", "risco"), payload, { merge: true });
      setFeedbackRadar("ok");
      setTimeout(() => setFeedbackRadar(null), 3000);
    } catch (err) {
      console.error("[ConfigPage] Erro ao salvar radar:", err);
      setFeedbackRadar("erro");
    } finally {
      setSalvandoRadar(false);
    }
  }

  function resetarRadar() {
    setRadarForm({ ...RADAR_PADRAO });
  }

  const cfUrl = "https://southamerica-east1-assent-2b945.cloudfunctions.net/capturarLead";

  const slugCarregando = crmConfig === null;
  const slugExibido    = crmConfig?.slugPublico || "";
  const slugAusente    = !slugCarregando && !slugExibido;

  // nomeEmpresa vem do AG (config prop do useCRM) para gerar o slug base
  const nomeEmpresa = config?.nomeEmpresa || "";

  async function salvarSlugNoCRM(novoSlug) {
    // Grava na coleção slugs (mapeamento público slug → empresaId)
    await setDoc(doc(db, "slugs", novoSlug), {
      empresaId,
      nomeEmpresa,
      criadoEm: new Date().toISOString(),
    });
    // Grava no dadosCRM da empresa
    await setDoc(doc(db, "dadosCRM", empresaId), {
      config: { slugPublico: novoSlug },
    }, { merge: true });
  }

  async function gerarPrimeiroSlug() {
    if (!empresaId) return;
    setGerandoSlug(true);
    setFeedbackRegen(null);
    try {
      await salvarSlugNoCRM(gerarSlug(nomeEmpresa));
      setFeedbackRegen("ok");
      setTimeout(() => setFeedbackRegen(null), 3000);
    } catch (err) {
      console.error("[ConfigPage] Erro ao gerar primeiro slug:", err);
      setFeedbackRegen("erro");
    } finally {
      setGerandoSlug(false);
    }
  }

  async function regenerarSlug() {
    if (!empresaId) return;
    setRegenerando(true);
    setFeedbackRegen(null);
    try {
      await salvarSlugNoCRM(gerarSlug(nomeEmpresa));
      setConfirmarRegen(false);
      setFeedbackRegen("ok");
      setTimeout(() => setFeedbackRegen(null), 3000);
    } catch (err) {
      console.error("[ConfigPage] Erro ao regenerar slug:", err);
      setFeedbackRegen("erro");
    } finally {
      setRegenerando(false);
    }
  }

  const snippets = {
    html:  SNIPPET_HTML(slugExibido),
    react: SNIPPET_REACT(slugExibido),
    api:   SNIPPET_API(slugExibido),
  };

  const TAB_LABELS = { html: "HTML puro", react: "React", api: "cURL / API" };

  return (
    <div style={{ maxWidth: 720 }}>

      {/* ── Seção: Configurar Radar ── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: "20px 22px", marginBottom: 16,
      }}>
        <SecaoTitulo T={T}>Configurar Radar</SecaoTitulo>
        <p style={{ fontSize: 12, color: T.textMid, lineHeight: 1.7, margin: "0 0 18px" }}>
          Defina os limiares que classificam clientes como <strong style={{ color: T.yellow }}>Atenção</strong> ou <strong style={{ color: T.red }}>Risco alto</strong> no Radar do dia.
          Os valores são aplicados em tempo real assim que salvos.
        </p>

        {radarForm === null ? (
          <div style={{ fontSize: 12, color: T.textDim, fontStyle: "italic" }}>Carregando...</div>
        ) : (
          <>
            {/* Bloco: sem histórico de frequência */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 700, color: T.textDim,
                letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 12,
              }}>
                Clientes sem histórico de frequência (dias ausente)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>

                <div style={{ background: T.surfaceAlt, border: `1px solid ${T.yellowBorder}`, borderRadius: 8, padding: "14px 16px" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: T.yellow, display: "block", marginBottom: 8, letterSpacing: "0.04em" }}>
                    ● Atenção — dias ausente
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="number" min={1} step={1}
                      value={radarForm.diasMedio}
                      onChange={e => setRadarForm(f => ({ ...f, diasMedio: parseInt(e.target.value) || 0 }))}
                      style={{
                        width: 72, padding: "7px 10px", borderRadius: 6, textAlign: "center",
                        border: `1px solid ${T.border}`, background: T.bg,
                        color: T.text, fontSize: 15, fontWeight: 700,
                        outline: "none", fontFamily: "inherit",
                      }}
                    />
                    <span style={{ fontSize: 12, color: T.textMid }}>dias</span>
                    <span style={{ fontSize: 10, color: T.textDim, marginLeft: "auto" }}>padrão: {RADAR_PADRAO.diasMedio}d</span>
                  </div>
                </div>

                <div style={{ background: T.surfaceAlt, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "14px 16px" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: T.red, display: "block", marginBottom: 8, letterSpacing: "0.04em" }}>
                    ● Risco alto — dias ausente
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="number" min={1} step={1}
                      value={radarForm.diasAlto}
                      onChange={e => setRadarForm(f => ({ ...f, diasAlto: parseInt(e.target.value) || 0 }))}
                      style={{
                        width: 72, padding: "7px 10px", borderRadius: 6, textAlign: "center",
                        border: `1px solid ${T.border}`, background: T.bg,
                        color: T.text, fontSize: 15, fontWeight: 700,
                        outline: "none", fontFamily: "inherit",
                      }}
                    />
                    <span style={{ fontSize: 12, color: T.textMid }}>dias</span>
                    <span style={{ fontSize: 10, color: T.textDim, marginLeft: "auto" }}>padrão: {RADAR_PADRAO.diasAlto}d</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Bloco: com histórico de frequência */}
            <div style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 9.5, fontWeight: 700, color: T.textDim,
                letterSpacing: "0.10em", textTransform: "uppercase", marginBottom: 12,
              }}>
                Clientes com histórico de frequência (multiplicador)
              </div>
              <p style={{ fontSize: 11, color: T.textDim, lineHeight: 1.6, margin: "0 0 12px" }}>
                Quando há histórico, o risco é calculado pelo tempo ausente ÷ frequência média do cliente. Ex: se a frequência média é 20 dias e o cliente está há 40 dias ausente, o multiplicador é 2×.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>

                <div style={{ background: T.surfaceAlt, border: `1px solid ${T.yellowBorder}`, borderRadius: 8, padding: "14px 16px" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: T.yellow, display: "block", marginBottom: 8, letterSpacing: "0.04em" }}>
                    ● Atenção — multiplicador acima de
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="number" min={0.1} step={0.1}
                      value={radarForm.multMedio}
                      onChange={e => setRadarForm(f => ({ ...f, multMedio: parseFloat(e.target.value) || 0 }))}
                      style={{
                        width: 72, padding: "7px 10px", borderRadius: 6, textAlign: "center",
                        border: `1px solid ${T.border}`, background: T.bg,
                        color: T.text, fontSize: 15, fontWeight: 700,
                        outline: "none", fontFamily: "inherit",
                      }}
                    />
                    <span style={{ fontSize: 12, color: T.textMid }}>×</span>
                    <span style={{ fontSize: 10, color: T.textDim, marginLeft: "auto" }}>padrão: {RADAR_PADRAO.multMedio}×</span>
                  </div>
                </div>

                <div style={{ background: T.surfaceAlt, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "14px 16px" }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: T.red, display: "block", marginBottom: 8, letterSpacing: "0.04em" }}>
                    ● Risco alto — multiplicador acima de
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="number" min={0.1} step={0.1}
                      value={radarForm.multAlto}
                      onChange={e => setRadarForm(f => ({ ...f, multAlto: parseFloat(e.target.value) || 0 }))}
                      style={{
                        width: 72, padding: "7px 10px", borderRadius: 6, textAlign: "center",
                        border: `1px solid ${T.border}`, background: T.bg,
                        color: T.text, fontSize: 15, fontWeight: 700,
                        outline: "none", fontFamily: "inherit",
                      }}
                    />
                    <span style={{ fontSize: 12, color: T.textMid }}>×</span>
                    <span style={{ fontSize: 10, color: T.textDim, marginLeft: "auto" }}>padrão: {RADAR_PADRAO.multAlto}×</span>
                  </div>
                </div>

              </div>
            </div>

            {/* Botões */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={salvarRadar}
                disabled={salvandoRadar}
                style={{
                  fontSize: 11.5, fontWeight: 700, padding: "9px 20px", borderRadius: 7,
                  background: salvandoRadar ? T.surfaceAlt : T.gold,
                  color: salvandoRadar ? T.textMid : "#000",
                  border: "none", cursor: salvandoRadar ? "not-allowed" : "pointer",
                  fontFamily: "inherit", letterSpacing: "0.04em", textTransform: "uppercase",
                  transition: "all 0.15s",
                }}
              >{salvandoRadar ? "Salvando..." : "✦ Salvar configuração"}</button>

              <button
                onClick={resetarRadar}
                style={{
                  fontSize: 11, padding: "9px 16px", borderRadius: 7,
                  background: "none", border: `1px solid ${T.border}`,
                  color: T.textMid, cursor: "pointer", fontFamily: "inherit",
                }}
              >↺ Restaurar padrões</button>

              {feedbackRadar === "ok" && (
                <span style={{ fontSize: 12, color: T.green }}>✓ Configuração salva. Radar atualizado em tempo real.</span>
              )}
              {feedbackRadar === "erro" && (
                <span style={{ fontSize: 12, color: T.red }}>Erro ao salvar. Tente novamente.</span>
              )}
              {feedbackRadar === "erro_ordem_dias" && (
                <span style={{ fontSize: 12, color: T.red }}>⚠ "Risco alto" deve ser maior que "Atenção" (dias).</span>
              )}
              {feedbackRadar === "erro_ordem_mult" && (
                <span style={{ fontSize: 12, color: T.red }}>⚠ "Risco alto" deve ser maior que "Atenção" (multiplicador).</span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Seção: Seu link de captura ── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: "20px 22px", marginBottom: 16,
      }}>
        <SecaoTitulo T={T}>Seu link de captura de leads</SecaoTitulo>

        {/* Caixa do slug — três estados: carregando / ausente / presente */}
        {slugCarregando ? (
          <div style={{
            background: T.bg, border: `1px solid ${T.borderAlt}`,
            borderRadius: 8, padding: "12px 16px", marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Slug público</div>
            <div style={{ fontSize: 12, color: T.textDim, fontStyle: "italic" }}>Carregando...</div>
          </div>
        ) : slugAusente ? (
          <div style={{
            background: T.yellowDim, border: `1px solid ${T.yellow}44`,
            borderRadius: 8, padding: "14px 16px", marginBottom: 14,
          }}>
            <div style={{ fontSize: 12, color: T.yellow, marginBottom: 10, lineHeight: 1.6 }}>
              ⚠️ Esta empresa ainda não possui um slug configurado. Gere agora para ativar os formulários de captura.
            </div>
            <button
              onClick={gerarPrimeiroSlug}
              disabled={gerandoSlug}
              style={{
                fontSize: 11, fontWeight: 700, padding: "8px 16px", borderRadius: 6,
                background: gerandoSlug ? T.surfaceAlt : T.gold,
                color: gerandoSlug ? T.textMid : "#000",
                border: "none", cursor: gerandoSlug ? "not-allowed" : "pointer",
                fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.04em",
              }}
            >{gerandoSlug ? "Gerando..." : "✦ Gerar meu primeiro slug"}</button>
          </div>
        ) : (
          <div style={{
            background: T.bg, border: `1px solid ${T.borderAlt}`,
            borderRadius: 8, padding: "12px 16px", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: T.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>Slug público</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.gold, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>
                {slugExibido}
              </div>
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(slugExibido); }}
              style={{
                fontSize: 10, fontWeight: 700, padding: "5px 12px", borderRadius: 5,
                background: T.surfaceAlt, border: `1px solid ${T.border}`,
                color: T.textMid, cursor: "pointer", fontFamily: "inherit",
                textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
              }}
            >Copiar</button>
          </div>
        )}

        <p style={{ fontSize: 12, color: T.textMid, lineHeight: 1.7, margin: "0 0 16px" }}>
          Este slug é o identificador público da sua empresa nos formulários de captura. Ele é usado no lugar do seu ID interno — mantendo seus dados protegidos.
        </p>

        {/* Regenerar slug */}
        {!confirmarRegen ? (
          <button
            onClick={() => setConfirmarRegen(true)}
            style={{
              fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 6,
              background: "none", border: `1px solid ${T.border}`,
              color: T.textMid, cursor: "pointer", fontFamily: "inherit",
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}
          >↻ Regenerar slug</button>
        ) : (
          <div style={{
            background: T.yellowDim, border: `1px solid ${T.yellow}44`,
            borderRadius: 8, padding: "12px 14px",
          }}>
            <p style={{ fontSize: 12, color: T.yellow, margin: "0 0 12px", lineHeight: 1.6 }}>
              ⚠️ Atenção: ao regenerar, o slug atual vai de parar funcionar. Você precisará atualizar todos os formulários que já estiverem publicados.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={regenerarSlug}
                disabled={regenerando}
                style={{
                  fontSize: 11, fontWeight: 700, padding: "7px 14px", borderRadius: 6,
                  background: regenerando ? T.surfaceAlt : T.yellow,
                  color: regenerando ? T.textMid : "#000",
                  border: "none", cursor: regenerando ? "not-allowed" : "pointer",
                  fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.04em",
                }}
              >{regenerando ? "Gerando..." : "Confirmar"}</button>
              <button
                onClick={() => setConfirmarRegen(false)}
                style={{
                  fontSize: 11, padding: "7px 14px", borderRadius: 6,
                  background: "none", border: `1px solid ${T.border}`,
                  color: T.textMid, cursor: "pointer", fontFamily: "inherit",
                }}
              >Cancelar</button>
            </div>
          </div>
        )}

        {feedbackRegen === "ok" && (
          <div style={{ marginTop: 10, fontSize: 12, color: T.green }}>✓ Slug regenerado com sucesso.</div>
        )}
        {feedbackRegen === "erro" && (
          <div style={{ marginTop: 10, fontSize: 12, color: T.red }}>Erro ao regenerar. Tente novamente.</div>
        )}
      </div>

      {/* ── Seção: Snippets de integração ── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: "20px 22px", marginBottom: 16,
      }}>
        <SecaoTitulo T={T}>Snippets de integração</SecaoTitulo>
        <p style={{ fontSize: 12, color: T.textMid, lineHeight: 1.7, margin: "0 0 14px" }}>
          Cole o código abaixo na sua landing page para capturar leads automaticamente no CRM.
        </p>

        {/* Tabs de snippet */}
        <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${T.border}`, paddingBottom: 0 }}>
          {Object.entries(TAB_LABELS).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSnippetAtivo(id)}
              style={{
                fontSize: 11, fontWeight: snippetAtivo === id ? 700 : 400,
                padding: "7px 14px", borderRadius: "6px 6px 0 0",
                border: "none", cursor: "pointer", fontFamily: "inherit",
                background: snippetAtivo === id ? T.surfaceAlt : "transparent",
                color: snippetAtivo === id ? T.text : T.textMid,
                borderBottom: snippetAtivo === id ? `2px solid ${T.gold}` : "2px solid transparent",
                marginBottom: -1,
              }}
            >{label}</button>
          ))}
        </div>

        <CodeBlock codigo={snippets[snippetAtivo]} T={T} />

        {snippetAtivo === "html" && (
          <p style={{ fontSize: 11, color: T.textDim, marginTop: 10, lineHeight: 1.6 }}>
            Cole todo o bloco (form + script) no HTML da sua landing page. UTMs da URL são capturados automaticamente.
          </p>
        )}
        {snippetAtivo === "react" && (
          <p style={{ fontSize: 11, color: T.textDim, marginTop: 10, lineHeight: 1.6 }}>
            Importe o componente e use <code style={{ color: T.gold }}>&lt;AssentForm /&gt;</code> onde quiser no seu projeto React.
          </p>
        )}
        {snippetAtivo === "api" && (
          <p style={{ fontSize: 11, color: T.textDim, marginTop: 10, lineHeight: 1.6 }}>
            Endpoint: <code style={{ color: T.gold, wordBreak: "break-all" }}>{cfUrl}</code>
          </p>
        )}
      </div>

      {/* ── Seção: Automações externas ── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: "20px 22px",
      }}>
        <SecaoTitulo T={T}>Automações externas</SecaoTitulo>
        <p style={{ fontSize: 12, color: T.textMid, lineHeight: 1.7, margin: "0 0 16px" }}>
          Conecte o CRM ao Zapier ou Make para receber alertas no WhatsApp, salvar leads em planilhas, criar tarefas no Notion e muito mais — sem código.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => setZapierAberto(true)}
            style={{
              fontSize: 11, fontWeight: 700, padding: "9px 18px", borderRadius: 7,
              background: T.gold, color: "#000", border: "none",
              cursor: "pointer", fontFamily: "inherit",
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}
          >📋 Instruções para Zapier</button>

          <button
            onClick={() => window.open("https://zapier.com", "_blank")}
            style={{
              fontSize: 11, padding: "9px 16px", borderRadius: 7,
              background: "none", border: `1px solid ${T.border}`,
              color: T.textMid, cursor: "pointer", fontFamily: "inherit",
            }}
          >↗ Abrir Zapier</button>

          <button
            onClick={() => window.open("https://make.com", "_blank")}
            style={{
              fontSize: 11, padding: "9px 16px", borderRadius: 7,
              background: "none", border: `1px solid ${T.border}`,
              color: T.textMid, cursor: "pointer", fontFamily: "inherit",
            }}
          >↗ Abrir Make.com</button>
        </div>

        {/* Info de limites gratuitos */}
        <div style={{
          marginTop: 16, display: "grid",
          gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr",
          gap: 10,
        }}>
          {[
            { nome: "Zapier Free", limite: "100 tarefas/mês", obs: "Suficiente para a maioria dos pequenos negócios" },
            { nome: "Make.com Free", limite: "1.000 operações/mês", obs: "Mais generoso, interface um pouco mais complexa" },
          ].map(p => (
            <div key={p.nome} style={{
              background: T.surfaceAlt, border: `1px solid ${T.border}`,
              borderRadius: 8, padding: "12px 14px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>{p.nome}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.green, marginBottom: 4 }}>{p.limite}</div>
              <div style={{ fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>{p.obs}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Zapier */}
      {zapierAberto && <ModalZapier T={T} onFechar={() => setZapierAberto(false)} />}
    </div>
  );
}
