import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./Login";
import { useCRM, montarPromptMensagem } from "./useCRM";

// ─── Temas ────────────────────────────────────────────────────────────────────
const TEMAS = {
  dark: {
    bg:        "#0a0a0b",
    surface:   "#111113",
    surfaceAlt:"#17171a",
    border:    "#222226",
    borderAlt: "#2a2a30",
    text:      "#e8e8ed",
    textMid:   "#8e8e99",
    textDim:   "#4a4a54",
    gold:      "#c9a84c",
    goldDim:   "#7a6230",
    red:       "#e05252",
    redDim:    "#3d1f1f",
    yellow:    "#d4903a",
    yellowDim: "#3a2810",
    green:     "#4aad7a",
    greenDim:  "#1a3028",
    blue:      "#4a8fd4",
    blueDim:   "#1a2840",
  },
  light: {
    bg:        "#f5f5f7",
    surface:   "#ffffff",
    surfaceAlt:"#f0f0f2",
    border:    "#e0e0e5",
    borderAlt: "#d0d0d8",
    text:      "#111113",
    textMid:   "#555560",
    textDim:   "#aaaabc",
    gold:      "#a07828",
    goldDim:   "#f5ead0",
    red:       "#c03030",
    redDim:    "#fde8e8",
    yellow:    "#b06010",
    yellowDim: "#fdf0e0",
    green:     "#1e7a50",
    greenDim:  "#e0f5ea",
    blue:      "#1a5fa0",
    blueDim:   "#e0edf8",
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
    alto:      { label: "Risco alto",    bg: T.redDim,    color: T.red    },
    medio:     { label: "Atenção",       bg: T.yellowDim, color: T.yellow },
    baixo:     { label: "Fiel",          bg: T.greenDim,  color: T.green  },
    indefinido:{ label: "Sem histórico", bg: T.surfaceAlt,color: T.textMid},
  };
  const s = map[risco] || map.indefinido;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 4,
      background: s.bg, color: s.color, letterSpacing: "0.06em",
      textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 5,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

// ─── Card de Métrica ──────────────────────────────────────────────────────────
function MetricCard({ val, label, color, T }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "20px 22px",
      borderTop: `2px solid ${color || T.border}`,
    }}>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || T.text, fontFamily: "monospace", letterSpacing: "-0.02em" }}>{val}</div>
      <div style={{ fontSize: 11, color: T.textMid, marginTop: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
    </div>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ insight, empresaNome, T }) {
  const [msg, setMsg] = useState(null);
  const [gerando, setGerando] = useState(false);

  const cores = {
    risco:        { borda: T.red,   badgeBg: T.redDim,  badgeColor: T.red,  label: "Risco de perda" },
    oportunidade: { borda: T.blue,  badgeBg: T.blueDim, badgeColor: T.blue, label: "Oportunidade" },
    fidelizacao:  { borda: T.green, badgeBg: T.greenDim,badgeColor: T.green,label: "Fidelização" },
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

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${cor.borda}`, borderRadius: 10,
      padding: "18px 20px", marginBottom: 10,
    }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{
          width: 40, height: 40, borderRadius: 8, flexShrink: 0,
          background: cor.badgeBg, color: cor.badgeColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 700,
        }}>
          {insight.cliente ? iniciais(insight.cliente) : "!"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 5 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{insight.cliente || "Alerta"}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
              background: cor.badgeBg, color: cor.badgeColor,
              textTransform: "uppercase", letterSpacing: "0.06em",
            }}>{cor.label}</span>
          </div>
          <p style={{ fontSize: 12, color: T.textMid, lineHeight: 1.6, margin: 0 }}>{insight.descricao}</p>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
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

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button onClick={gerarMensagem} disabled={gerando} style={{
          fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 6,
          background: gerando ? T.surfaceAlt : T.gold,
          color: gerando ? T.textMid : "#000",
          border: "none", cursor: gerando ? "not-allowed" : "pointer",
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>
          {gerando ? "Gerando..." : "✦ Gerar mensagem"}
        </button>
        {insight.telefone && (
          <button onClick={() => window.open(`https://wa.me/55${telLimpo}`, "_blank")} style={{
            fontSize: 11, fontWeight: 600, padding: "7px 14px", borderRadius: 6,
            background: "none", border: `1px solid ${T.border}`,
            cursor: "pointer", color: T.textMid,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>WhatsApp</button>
        )}
      </div>

      {msg && (
        <div style={{
          marginTop: 14, background: T.surfaceAlt, borderRadius: 8,
          padding: "14px 16px", border: `1px solid ${T.borderAlt}`,
        }}>
          <p style={{
            fontSize: 13, lineHeight: 1.7, margin: 0, color: T.text,
            whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}>{msg}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            {telLimpo && (
              <button onClick={() => window.open(`https://wa.me/55${telLimpo}?text=${encodeURIComponent(msg)}`, "_blank")} style={{
                fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 6,
                background: T.green, color: "#fff", border: "none", cursor: "pointer",
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}>↗ Enviar no WhatsApp</button>
            )}
            <button onClick={gerarMensagem} style={{
              fontSize: 11, padding: "6px 12px", borderRadius: 6,
              background: "none", border: `1px solid ${T.border}`,
              cursor: "pointer", color: T.textMid,
            }}>↺ Regenerar</button>
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

  const contexto = metricas ? `
Empresa: ${config?.empresaNome || "não identificada"}.
Clientes ativos: ${metricas.totalClientes}.
Em risco alto: ${metricas.emRisco}.
Dormentes (+60d): ${metricas.dormentes}.
Fiéis: ${metricas.fieis}.
Ticket médio geral: ${formatarReal(metricas.ticketGeral)}.
Receita em risco: ${formatarReal(metricas.receitaEmRisco)}.
Clientes em risco: ${clientes.filter(c => c.risco === "alto").map(c => `${c.nome} (${c.diasAusente}d ausente)`).join(", ") || "nenhum"}.
  `.trim() : "";

  async function perguntar(q) {
    const texto = q || pergunta;
    if (!texto.trim()) return;
    setPensando(true); setResposta(null);
    try {
      const r = await chamarIA(
        `Você é um consultor especialista em retenção de clientes para pequenos negócios brasileiros, trabalhando para "${config?.empresaNome || "esta empresa"}".
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
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: T.textMid, marginBottom: 14, lineHeight: 1.6 }}>
          Faça qualquer pergunta sobre seus clientes. A IA analisa os dados em tempo real.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={pergunta}
            onChange={e => setPergunta(e.target.value)}
            onKeyDown={e => e.key === "Enter" && perguntar()}
            placeholder="Ex: quem devo priorizar hoje?"
            style={{
              flex: 1, padding: "10px 14px", borderRadius: 7, fontSize: 13,
              border: `1px solid ${T.borderAlt}`, outline: "none",
              fontFamily: "inherit", background: T.surfaceAlt, color: T.text,
            }}
          />
          <button onClick={() => perguntar()} disabled={pensando} style={{
            padding: "10px 18px", borderRadius: 7, fontSize: 11, fontWeight: 700,
            background: pensando ? T.surfaceAlt : T.gold,
            color: pensando ? T.textMid : "#000",
            border: "none", cursor: pensando ? "not-allowed" : "pointer",
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            {pensando ? "..." : "✦ Perguntar"}
          </button>
        </div>
      </div>

      {(resposta || pensando) && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: T.gold, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
            ✦ Assistente IA
          </p>
          {pensando
            ? <p style={{ fontSize: 13, color: T.textMid }}>Analisando dados...</p>
            : <p style={{ fontSize: 13, lineHeight: 1.8, color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{resposta}</p>
          }
        </div>
      )}

      <p style={{ fontSize: 10, fontWeight: 700, color: T.textDim, letterSpacing: "0.12em", marginBottom: 12, textTransform: "uppercase" }}>
        Sugestões rápidas
      </p>
      {sugestoes.map((s) => (
        <button key={s} onClick={() => perguntar(s)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          width: "100%", padding: "13px 16px", marginBottom: 6, textAlign: "left",
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
          fontSize: 12, color: T.textMid, cursor: "pointer", fontFamily: "inherit",
        }}>
          {s} <span style={{ color: T.textDim, fontSize: 14 }}>→</span>
        </button>
      ))}
    </div>
  );
}

// ─── App Principal ────────────────────────────────────────────────────────────
export default function App() {
  const [aba, setAba] = useState("radar");
  const [usuario, setUsuario] = useState(null);
  const [verificando, setVerificando] = useState(true);
  const [tema, setTema] = useState(() => localStorage.getItem("crm-tema") || "dark");

  const T = TEMAS[tema];

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

  const { clientes, insights, metricas, config } = useCRM(usuario?.empresaId);

  if (verificando) return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", fontSize: 13, color: T.textMid, background: T.bg,
      fontFamily: "system-ui, sans-serif", gap: 10,
    }}>
      <span style={{ color: T.gold }}>✦</span> Verificando acesso...
    </div>
  );

  if (!usuario) return <Login onLogin={setUsuario} />;

  const abas = [
    { id: "radar",    icon: "◈", label: "Radar do dia",  badge: insights.length || null },
    { id: "clientes", icon: "◉", label: "Clientes",       badge: null },
    { id: "ia",       icon: "✦", label: "Assistente IA",  badge: null },
    { id: "painel",   icon: "▦", label: "Painel",         badge: null },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: T.bg, color: T.text }}>

      {/* Sidebar */}
      <div style={{ width: 230, background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.16em", color: T.gold, textTransform: "uppercase" }}>
            CRM Retenção
          </div>
          <div style={{ fontSize: 10, color: T.textDim, marginTop: 3, letterSpacing: "0.06em" }}>via Assent Gestão</div>
        </div>

        <nav style={{ flex: 1, padding: "12px 10px" }}>
          {abas.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "9px 12px", borderRadius: 7, marginBottom: 2,
              border: "none",
              background: aba === a.id ? T.surfaceAlt : "transparent",
              color: aba === a.id ? T.text : T.textMid,
              fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              fontWeight: aba === a.id ? 600 : 400,
            }}>
              <span style={{ color: aba === a.id ? T.gold : T.textDim, fontSize: 13 }}>{a.icon}</span>
              {a.label}
              {a.badge ? (
                <span style={{
                  marginLeft: "auto", fontSize: 10, fontWeight: 700,
                  background: T.red, color: "#fff",
                  borderRadius: 4, padding: "1px 6px",
                }}>{a.badge}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {config?.empresaNome || "Empresa"}
          </div>
          <div style={{ fontSize: 10, color: T.textDim, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {usuario.email}
          </div>
          <button onClick={() => signOut(auth)} style={{
            marginTop: 10, fontSize: 10, color: T.textDim, background: "none",
            border: `1px solid ${T.border}`, cursor: "pointer", padding: "5px 10px",
            borderRadius: 5, fontFamily: "inherit",
          }}>Sair</button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{
          padding: "16px 28px", borderBottom: `1px solid ${T.border}`,
          background: T.surface, display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>
              {abas.find(a => a.id === aba)?.label}
            </div>
            <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Botão de tema */}
            <button onClick={alternarTema} title={tema === "dark" ? "Modo claro" : "Modo escuro"} style={{
              width: 34, height: 34, borderRadius: 8, border: `1px solid ${T.border}`,
              background: T.surfaceAlt, cursor: "pointer", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: T.textMid,
            }}>
              {tema === "dark" ? "☀️" : "🌙"}
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.green }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.green, display: "inline-block" }} />
              sincronizado
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>

          {aba === "radar" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                <MetricCard T={T} val={metricas?.emRisco || 0}                      label="Em risco alto"    color={T.red} />
                <MetricCard T={T} val={formatarReal(metricas?.receitaEmRisco || 0)} label="Receita em risco" color={T.yellow} />
                <MetricCard T={T} val={metricas?.totalClientes || 0}                label="Clientes ativos"  color={T.green} />
                <MetricCard T={T} val={formatarReal(metricas?.ticketGeral || 0)}    label="Ticket médio"     color={T.gold} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: T.textDim, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  Ações prioritárias de hoje
                </span>
                <div style={{ flex: 1, height: 1, background: T.border }} />
              </div>
              {insights.length === 0
                ? <div style={{ textAlign: "center", padding: "60px 0", color: T.textDim, fontSize: 13, border: `1px dashed ${T.border}`, borderRadius: 10 }}>
                    Nenhum insight gerado ainda.
                  </div>
                : insights.map((ins) => <InsightCard key={ins.id} insight={ins} empresaNome={config?.empresaNome} T={T} />)
              }
            </>
          )}

          {aba === "clientes" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
                <MetricCard T={T} val={clientes.filter(c => c.risco === "alto").length}  label="Risco alto" color={T.red} />
                <MetricCard T={T} val={clientes.filter(c => c.risco === "medio").length} label="Atenção"    color={T.yellow} />
                <MetricCard T={T} val={clientes.filter(c => c.risco === "baixo").length} label="Fiéis"      color={T.green} />
              </div>
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      {["Cliente", "Último serviço", "Ausente", "Ticket médio", "Score"].map(h => (
                        <th key={h} style={{
                          textAlign: "left", padding: "12px 16px",
                          fontSize: 9, fontWeight: 700, color: T.textDim,
                          textTransform: "uppercase", letterSpacing: "0.1em",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...clientes]
                      .sort((a, b) => ({ alto: 0, medio: 1, baixo: 2, indefinido: 3 }[a.risco] || 3) - ({ alto: 0, medio: 1, baixo: 2, indefinido: 3 }[b.risco] || 3))
                      .map((c, i) => (
                        <tr key={c.nome} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? "transparent" : T.surfaceAlt }}>
                          <td style={{ padding: "14px 16px" }}>
                            <div style={{ fontWeight: 600, color: T.text }}>{c.nome}</div>
                            <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{c.telefone || "—"}</div>
                          </td>
                          <td style={{ padding: "14px 16px", color: T.textMid, fontSize: 11 }}>{c.produtoFavorito || "—"}</td>
                          <td style={{ padding: "14px 16px", fontWeight: 600, color: c.diasAusente > 30 ? T.red : T.textMid }}>
                            {c.diasAusente != null ? `${c.diasAusente}d` : "—"}
                          </td>
                          <td style={{ padding: "14px 16px", color: T.gold, fontWeight: 600 }}>
                            {c.ticketMedio != null ? formatarReal(c.ticketMedio) : "—"}
                          </td>
                          <td style={{ padding: "14px 16px" }}><RiscoBadge risco={c.risco} T={T} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {aba === "ia" && <AssistenteIA metricas={metricas} clientes={clientes} config={config} T={T} />}

          {aba === "painel" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                <MetricCard T={T} val={metricas?.totalClientes || 0}                label="Clientes totais" />
                <MetricCard T={T} val={metricas?.fieis || 0}                        label="Clientes fiéis"  color={T.green} />
                <MetricCard T={T} val={metricas?.dormentes || 0}                    label="Dormentes +60d"  color={T.yellow} />
                <MetricCard T={T} val={formatarReal(metricas?.receitaRecente || 0)} label="Receita 30d"     color={T.gold} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: T.textDim, marginBottom: 16, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Segmentos automáticos
                  </p>
                  {[
                    { label: "Fiéis",            val: metricas?.fieis || 0,     cor: T.green },
                    { label: "Em risco",         val: metricas?.emRisco || 0,   cor: T.red },
                    { label: "Dormentes (+60d)", val: metricas?.dormentes || 0, cor: T.yellow },
                    { label: "Alto valor",       val: clientes.filter(c => (c.ticketMedio || 0) > 500).length, cor: T.gold },
                    { label: "Novos (1 compra)", val: metricas?.novos || 0,     cor: T.textMid },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 12, color: T.textMid }}>{s.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: s.cor }}>{s.val}</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: T.textDim, marginBottom: 16, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    Resumo financeiro
                  </p>
                  {[
                    { label: "Ticket médio geral",  val: formatarReal(metricas?.ticketGeral),    color: T.gold },
                    { label: "Receita em risco",    val: formatarReal(metricas?.receitaEmRisco), color: T.red },
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
        </div>
      </div>
    </div>
  );
}
