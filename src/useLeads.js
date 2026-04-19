// useLeads.js
// Módulo de gestão de leads integrado ao CRM Retenção.
// Segue exatamente o mesmo padrão do useCRM.js:
//   - onSnapshot no Firestore (tempo real)
//   - processamento client-side
//   - empresaId como chave de isolamento
//
// Estrutura no Firestore:
//   dadosCRM/{empresaId}  → leads, automacoes, leadEventos, config (slug)
//
// Separado de dados/{empresaId} que pertence ao Assent Gestão (clientes, vendas, serviços).

import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc, setDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
import { db } from "./firebase";

// ─── Scoring de leads (qualificação por engajamento) ─────────────────────────
// Paralelo ao calcularScoreChurn do useCRM, mas para leads de captação.

const PONTOS = {
  form_submit:      10,
  pagina_preco:     20,
  email_aberto:      5,
  email_clicado:     8,
  multiplas_paginas: 10, // 3+ page views
};

export async function removerEventoLead(empresaId, lead, eventoId) {
  const leads = await lerLeads(empresaId);
  const leadsAtualizados = leads.map(l =>
    l.id === lead.id
      ? { ...stripCalculados(l), eventos: (l.eventos || []).filter(e => e.id !== eventoId), atualizadoEm: new Date().toISOString() }
      : l
  );
  await setDoc(doc(db, "dadosCRM", empresaId), { leads: leadsAtualizados }, { merge: true });
}
function calcularScoreLead(lead) {
  const eventos = lead.eventos || [];
  let score = 0;
  const breakdown = {};

  // Form submit
  const forms = eventos.filter(e => e.tipo === "form_submit").length;
  if (forms > 0) {
    breakdown.form_submit = PONTOS.form_submit;
    score += PONTOS.form_submit;
  }

  // Visitou página de preço/planos
  const visitouPreco = eventos.some(e =>
    e.tipo === "page_view" &&
    (e.url || "").match(/preco|pricing|planos|plano/i)
  );
  if (visitouPreco) {
    breakdown.pagina_preco = PONTOS.pagina_preco;
    score += PONTOS.pagina_preco;
  }

  // Emails
  const emailsAbertos = eventos.filter(e => e.tipo === "email_aberto").length;
  if (emailsAbertos > 0) {
    breakdown.email_aberto = emailsAbertos * PONTOS.email_aberto;
    score += breakdown.email_aberto;
  }

  const emailsClicados = eventos.filter(e => e.tipo === "email_clicado").length;
  if (emailsClicados > 0) {
    breakdown.email_clicado = emailsClicados * PONTOS.email_clicado;
    score += breakdown.email_clicado;
  }

  // 3+ page views = engajamento alto
  const pageViews = eventos.filter(e => e.tipo === "page_view").length;
  if (pageViews >= 3) {
    breakdown.multiplas_paginas = PONTOS.multiplas_paginas;
    score += PONTOS.multiplas_paginas;
  }

  return { score, breakdown };
}

// ─── Temperatura do lead ──────────────────────────────────────────────────────
// Análogo ao "risco" dos clientes — aqui indica quão quente está o lead.

function calcularTemperatura(score) {
  if (score >= 30) return "quente";   // pronto pra vendas
  if (score >= 15) return "morno";    // nurturing
  return "frio";                       // topo de funil
}

// ─── Enriquece leads com score e temperatura ──────────────────────────────────

function enriquecerLeads(leads = []) {
  return leads.map(lead => {
    const { score, breakdown } = calcularScoreLead(lead);
    const temperatura = calcularTemperatura(score);

    // Última atividade
    const eventos = [...(lead.eventos || [])].sort(
      (a, b) => new Date(b.criadoEm) - new Date(a.criadoEm)
    );
    const ultimaAtividade = eventos[0]?.criadoEm || lead.criadoEm;
    const diasSemAtividade = ultimaAtividade
      ? Math.floor((Date.now() - new Date(ultimaAtividade)) / 86400000)
      : null;

    // Origem principal (primeiro UTM registrado)
    const primeiroEvento = (lead.eventos || []).find(e => e.utm_source);

    return {
      ...lead,
      score,
      scoreBreakdown: breakdown,
      temperatura,
      ultimaAtividade,
      diasSemAtividade,
      utmSource:   primeiroEvento?.utm_source   || lead.utm_source   || null,
      utmCampanha: primeiroEvento?.utm_campaign || lead.utm_campaign || null,
    };
  });
}

// ─── Métricas de leads ────────────────────────────────────────────────────────

