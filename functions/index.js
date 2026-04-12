const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// ─── Helpers compartilhados ──────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function setCors(res) {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
}

function calcularScore(dados) {
  let score = 0;
  const { utm_source, utm_medium, landingPage, nome, email, telefone } = dados;
  if (nome?.trim())     score += 5;
  if (email?.trim())    score += 5;
  if (telefone?.trim()) score += 5;
  if (utm_medium === "cpc" || utm_medium === "paid") score += 15;
  if (utm_source === "google")                       score += 10;
  if (utm_source === "instagram" || utm_source === "facebook") score += 8;
  const paginaPreco = landingPage && /prec[oi]|plano|plan|pricing/i.test(landingPage);
  if (paginaPreco) score += 20;
  score += 10;
  return Math.min(score, 100);
}

function calcularTemperatura(score) {
  if (score >= 50) return "quente";
  if (score >= 25) return "morno";
  return "frio";
}

function validarCaptura(body) {
  const erros = [];
  if (!body.empresaId || typeof body.empresaId !== "string")
    erros.push("empresaId é obrigatório e deve ser string");
  if (!body.nome && !body.email && !body.telefone)
    erros.push("Informe ao menos um de: nome, email, telefone");
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
    erros.push("email inválido");
  return erros;
}

// ─── Cloud Function 1: capturarLead ─────────────────────────────────────────
// POST público (sem auth) — chamado pelos formulários das landing pages

exports.capturarLead = onRequest(
  {
    region: "southamerica-east1",
    cors: false,
    timeoutSeconds: 10,
    maxInstances: 50,
  },
  async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST")
      return res.status(405).json({ ok: false, erro: "Método não permitido" });

    const body  = req.body || {};
    const erros = validarCaptura(body);
    if (erros.length > 0) return res.status(400).json({ ok: false, erros });

    const {
      empresaId,
      nome = "", email = "", telefone = "",
      utm_source = "", utm_campaign = "", utm_medium = "",
      landingPage = "",
    } = body;

    const score       = calcularScore({ utm_source, utm_medium, landingPage, nome, email, telefone });
    const temperatura = calcularTemperatura(score);
    const agora       = Date.now();

    const novoLead = {
      id:          `lead_${agora}_${Math.random().toString(36).slice(2, 8)}`,
      nome:        nome.trim(),
      email:       email.trim().toLowerCase(),
      telefone:    telefone.trim(),
      score,
      temperatura,
      status:      "novo",
      origem:      utm_source || "direto",
      utm:         { source: utm_source, campaign: utm_campaign, medium: utm_medium },
      landingPage,
      eventos: [{
        tipo:      "form_submit",
        timestamp: agora,
        descricao: `Formulário enviado via ${landingPage || "landing page"}`,
        pontos:    10,
      }],
      automacoesDisparadas: [],
      criadoEm:    agora,
      atualizadoEm: agora,
    };

    try {
      await db.collection("leads").doc(empresaId).set(
        { leads: FieldValue.arrayUnion(novoLead), atualizadoEm: agora },
        { merge: true }
      );
      console.log(`[capturarLead] ${empresaId} | score:${score} | ${temperatura}`);
      return res.status(200).json({
        ok: true, leadId: novoLead.id, score, temperatura,
        mensagem: "Lead capturado com sucesso",
      });
    } catch (err) {
      console.error("[capturarLead] Erro:", err);
      return res.status(500).json({ ok: false, erro: "Erro interno ao salvar lead" });
    }
  }
);

// ─── Cloud Function 2: dispararAutomacoes ────────────────────────────────────
// Roda automaticamente toda vez que leads/{empresaId} muda no Firestore.
// Verifica automações ativas e dispara webhooks — funciona 24/7.

exports.dispararAutomacoes = onDocumentWritten(
  {
    document:      "leads/{empresaId}",
    region:        "southamerica-east1",
    timeoutSeconds: 30,
    maxInstances:  10,
  },
  async (event) => {
    const empresaId  = event.params.empresaId;
    const depois     = event.data?.after?.data();
    const antes      = event.data?.before?.data();

    if (!depois) return;

    const leads      = depois.leads      || [];
    const automacoes = depois.automacoes || [];
    const leadsAntes = antes?.leads      || [];

    const idsAntes = new Set(leadsAntes.map(l => l.id));

    // Só processa automações de webhook com URL configurada
    const webhooksAtivos = automacoes.filter(
      a => a.ativa && a.acao === "webhook" && a.acaoDados?.url
    );
    if (webhooksAtivos.length === 0) return;

    const tarefas = [];

    leads.forEach(lead => {
      const ehNovo = !idsAntes.has(lead.id);

      webhooksAtivos.forEach(auto => {
        if ((lead.automacoesDisparadas || []).includes(auto.id)) return;

        let disparar = false;
        if (auto.gatilho === "form_submit" && ehNovo) disparar = true;
        if (auto.gatilho === "score_acima" && lead.score >= (auto.gatilhoValor || 30)) disparar = true;
        if (auto.gatilho === "inativo_dias") {
          const dias = Math.floor((Date.now() - (lead.atualizadoEm || lead.criadoEm || 0)) / 86400000);
          if (dias >= (auto.gatilhoValor || 30)) disparar = true;
        }

        if (!disparar) return;

        const payload = {
          evento:    auto.gatilho,
          automacao: { id: auto.id, nome: auto.nome },
          lead: {
            id: lead.id, nome: lead.nome, email: lead.email,
            telefone: lead.telefone, score: lead.score,
            temperatura: lead.temperatura, status: lead.status,
            origem: lead.origem, utm: lead.utm,
            landingPage: lead.landingPage, criadoEm: lead.criadoEm,
          },
          empresaId,
          timestamp: Date.now(),
        };

        const p = fetch(auto.acaoDados.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(8000),
        })
          .then(r => {
            console.log(`[automacao] OK | ${auto.nome} | lead:${lead.id} | http:${r.status}`);
            return { autoId: auto.id, leadId: lead.id, ok: true };
          })
          .catch(err => {
            console.error(`[automacao] ERRO | ${auto.nome} | lead:${lead.id} |`, err.message);
            return { autoId: auto.id, leadId: lead.id, ok: false };
          });

        tarefas.push(p);
      });
    });

    if (tarefas.length === 0) return;

    const resultados     = await Promise.all(tarefas);
    const disparosSucesso = resultados.filter(r => r.ok);
    if (disparosSucesso.length === 0) return;

    // Marca automacoesDisparadas para não re-disparar
    const leadsAtualizados = leads.map(lead => {
      const novas = disparosSucesso
        .filter(r => r.leadId === lead.id)
        .map(r => r.autoId);
      if (novas.length === 0) return lead;
      return {
        ...lead,
        automacoesDisparadas: [
          ...new Set([...(lead.automacoesDisparadas || []), ...novas]),
        ],
      };
    });

    await db.collection("leads").doc(empresaId).update({ leads: leadsAtualizados });
  }
);
