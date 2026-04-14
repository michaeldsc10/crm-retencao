// useLeads.js
// Módulo de gestão de leads integrado ao CRM Retenção.
// Segue exatamente o mesmo padrão do useCRM.js:
//   - onSnapshot no Firestore (tempo real)
//   - processamento client-side
//   - empresaId como chave de isolamento
//
// Estrutura no Firestore:
//   dados/{empresaId}/leads        → array de leads (igual a clientes/vendas)
//   dados/{empresaId}/leadEventos  → array de eventos de comportamento
//   dados/{empresaId}/automacoes   → array de regras de automação
//
// Tudo dentro do mesmo doc que o CRM já usa: dados/{empresaId}
// Sem nova coleção, sem nova config de Firebase.

import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc, arrayUnion, arrayRemove, getDoc } from "firebase/firestore";
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
  });

  useEffect(() => {
    if (!empresaId) return;

    // Usa o mesmo doc do CRM: dados/{empresaId}
    const ref = doc(db, "dados", empresaId);

    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setEstado(s => ({ ...s, carregando: false, erro: "Empresa não encontrada." }));
          return;
        }

        const dados = snap.data();
        const leads      = dados.leads       || [];
        const automacoes = dados.automacoes  || [];

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
// Padrão: getDoc → modificar array em memória por id → updateDoc.
// Evita arrayRemove/arrayUnion com objetos complexos, que exige match exato
// e duplica o lead quando qualquer campo difere.

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
  const snap = await getDoc(doc(db, "dados", empresaId));
  return snap.exists() ? (snap.data().leads || []) : [];
}

/**
 * Adiciona um novo lead ao array leads do doc da empresa.
 */
export async function adicionarLead(empresaId, dadosLead) {
  const ref = doc(db, "dados", empresaId);
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
      id:          crypto.randomUUID(),
      tipo:        "form_submit",
      url:         dadosLead.landingPage  || null,
      utm_source:  dadosLead.utm_source   || null,
      utm_campaign:dadosLead.utm_campaign || null,
      criadoEm:    new Date().toISOString(),
    }],
    automacoesDisparadas: [],
    criadoEm:     new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  };

  await updateDoc(ref, { leads: arrayUnion(novoLead) });
  return novoLead;
}

/**
 * Atualiza o status de um lead (ex: novo → qualificado).
 * Usa read-modify-write por id para evitar duplicação.
 */
export async function atualizarStatusLead(empresaId, leadAtual, novoStatus) {
  const ref  = doc(db, "dados", empresaId);
  const leads = await lerLeads(empresaId);

  const leadsAtualizados = leads.map(l =>
    l.id === leadAtual.id
      ? { ...stripCalculados(l), status: novoStatus, atualizadoEm: new Date().toISOString() }
      : l
  );

  await updateDoc(ref, { leads: leadsAtualizados });
}

/**
 * Adiciona um evento ao array eventos de um lead específico.
 * Usa read-modify-write por id para evitar duplicação.
 */
export async function registrarEventoLead(empresaId, leadAtual, evento) {
  const ref  = doc(db, "dados", empresaId);
  const leads = await lerLeads(empresaId);

  const novoEvento = {
    id:       crypto.randomUUID(),
    criadoEm: new Date().toISOString(),
    ...evento,
  };

  const leadsAtualizados = leads.map(l =>
    l.id === leadAtual.id
      ? {
          ...stripCalculados(l),
          eventos:      [...(l.eventos || []), novoEvento],
          atualizadoEm: new Date().toISOString(),
        }
      : l
  );

  await updateDoc(ref, { leads: leadsAtualizados });
}

/**
 * Remove um lead pelo id.
 */
export async function removerLead(empresaId, leadId) {
  const ref  = doc(db, "dados", empresaId);
  const leads = await lerLeads(empresaId);
  await updateDoc(ref, { leads: leads.filter(l => l.id !== leadId) });
}

/**
 * Cria ou substitui uma automação no array automacoes.
 */
export async function salvarAutomacao(empresaId, automacao, antiga = null) {
  const ref = doc(db, "dados", empresaId);
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

  if (antiga) await updateDoc(ref, { automacoes: arrayRemove(antiga) });
  await updateDoc(ref, { automacoes: arrayUnion(novaAuto) });
  return novaAuto;
}

/**
 * Remove uma automação.
 */
export async function removerAutomacao(empresaId, automacao) {
  const ref = doc(db, "dados", empresaId);
  await updateDoc(ref, { automacoes: arrayRemove(automacao) });
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
