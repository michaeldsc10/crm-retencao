import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useCRM, montarPromptMensagem, ignorarCliente, reativarCliente } from "./useCRM";
import LeadsPage from "./LeadsPage";
import ConfigPage from "./ConfigPage";
import NotificacoesLeads from "./NotificacoesLeads";
import { useLeads } from "./useLeads";

import BrandAnimation from "./BrandAnimation";
import LoginForm from "./LoginForm";
import "./App.css";

// ── Fonte injetada via JS para não exigir mudança no index.css ────────────────
if (!document.getElementById("crm-fonts")) {
  const link = document.createElement("link");
  link.id = "crm-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&family=Cormorant+Garamond:wght@400;600&display=swap";
  document.head.appendChild(link);
}

const FONT = "'Outfit', system-ui, sans-serif";
const FONT_DISPLAY = "'Cormorant Garamond', Georgia, serif";

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
    bg: "#09090b",
    surface: "#111114",
    surfaceAlt: "#18181c",
    border: "#1e1e24",
    borderAlt: "#28282f",
    text: "#eceaff",
    textMid: "#7a7990",
    textDim: "#3e3d50",
    gold: "#c8a44a",
    goldDim: "#6a5520",
    goldGlow: "rgba(200,164,74,0.12)",
    goldBorder: "rgba(200,164,74,0.28)",
    red: "#e05252",
    redDim: "#2a1010",
    redBorder: "rgba(224,82,82,0.22)",
    yellow: "#d4903a",
    yellowDim: "#2a1a08",
    yellowBorder: "rgba(212,144,58,0.22)",
    green: "#3aad78",
    greenDim: "#0d2419",
    greenBorder: "rgba(58,173,120,0.22)",
    blue: "#4a8fd4",
    blueDim: "#0d1e35",
    blueBorder: "rgba(74,143,212,0.22)",
  },
  light: {
    bg: "#f5f5f7",
    surface: "#ffffff",
    surfaceAlt: "#f0f0f3",
    border: "#e2e2e8",
    borderAlt: "#d0d0d8",
    text: "#111113",
    textMid: "#555565",
    textDim: "#aaaabc",
    gold: "#a07828",
    goldDim: "#f5ead0",
    goldGlow: "rgba(160,120,40,0.08)",
    goldBorder: "rgba(160,120,40,0.25)",
    red: "#c03030",
    redDim: "#fde8e8",
    redBorder: "rgba(192,48,48,0.22)",
    yellow: "#b06010",
    yellowDim: "#fdf0e0",
    yellowBorder: "rgba(176,96,16,0.22)",
    green: "#1e7a50",
    greenDim: "#e0f5ea",
    greenBorder: "rgba(30,122,80,0.22)",
    blue: "#1a5fa0",
    blueDim: "#e0edf8",
    blueBorder: "rgba(26,95,160,0.22)",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function iniciais(nome = "") {
  return nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
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
    alto:      { label: "Risco alto",    bg: T.redDim,    color: T.red,    border: T.redBorder    },
    medio:     { label: "Atenção",       bg: T.yellowDim, color: T.yellow, border: T.yellowBorder },
    baixo:     { label: "Fiel",          bg: T.greenDim,  color: T.green,  border: T.greenBorder  },
    indefinido: { label: "Sem histórico", bg: T.surfaceAlt, color: T.textMid, border: T.border     },
  };
  const s = map[risco] || map.indefinido;
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      letterSpacing: "0.07em", textTransform: "uppercase",
      display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
      fontFamily: FONT,
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
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: "18px 20px 16px",
      position: "relative",
      overflow: "hidden",
      transition: "border-color 0.18s",
    }}>
      {/* bottom accent line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
        background: color || T.border,
        borderRadius: "0 0 16px 16px",
        opacity: color ? 0.85 : 0.3,
      }} />
      <div style={{
        fontSize: 30, fontWeight: 600, color: color || T.text,
        fontFamily: FONT_DISPLAY, letterSpacing: "-0.02em", lineHeight: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        marginBottom: 8,
      }}>{val}</div>
      <div style={{
        fontSize: 9.5, color: T.textMid, textTransform: "uppercase",
        letterSpacing: "0.10em", lineHeight: 1.4, fontWeight: 500,
      }}>{label}</div>
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ insight, empresaNome, empresaId, T }) {
  const [msg, setMsg] = useState(null);
  const [gerando, setGerando] = useState(false);
  const [ignorando, setIgnorando] = useState(false);

  const cores = {
    risco_alto:   { borda: T.red,    badgeBg: T.redDim,    badgeColor: T.red,    border: T.redBorder,    label: "Risco de perda" },
    risco_medio:  { borda: T.yellow, badgeBg: T.yellowDim, badgeColor: T.yellow, border: T.yellowBorder, label: "Atenção"        },
    oportunidade: { borda: T.blue,   badgeBg: T.blueDim,   badgeColor: T.blue,   border: T.blueBorder,   label: "Oportunidade"   },
    fidelizacao:  { borda: T.green,  badgeBg: T.greenDim,  badgeColor: T.green,  border: T.greenBorder,  label: "Fidelização"    },
  };
  const tipoKey = insight.tipo === "risco"
    ? (insight.prioridade === 1 ? "risco_alto" : "risco_medio")
    : insight.tipo;
  const cor = cores[tipoKey] || cores.risco_alto;
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
        id: insight.clienteId, nome: insight.cliente, telefone: insight.telefone,
      });
    } catch (e) {
      console.error("Erro ao ignorar cliente:", e);
      setIgnorando(false);
    }
  }

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      marginBottom: 10,
      overflow: "hidden",
      transition: "border-color 0.18s",
    }}>
      {/* left accent bar */}
      <div style={{ display: "flex" }}>
        <div style={{
          width: 3, flexShrink: 0,
          background: cor.borda,
          borderRadius: "16px 0 0 16px",
          boxShadow: tipoKey === "risco_alto" ? `0 0 12px ${T.red}` : tipoKey === "risco_medio" ? `0 0 8px ${T.yellow}` : "none",
        }} />
        <div style={{ flex: 1, padding: "16px 16px 16px 14px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            {/* avatar */}
            <div style={{
              width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
              background: cor.badgeBg, color: cor.badgeColor,
              border: `1.5px solid ${cor.border}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 600, fontFamily: FONT,
            }}>
              {insight.cliente ? iniciais(insight.cliente) : "!"}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{
                  fontSize: 13.5, fontWeight: 600, color: T.text,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  maxWidth: "60%", fontFamily: FONT,
                }}>{insight.cliente || "Alerta"}</span>
                <span style={{
                  fontSize: 9.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999,
                  background: cor.badgeBg, color: cor.badgeColor,
                  border: `1px solid ${cor.border}`,
                  textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap",
                  fontFamily: FONT,
                }}>{cor.label}</span>
              </div>
              <p style={{ fontSize: 12, color: T.textMid, lineHeight: 1.65, margin: 0, fontFamily: FONT, fontWeight: 300 }}>
                {insight.descricao}
              </p>
              <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                {insight.diasAusente != null && (
                  <span style={{ fontSize: 11, color: T.textDim, fontFamily: FONT }}>
                    ausente há <strong style={{ color: insight.prioridade === 1 ? T.red : T.yellow, fontWeight: 600 }}>{insight.diasAusente}d</strong>
                  </span>
                )}
                {insight.ticketMedio != null && (
                  <span style={{ fontSize: 11, color: T.textDim, fontFamily: FONT }}>
                    ticket <strong style={{ color: T.gold, fontWeight: 600 }}>{formatarReal(insight.ticketMedio)}</strong>
                  </span>
                )}
                {insight.preco != null && (
                  <span style={{ fontSize: 11, color: T.textDim, fontFamily: FONT }}>
                    potencial <strong style={{ color: T.green, fontWeight: 600 }}>+{formatarReal(insight.preco)}</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* action buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={gerarMensagem} disabled={gerando} style={{
              fontSize: 11.5, fontWeight: 600, padding: "7px 16px", borderRadius: 8,
              background: gerando ? T.surfaceAlt : T.gold,
              color: gerando ? T.textMid : "#000",
              border: gerando ? `1px solid ${T.border}` : "none",
              cursor: gerando ? "not-allowed" : "pointer",
              letterSpacing: "0.04em", fontFamily: FONT,
              transition: "all 0.16s",
            }}>
              {gerando ? "Gerando..." : "✦ Gerar mensagem"}
            </button>

            {insight.telefone && (
              <button onClick={() => window.open(`https://wa.me/55${telLimpo}`, "_blank")} style={{
                fontSize: 11.5, fontWeight: 500, padding: "7px 16px", borderRadius: 8,
                background: "none", border: `1px solid ${T.border}`,
                cursor: "pointer", color: T.textMid,
                letterSpacing: "0.04em", fontFamily: FONT,
                transition: "all 0.16s",
              }}>WhatsApp</button>
            )}

            <button onClick={handleIgnorar} disabled={ignorando} title="Ignorar este cliente nos alertas futuros" style={{
              fontSize: 11.5, fontWeight: 500, padding: "7px 14px", borderRadius: 8,
              background: "none", border: `1px solid ${T.border}`,
              cursor: ignorando ? "not-allowed" : "pointer",
              color: ignorando ? T.textDim : T.textMid,
              letterSpacing: "0.04em", fontFamily: FONT,
              marginLeft: "auto", transition: "all 0.16s",
            }}>
              {ignorando ? "Ignorando..." : "Ignorar cliente"}
            </button>
          </div>

          {/* mensagem gerada */}
          {msg && (
            <div style={{
              marginTop: 12, background: T.surfaceAlt, borderRadius: 12,
              padding: "14px 16px", border: `1px solid ${T.borderAlt}`,
            }}>
              <p style={{
                fontSize: 13, lineHeight: 1.75, margin: 0, color: T.text,
                whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: FONT, fontWeight: 300,
              }}>{msg}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {telLimpo && (
                  <button onClick={() => window.open(`https://wa.me/55${telLimpo}?text=${encodeURIComponent(msg)}`, "_blank")} style={{
                    fontSize: 11.5, fontWeight: 600, padding: "7px 14px", borderRadius: 8,
                    background: T.green, color: "#fff", border: "none", cursor: "pointer",
                    letterSpacing: "0.04em", fontFamily: FONT,
                  }}>↗ Enviar no WhatsApp</button>
                )}
                <button onClick={gerarMensagem} style={{
                  fontSize: 11.5, padding: "7px 14px", borderRadius: 8,
                  background: "none", border: `1px solid ${T.border}`,
                  cursor: "pointer", color: T.textMid, fontFamily: FONT,
                }}>↺ Regenerar</button>
              </div>
            </div>
          )}
        </div>
      </div>
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
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: T.textMid, marginBottom: 14, lineHeight: 1.65, fontFamily: FONT, fontWeight: 300 }}>
          Faça qualquer pergunta sobre seus clientes. A IA analisa os dados em tempo real.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && perguntar()}
            placeholder="Ex: quem devo priorizar hoje?"
            style={{
              flex: 1, padding: "11px 14px", borderRadius: 10, fontSize: 13,
              border: `1px solid ${T.borderAlt}`, outline: "none",
              fontFamily: FONT, background: T.surfaceAlt, color: T.text, minWidth: 0,
            }}
          />
          <button onClick={() => perguntar()} disabled={pensando} style={{
            padding: "11px 18px", borderRadius: 10, fontSize: 11.5, fontWeight: 600,
            background: pensando ? T.surfaceAlt : T.gold,
            color: pensando ? T.textMid : "#000",
            border: "none", cursor: pensando ? "not-allowed" : "pointer",
            letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap",
            flexShrink: 0, fontFamily: FONT, transition: "all 0.16s",
          }}>
            {pensando ? "..." : "✦ Perguntar"}
          </button>
        </div>
      </div>

      {(resposta || pensando) && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20, marginBottom: 14 }}>
          <p style={{ fontSize: 9.5, fontWeight: 700, color: T.gold, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase", fontFamily: FONT }}>
            ✦ Assistente IA
          </p>
          {pensando
            ? <p style={{ fontSize: 13, color: T.textMid, fontFamily: FONT }}>Analisando dados...</p>
            : <p style={{ fontSize: 13, lineHeight: 1.8, color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0, fontFamily: FONT, fontWeight: 300 }}>{resposta}</p>
          }
        </div>
      )}

      <p style={{ fontSize: 9.5, fontWeight: 700, color: T.textDim, letterSpacing: "0.12em", marginBottom: 10, textTransform: "uppercase", fontFamily: FONT }}>
        Sugestões rápidas
      </p>
      {sugestoes.map((s) => (
        <button key={s} onClick={() => perguntar(s)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          width: "100%", padding: "13px 16px", marginBottom: 7, textAlign: "left",
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
          fontSize: 12, color: T.textMid, cursor: "pointer", fontFamily: FONT,
          fontWeight: 300, transition: "border-color 0.15s",
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
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 480, fontFamily: FONT }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${T.border}` }}>
              {["Cliente", "Último serviço", "Ausente", "Ticket médio", "Score"].map((h) => (
                <th key={h} style={{
                  textAlign: "left", padding: "13px 16px",
                  fontSize: 9, fontWeight: 700, color: T.textDim,
                  textTransform: "uppercase", letterSpacing: "0.10em", whiteSpace: "nowrap",
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => (
              <tr key={c.nome} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? "transparent" : T.surfaceAlt }}>
                <td style={{ padding: "13px 16px", cursor: "pointer" }} onClick={() => onSelecionar(c)}>
                  <div style={{ fontWeight: 600, color: T.text }}>{c.nome}</div>
                  <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{c.telefone || "—"}</div>
                </td>
                <td style={{ padding: "13px 16px", color: T.textMid, fontSize: 11.5, whiteSpace: "nowrap" }}>{c.produtoFavorito || "—"}</td>
                <td style={{ padding: "13px 16px", fontWeight: 600, color: c.diasAusente > 30 ? T.red : T.textMid, whiteSpace: "nowrap" }}>
                  {c.diasAusente != null ? `${c.diasAusente}d` : "—"}
                </td>
                <td style={{ padding: "13px 16px", color: T.gold, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {c.ticketMedio != null ? formatarReal(c.ticketMedio) : "—"}
                </td>
                <td style={{ padding: "13px 16px" }}><RiscoBadge risco={c.risco} T={T} /></td>
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
          borderRadius: 14, padding: "14px 16px", marginBottom: 8, cursor: "pointer",
          fontFamily: FONT,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</div>
              {c.telefone && <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{c.telefone}</div>}
            </div>
            <RiscoBadge risco={c.risco} T={T} />
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            {c.produtoFavorito && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Último serviço</div>
                <div style={{ fontSize: 11.5, color: T.textMid, fontWeight: 300 }}>{c.produtoFavorito}</div>
              </div>
            )}
            {c.diasAusente != null && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Ausente</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: c.diasAusente > 30 ? T.red : T.textMid }}>{c.diasAusente}d</div>
              </div>
            )}
            {c.ticketMedio != null && (
              <div>
                <div style={{ fontSize: 9, color: T.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Ticket médio</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: T.gold }}>{formatarReal(c.ticketMedio)}</div>
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
  function toDate(val) { return val?.toDate ? val.toDate() : new Date(val); }
  function matchNome(a = "", b = "") {
    const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
    return x === y || y.startsWith(x) || x.startsWith(y);
  }
  const historico = vendas.filter((v) => matchNome(v.cliente, cliente.nome)).sort((a, b) => toDate(b.data) - toDate(a.data));
  const faturamentoTotal = historico.reduce((acc, v) => acc + (v.total || 0), 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: "20px", backdropFilter: "blur(6px)" }}>
      <div style={{ background: T.surface, width: "100%", maxWidth: "550px", borderRadius: 20, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", maxHeight: "90vh", boxShadow: "0 24px 60px rgba(0,0,0,0.6)", fontFamily: FONT }}>
        <div style={{ padding: "24px 28px", borderBottom: `1px solid ${T.border}`, position: "relative" }}>
          <div style={{ fontSize: 9, color: T.gold, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 6 }}>Ficha do Cliente</div>
          <h2 style={{ margin: 0, fontSize: 22, color: T.text, letterSpacing: "-0.01em", fontFamily: FONT_DISPLAY, fontWeight: 600 }}>{cliente.nome}</h2>
          <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
            <span style={{ fontSize: 12, color: T.textMid }}>LTV: <b style={{ color: T.green, fontWeight: 600 }}>{formatarReal(faturamentoTotal)}</b></span>
            <span style={{ fontSize: 12, color: T.textMid }}>Serviços: <b style={{ fontWeight: 600 }}>{historico.length}</b></span>
          </div>
          <button onClick={onClose} style={{ position: "absolute", top: 24, right: 24, background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 18, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: "24px 28px", overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.textDim, textTransform: "uppercase", marginBottom: 16, letterSpacing: "0.12em" }}>
            Histórico de Vendas (via Assent Gestão)
          </div>
          {historico.map((v, i) => (
            <div key={i} style={{ padding: "16px 18px", background: T.surfaceAlt, borderRadius: 12, marginBottom: 10, border: `1px solid ${T.borderAlt}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: T.textDim }}>{new Date(v.data).toLocaleDateString("pt-BR")}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.gold, fontFamily: FONT_DISPLAY }}>{formatarReal(v.total)}</span>
              </div>
              <div style={{ fontSize: 13.5, color: T.text, fontWeight: 500 }}>
                {v.itens?.map((item) => item.nome || item.produto).join(", ") || "Serviço"}
              </div>
            </div>
          ))}
          {historico.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: T.textDim, border: `1px dashed ${T.border}`, borderRadius: 12, fontSize: 13 }}>
              Nenhum faturamento registrado no Assent Gestão.
            </div>
          )}
        </div>
        <div style={{ padding: "20px 28px", borderTop: `1px solid ${T.border}` }}>
          <button style={{
            width: "100%", padding: "12px", borderRadius: 10,
            background: T.gold, color: "#000", border: "none",
            fontWeight: 600, cursor: "pointer", fontSize: 12,
            textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: FONT,
          }}>
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
    try { await reativarCliente(empresaId, ig); }
    catch (e) { console.error("Erro ao reativar cliente:", e); }
    finally { setReativando(null); }
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: T.textDim, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Clientes ignorados ({ignorados.length})
        </span>
        <div style={{ flex: 1, height: 1, background: T.border }} />
      </div>

      {ignorados.length === 0 ? (
        <div style={{
          textAlign: "center", padding: "36px 0", color: T.textDim,
          fontSize: 13, border: `1px dashed ${T.border}`, borderRadius: 14, fontWeight: 300,
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
              gap: 12, padding: "13px 16px", marginBottom: 8,
              background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
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
                  fontSize: 11.5, fontWeight: 600, padding: "7px 14px", borderRadius: 8,
                  background: isReativando ? T.surfaceAlt : "none",
                  border: `1px solid ${T.border}`,
                  cursor: isReativando ? "not-allowed" : "pointer",
                  color: isReativando ? T.textDim : T.green,
                  letterSpacing: "0.04em", fontFamily: FONT,
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
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", fontSize: 13, color: TEMAS.dark.textMid,
        background: TEMAS.dark.bg, fontFamily: FONT, gap: 10,
      }}>
        <span style={{ color: TEMAS.dark.gold }}>✦</span> Verificando acesso...
      </div>
    );

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

  const sidebarWidth = bp.isMobile ? 0 : sidebarAberta ? 234 : 60;

  return (
    <div style={{
      display: "flex", height: "100vh", fontFamily: FONT,
      background: T.bg, color: T.text, position: "relative", overflow: "hidden",
    }}>

      {/* Overlay mobile */}
      {bp.isMobile && sidebarAberta && (
        <div onClick={() => setSidebarAberta(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40, backdropFilter: "blur(2px)" }} />
      )}

      {/* ── Sidebar ── */}
      <div style={{
        position: bp.isMobile ? "fixed" : "relative",
        top: 0, left: 0, bottom: 0,
        width: bp.isMobile ? 244 : sidebarWidth,
        zIndex: bp.isMobile ? 50 : 1,
        background: T.surface,
        borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column",
        transition: "width 0.22s ease, transform 0.22s ease",
        transform: bp.isMobile ? (sidebarAberta ? "translateX(0)" : "translateX(-100%)") : "none",
        overflow: "hidden", flexShrink: 0,
      }}>
        {/* Logo + toggle */}
        <div style={{
          padding: "18px 16px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 60,
        }}>
          <div style={{
            overflow: "hidden",
            opacity: sidebarAberta || bp.isMobile ? 1 : 0,
            transition: "opacity 0.15s ease", whiteSpace: "nowrap",
          }}>
            <div style={{
              fontSize: 12.5, fontWeight: 700, letterSpacing: "0.12em",
              color: T.gold, textTransform: "uppercase", fontFamily: FONT,
            }}>CRM Retenção</div>
            <div style={{ fontSize: 9.5, color: T.textDim, marginTop: 2, letterSpacing: "0.06em" }}>via Assent Gestão</div>
          </div>
          {!bp.isMobile && (
            <button
              onClick={() => setSidebarAberta((v) => !v)}
              title={sidebarAberta ? "Recolher menu" : "Expandir menu"}
              style={{
                width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`,
                background: T.surfaceAlt, cursor: "pointer", fontSize: 12,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.textMid, flexShrink: 0, marginLeft: sidebarAberta ? 8 : "auto",
              }}
            >
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
                  borderRadius: 10, marginBottom: 2,
                  border: ativo ? `1px solid ${T.goldBorder}` : "1px solid transparent",
                  background: ativo ? T.goldGlow : "transparent",
                  color: ativo ? T.text : T.textMid,
                  fontSize: 12.5, cursor: "pointer", fontFamily: FONT,
                  fontWeight: ativo ? 500 : 400, transition: "all 0.15s ease",
                  position: "relative",
                }}
              >
                {/* active indicator bar */}
                {ativo && (
                  <div style={{
                    position: "absolute", left: 0, top: "22%", height: "56%",
                    width: 2.5, background: T.gold,
                    borderRadius: "0 2px 2px 0",
                  }} />
                )}
                <span style={{ color: ativo ? T.gold : T.textDim, fontSize: 14, flexShrink: 0 }}>{a.icon}</span>
                {mostrarLabel && (
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.labelFull}</span>
                )}
                {a.badge && mostrarLabel ? (
                  <span style={{
                    marginLeft: "auto", fontSize: 9.5, fontWeight: 700,
                    background: T.red, color: "#fff",
                    borderRadius: 999, padding: "1px 7px", flexShrink: 0,
                  }}>{a.badge}</span>
                ) : a.badge && !mostrarLabel ? (
                  <span style={{ position: "absolute", top: 5, right: 5, width: 7, height: 7, borderRadius: "50%", background: T.red }} />
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Rodapé da sidebar */}
        <div style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 6 }}>
          {sidebarAberta || bp.isMobile ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                  background: T.goldGlow, border: `1px solid ${T.goldBorder}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: T.gold, fontFamily: FONT,
                }}>
                  {(config?.empresa?.nomeEmpresa || usuario?.email || "U")[0].toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {config?.empresa?.nomeEmpresa || "Empresa"}
                  </div>
                  <div style={{ fontSize: 9.5, color: T.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{usuario.email}</div>
                </div>
              </div>
              <button
                onClick={() => signOut(auth)}
                style={{
                  marginTop: 4, fontSize: 11, color: T.textDim,
                  background: "none", border: `1px solid ${T.border}`,
                  cursor: "pointer", padding: "6px 10px", borderRadius: 8,
                  fontFamily: FONT, alignSelf: "flex-start", letterSpacing: "0.03em",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >Sair</button>
            </>
          ) : (
            <button
              onClick={() => signOut(auth)}
              title="Sair"
              style={{
                width: 36, height: 36, borderRadius: 9, border: `1px solid ${T.border}`,
                background: "none", cursor: "pointer", color: T.textDim,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, margin: "0 auto",
              }}
            >↪</button>
          )}
        </div>
      </div>

      {/* ── Área principal ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{
          padding: bp.isMobile ? "12px 16px" : "14px 26px",
          borderBottom: `1px solid ${T.border}`,
          background: T.surface,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {bp.isMobile && (
              <button
                onClick={() => setSidebarAberta((v) => !v)}
                style={{
                  width: 34, height: 34, borderRadius: 9, border: `1px solid ${T.border}`,
                  background: T.surfaceAlt, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: T.textMid, fontSize: 16, flexShrink: 0,
                }}
              >☰</button>
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: bp.isMobile ? 14 : 17,
                fontWeight: 600, color: T.text,
                letterSpacing: "-0.01em",
                fontFamily: FONT_DISPLAY,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {abas.find((a) => a.id === aba)?.labelFull}
              </div>
              {!bp.isMobile && (
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 2, fontFamily: FONT, fontWeight: 300 }}>
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
              )}
            </div>
          </div>

          {/* Right side of header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <NotificacoesLeads
              acoesDisparadas={leadsData.acoesDisparadas}
              leads={leadsData.leads}
              T={T}
              bp={bp}
              onVerLead={() => {}}
            />
            <button
              onClick={alternarTema}
              title={tema === "dark" ? "Modo claro" : "Modo escuro"}
              style={{
                width: 34, height: 34, borderRadius: 9,
                border: `1px solid ${T.border}`,
                background: T.surfaceAlt, cursor: "pointer", fontSize: 15,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: T.textMid,
              }}
            >
              {tema === "dark" ? "☀️" : "🌙"}
            </button>
            {!bp.isMobile && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 11, color: T.green, fontFamily: FONT, fontWeight: 500,
                background: T.greenDim, border: `1px solid ${T.greenBorder}`,
                borderRadius: 999, padding: "5px 12px",
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: T.green, display: "inline-block",
                  animation: "crm-pulse 2.2s ease-in-out infinite",
                }} />
                sincronizado
                <style>{`@keyframes crm-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.75)} }`}</style>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: bp.isMobile ? "16px 14px" : "24px 26px",
          paddingBottom: bp.isMobile ? "72px" : "24px",
        }}>

          {/* ── Radar ── */}
          {aba === "radar" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                <MetricCard T={T} val={metricas?.emRisco || 0}                      label="Em risco alto"    color={T.red}    />
                <MetricCard T={T} val={formatarReal(metricas?.receitaEmRisco || 0)} label="Receita em risco" color={T.yellow}  />
                <MetricCard T={T} val={metricas?.totalClientes || 0}                label="Clientes ativos"  color={T.green}  />
                <MetricCard T={T} val={formatarReal(metricas?.ticketGeral || 0)}    label="Ticket médio"     color={T.gold}   />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: T.textDim, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", fontFamily: FONT }}>
                  Ações prioritárias de hoje
                </span>
                <div style={{ flex: 1, height: 1, background: T.border }} />
              </div>
              {insights.length === 0
                ? <div style={{ textAlign: "center", padding: "48px 0", color: T.textDim, fontSize: 13, border: `1px dashed ${T.border}`, borderRadius: 14, fontFamily: FONT, fontWeight: 300 }}>
                    Nenhum insight gerado ainda.
                  </div>
                : insights.map((ins) => (
                    <InsightCard key={ins.id} insight={ins} empresaNome={config?.empresa?.nomeEmpresa} empresaId={usuario?.empresaId} T={T} />
                  ))
              }
            </>
          )}

          {/* ── Clientes ── */}
          {aba === "clientes" && (
            <>
              <div style={{ marginBottom: 18 }}>
                <input
                  type="text"
                  placeholder="Buscar por nome ou telefone..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  style={{
                    width: "100%", padding: "12px 16px", borderRadius: 12,
                    border: `1px solid ${T.border}`, background: T.surface,
                    color: T.text, fontSize: 13.5, outline: "none",
                    boxSizing: "border-box", fontFamily: FONT, fontWeight: 300,
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = T.gold)}
                  onBlur={(e) => (e.target.style.borderColor = T.border)}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
                <MetricCard T={T} val={clientesFiltrados.filter((c) => c.risco === "alto").length}  label="Risco alto" color={T.red}    />
                <MetricCard T={T} val={clientesFiltrados.filter((c) => c.risco === "medio").length} label="Atenção"    color={T.yellow} />
                <MetricCard T={T} val={clientesFiltrados.filter((c) => c.risco === "baixo").length} label="Fiéis"      color={T.green}  />
              </div>
              {bp.isMobile
                ? <CardsClientes clientes={clientesFiltrados} T={T} onSelecionar={setClienteAtivo} />
                : <TabelaClientes clientes={clientesFiltrados} T={T} onSelecionar={setClienteAtivo} />
              }
              {clientesFiltrados.length === 0 && (
                <div style={{ textAlign: "center", padding: "40px", color: T.textDim, fontFamily: FONT, fontWeight: 300 }}>
                  Nenhum cliente encontrado com "{busca}".
                </div>
              )}
            </>
          )}

          {/* ── IA ── */}
          {aba === "ia" && <AssistenteIA metricas={metricas} clientes={clientes} config={config} T={T} />}

          {/* ── Painel ── */}
          {aba === "painel" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                <MetricCard T={T} val={metricas?.totalClientes || 0}                label="Clientes totais" />
                <MetricCard T={T} val={metricas?.fieis || 0}                        label="Clientes fiéis"  color={T.green}  />
                <MetricCard T={T} val={metricas?.dormentes || 0}                    label="Dormentes +60d"  color={T.yellow} />
                <MetricCard T={T} val={formatarReal(metricas?.receitaRecente || 0)} label="Receita 30d"     color={T.gold}   />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.textDim, marginBottom: 16, letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: FONT }}>Segmentos automáticos</p>
                  {[
                    { label: "Fiéis",            val: metricas?.fieis || 0,     cor: T.green   },
                    { label: "Em risco",         val: metricas?.emRisco || 0,   cor: T.red     },
                    { label: "Dormentes (+60d)", val: metricas?.dormentes || 0, cor: T.yellow  },
                    { label: "Alto valor",       val: clientes.filter((c) => (c.ticketMedio || 0) > 500).length, cor: T.gold },
                    { label: "Novos (1 compra)", val: metricas?.novos || 0,     cor: T.textMid },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 12.5, color: T.textMid, fontFamily: FONT, fontWeight: 300 }}>{s.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: s.cor, fontFamily: FONT_DISPLAY }}>{s.val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, padding: 20 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 700, color: T.textDim, marginBottom: 16, letterSpacing: "0.10em", textTransform: "uppercase", fontFamily: FONT }}>Resumo financeiro</p>
                  {[
                    { label: "Ticket médio geral",  val: formatarReal(metricas?.ticketGeral),    color: T.gold  },
                    { label: "Receita em risco",    val: formatarReal(metricas?.receitaEmRisco), color: T.red   },
                    { label: "Receita últimos 30d", val: formatarReal(metricas?.receitaRecente), color: T.green },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 12.5, color: T.textMid, fontFamily: FONT, fontWeight: 300 }}>{s.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: s.color, fontFamily: FONT_DISPLAY }}>{s.val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Leads ── */}
          {aba === "leads" && (
            <LeadsPage T={T} bp={bp} empresaId={usuario?.empresaId} config={config} />
          )}

          {/* ── Configurações ── */}
          {aba === "config" && (
            <div>
              <ConfigPage T={T} bp={bp} empresaId={usuario?.empresaId} config={config} />
              <div style={{ marginTop: 32 }}>
                <ClientesIgnorados ignorados={ignorados} empresaId={usuario?.empresaId} T={T} />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Bottom Nav (mobile only) ── */}
      {bp.isMobile && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: T.surface, borderTop: `1px solid ${T.border}`,
          display: "flex", zIndex: 30, paddingBottom: "env(safe-area-inset-bottom)",
        }}>
          {abas.map((a) => {
            const ativo = aba === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                style={{
                  flex: 1, padding: "10px 4px 8px",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: FONT, position: "relative",
                }}
              >
                <span style={{ fontSize: 17, color: ativo ? T.gold : T.textDim, transition: "color 0.15s ease" }}>{a.icon}</span>
                <span style={{ fontSize: 9, fontWeight: ativo ? 600 : 400, color: ativo ? T.text : T.textDim, letterSpacing: "0.04em", textTransform: "uppercase" }}>{a.label}</span>
                {a.badge ? <span style={{ position: "absolute", top: 6, right: "calc(50% - 14px)", width: 7, height: 7, borderRadius: "50%", background: T.red }} /> : null}
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
