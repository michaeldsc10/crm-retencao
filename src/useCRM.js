import { useState, useEffect } from "react";
import {
  doc,
  collection,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Configuração padrão do Radar ────────────────────────────────────────────
// Salva em dadosCRM/{empresaId} → radar
// Sobrescrito pelo usuário via Configurações → Configurar Radar.
export const RADAR_PADRAO = {
  diasMedio: 15,   // dias ausente → risco médio  (sem histórico de frequência)
  diasAlto:  30,   // dias ausente → risco alto   (sem histórico de frequência)
  multMedio: 1.5,  // mult. da freq. média → risco médio
  multAlto:  2.5,  // mult. da freq. média → risco alto
};

// ─── Helper: converte Timestamp do Firestore ou string para Date ──────────────
function toDate(val) {
  if (!val) return new Date(0);
  if (val?.toDate) return val.toDate();
  return new Date(val);
}

// ─── Helper: compara nome do cliente com tolerância a nomes parciais ──────────
function matchNomeCliente(vendaCliente = "", clienteNome = "") {
  const a = (vendaCliente || "").trim().toLowerCase();
  const b = (clienteNome || "").trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || b.startsWith(a) || a.startsWith(b);
}

// ─── Gera chave segura para ID de documento no Firestore ─────────────────────
function chaveCliente(clienteId, clienteNome) {
  if (clienteId) return clienteId;
  return (clienteNome || "desconhecido")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 80);
}

// ─── Ignorar cliente ──────────────────────────────────────────────────────────
// Caminho: dadosCRM/{empresaId}/ignore/{chaveCliente}
export async function ignorarCliente(empresaId, cliente) {
  const chave = chaveCliente(cliente.id, cliente.nome);
  await setDoc(doc(db, "dadosCRM", empresaId, "ignore", chave), {
    clienteId:  cliente.id       || null,
    nome:       cliente.nome     || "Desconhecido",
    telefone:   cliente.telefone || null,
    ignoradoEm: serverTimestamp(),
  });
}

// ─── Reativar cliente ignorado ────────────────────────────────────────────────
export async function reativarCliente(empresaId, clienteIgnorado) {
  const chave = clienteIgnorado._docId ||
    chaveCliente(clienteIgnorado.clienteId, clienteIgnorado.nome);
  await deleteDoc(doc(db, "dadosCRM", empresaId, "ignore", chave));
}

