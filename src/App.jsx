import { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import Login from "./Login";
import { useCRM, montarPromptMensagem } from "./useCRM";

function iniciais(nome = "") {
  return nome.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function formatarReal(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor || 0);
}

async function chamarIA(system, user) {
  const r = await fetch("/api/ia", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, user }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Erro na IA");
  return d.texto;
}

function RiscoBadge({ risco }) {
  const map = {
    alto:      { label: "risco alto",    bg: "#FCEBEB", color: "#A32D2D" },
    medio:     { label: "atenção",       bg: "#FAEEDA", color: "#854F0B" },
    baixo:     { label: "fiel",          bg: "#EAF3DE", color: "#3B6D11" },
    indefinido:{ label: "sem histórico", bg: "#F1EFE8", color: "#5F5E5A" },
  };
  const s = map[risco] || map.indefinido;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function InsightCard({ insight, empresaNome }) {
  const [msg, setMsg] = useState(null);
  const [gerando, setGerando] = useState(false);

  const cores = {
    risco:       { borda: "#E24B4A", badgeBg: "#FCEBEB", badgeColor: "#A32D2D", label: "Risco de perda" },
    oportunidade:{ borda: "#378ADD", badgeBg: "#E6F1FB", badgeColor: "#185FA5", label: "Oportunidade" },
    fidelizacao: { borda: "#1D9E75", badgeBg: "#E1F5EE", badgeColor: "#0F6E56", label: "Fidelização" },
  };
  const cor = cores[insight.tipo] || cores.risco;

  async function gerarMensagem() {
    setGerando(true);
    setMsg(null);
    try {
      const { system, user } = montarPromptMensagem(insight, empresaNome);
      const texto = await chamarIA(system, user);
      setMsg(texto);
    } catch {
      setMsg("Erro ao gerar mensagem. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  const telLimpo = (insight.telefone || "").replace(/\D/g, "");

  return (
    <div style={{
      background: "#fff", border: "0.5px solid #e5e5e3",
      borderLeft: `3px solid ${cor.borda}`,
      borderRadius: 12, padding: 16, marginBottom: 10,
    }}>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: cor.badgeBg, color: cor.badgeColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, fontWeight: 600,
        }}>
          {insight.cliente ? iniciais(insight.cliente) : "!"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{insight.cliente || "Alerta"}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: cor.badgeBg, color: cor.badgeColor }}>
              {cor.label}
            </span>
          </div>
          <p style={{ fontSize: 12, color: "#888", lineHeight: 1.5, margin: 0 }}>{insight.descricao}</p>
          <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
            {insight.diasAusente != null && (
              <span style={{ fontSize: 11, color: "#aaa" }}>ausente há <strong style={{ color: "#333" }}>{insight.diasAusente}d</strong></span>
            )}
            {insight.ticketMedio != null && (
              <span style={{ fontSize: 11, color: "#aaa" }}>ticket <strong style={{ color: "#333" }}>{formatarReal(insight.ticketMedio)}</strong></span>
            )}
            {insight.preco != null && (
              <span style={{ fontSize: 11, color: "#aaa" }}>potencial <strong style={{ color: "#333" }}>+{formatarReal(insight.preco)}</strong></span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button onClick={gerarMensagem} disabled={gerando} style={{
          fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 7,
          background: "#185FA5", color: "#fff", border: "none", cursor: "pointer",
          opacity: gerando ? 0.6 : 1,
        }}>
          {gerando ? "Gerando..." : "✦ Gerar mensagem"}
        </button>
        {insight.telefone && (
          <button onClick={() => window.open(`https://wa.me/55${telLimpo}`, "_blank")} style={{
            fontSize: 12, fontWeight: 500, padding: "7px 14px", borderRadius: 7,
            background: "none", border: "0.5px solid #ddd", cursor: "pointer", color: "#555",
          }}>
            WhatsApp
          </button>
        )}
      </div>

      {msg && (
        <div style={{ marginTop: 12, background: "#f7f7f5", borderRadius: 8, padding: 14, border: "0.5px solid #e5e5e3" }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{msg}</p>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            {telLimpo && (
              <button onClick={() => window.open(`https://wa.me/55${telLimpo}?text=${encodeURIComponent(msg)}`, "_blank")} style={{
                fontSize: 12, fontWeight: 500, padding: "6px 12px", borderRadius: 6,
                background: "#185FA5", color: "#fff", border: "none", cursor: "pointer",
              }}>
                ↗ Enviar no WhatsApp
              </button>
            )}
            <button onClick={gerarMensagem} style={{
              fontSize: 12, padding: "6px 12px", borderRadius: 6,
              background: "none", border: "0.5px solid #ddd", cursor: "pointer", color: "#555",
            }}>
              ↺ Regenerar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AssistenteIA({ metricas, clientes, config }) {
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
    setPensando(true);
    setResposta(null);
    try {
      const r = await chamarIA(
        `Você é consultor de retenção de clientes para pequenos negócios. Responda de forma direta e prática, com números quando possível. Máximo 6 linhas. Contexto: ${contexto}`,
        texto
      );
      setResposta(r);
    } catch {
      setResposta("Erro ao conectar com a IA.");
    } finally {
      setPensando(false);
      setPergunta("");
    }
  }

  const sugestoes = [
    "Quais clientes tenho risco de perder essa semana?",
    "Como posso aumentar meu ticket médio?",
    "Que campanha posso fazer para recuperar clientes dormentes?",
    "Quem são meus clientes mais valiosos?",
  ];

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <p style={{ fontSize: 12, color: "#888", marginBottom: 12, lineHeight: 1.5 }}>
          Faça qualquer pergunta sobre seus clientes. A IA analisa os dados do Assent Gestão em tempo real.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={pergunta}
            onChange={e => setPergunta(e.target.value)}
            onKeyDown={e => e.key === "Enter" && perguntar()}
            placeholder="Ex: quem devo priorizar hoje?"
            style={{ flex: 1, padding: "9px 12px", borderRadius: 8, fontSize: 13, border: "0.5px solid #ddd", outline: "none", fontFamily: "inherit" }}
          />
          <button onClick={() => perguntar()} disabled={pensando} style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500,
            background: "#185FA5", color: "#fff", border: "none", cursor: "pointer",
            opacity: pensando ? 0.6 : 1,
          }}>
            {pensando ? "..." : "✦ Perguntar"}
          </button>
        </div>
      </div>

      {(resposta || pensando) && (
        <div style={{ background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: "#185FA5", letterSpacing: "0.08em", marginBottom: 10 }}>✦ ASSISTENTE IA</p>
          {pensando
            ? <p style={{ fontSize: 13, color: "#aaa" }}>Analisando dados...</p>
            : <p style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{resposta}</p>
          }
        </div>
      )}

      <p style={{ fontSize: 11, fontWeight: 600, color: "#aaa", letterSpacing: "0.08em", marginBottom: 10, textTransform: "uppercase" }}>Sugestões rápidas</p>
      {sugestoes.map((s) => (
        <button key={s} onClick={() => perguntar(s)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          width: "100%", padding: "11px 14px", marginBottom: 8, textAlign: "left",
          background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: 8,
          fontSize: 12, color: "#555", cursor: "pointer", fontFamily: "inherit",
        }}>
          {s} <span style={{ color: "#bbb" }}>→</span>
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [aba, setAba] = useState("radar");
  const [usuario, setUsuario] = useState(null);
  const [verificando, setVerificando] = useState(true);

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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 14, color: "#888" }}>
      Verificando acesso...
    </div>
  );

  if (!usuario) return <Login onLogin={setUsuario} />;

  const abas = [
    { id: "radar",    label: "Radar do dia", badge: insights.length || null },
    { id: "clientes", label: "Clientes",      badge: null },
    { id: "ia",       label: "Assistente IA", badge: null },
    { id: "painel",   label: "Painel",        badge: null },
  ];

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: "#fafaf9" }}>
      <div style={{ width: 220, background: "#fff", borderRight: "0.5px solid #e5e5e3", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "20px 18px 16px", borderBottom: "0.5px solid #e5e5e3" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#22c55e", marginRight: 6 }} />
            CRM Retenção
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>via Assent Gestão</div>
        </div>

        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {abas.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "9px 12px", borderRadius: 8, marginBottom: 2,
              border: "none", background: aba === a.id ? "#f1f0ec" : "none",
              color: aba === a.id ? "#111" : "#888", fontSize: 13, cursor: "pointer",
              fontFamily: "inherit", fontWeight: aba === a.id ? 500 : 400,
            }}>
              {a.label}
              {a.badge ? (
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: "#E24B4A", color: "#fff", borderRadius: 10, padding: "2px 6px" }}>
                  {a.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div style={{ padding: "14px 18px", borderTop: "0.5px solid #e5e5e3" }}>
          <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {config?.empresaNome || "Empresa"}
          </div>
          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{usuario.email}</div>
          <button onClick={() => signOut(auth)} style={{
            marginTop: 8, fontSize: 11, color: "#aaa", background: "none",
            border: "none", cursor: "pointer", padding: 0, fontFamily: "inherit",
          }}>
            Sair
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: "0.5px solid #e5e5e3", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{abas.find(a => a.id === aba)?.label}</div>
            <div style={{ fontSize: 12, color: "#888" }}>
              {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>
          <span style={{ fontSize: 11, color: "#22c55e" }}>● sincronizado</span>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {aba === "radar" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { val: metricas?.emRisco || 0,                      lbl: "em risco alto",   cor: "#E24B4A" },
                  { val: formatarReal(metricas?.receitaEmRisco || 0), lbl: "receita em risco", cor: "#F59E0B" },
                  { val: metricas?.totalClientes || 0,                lbl: "clientes ativos",  cor: "#22c55e" },
                  { val: formatarReal(metricas?.ticketGeral || 0),    lbl: "ticket médio",     cor: "#185FA5" },
                ].map((m) => (
                  <div key={m.lbl} style={{ background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 22, fontWeight: 600, color: m.cor }}>{m.val}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>{m.lbl}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "#aaa", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                Ações prioritárias de hoje
              </p>
              {insights.length === 0
                ? <div style={{ textAlign: "center", padding: "40px 0", color: "#aaa", fontSize: 13 }}>Nenhum insight gerado ainda.</div>
                : insights.map((ins) => <InsightCard key={ins.id} insight={ins} empresaNome={config?.empresaNome} />)
              }
            </>
          )}

          {aba === "clientes" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  { val: clientes.filter(c => c.risco === "alto").length,  lbl: "risco alto", cor: "#E24B4A" },
                  { val: clientes.filter(c => c.risco === "medio").length, lbl: "atenção",    cor: "#F59E0B" },
                  { val: clientes.filter(c => c.risco === "baixo").length, lbl: "fiéis",      cor: "#22c55e" },
                ].map((m) => (
                  <div key={m.lbl} style={{ background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 20, fontWeight: 600, color: m.cor }}>{m.val}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>{m.lbl}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "0.5px solid #e5e5e3" }}>
                      {["Cliente", "Último serviço", "Ausente", "Ticket médio", "Score"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 10, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...clientes].sort((a, b) => ({ alto: 0, medio: 1, baixo: 2, indefinido: 3 }[a.risco] || 3) - ({ alto: 0, medio: 1, baixo: 2, indefinido: 3 }[b.risco] || 3))
                      .map((c) => (
                        <tr key={c.nome} style={{ borderBottom: "0.5px solid #f0f0ee" }}>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 500 }}>{c.nome}</div>
                            <div style={{ fontSize: 11, color: "#aaa" }}>{c.telefone || "—"}</div>
                          </td>
                          <td style={{ padding: "12px 14px", color: "#888", fontSize: 12 }}>{c.produtoFavorito || "—"}</td>
                          <td style={{ padding: "12px 14px", fontWeight: 500, color: c.diasAusente > 30 ? "#E24B4A" : "#333" }}>
                            {c.diasAusente != null ? `${c.diasAusente}d` : "—"}
                          </td>
                          <td style={{ padding: "12px 14px", fontSize: 12 }}>{c.ticketMedio != null ? formatarReal(c.ticketMedio) : "—"}</td>
                          <td style={{ padding: "12px 14px" }}><RiscoBadge risco={c.risco} /></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {aba === "ia" && <AssistenteIA metricas={metricas} clientes={clientes} config={config} />}

          {aba === "painel" && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                {[
                  { val: metricas?.totalClientes || 0,                lbl: "clientes totais" },
                  { val: metricas?.fieis || 0,                        lbl: "clientes fiéis" },
                  { val: metricas?.dormentes || 0,                    lbl: "dormentes (+60d)" },
                  { val: formatarReal(metricas?.receitaRecente || 0), lbl: "receita últimos 30d" },
                ].map((m) => (
                  <div key={m.lbl} style={{ background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 22, fontWeight: 600 }}>{m.val}</div>
                    <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>{m.lbl}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div style={{ background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: 10, padding: 16 }}>
                  <p style={{ fontSize: 11, color: "#aaa", marginBottom: 14 }}>Segmentos automáticos</p>
                  {[
                    { label: "Fiéis",            val: metricas?.fieis || 0,     cor: "#22c55e" },
                    { label: "Em risco",         val: metricas?.emRisco || 0,   cor: "#E24B4A" },
                    { label: "Dormentes (+60d)", val: metricas?.dormentes || 0, cor: "#F59E0B" },
                    { label: "Alto valor",       val: clientes.filter(c => (c.ticketMedio || 0) > 500).length, cor: "#185FA5" },
                    { label: "Novos (1 compra)", val: metricas?.novos || 0,     cor: "#888" },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid #f0f0ee" }}>
                      <span style={{ fontSize: 13 }}>{s.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: s.cor }}>{s.val} clientes</span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#fff", border: "0.5px solid #e5e5e3", borderRadius: 10, padding: 16 }}>
                  <p style={{ fontSize: 11, color: "#aaa", marginBottom: 14 }}>Resumo financeiro</p>
                  {[
                    { label: "Ticket médio geral",  val: formatarReal(metricas?.ticketGeral) },
                    { label: "Receita em risco",    val: formatarReal(metricas?.receitaEmRisco) },
                    { label: "Receita últimos 30d", val: formatarReal(metricas?.receitaRecente) },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "0.5px solid #f0f0ee" }}>
                      <span style={{ fontSize: 13, color: "#555" }}>{s.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{s.val}</span>
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