function calcularMetricasLeads(leadsEnriquecidos) {
  const total    = leadsEnriquecidos.length;
  const quentes  = leadsEnriquecidos.filter(l => l.temperatura === "quente").length;
  const mornos   = leadsEnriquecidos.filter(l => l.temperatura === "morno").length;
  const frios    = leadsEnriquecidos.filter(l => l.temperatura === "frio").length;

  const porStatus = {
    novo:        leadsEnriquecidos.filter(l => l.status === "novo").length,
    contactado:  leadsEnriquecidos.filter(l => l.status === "contactado").length,
    qualificado: leadsEnriquecidos.filter(l => l.status === "qualificado").length,
    convertido:  leadsEnriquecidos.filter(l => l.status === "convertido").length,
    perdido:     leadsEnriquecidos.filter(l => l.status === "perdido").length,
  };

  // Score médio
  const scoreMedio = total
    ? Math.round(leadsEnriquecidos.reduce((a, l) => a + l.score, 0) / total)
    : 0;

  // Top campanha
  const campanhas = {};
  leadsEnriquecidos.forEach(l => {
    if (l.utmCampanha) campanhas[l.utmCampanha] = (campanhas[l.utmCampanha] || 0) + 1;
  });
  const topCampanha = Object.entries(campanhas)
    .sort((a, b) => b[1] - a[1])[0] || null;

  return { total, quentes, mornos, frios, porStatus, scoreMedio, topCampanha };
}

// ─── Verifica e dispara automações ───────────────────────────────────────────
// Roda client-side após cada snapshot, igual à lógica de insights do useCRM.

function verificarAutomacoes(leadsEnriquecidos, automacoes = []) {
  const acoes = [];

  automacoes.forEach(auto => {
    if (!auto.ativa) return;

    leadsEnriquecidos.forEach(lead => {
      // Evita disparar duas vezes para o mesmo lead+automação
      const jaDisparou = (lead.automacoesDisparadas || []).includes(auto.id);
      if (jaDisparou) return;

      let disparar = false;

      if (auto.gatilho === "score_acima" && lead.score >= (auto.gatilhoValor || 30)) {
        disparar = true;
      }
      if (auto.gatilho === "form_submit" && (lead.eventos || []).some(e => e.tipo === "form_submit")) {
        disparar = true;
      }
      if (auto.gatilho === "inativo_dias" && lead.diasSemAtividade >= (auto.gatilhoValor || 30)) {
        disparar = true;
      }

      if (disparar) {
        acoes.push({ automacao: auto, lead });
      }
    });
  });

  return acoes;
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useLeads(empresaId) {
  const [estado, setEstado] = useState({
    carregando: true,
    erro: null,
    leads: [],
    metricas: null,
    automacoes: [],
    acoesDisparadas: [],
    config: null,
  });

  useEffect(() => {
    if (!empresaId) return;

    const ref = doc(db, "dadosCRM", empresaId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          // Documento ainda não existe — estado inicial limpo, sem erro
          setEstado(s => ({ ...s, carregando: false, leads: [], automacoes: [], config: {} }));
          return;
        }

        const dados = snap.data();
        const leads      = dados.leads       || [];
        const automacoes = dados.automacoes  || [];
        const config     = dados.config      || {};

        const leadsEnriquecidos = enriquecerLeads(leads);
        const metricas          = calcularMetricasLeads(leadsEnriquecidos);
        const acoesDisparadas   = verificarAutomacoes(leadsEnriquecidos, automacoes);

        setEstado({
          carregando: false,
          erro: null,
          leads: leadsEnriquecidos,
          metricas,
          automacoes,
          acoesDisparadas,
          config,
        });
      },
      (err) => {
        console.error(err);
        setEstado(s => ({ ...s, carregando: false, erro: "Erro ao carregar leads." }));
      }
    );

    return () => unsub();
  }, [empresaId]);

  return estado;
}

// ─── Ações de escrita no Firestore ────────────────────────────────────────────
// Padrão: getDoc → modificar array em memória por id → setDoc merge.
// setDoc com merge cria o documento se não existir — seguro para novos empresaIds.
// Evita arrayRemove/arrayUnion com objetos complexos que exige match exato.

const CAMPOS_CALCULADOS = [
  "score", "scoreBreakdown", "temperatura",
  "ultimaAtividade", "diasSemAtividade", "utmSource", "utmCampanha",
];

function stripCalculados(lead) {
  const limpo = { ...lead };
  CAMPOS_CALCULADOS.forEach(k => delete limpo[k]);
  return limpo;
}

async function lerLeads(empresaId) {
  const snap = await getDoc(doc(db, "dadosCRM", empresaId));
  return snap.exists() ? (snap.data().leads || []) : [];
}

async function lerAutomacoes(empresaId) {
  const snap = await getDoc(doc(db, "dadosCRM", empresaId));
  return snap.exists() ? (snap.data().automacoes || []) : [];
}

/**
 * Adiciona um novo lead. Usa setDoc merge para criar dadosCRM se não existir ainda.
 */
