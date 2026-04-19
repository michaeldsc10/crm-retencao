import { useState, useEffect } from "react";
import { doc, collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// ─── Score de churn ───────────────────────────────────────────────────────────

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
        intervalos.push(
          (vendasCliente[i]._data - vendasCliente[i - 1]._data) / 86400000
        );
      }
      frequenciaMedia = Math.round(
        intervalos.reduce((a, b) => a + b, 0) / intervalos.length
      );
    }

    const totalGasto = vendasCliente.reduce((acc, v) => acc + (v.total || 0), 0);
    const ticketMedio = Math.round(totalGasto / vendasCliente.length);

    const contagem = {};
    vendasCliente.forEach((v) =>
      (v.itens || []).forEach((i) => {
        contagem[i.produto] = (contagem[i.produto] || 0) + 1;
      })
    );
    const [produtoFavorito] =
      Object.entries(contagem).sort((a, b) => b[1] - a[1])[0] || [];

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

    const comprados = new Set(
      vendas
        .filter((v) => v.cliente === c.nome)
        .flatMap((v) => (v.itens || []).map((i) => i.produto))
    );

    const catFav = (() => {
      const cc = {};
      vendas
        .filter((v) => v.cliente === c.nome)
        .forEach((v) =>
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
    emRisco: com.filter((c) => c.risco === "alto" || c.risco === "medio").length,
    dormentes: com.filter((c) => c.diasAusente > 60).length,
    fieis: com.filter((c) => c.risco === "baixo" && c.totalCompras >= 2).length,
    novos: com.filter((c) => c.totalCompras === 1).length,
    receitaEmRisco: com
      .filter((c) => c.risco === "alto")
      .reduce((a, c) => a + (c.ticketMedio || 0), 0),
    receitaRecente: vendas
      .filter((v) => new Date(v.data) >= trintaDias)
      .reduce((a, v) => a + (v.total || 0), 0),
    ticketGeral: com.length
      ? Math.round(com.reduce((a, c) => a + (c.ticketMedio || 0), 0) / com.length)
      : 0,
  };
}

// ─── Hook principal ───────────────────────────────────────────────────────────
//
// Estrutura esperada no Firestore (Assent Gestão):
//
//   users/{empresaId}                    ← documento raiz (contadores etc.)
//   users/{empresaId}/clientes/{...}     ← subcoleção de clientes
//   users/{empresaId}/vendas/{...}       ← subcoleção de vendas
//   users/{empresaId}/servicos/{...}     ← subcoleção de serviços
//   users/{empresaId}/config/geral       ← configurações da empresa
//
// ─────────────────────────────────────────────────────────────────────────────

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

    // Buffer compartilhado entre os listeners
    const buffer = {
      clientes: [],
      vendas: [],
      servicos: [],
      config: {},
    };

    // Controle de quais listeners já dispararam pelo menos uma vez
    const pronto = {
      clientes: false,
      vendas: false,
      servicos: false,
      config: false,
    };

    // Só recalcula quando todos os listeners tiverem carregado
    function recalcular() {
      if (!pronto.clientes || !pronto.vendas || !pronto.servicos || !pronto.config) return;

      const clientesComScore = calcularScoreChurn(buffer.clientes, buffer.vendas);
      const insights = gerarInsights(clientesComScore, buffer.vendas, buffer.servicos);
      const metricas = calcularMetricas(clientesComScore, buffer.vendas);

      setEstado({
        carregando: false,
        erro: null,
        dadosBrutos: { ...buffer },
        clientes: clientesComScore,
        insights,
        metricas,
        config: buffer.config,
      });
    }

    function onErro(secao) {
      return (err) => {
        console.error(`[useCRM] Erro em "${secao}":`, err);
        setEstado((s) => ({
          ...s,
          carregando: false,
          erro: `Erro ao carregar ${secao}.`,
        }));
      };
    }

    const unsubs = [];

    // 1. Subcoleção: clientes
    unsubs.push(
      onSnapshot(
        collection(db, "users", empresaId, "clientes"),
        (snap) => {
          buffer.clientes = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          pronto.clientes = true;
          recalcular();
        },
        onErro("clientes")
      )
    );

    // 2. Subcoleção: vendas
    unsubs.push(
      onSnapshot(
        collection(db, "users", empresaId, "vendas"),
        (snap) => {
          buffer.vendas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          pronto.vendas = true;
          recalcular();
        },
        onErro("vendas")
      )
    );

    // 3. Subcoleção: servicos
    unsubs.push(
      onSnapshot(
        collection(db, "users", empresaId, "servicos"),
        (snap) => {
          buffer.servicos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          pronto.servicos = true;
          recalcular();
        },
        onErro("serviços")
      )
    );

    // 4. Documento de config (users/{id}/config/geral)
    unsubs.push(
      onSnapshot(
        doc(db, "users", empresaId, "config", "geral"),
        (snap) => {
          buffer.config = snap.exists() ? snap.data() : {};
          pronto.config = true;
          recalcular();
        },
        (err) => {
          // Config não é crítica: marca como pronto mesmo sem dados
          console.warn("[useCRM] Config não encontrada:", err);
          pronto.config = true;
          recalcular();
        }
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [empresaId]);

  return estado;
}

// ─── Gerador de prompt para IA ────────────────────────────────────────────────
//
// Acesse o nome da empresa via: config?.empresa?.nomeEmpresa
//
// ─────────────────────────────────────────────────────────────────────────────

export function montarPromptMensagem(insight, empresaNome) {
  const empresa = empresaNome || "nossa agência";

  const system = `Você é um gestor de relacionamento da "${empresa}". 
  Sua missão é escrever uma mensagem de WhatsApp extremamente humana e curta (máximo 3 linhas).
  REGRAS:
  - Use um tom de "parceria", não de "vendedor".
  - Nunca use "espero que esteja bem" ou "notamos que você sumiu".
  - Se houver um produto favorito, mencione algo sobre o valor dele.
  - Termine com uma pergunta aberta.
  - Saída: Apenas o texto da mensagem.`;

  let user = "";
  if (insight.tipo === "risco") {
    user = `Cliente: ${insight.cliente}. Serviço: ${insight.produtoFavorito || "nossos serviços"}. Ausente há ${insight.diasAusente} dias. 
    Escreva um oi rápido, dizendo que lembrou dele ao organizar a agenda e pergunte como estão os planos dessa semana.`;
  } else if (insight.tipo === "oportunidade") {
    user = `Cliente: ${insight.cliente}. Já faz ${insight.produtoFavorito}, mas nunca usou "${insight.servico}". 
    Sugira esse novo serviço como algo que pode escalar os resultados que ele já tem.`;
  }

  return { system, user };
}