// ─── Score de churn ───────────────────────────────────────────────────────────
function calcularScoreChurn(clientes = [], vendas = [], radar = RADAR_PADRAO) {
  const { diasMedio, diasAlto, multMedio, multAlto } = { ...RADAR_PADRAO, ...radar };
  const hoje = new Date();

  return clientes.map((cliente) => {
    const vendasCliente = vendas
      .filter((v) => matchNomeCliente(v.cliente, cliente.nome))
      .map((v) => ({ ...v, _data: toDate(v.data) }))
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

    const totalGasto = vendasCliente.reduce(
      (acc, v) => acc + (v.total ?? v.custoTotal ?? 0), 0
    );
    const ticketMedio = Math.round(totalGasto / vendasCliente.length);

    const contagem = {};
    vendasCliente.forEach((v) =>
      (v.itens || []).forEach((i) => {
        const nomeProduto = i.nome || i.produto || "Desconhecido";
        contagem[nomeProduto] = (contagem[nomeProduto] || 0) + 1;
      })
    );
    const [produtoFavorito] =
      Object.entries(contagem).sort((a, b) => b[1] - a[1])[0] || [];

    const mult = frequenciaMedia ? diasAusente / frequenciaMedia : null;
    let risco = "baixo";
    if (mult !== null) {
      if (mult > multAlto)  risco = "alto";
      else if (mult > multMedio) risco = "medio";
    } else {
      if (diasAusente > diasAlto)  risco = "alto";
      else if (diasAusente > diasMedio) risco = "medio";
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
function gerarInsights(clientesComScore, vendas = [], servicos = [], ignorados = []) {
  const nomesIgnorados = new Set(
    ignorados.map((ig) => (ig.nome || "").trim().toLowerCase())
  );

  const insights = [];

  clientesComScore.forEach((c) => {
    if (c._semVendas) return;
    if (nomesIgnorados.has((c.nome || "").trim().toLowerCase())) return;

    if (c.risco === "alto" || c.risco === "medio") {
      insights.push({
        id: `risco-${c.nome}`,
        tipo: "risco",
        prioridade: c.risco === "alto" ? 1 : 2,
        clienteId: c.id || null,
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
        .filter((v) => matchNomeCliente(v.cliente, c.nome))
        .flatMap((v) => (v.itens || []).map((i) => i.nome || i.produto))
    );

    const catFav = (() => {
      const cc = {};
      vendas
        .filter((v) => matchNomeCliente(v.cliente, c.nome))
        .forEach((v) =>
          (v.itens || []).forEach((item) => {
            const nomeProd = item.nome || item.produto;
            const srv = servicos.find((s) => s.nome === nomeProd);
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
        clienteId: c.id || null,
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
      .filter((c) => c.risco === "alto" || c.risco === "medio")
      .reduce((a, c) => a + (c.ticketMedio || 0), 0),
    receitaRecente: vendas
      .filter((v) => toDate(v.data) >= trintaDias)
      .reduce((a, v) => a + (v.total ?? v.custoTotal ?? 0), 0),
    ticketGeral: com.length
      ? Math.round(com.reduce((a, c) => a + (c.ticketMedio || 0), 0) / com.length)
      : 0,
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
    ignorados: [],
    radar: RADAR_PADRAO,
  });

  useEffect(() => {
    if (!empresaId) return;

    const buffer = {
      clientes:  [],
      vendas:    [],
      servicos:  [],
      config:    {},
      ignorados: [],
      radar:     {},
    };

    const pronto = {
      clientes:  false,
      vendas:    false,
      servicos:  false,
      config:    false,
      ignorados: false,
      radar:     false,
    };

    function recalcular() {
      if (
        !pronto.clientes  ||
        !pronto.vendas    ||
        !pronto.servicos  ||
        !pronto.config    ||
        !pronto.ignorados ||
        !pronto.radar
      ) return;

      const radar = { ...RADAR_PADRAO, ...buffer.radar };
      const clientesComScore = calcularScoreChurn(buffer.clientes, buffer.vendas, radar);
      const insights = gerarInsights(
        clientesComScore,
        buffer.vendas,
        buffer.servicos,
        buffer.ignorados
      );
      const metricas = calcularMetricas(clientesComScore, buffer.vendas);

      setEstado({
        carregando: false,
        erro: null,
        dadosBrutos: { ...buffer },
        clientes: clientesComScore,
        insights,
        metricas,
        config: buffer.config,
        ignorados: buffer.ignorados,
        radar,
      });
    }

    function onErro(secao) {
      return (err) => {
        console.error(`[useCRM] Erro em "${secao}":`, err);
        setEstado((s) => ({ ...s, carregando: false, erro: `Erro ao carregar ${secao}.` }));
      };
    }

    const unsubs = [];

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

    unsubs.push(
      onSnapshot(
        doc(db, "users", empresaId, "config", "geral"),
        (snap) => {
          buffer.config = snap.exists() ? snap.data() : {};
          pronto.config = true;
          recalcular();
        },
        (err) => {
          console.warn("[useCRM] Config não encontrada:", err);
          pronto.config = true;
          recalcular();
        }
      )
    );

    // ── Ignorados: dadosCRM/{empresaId}/ignore ──────────────────────────────
    unsubs.push(
      onSnapshot(
        collection(db, "dadosCRM", empresaId, "ignore"),
        (snap) => {
          buffer.ignorados = snap.docs.map((d) => ({ _docId: d.id, ...d.data() }));
          pronto.ignorados = true;
          recalcular();
        },
        (err) => {
          // Coleção pode ainda não existir: não bloqueia o sistema
          console.warn("[useCRM] Coleção ignore não encontrada (normal na 1ª vez):", err);
          pronto.ignorados = true;
          recalcular();
        }
      )
    );

    // ── Radar: dadosCRM/{empresaId}/radar/risco ─────────────────────────────
    // Se o doc não existir, usa RADAR_PADRAO — não bloqueia o sistema.
    unsubs.push(
      onSnapshot(
        doc(db, "dadosCRM", empresaId, "radar", "risco"),
        (snap) => {
          buffer.radar = snap.exists() ? snap.data() : {};
          pronto.radar = true;
          recalcular();
        },
        (err) => {
          console.warn("[useCRM] Config radar não encontrada (usando padrão):", err);
          buffer.radar = {};
          pronto.radar = true;
          recalcular();
        }
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [empresaId]);

  return estado;
}

// ─── Gerador de prompt para IA ────────────────────────────────────────────────
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