export async function adicionarLead(empresaId, dadosLead) {
  const leads = await lerLeads(empresaId);
  const novoLead = {
    id:           crypto.randomUUID(),
    nome:         dadosLead.nome || "",
    email:        dadosLead.email || "",
    telefone:     dadosLead.telefone || "",
    empresa:      dadosLead.empresa || "",
    cargo:        dadosLead.cargo || "",
    status:       "novo",
    utm_source:   dadosLead.utm_source   || null,
    utm_campaign: dadosLead.utm_campaign || null,
    utm_medium:   dadosLead.utm_medium   || null,
    landingPage:  dadosLead.landingPage  || null,
    eventos: [{
      id:           crypto.randomUUID(),
      tipo:         "form_submit",
      url:          dadosLead.landingPage  || null,
      utm_source:   dadosLead.utm_source   || null,
      utm_campaign: dadosLead.utm_campaign || null,
      criadoEm:     new Date().toISOString(),
    }],
    automacoesDisparadas: [],
    criadoEm:     new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };

  await setDoc(doc(db, "dadosCRM", empresaId), { leads: [...leads, novoLead] }, { merge: true });
  return novoLead;
}

/**
 * Atualiza o status de um lead. Read-modify-write por id.
 */
export async function atualizarStatusLead(empresaId, leadAtual, novoStatus) {
  const leads = await lerLeads(empresaId);
  const leadsAtualizados = leads.map(l =>
    l.id === leadAtual.id
      ? { ...stripCalculados(l), status: novoStatus, atualizadoEm: new Date().toISOString() }
      : l
  );
  await setDoc(doc(db, "dadosCRM", empresaId), { leads: leadsAtualizados }, { merge: true });
}

/**
 * Adiciona um evento a um lead. Read-modify-write por id.
 */
export async function registrarEventoLead(empresaId, leadAtual, evento) {
  const leads = await lerLeads(empresaId);
  const novoEvento = { id: crypto.randomUUID(), criadoEm: new Date().toISOString(), ...evento };

  const leadsAtualizados = leads.map(l =>
    l.id === leadAtual.id
      ? { ...stripCalculados(l), eventos: [...(l.eventos || []), novoEvento], atualizadoEm: new Date().toISOString() }
      : l
  );
  await setDoc(doc(db, "dadosCRM", empresaId), { leads: leadsAtualizados }, { merge: true });
}

/**
 * Remove um lead pelo id.
 */
export async function removerLead(empresaId, leadId) {
  const leads = await lerLeads(empresaId);
  await setDoc(doc(db, "dadosCRM", empresaId), { leads: leads.filter(l => l.id !== leadId) }, { merge: true });
}

/**
 * Cria ou edita uma automação. Read-modify-write por id.
 */
export async function salvarAutomacao(empresaId, automacao, antiga = null) {
  const automacoes = await lerAutomacoes(empresaId);
  const novaAuto = {
    id:           automacao.id || crypto.randomUUID(),
    nome:         automacao.nome,
    ativa:        automacao.ativa !== false,
    gatilho:      automacao.gatilho,
    gatilhoValor: automacao.gatilhoValor || null,
    acao:         automacao.acao,
    acaoDados:    automacao.acaoDados || {},
    criadoEm:     automacao.criadoEm || new Date().toISOString(),
  };

  const atualizadas = antiga
    ? automacoes.map(a => a.id === antiga.id ? novaAuto : a)
    : [...automacoes, novaAuto];

  await setDoc(doc(db, "dadosCRM", empresaId), { automacoes: atualizadas }, { merge: true });
  return novaAuto;
}

/**
 * Remove uma automação pelo id.
 */
export async function removerAutomacao(empresaId, automacao) {
  const automacoes = await lerAutomacoes(empresaId);
  await setDoc(
    doc(db, "dadosCRM", empresaId),
    { automacoes: automacoes.filter(a => a.id !== automacao.id) },
    { merge: true }
  );
}

// ─── Prompt IA para leads ─────────────────────────────────────────────────────
// Mesmo padrão do montarPromptMensagem do useCRM.

export function montarPromptLead(lead, empresaNome) {
  const empresa = empresaNome || "a empresa";
  const system = `Você é assistente de vendas de "${empresa}". Gere apenas o texto da mensagem de WhatsApp — sem aspas, sem introdução. Tom: direto, consultivo, nunca genérico. Máximo 4 linhas. Não mencione sistemas ou inteligência artificial.`;

  const user = `Lead: ${lead.nome}. Score: ${lead.score} (${lead.temperatura}). 
Origem: ${lead.utmCampanha || lead.utmSource || "orgânico"}. 
Status: ${lead.status}. 
Eventos: ${(lead.eventos || []).map(e => e.tipo).join(", ") || "nenhum"}. 
Gere uma mensagem de primeiro contato para WhatsApp.`;

  return { system, user };
}
