// ─── Adicione esta função no useLeads.js ──────────────────────────────────────
// Cole junto às outras funções exportadas (perto de registrarEventoLead)

import { doc, updateDoc, arrayRemove } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Remove um evento/anotação específico do array `eventos` do lead no Firestore.
 * @param {string} empresaId
 * @param {object} lead   - objeto do lead (precisa de lead.id)
 * @param {string} eventoId - ev.id do evento a remover
 */
export async function removerEventoLead(empresaId, lead, eventoId) {
  const leadRef = doc(db, "empresas", empresaId, "leads", lead.id);

  // Encontra o objeto exato do evento para usar no arrayRemove
  const evento = (lead.eventos || []).find(e => e.id === eventoId);
  if (!evento) return;

  await updateDoc(leadRef, {
    eventos: arrayRemove(evento),
  });
}
