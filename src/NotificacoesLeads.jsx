// NotificacoesLeads.jsx
// Badge de notificação + painel de alertas de leads quentes/automações disparadas.
// Recebe `acoesDisparadas` do useLeads e exibe alertas dentro do CRM.
// Não depende de push notification — funciona só com o app aberto.
//
// Props:
//   acoesDisparadas  — array de { automacao, lead } vindo do useLeads
//   leads            — array de leads enriquecidos
//   T                — tema (dark/light)
//   bp               — breakpoints { isMobile }
//   onVerLead        — callback(lead) para abrir o painel lateral do lead

import { useState, useEffect, useRef } from "react";

// ─── Ícones inline (sem lib) ─────────────────────────────────────────────────

function IconSino({ size = 20, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function IconX({ size = 14, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function IconFogo({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2c0 0-5 5.5-5 10a5 5 0 0010 0C17 7.5 12 2 12 2zm0 13a2 2 0 01-2-2c0-2 2-4.5 2-4.5s2 2.5 2 4.5a2 2 0 01-2 2z"/>
    </svg>
  );
}

// ─── Temperatura helpers ─────────────────────────────────────────────────────

function corTemperatura(temp, T) {
  if (temp === "quente") return T.red;
  if (temp === "morno")  return T.yellow;
  return T.blue;
}

function labelTemperatura(temp) {
  if (temp === "quente") return "🔥 Quente";
  if (temp === "morno")  return "🌤 Morno";
  return "❄️ Frio";
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function NotificacoesLeads({ acoesDisparadas = [], leads = [], T, bp, onVerLead }) {
  const [aberto, setAberto]         = useState(false);
  const [vistas, setVistas]         = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("assent_notif_vistas") || "[]")); }
    catch { return new Set(); }
  });
  const painelRef = useRef(null);

  // Leads quentes ainda não contactados (alerta proativo, independente de automações)
  const leadsQuentes = leads.filter(l => l.temperatura === "quente" && l.status === "novo");

  // Une alertas de automações disparadas + leads quentes novos
  const todasNotificacoes = [
    ...acoesDisparadas.map(a => ({
      id:   `auto_${a.automacao.id}_${a.lead.id}`,
      tipo: "automacao",
      lead: a.lead,
      automacao: a.automacao,
      titulo: a.automacao.nome,
      descricao: `Gatilho: ${a.automacao.gatilho.replace("_", " ")} • Score ${a.lead.score}`,
    })),
    ...leadsQuentes.map(l => ({
      id:   `quente_${l.id}`,
      tipo: "lead_quente",
      lead: l,
      titulo: `Lead quente: ${l.nome || l.email || "Sem nome"}`,
      descricao: `Score ${l.score} • ${l.origem || "direto"} • ainda sem contato`,
    })),
  ];

  const naoVistas = todasNotificacoes.filter(n => !vistas.has(n.id));
  const quantidade = naoVistas.length;

  // Fecha ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    function handler(e) {
      if (painelRef.current && !painelRef.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [aberto]);

  function marcarTodasVistas() {
    const novas = new Set([...vistas, ...todasNotificacoes.map(n => n.id)]);
    setVistas(novas);
    localStorage.setItem("assent_notif_vistas", JSON.stringify([...novas]));
  }

  function marcarUmaVista(id) {
    const novas = new Set([...vistas, id]);
    setVistas(novas);
    localStorage.setItem("assent_notif_vistas", JSON.stringify([...novas]));
  }

  function handleVerLead(notif) {
    marcarUmaVista(notif.id);
    setAberto(false);
    onVerLead?.(notif.lead);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: "relative" }} ref={painelRef}>

      {/* Botão sino */}
      <button
        onClick={() => { setAberto(a => !a); if (!aberto && quantidade > 0) {} }}
        style={{
          position:    "relative",
          background:  "none",
          border:      "none",
          cursor:      "pointer",
          padding:     "6px",
          borderRadius: "8px",
          color:        T.textMid,
          display:      "flex",
          alignItems:   "center",
          transition:   "background 0.15s",
        }}
        title="Notificações de leads"
      >
        <IconSino size={20} color={quantidade > 0 ? T.gold : T.textDim} />

        {/* Badge contador */}
        {quantidade > 0 && (
          <span style={{
            position:   "absolute",
            top:        "2px",
            right:      "2px",
            background: T.red,
            color:      "#fff",
            fontSize:   "10px",
            fontWeight: "700",
            borderRadius: "999px",
            minWidth:   "16px",
            height:     "16px",
            display:    "flex",
            alignItems: "center",
            justifyContent: "center",
            padding:    "0 3px",
            lineHeight: 1,
          }}>
            {quantidade > 9 ? "9+" : quantidade}
          </span>
        )}
      </button>

      {/* Painel dropdown */}
      {aberto && (
        <div style={{
          position:    "absolute",
          top:         "calc(100% + 8px)",
          right:       bp?.isMobile ? "-12px" : "0",
          width:       bp?.isMobile ? "calc(100vw - 24px)" : "340px",
          maxHeight:   "420px",
          background:  T.surface,
          border:      `1px solid ${T.border}`,
          borderRadius: "12px",
          boxShadow:   "0 8px 32px rgba(0,0,0,0.18)",
          zIndex:      200,
          display:     "flex",
          flexDirection: "column",
          overflow:    "hidden",
        }}>

          {/* Header do painel */}
          <div style={{
            display:        "flex",
            alignItems:     "center",
            justifyContent: "space-between",
            padding:        "12px 14px",
            borderBottom:   `1px solid ${T.border}`,
            flexShrink:     0,
          }}>
            <span style={{ fontSize: "13px", fontWeight: "600", color: T.text }}>
              Notificações de leads
            </span>
            {quantidade > 0 && (
              <button
                onClick={marcarTodasVistas}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: "11px", color: T.gold, padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                Marcar todas como vistas
              </button>
            )}
          </div>

          {/* Lista de notificações */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {todasNotificacoes.length === 0 ? (
              <div style={{
                padding: "32px 16px", textAlign: "center",
                color: T.textDim, fontSize: "13px",
              }}>
                Nenhuma notificação no momento
              </div>
            ) : (
              todasNotificacoes.map(notif => {
                const jáVista = vistas.has(notif.id);
                const cor     = corTemperatura(notif.lead.temperatura, T);
                return (
                  <div
                    key={notif.id}
                    style={{
                      display:    "flex",
                      gap:        "10px",
                      padding:    "12px 14px",
                      borderBottom: `1px solid ${T.border}`,
                      background: jáVista ? "transparent" : T.surfaceAlt,
                      cursor:     "pointer",
                      transition: "background 0.15s",
                    }}
                    onClick={() => handleVerLead(notif)}
                  >
                    {/* Indicador de temperatura */}
                    <div style={{
                      width: "32px", height: "32px", borderRadius: "8px",
                      background: cor + "22",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: cor, flexShrink: 0,
                    }}>
                      <IconFogo size={16} />
                    </div>

                    {/* Conteúdo */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: "12px", fontWeight: jáVista ? "400" : "600",
                        color: T.text, marginBottom: "2px",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {notif.titulo}
                      </div>
                      <div style={{ fontSize: "11px", color: T.textDim }}>
                        {notif.descricao}
                      </div>
                      <div style={{
                        fontSize: "10px", color: cor, marginTop: "3px", fontWeight: "500",
                      }}>
                        {labelTemperatura(notif.lead.temperatura)}
                      </div>
                    </div>

                    {/* Botão dispensar */}
                    <button
                      onClick={e => { e.stopPropagation(); marcarUmaVista(notif.id); }}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: T.textDim, padding: "2px", alignSelf: "flex-start",
                        flexShrink: 0,
                      }}
                      title="Dispensar"
                    >
                      <IconX size={12} color={T.textDim} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {todasNotificacoes.length > 0 && (
            <div style={{
              padding:      "8px 14px",
              borderTop:    `1px solid ${T.border}`,
              textAlign:    "center",
              flexShrink:   0,
            }}>
              <span style={{ fontSize: "11px", color: T.textDim }}>
                {quantidade > 0
                  ? `${quantidade} não vista${quantidade > 1 ? "s" : ""}`
                  : "Todas vistas"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
