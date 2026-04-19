import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useCRM, montarPromptMensagem, ignorarCliente, reativarCliente } from "./useCRM";
import LeadsPage from "./LeadsPage";
import ConfigPage from "./ConfigPage";
import NotificacoesLeads from "./NotificacoesLeads";
import { useLeads } from "./useLeads";

// ── Nova tela de login ────────────────────────────────────────────────────────
import BrandAnimation from "./BrandAnimation";
import LoginForm from "./LoginForm";
import "./App.css";

function LoginScreen({ onLogin }) {
  return (
    <div className="login-container">
      <div className="login-left">
        <BrandAnimation />
      </div>
      <div className="login-right">
        <LoginForm onLogin={onLogin} />
      </div>
    </div>
  );
}

// ─── Hook de Breakpoint ───────────────────────────────────────────────────────
function useBreakpoint() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return {
    isMobile: width < 640,
    isTablet: width >= 640 && width < 1024,
    isDesktop: width >= 1024,
    width,
  };
}

// ─── Temas ────────────────────────────────────────────────────────────────────
const TEMAS = {
  dark: {
    bg: "#0a0a0b",
    surface: "#111113",
    surfaceAlt: "#17171a",
    border: "#222226",
    borderAlt: "#2a2a30",
    text: "#e8e8ed",
    textMid: "#8e8e99",
    textDim: "#4a4a54",
    gold: "#c9a84c",
    goldDim: "#7a6230",
    red: "#e05252",
    redDim: "#3d1f1f",
    yellow: "#d4903a",
    yellowDim: "#3a2810",
    green: "#4aad7a",
    greenDim: "#1a3028",
    blue: "#4a8fd4",
    blueDim: "#1a2840",
  },
  light: {
    bg: "#f5f5f7",
    surface: "#ffffff",
    surfaceAlt: "#f0f0f2",
    border: "#e0e0e5",
    borderAlt: "#d0d0d8",
    text: "#111113",
    textMid: "#555560",
    textDim: "#aaaabc",
    gold: "#a07828",
    goldDim: "#f5ead0",
    red: "#c03030",
    redDim: "#fde8e8",
    yellow: "#b06010",
    yellowDim: "#fdf0e0",
    green: "#1e7a50",
    greenDim: "#e0f5ea",
    blue: "#1a5fa0",
    blueDim: "#e0edf8",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function iniciais(nome = "") {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function formatarReal(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor || 0);
}

async function chamarIA(system, user) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 1500, temperature: 0.9 },
      }),
    }
  );
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || "Erro na IA");
  return d.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ─── Badge de Risco ───────────────────────────────────────────────────────────
