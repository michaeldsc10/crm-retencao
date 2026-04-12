const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// ─── Helpers ────────────────────────────────────────────────────────────────

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

  // Campos preenchidos
  if (nome?.trim()) score += 5;
  if (email?.trim()) score += 5;
  if (telefone?.trim()) score += 5;

  // Origem da mídia
  if (utm_medium === "cpc" || utm_medium === "paid") score += 15;
  if (utm_source === "google") score += 10;
  if (utm_source === "instagram" || utm_source === "facebook") score += 8;

  // Landing page de preço = alto interesse
  const paginaPreco = landingPage && /prec[oi]|plano|plan|pricing/i.test(landingPage);
  if (paginaPreco) score += 20;

  // Form submit padrão
  score += 10;

  return Math.min(score, 100);
}

function calcularTemperatura(score) {
  if (score >= 50) return "quente";
  if (score >= 25) return "morno";
  return "frio";
}

// ─── Validação ───────────────────────────────────────────────────────────────

function validar(body) {
  const erros = [];

  if (!body.empresaId || typeof body.empresaId !== "string") {
    erros.push("empresaId é obrigatório e deve ser string");
  }

  if (!body.nome && !body.email && !body.telefone) {
    erros.push("Informe ao menos um de: nome, email, telefone");
  }

  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    erros.push("email inválido");
  }

  return erros;
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

exports.capturarLead = onRequest(
  {
    region: "southamerica-east1", // São Paulo — menor latência para BR
    cors: false,                  // CORS manual para controle total
    timeoutSeconds: 10,
    maxInstances: 50,
  },
  async (req, res) => {
    setCors(res);

    // Preflight CORS
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, erro: "Método não permitido" });
    }

    // ── Validação do payload ───────────────────────────────────────────────
    const body = req.body || {};
    const erros = validar(body);
    if (erros.length > 0) {
      return res.status(400).json({ ok: false, erros });
    }

    const {
      empresaId,
      nome = "",
      email = "",
      telefone = "",
      utm_source = "",
      utm_campaign = "",
      utm_medium = "",
      landingPage = "",
    } = body;

    // ── Montar lead ────────────────────────────────────────────────────────
    const score = calcularScore({ utm_source, utm_medium, landingPage, nome, email, telefone });
    const temperatura = calcularTemperatura(score);
    const agora = Date.now();

    const novoLead = {
      id: `lead_${agora}_${Math.random().toString(36).slice(2, 8)}`,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      telefone: telefone.trim(),
      score,
      temperatura,
      status: "novo",
      origem: utm_source || "direto",
      utm: { source: utm_source, campaign: utm_campaign, medium: utm_medium },
      landingPage,
      eventos: [
        {
          tipo: "form_submit",
          timestamp: agora,
          descricao: `Formulário enviado via ${landingPage || "landing page"}`,
          pontos: 10,
        },
      ],
      criadoEm: agora,
      atualizadoEm: agora,
    };

    // ── Persistir no Firestore ─────────────────────────────────────────────
    try {
      const docRef = db.collection("leads").doc(empresaId);

      await docRef.set(
        {
          leads: FieldValue.arrayUnion(novoLead),
          atualizadoEm: agora,
        },
        { merge: true }
      );

      console.log(`[capturarLead] Lead salvo — empresa: ${empresaId}, score: ${score}, temp: ${temperatura}`);

      return res.status(200).json({
        ok: true,
        leadId: novoLead.id,
        score,
        temperatura,
        mensagem: "Lead capturado com sucesso",
      });
    } catch (err) {
      console.error("[capturarLead] Erro ao salvar:", err);
      return res.status(500).json({ ok: false, erro: "Erro interno ao salvar lead" });
    }
  }
);
