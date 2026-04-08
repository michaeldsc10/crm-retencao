import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// ─── Score de churn ───────────────────────────────────────────────────────────
export function useCRM(empresaId) {
  console.log("useCRM recebeu empresaId:", empresaId); // ← adiciona essa linha
  const [estado, setEstado] = useState({
function calcularScoreChurn(clientes = [], vendas = []) {
  const hoje = new Date();

  return clientes.map((cliente) => {
    const vendasCliente = vendas
      .filter((v) => v.cliente === cliente.nome)
      .map((v) => ({ ...v, _data: new Date(v.data) }))
      .sort((a, b) => a._data - b._data);

    if (vendasCliente.length === 0) {
      return { ...cliente, _semVendas: true, risco: "indefinido" };
    }

    const ultima = vendasCliente[vendasCliente.length - 1];
    const diasAusente = Math.floor((hoje - ultima._data) / 86400000);

    let frequenciaMedia = null;
    if (vendasCliente.length >= 2) {
      const intervalos = [];
      for (let i = 1; i < vendasCliente.length; i++) {
        intervalos.push((vendasCliente[i]._data - vendasCliente[i - 1]._data) / 86400000);
      }
      frequenciaMedia = Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length);
    }

    const totalGasto = vendasCliente.reduce((acc, v) => acc + (v.total || 0), 0);
    const ticketMedio = Math.round(totalGasto / vendasCliente.length);

    // Produto/serviço favorito
    const contagem = {};
    vendasCliente.forEach((v) =>
      (v.itens || []).forEach((i) => {
        contagem[i.produto] = (contagem[i.produto] || 0) + 1;
      })
    );
    const [produtoFavorito] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0] || [];

    // Score de risco
    const mult = frequenciaMedia ? diasAusente / frequenciaMedia : null;
    let risco = "baixo";
    if (mult !== null) {
      if (mult > 2.5) risco = "alto";
      else if (mult > 1.5) risco = "medio";
    } else {
      if (diasAusente > 60) risco = "alto";
      else if (diasAusente > 30) risco = "medio";
    }

    return {
      ...cliente,
      diasAusente,
      frequenciaMedia,
      ticketMedio,
      produtoFavorito: produtoFavorito || null,
      totalCompras: vendasCliente.length,
      ultimaCompra: ultima.data,
      risco,
      multiplicador: mult ? parseFloat(mult.toFixed(1)) : null,
    };
  });
}

// ─── Gerador de insights ──────────────────────────────────────────────────────

function gerarInsights(clientesComScore, vendas = [], servicos = []) {
  const insights = [];

  clientesComScore.forEach((c) => {
    if (c._semVendas) return;

    if (c.risco === "alto" || c.risco === "medio") {
      insights.push({
        id: `risco-${c.nome}`,
        tipo: "risco",
        prioridade: c.risco === "alto" ? 1 : 2,
        cliente: c.nome,
        telefone: c.telefone,
        diasAusente: c.diasAusente,
        frequenciaMedia: c.frequenciaMedia,
        produtoFavorito: c.produtoFavorito,
        ticketMedio: c.ticketMedio,
        multiplicador: c.multiplicador,
        descricao: c.frequenciaMedia
          ? `Frequência média é ${c.frequenciaMedia} dias — está ${c.diasAusente} dias sem aparecer (${c.multiplicador}× acima do normal).`
          : `${c.diasAusente} dias sem aparecer. Último serviço: ${c.produtoFavorito || "não identificado"}.`,
      });
    }

    // Oportunidade de upsell
    const comprados = new Set(
      vendas.filter((v) => v.cliente === c.nome).flatMap((v) => (v.itens || []).map((i) => i.produto))
    );
    const catFav = (() => {
      const cc = {};
      vendas.filter((v) => v.cliente === c.nome).forEach((v) =>
        (v.itens || []).forEach((item) => {
          const srv = servicos.find((s) => s.nome === item.produto);
          if (srv?.categoria) cc[srv.categoria] = (cc[srv.categoria] || 0) + 1;
        })
      );
      return Object.entries(cc).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    })();

    const naoComprado = servicos.find(
      (s) => !comprados.has(s.nome) && s.categoria === catFav
    );
    if (naoComprado && c.risco === "baixo" && catFav) {
      insights.push({
        id: `upsell-${c.nome}`,
        tipo: "oportunidade",
        prioridade: 3,
        cliente: c.nome,
        telefone: c.telefone,
        servico: naoComprado.nome,
        preco: naoComprado.preco,
        ticketMedio: c.ticketMedio,
        descricao: `Sempre contrata ${catFav}, mas nunca experimentou "${naoComprado.nome}". Potencial: +R$ ${naoComprado.preco}.`,
      });
    }
  });

  return insights.sort((a, b) => a.prioridade - b.prioridade);
}

// ─── Métricas do painel ───────────────────────────────────────────────────────

function calcularMetricas(clientesComScore, vendas = []) {
  const hoje = new Date();
  const trintaDias = new Date(hoje - 30 * 86400000);
  const com = clientesComScore.filter((c) => !c._semVendas);

  return {
    totalClientes: com.length,
    emRisco: com.filter((c) => c.risco === "alto").length,
    dormentes: com.filter((c) => c.diasAusente > 60).length,
    fieis: com.filter((c) => c.risco === "baixo" && c.totalCompras >= 2).length,
    novos: com.filter((c) => c.totalCompras === 1).length,
    receitaEmRisco: com.filter((c) => c.risco === "alto").reduce((a, c) => a + (c.ticketMedio || 0), 0),
    receitaRecente: vendas.filter((v) => new Date(v.data) >= trintaDias).reduce((a, v) => a + (v.total || 0), 0),
    ticketGeral: com.length ? Math.round(com.reduce((a, c) => a + (c.ticketMedio || 0), 0) / com.length) : 0,
  };
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useCRM(empresaId) {
  const [estado, setEstado] = useState({
    carregando: true,
    erro: null,
    dadosBrutos: null,
    clientes: [],
    insights: [],
    metricas: null,
    config: null,
  });

  useEffect(() => {
    if (!empresaId) return;

    const ref = doc(db, "dados", empresaId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setEstado((s) => ({ ...s, carregando: false, erro: "Empresa não encontrada." }));
          return;
        }

        const dados = snap.data();
        const { clientes = [], vendas = [], servicos = [], config = {} } = dados;

        const clientesComScore = calcularScoreChurn(clientes, vendas);
        const insights = gerarInsights(clientesComScore, vendas, servicos);
        const metricas = calcularMetricas(clientesComScore, vendas);

        setEstado({
          carregando: false,
          erro: null,
          dadosBrutos: dados,
          clientes: clientesComScore,
          insights,
          metricas,
          config,
        });
      },
      (err) => {
        console.error(err);
        setEstado((s) => ({ ...s, carregando: false, erro: "Erro ao conectar com o Firestore." }));
      }
    );

    return () => unsub();
  }, [empresaId]);

  return estado;
}

// ─── Gerador de prompt para IA ────────────────────────────────────────────────

export function montarPromptMensagem(insight, empresaNome) {
  const empresa = empresaNome || "a empresa";
  const system = `Você é assistente de CRM de "${empresa}". Gere apenas o texto da mensagem de WhatsApp — sem aspas, sem introdução, sem explicação. Tom: caloroso, pessoal, nunca genérico. Máximo 4 linhas. Não mencione sistemas ou inteligência artificial.`;

  let user = "";
  if (insight.tipo === "risco") {
    user = `Cliente: ${insight.cliente}. Ausente há ${insight.diasAusente} dias (frequência normal: ${insight.frequenciaMedia || "não calculada"} dias). Último serviço: ${insight.produtoFavorito || "não identificado"}. Gere mensagem de reativação para WhatsApp.`;
  } else if (insight.tipo === "oportunidade") {
    user = `Cliente: ${insight.cliente}. É fiel mas nunca experimentou "${insight.servico}" (R$ ${insight.preco}). Gere mensagem apresentando esse serviço de forma natural para WhatsApp.`;
  }

  return { system, user };
}