function RiscoBadge({ risco, T }) {
  const map = {
    alto: { label: "Risco alto", bg: T.redDim, color: T.red },
    medio: { label: "Atenção", bg: T.yellowDim, color: T.yellow },
    baixo: { label: "Fiel", bg: T.greenDim, color: T.green },
    indefinido: { label: "Sem histórico", bg: T.surfaceAlt, color: T.textMid },
  };
  const s = map[risco] || map.indefinido;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
      background: s.bg, color: s.color, letterSpacing: "0.06em",
      textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 5,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, display: "inline-block", flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ─── Card de Métrica ──────────────────────────────────────────────────────────
function MetricCard({ val, label, color, T }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "16px 18px",
      borderTop: `2px solid ${color || T.border}`,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || T.text, fontFamily: "monospace", letterSpacing: "-0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{val}</div>
      <div style={{ fontSize: 10, color: T.textMid, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1.4 }}>{label}</div>
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ insight, empresaNome, empresaId, T }) {
  const [msg, setMsg] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [ignorando, setIgnorando] = useState(false);

  const cores = {
    risco: { borda: T.red, badgeBg: T.redDim, badgeColor: T.red, label: "Risco de perda" },
    oportunidade: { borda: T.blue, badgeBg: T.blueDim, badgeColor: T.blue, label: "Oportunidade" },
    fidelizacao: { borda: T.green, badgeBg: T.greenDim, badgeColor: T.green, label: "Fidelização" },
  };
  const cor = cores[insight.tipo] || cores.risco;
  const telLimpo = (insight.telefone || "").replace(/\D/g, "");

  async function gerarMensagem() {
    setGerando(true); setMsg(null);
    try {
      const { system, user } = montarPromptMensagem(insight, empresaNome);
      setMsg(await chamarIA(system, user));
    } catch { setMsg("Erro ao gerar mensagem. Tente novamente."); }
    finally { setGerando(false); }
  }

  async function handleIgnorar() {
    if (!empresaId || ignorando) return;
    setIgnorando(true);
    try {
      await ignorarCliente(empresaId, {
        id: insight.clienteId,
        nome: insight.cliente,
        telefone: insight.telefone,
      });
    } catch (e) {
      console.error("Erro ao ignorar cliente:", e);
      setIgnorando(false);
    }
  }

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${cor.borda}`, borderRadius: 10,
      padding: "16px 16px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: cor.badgeBg, color: cor.badgeColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700,
        }}>
          {insight.cliente ? iniciais(insight.cliente) : "!"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{insight.cliente || "Alerta"}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: cor.badgeBg, color: cor.badgeColor, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{cor.label}</span>
          </div>
          <p style={{ fontSize: 12, color: T.textMid, lineHeight: 1.6, margin: 0 }}>{insight.descricao}</p>
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            {insight.diasAusente != null && (
              <span style={{ fontSize: 11, color: T.textDim }}>
                ausente há <strong style={{ color: insight.diasAusente > 30 ? T.red : T.textMid }}>{insight.diasAusente}d</strong>
              </span>
            )}
            {insight.ticketMedio != null && (
              <span style={{ fontSize: 11, color: T.textDim }}>
                ticket <strong style={{ color: T.gold }}>{formatarReal(insight.ticketMedio)}</strong>
              </span>
            )}
            {insight.preco != null && (
              <span style={{ fontSize: 11, color: T.textDim }}>
                potencial <strong style={{ color: T.green }}>+{formatarReal(insight.preco)}</strong>
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={gerarMensagem} disabled={gerando} style={{
          fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 6,
          background: gerando ? T.surfaceAlt : T.gold, color: gerando ? T.textMid : "#000",
          border: "none", cursor: gerando ? "not-allowed" : "pointer",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {gerando ? "Gerando..." : "\u2726 Gerar mensagem"}
        </button>
        {insight.telefone && (
          <button onClick={() => window.open(`https://wa.me/55${telLimpo}`, "_blank")} style={{
            fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 6,
            background: "none", border: `1px solid ${T.border}`, cursor: "pointer", color: T.textMid,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>WhatsApp</button>
        )}
        <button
          onClick={handleIgnorar}
          disabled={ignorando}
          title="Ignorar este cliente nos alertas futuros"
          style={{
            fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 6,
            background: "none", border: `1px solid ${T.border}`,
            cursor: ignorando ? "not-allowed" : "pointer",
            color: ignorando ? T.textDim : T.textMid,
            letterSpacing: "0.04em", textTransform: "uppercase",
            marginLeft: "auto",
          }}
        >
          {ignorando ? "Ignorando..." : "Ignorar cliente"}
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 12, background: T.surfaceAlt, borderRadius: 8, padding: "12px 14px", border: `1px solid ${T.borderAlt}` }}>
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0, color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{msg}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            {telLimpo && (
              <button onClick={() => window.open(`https://wa.me/55${telLimpo}?text=${encodeURIComponent(msg)}`, "_blank")} style={{
                fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 6,
                background: T.green, color: "#fff", border: "none", cursor: "pointer",
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}>\u2197 Enviar no WhatsApp</button>
            )}
            <button onClick={gerarMensagem} style={{
              fontSize: 11, padding: "6px 12px", borderRadius: 6,
              background: "none", border: `1px solid ${T.border}`, cursor: "pointer", color: T.textMid,
            }}>\u21ba Regenerar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Assistente IA ────────────────────────────────────────────────────────────
function AssistenteIA({ metricas, clientes, config, T }) {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState(null);
  const [pensando, setPensando] = useState(false);

  const contexto = metricas
    ? `Empresa: ${config?.empresa?.nomeEmpresa || "não identificada"}.
Clientes ativos: ${metricas.totalClientes}.
Em risco alto: ${metricas.emRisco}.
Dormentes (+60d): ${metricas.dormentes}.
Fiéis: ${metricas.fieis}.
Ticket médio geral: ${formatarReal(metricas.ticketGeral)}.
Receita em risco: ${formatarReal(metricas.receitaEmRisco)}.
Clientes em risco: ${clientes.filter((c) => c.risco === "alto").map((c) => `${c.nome} (${c.diasAusente}d ausente)`).join(", ") || "nenhum"}.`.trim()
    : "";

  async function perguntar(q) {
    const texto = q || pergunta;
    if (!texto.trim()) return;
    setPensando(true); setResposta(null);
    try {
      const r = await chamarIA(
        `Você é um consultor especialista em retenção de clientes para pequenos negócios brasileiros, trabalhando para "${config?.empresa?.nomeEmpresa || "esta empresa"}".
Você tem acesso aos dados reais dos clientes e deve dar conselhos práticos, diretos e específicos — nunca genéricos.
Dados atuais do negócio:\n${contexto}
Regras:
- Responda sempre em português brasileiro
- Seja direto e prático, com ações concretas
- Use os dados reais fornecidos nas respostas
- Cite nomes de clientes e valores quando relevante
- Máximo 6 linhas
- Nunca diga "com base nos dados" ou frases introdutórias`,
        texto
      );
      setResposta(r);
    } catch { setResposta("Erro ao conectar com a IA."); }
    finally { setPensando(false); setPergunta(""); }
  }

  const sugestoes = [
    "Quais clientes tenho risco de perder essa semana?",
    "Como posso aumentar meu ticket médio?",
    "Que campanha posso fazer para recuperar clientes dormentes?",
    "Quem são meus clientes mais valiosos?",
  ];

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: T.textMid, marginBottom: 12, lineHeight: 1.6 }}>
          Faça qualquer pergunta sobre seus clientes. A IA analisa os dados em tempo real.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && perguntar()}
            placeholder="Ex: quem devo priorizar hoje?"
            style={{
              flex: 1, padding: "10px 12px", borderRadius: 7, fontSize: 13,
              border: `1px solid ${T.borderAlt}`, outline: "none",
              fontFamily: "inherit", background: T.surfaceAlt, color: T.text, minWidth: 0,
            }}
          />
          <button onClick={() => perguntar()} disabled={pensando} style={{
            padding: "10px 16px", borderRadius: 7, fontSize: 11, fontWeight: 700,
            background: pensando ? T.surfaceAlt : T.gold, color: pensando ? T.textMid : "#000",
            border: "none", cursor: pensando ? "not-allowed" : "pointer",
            letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {pensando ? "..." : "✦ Perguntar"}
          </button>
        </div>
      </div>

      {(resposta || pensando) && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: T.gold, letterSpacing: "0.12em", marginBottom: 10, textTransform: "uppercase" }}>
            ✦ Assistente IA
          </p>
          {pensando
            ? <p style={{ fontSize: 13, color: T.textMid }}>Analisando dados...</p>
            : <p style={{ fontSize: 13, lineHeight: 1.8, color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{resposta}</p>
          }
        </div>
      )}

      <p style={{ fontSize: 10, fontWeight: 700, color: T.textDim, letterSpacing: "0.12em", marginBottom: 10, textTransform: "uppercase" }}>
        Sugestões rápidas
      </p>
      {sugestoes.map((s) => (
        <button key={s} onClick={() => perguntar(s)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          width: "100%", padding: "12px 14px", marginBottom: 6, textAlign: "left",
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
          fontSize: 12, color: T.textMid, cursor: "pointer", fontFamily: "inherit",
        }}>
          <span style={{ flex: 1, paddingRight: 8 }}>{s}</span>
          <span style={{ color: T.textDim, fontSize: 14, flexShrink: 0 }}>→</span>
        </button>
      ))}
    </div>
  );
}

// ─── Tabela de Clientes (Desktop) ─────────────────────────────────────────────
function TabelaClientes({ clientes, T, onSelecionar }) {
  const sorted = [...clientes].sort(
    (a, b) =>
      ({ alto: 0, medio: 1, baixo: 2, indefinido: 3 }[a.risco] || 3) -
      ({ alto: 0, medio: 1, baixo: 2, indefinido: 3 }[b.risco] || 3)
  );
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 480 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {["Cliente", "Último serviço", "Ausente", "Ticket médio", "Score"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "12px 14px", fontSize: 9, fontWeight: 700, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={c.nome} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? "transparent" : T.surfaceAlt }}>
                <td style={{ padding: "12px 14px", cursor: "pointer" }} onClick={() => onSelecionar(c)}>
                  <div style={{ fontWeight: 600, color: T.text, textDecoration: "underline" }}>{c.nome}</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{c.telefone || "—"}</div>
                </td>
                <td style={{ padding: "12px 14px", color: T.textMid, fontSize: 11, whiteSpace: "nowrap" }}>{c.produtoFavorito || "—"}</td>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: c.diasAusente > 30 ? T.red : T.textMid, whiteSpace: "nowrap" }}>
                  {c.diasAusente != null ? `${c.diasAusente}d` : "—"}
                </td>
                <td style={{ padding: "12px 14px", color: T.gold, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {c.ticketMedio != null ? formatarReal(c.ticketMedio) : "—"}
                </td>
                <td style={{ padding: "12px 14px" }}><RiscoBadge risco={c.risco} T={T} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Cards de Clientes (Mobile) ───────────────────────────────────────────────
function CardsClientes({ clientes, T, onSelecionar }) {
  const sorted = [...clientes].sort(
    (a, b) =>
      ({ alto: 0, medio: 1, baixo: 2, indefinido: 3 }[a.risco] || 3) -
      ({ alto: 0, medio: 1, baixo: 2, indefinido: 3 }[b.risco] || 3)
  );
  return (
    <div>
      {sorted.map((c) => (
        <div key={c.nome} onClick={() => onSelecionar(c)} style={{
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 10, padding: "14px 14px", marginBottom: 8, cursor: "pointer",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
              {c.telefone && <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{c.telefone}</div>}
            </div>
            <RiscoBadge risco={c.risco} T={T} />
          </div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {c.produtoFavorito && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Último serviço</div>
                <div style={{ fontSize: 11, color: T.textMid }}>{c.produtoFavorito}</div>
              </div>
            )}
            {c.diasAusente != null && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Ausente</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: c.diasAusente > 30 ? T.red : T.textMid }}>{c.diasAusente}d</div>
              </div>
            )}
            {c.ticketMedio != null && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Ticket médio</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.gold }}>{formatarReal(c.ticketMedio)}</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Modal Histórico CRM ──────────────────────────────────────────────────────
function ModalHistoricoCRM({ cliente, vendas, T, onClose }) {
  if (!cliente) return null;
  // BUG CORRIGIDO: fuzzy match de nome + parse correto de Timestamp Firestore
  function toDate(val) { return val?.toDate ? val.toDate() : new Date(val); }
  function matchNome(a = "", b = "") {
    const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
    return x === y || y.startsWith(x) || x.startsWith(y);
  }
  const historico = vendas.filter((v) => matchNome(v.cliente, cliente.nome)).sort((a, b) => toDate(b.data) - toDate(a.data));
  const faturamentoTotal = historico.reduce((acc, v) => acc + (v.total || 0), 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: "20px", backdropFilter: "blur(6px)" }}>
      <div style={{ background: T.surface, width: "100%", maxWidth: "550px", borderRadius: "16px", border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", maxHeight: "90vh", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
        <div style={{ padding: "24px", borderBottom: `1px solid ${T.border}`, position: "relative" }}>
          <div style={{ fontSize: "10px", color: T.gold, fontWeight: "800", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "4px" }}>Ficha do Cliente</div>
          <h2 style={{ margin: 0, fontSize: "22px", color: T.text, letterSpacing: "-0.5px" }}>{cliente.nome}</h2>
          <div style={{ display: "flex", gap: "15px", marginTop: "10px" }}>
            <span style={{ fontSize: "12px", color: T.textMid }}>LTV: <b style={{ color: T.green }}>{formatarReal(faturamentoTotal)}</b></span>
            <span style={{ fontSize: "12px", color: T.textMid }}>Serviços: <b>{historico.length}</b></span>
          </div>
          <button onClick={onClose} style={{ position: "absolute", top: "24px", right: "24px", background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: "20px" }}>✕</button>
        </div>
        <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: "11px", fontWeight: "700", color: T.textDim, textTransform: "uppercase", marginBottom: "16px", letterSpacing: "1px" }}>
            Histórico de Vendas (via Assent Gestão)
          </div>
          {historico.map((v, i) => (
            <div key={i} style={{ padding: "16px", background: T.surfaceAlt, borderRadius: "10px", marginBottom: "12px", border: `1px solid ${T.borderAlt}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", color: T.textDim }}>{new Date(v.data).toLocaleDateString("pt-BR")}</span>
                <span style={{ fontSize: "13px", fontWeight: "700", color: T.gold }}>{formatarReal(v.total)}</span>
              </div>
              <div style={{ fontSize: "14px", color: T.text, fontWeight: "500" }}>
                {v.itens?.map((item) => item.nome || item.produto).join(", ") || "Serviço"}
              </div>
            </div>
          ))}
          {historico.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: T.textDim, border: `1px dashed ${T.border}`, borderRadius: "10px" }}>
              Nenhum faturamento registrado no Assent Gestão.
            </div>
          )}
        </div>
        <div style={{ padding: "20px", borderTop: `1px solid ${T.border}` }}>
          <button style={{ width: "100%", padding: "12px", borderRadius: "8px", background: T.gold, color: "#000", border: "none", fontWeight: "700", cursor: "pointer", fontSize: "12px", textTransform: "uppercase" }}>
            + Registrar Contato Manual
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Módulo: Clientes Ignorados ───────────────────────────────────────────────
function ClientesIgnorados({ ignorados, empresaId, T }) {
  const [reativando, setReativando] = useState(null);

  async function handleReativar(ig) {
    setReativando(ig._docId || ig.nome);
    try {
      await reativarCliente(empresaId, ig);
    } catch (e) {
      console.error("Erro ao reativar cliente:", e);
    } finally {
      setReativando(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.textDim, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Clientes ignorados ({ignorados.length})
        </span>
        <div style={{ flex: 1, height: 1, background: T.border }} />
      </div>

      {ignorados.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "36px 0", color: T.textDim,
          fontSize: 13, border: `1px dashed ${T.border}`, borderRadius: 10,
        }}>
          Nenhum cliente ignorado. Use o botão "Ignorar cliente" nos alertas do Radar.
        </div>
      ) : (
        ignorados.map((ig) => {
          const key = ig._docId || ig.nome;
          const isReativando = reativando === key;
          return (
            <div key={key} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 12, padding: "12px 14px", marginBottom: 8,
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                  background: T.surfaceAlt, color: T.textDim,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                }}>
                  {(ig.nome || "?").split(" ").slice(0, 2).map(p => p[0]).join("").toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ig.nome}</div>
                  {ig.telefone && <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>{ig.telefone}</div>}
                  {ig.ignoradoEm && (
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 1 }}>
                      Ignorado em {ig.ignoradoEm?.toDate
                        ? ig.ignoradoEm.toDate().toLocaleDateString("pt-BR")
                        : new Date(ig.ignoradoEm).toLocaleDateString("pt-BR")}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleReativar(ig)}
                disabled={isReativando}
                style={{
                  fontSize: 11, fontWeight: 600, padding: "6px 14px", borderRadius: 6,
                  background: isReativando ? T.surfaceAlt : "none",
                  border: `1px solid ${T.border}`,
                  cursor: isReativando ? "not-allowed" : "pointer",
                  color: isReativando ? T.textDim : T.green,
                  letterSpacing: "0.04em", textTransform: "uppercase", flexShrink: 0,
                }}
              >
                {isReativando ? "Reativando..." : "↩ Reativar"}
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─── App Principal ────────────────────────────────────────────────────────────
export default function App() {
  const [aba, setAba] = useState("radar");
  const [usuario, setUsuario] = useState(null);
  const [busca, setBusca] = useState("");
  const [verificando, setVerificando] = useState(true);
  const [tema, setTema] = useState(() => localStorage.getItem("crm-tema") || "dark");
  const [sidebarAberta, setSidebarAberta] = useState(true);
  const [clienteAtivo, setClienteAtivo] = useState(null);

  const T = TEMAS[tema];
  const bp = useBreakpoint();

  useEffect(() => {
    if (bp.isMobile) setSidebarAberta(false);
    else setSidebarAberta(true);
  }, [bp.isMobile]);

  function alternarTema() {
    const novo = tema === "dark" ? "light" : "dark";
    setTema(novo);
    localStorage.setItem("crm-tema", novo);
  }

  // Verifica sessão ativa ao recarregar a página
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const snap = await getDoc(doc(db, "licencas", user.uid));
        if (snap.exists() && snap.data().clienteCRM) {
          setUsuario({ uid: user.uid, email: user.email, empresaId: user.uid });
        } else {
          await signOut(auth);
          setUsuario(null);
        }
      } else {
        setUsuario(null);
      }
      setVerificando(false);
    });
    return () => unsub();
  }, []);

  const { clientes, insights, metricas, config, dadosBrutos, ignorados } = useCRM(usuario?.empresaId);
  const leadsData = useLeads(usuario?.empresaId);

  const clientesFiltrados = clientes.filter((c) => {
    const nomeLimpo = (c.nome || "").toLowerCase();
    const buscaLimpa = busca.toLowerCase();
    const telefoneLimpo = c.telefone || "";
    return nomeLimpo.includes(buscaLimpa) || telefoneLimpo.includes(buscaLimpa);
  });

  // ── Tela de carregamento ──────────────────────────────────────────────────
  if (verificando)
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 13, color: TEMAS.dark.textMid, background: TEMAS.dark.bg, fontFamily: "system-ui, sans-serif", gap: 10 }}>
        <span style={{ color: TEMAS.dark.gold }}>✦</span> Verificando acesso...
      </div>
    );

  // ── Nova tela de login ────────────────────────────────────────────────────
  if (!usuario) return <LoginScreen onLogin={setUsuario} />;

  // ── Abas ──────────────────────────────────────────────────────────────────
  const abas = [
    { id: "radar",    icon: "◈", label: "Radar",    labelFull: "Radar do dia",    badge: insights.length || null },
    { id: "clientes", icon: "◉", label: "Clientes", labelFull: "Clientes",         badge: null },
    { id: "ia",       icon: "✦", label: "IA",        labelFull: "Assistente IA",   badge: null },
    { id: "painel",   icon: "▦", label: "Painel",    labelFull: "Painel",           badge: null },
    { id: "leads",    icon: "◎", label: "Leads",     labelFull: "Gestão de Leads", badge: null },
    { id: "config",   icon: "⚙", label: "Config",    labelFull: "Configurações",   badge: null },
  ];

  const sidebarWidth = bp.isMobile ? 0 : sidebarAberta ? 230 : 60;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: T.bg, color: T.text, position: "relative", overflow: "hidden" }}>

      {/* Overlay mobile */}
      {bp.isMobile && sidebarAberta && (
        <div onClick={() => setSidebarAberta(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }} />
      )}

      {/* ── Sidebar ── */}
      <div style={{
        position: bp.isMobile ? "fixed" : "relative",
        top: 0, left: 0, bottom: 0,
        width: bp.isMobile ? 240 : sidebarWidth,
        zIndex: bp.isMobile ? 50 : 1,
        background: T.surface, borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column",
        transition: "width 0.22s ease, transform 0.22s ease",
        transform: bp.isMobile ? (sidebarAberta ? "translateX(0)" : "translateX(-100%)") : "none",
        overflow: "hidden", flexShrink: 0,
      }}>
        {/* Logo + toggle */}
        <div style={{ padding: "18px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 58 }}>
          <div style={{ overflow: "hidden", opacity: sidebarAberta || bp.isMobile ? 1 : 0, transition: "opacity 0.15s ease", whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: T.gold, textTransform: "uppercase" }}>CRM Retenção</div>
            <div style={{ fontSize: 10, color: T.textDim, marginTop: 2, letterSpacing: "0.06em" }}>via Assent Gestão</div>
          </div>
          {!bp.isMobile && (
            <button onClick={() => setSidebarAberta((v) => !v)} title={sidebarAberta ? "Recolher menu" : "Expandir menu"} style={{
              width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`,
              background: T.surfaceAlt, cursor: "pointer", fontSize: 13,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: T.textMid, flexShrink: 0, marginLeft: sidebarAberta ? 8 : "auto",
            }}>
              {sidebarAberta ? "←" : "→"}
            </button>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "10px 8px", overflowY: "auto" }}>
          {abas.map((a) => {
            const ativo = aba === a.id;
            const mostrarLabel = sidebarAberta || bp.isMobile;
            return (
              <button
                key={a.id}
                onClick={() => { setAba(a.id); if (bp.isMobile) setSidebarAberta(false); }}
                title={!mostrarLabel ? a.labelFull : undefined}
                style={{
                  display: "flex", alignItems: "center",
                  gap: mostrarLabel ? 10 : 0,
                  justifyContent: mostrarLabel ? "flex-start" : "center",
                  width: "100%", padding: mostrarLabel ? "9px 12px" : "10px",
                  borderRadius: 7, marginBottom: 2, border: "none",
                  background: ativo ? T.surfaceAlt : "transparent",
                  color: ativo ? T.text : T.textMid,
                  fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  fontWeight: ativo ? 600 : 400, transition: "all 0.15s ease",
                  position: "relative",
                }}
              >
                <span style={{ color: ativo ? T.gold : T.textDim, fontSize: 14, flexShrink: 0 }}>{a.icon}</span>
                {mostrarLabel && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.labelFull}</span>}
                {a.badge && mostrarLabel ? (
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: T.red, color: "#fff", borderRadius: 4, padding: "1px 6px", flexShrink: 0 }}>{a.badge}</span>
                ) : a.badge && !mostrarLabel ? (
                  <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: T.red }} />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Rodapé da sidebar */}
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
          {sidebarAberta || bp.isMobile ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {config?.empresa?.nomeEmpresa || "Empresa"}
              </div>
              <div style={{ fontSize: 10, color: T.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{usuario.email}</div>
              <button onClick={() => signOut(auth)} style={{ marginTop: 4, fontSize: 10, color: T.textDim, background: "none", border: `1px solid ${T.border}`, cursor: "pointer", padding: "5px 10px", borderRadius: 5, fontFamily: "inherit", alignSelf: "flex-start" }}>Sair</button>
            </>
          ) : (
            <button onClick={() => signOut(auth)} title="Sair" style={{ width: 36, height: 36, borderRadius: 7, border: `1px solid ${T.border}`, background: "none", cursor: "pointer", color: T.textDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, margin: "0 auto" }}>↪</button>
          )}
        </div>
      </div>

      {/* ── Área principal ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: bp.isMobile ? "12px 16px" : "14px 24px", borderBottom: `1px solid ${T.border}`, background: T.surface, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {bp.isMobile && (
              <button onClick={() => setSidebarAberta((v) => !v)} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.textMid, fontSize: 16, flexShrink: 0 }}>☰</button>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: bp.isMobile ? 14 : 16, fontWeight: 700, color: T.text, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {abas.find((a) => a.id === aba)?.labelFull}
              </div>
              {!bp.isMobile && (
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <NotificacoesLeads
              acoesDisparadas={leadsData.acoesDisparadas}
              leads={leadsData.leads}
              T={T}
              bp={bp}
              onVerLead={() => {}}
            />
            <button onClick={alternarTema} title={tema === "dark" ? "Modo claro" : "Modo escuro"} style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surfaceAlt, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: T.textMid }}>
              {tema === "dark" ? "☀️" : "🌙"}
            </button>
            {!bp.isMobile && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.green }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, display: "inline-block" }} />
                sincronizado
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: bp.isMobile ? "16px 14px" : "22px 24px", paddingBottom: bp.isMobile ? "72px" : "22px" }}>

          {/* ── Radar ── */}
          {aba === "radar" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                <MetricCard T={T} val={metricas?.emRisco || 0}                      label="Em risco alto"    color={T.red} />
                <MetricCard T={T} val={formatarReal(metricas?.receitaEmRisco || 0)} label="Receita em risco" color={T.yellow} />
                <MetricCard T={T} val={metricas?.totalClientes || 0}                label="Clientes ativos"  color={T.green} />
                <MetricCard T={T} val={formatarReal(metricas?.ticketGeral || 0)}    label="Ticket médio"     color={T.gold} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.textDim, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Ações prioritárias de hoje</span>
                <div style={{ flex: 1, height: 1, background: T.border }} />
              </div>
              {insights.length === 0
                ? <div style={{ textAlign: "center", padding: "48px 0", color: T.textDim, fontSize: 13, border: `1px dashed ${T.border}`, borderRadius: 10 }}>Nenhum insight gerado ainda.</div>
                : insights.map((ins) => <InsightCard key={ins.id} insight={ins} empresaNome={config?.empresa?.nomeEmpresa} empresaId={usuario?.empresaId} T={T} />)
              }
            </>
          )}

          {/* ── Clientes ── */}
          {aba === "clientes" && (
            <>
              <div style={{ marginBottom: 20 }}>
                <input type="text" placeholder="Buscar por nome ou telefone..." value={busca} onChange={(e) => setBusca(e.target.value)}
                  style={{ width: "100%", padding: "12px 16px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
                  onFocus={(e) => (e.target.style.borderColor = T.gold)}
                  onBlur={(e) => (e.target.style.borderColor = T.border)}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
                <MetricCard T={T} val={clientesFiltrados.filter((c) => c.risco === "alto").length}  label="Risco alto" color={T.red} />
                <MetricCard T={T} val={clientesFiltrados.filter((c) => c.risco === "medio").length} label="Atenção"    color={T.yellow} />
                <MetricCard T={T} val={clientesFiltrados.filter((c) => c.risco === "baixo").length} label="Fiéis"      color={T.green} />
              </div>
              {bp.isMobile
                ? <CardsClientes clientes={clientesFiltrados} T={T} onSelecionar={setClienteAtivo} />
                : <TabelaClientes clientes={clientesFiltrados} T={T} onSelecionar={setClienteAtivo} />
              }
              {clientesFiltrados.length === 0 && <div style={{ textAlign: "center", padding: "40px", color: T.textDim }}>Nenhum cliente encontrado com "{busca}".</div>}
            </>
          )}

          {/* ── IA ── */}
          {aba === "ia" && <AssistenteIA metricas={metricas} clientes={clientes} config={config} T={T} />}

          {/* ── Painel ── */}
          {aba === "painel" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
                <MetricCard T={T} val={metricas?.totalClientes || 0}                label="Clientes totais" />
                <MetricCard T={T} val={metricas?.fieis || 0}                        label="Clientes fiéis"  color={T.green} />
                <MetricCard T={T} val={metricas?.dormentes || 0}                    label="Dormentes +60d"  color={T.yellow} />
                <MetricCard T={T} val={formatarReal(metricas?.receitaRecente || 0)} label="Receita 30d"     color={T.gold} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: T.textDim, marginBottom: 14, letterSpacing: "0.1em", textTransform: "uppercase" }}>Segmentos automáticos</p>
                  {[
                    { label: "Fiéis",            val: metricas?.fieis || 0,    cor: T.green   },
                    { label: "Em risco",         val: metricas?.emRisco || 0,  cor: T.red     },
                    { label: "Dormentes (+60d)", val: metricas?.dormentes || 0,cor: T.yellow  },
                    { label: "Alto valor",       val: clientes.filter((c) => (c.ticketMedio || 0) > 500).length, cor: T.gold },
                    { label: "Novos (1 compra)", val: metricas?.novos || 0,    cor: T.textMid },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 12, color: T.textMid }}>{s.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: s.cor }}>{s.val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: T.textDim, marginBottom: 14, letterSpacing: "0.1em", textTransform: "uppercase" }}>Resumo financeiro</p>
                  {[
                    { label: "Ticket médio geral",  val: formatarReal(metricas?.ticketGeral),    color: T.gold  },
                    { label: "Receita em risco",    val: formatarReal(metricas?.receitaEmRisco), color: T.red   },
                    { label: "Receita últimos 30d", val: formatarReal(metricas?.receitaRecente), color: T.green },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 12, color: T.textMid }}>{s.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Leads ── */}
          {aba === "leads" && (
            <LeadsPage
              T={T}
              bp={bp}
              empresaId={usuario?.empresaId}
              config={config}
            />
          )}

          {/* ── Configurações ── */}
          {aba === "config" && (
            <div>
              <ConfigPage
                T={T}
                bp={bp}
                empresaId={usuario?.empresaId}
                config={config}
              />
              <div style={{ marginTop: 32 }}>
                <ClientesIgnorados
                  ignorados={ignorados}
                  empresaId={usuario?.empresaId}
                  T={T}
                />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Bottom Nav (mobile only) ── */}
      {bp.isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: T.surface, borderTop: `1px solid ${T.border}`, display: "flex", zIndex: 30, paddingBottom: "env(safe-area-inset-bottom)" }}>
          {abas.map((a) => {
            const ativo = aba === a.id;
            return (
              <button key={a.id} onClick={() => setAba(a.id)} style={{ flex: 1, padding: "10px 4px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", position: "relative" }}>
                <span style={{ fontSize: 17, color: ativo ? T.gold : T.textDim, transition: "color 0.15s ease" }}>{a.icon}</span>
                <span style={{ fontSize: 9, fontWeight: ativo ? 700 : 400, color: ativo ? T.text : T.textDim, letterSpacing: "0.04em", textTransform: "uppercase" }}>{a.label}</span>
                {a.badge ? <span style={{ position: "absolute", top: 6, right: "calc(50% - 14px)", width: 8, height: 8, borderRadius: "50%", background: T.red }} /> : null}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Modal Histórico ── */}
      {clienteAtivo && (
        <ModalHistoricoCRM
          cliente={clienteAtivo}
          vendas={dadosBrutos?.vendas || []}
          T={T}
          onClose={() => setClienteAtivo(null)}
        />
      )}
    </div>
  );
}
