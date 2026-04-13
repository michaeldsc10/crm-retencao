/**
 * Assent CRM — Snippets de Captura de Lead
 * Gerado automaticamente pelo módulo de Configuração de Captura
 *
 * URL da Cloud Function:
 *   Produção : https://southamerica-east1-assent-2b945.cloudfunctions.net/capturarLead
 *   Via Hosting (rewrite): https://SEU_DOMINIO/api/capturarLead
 *
 * Segurança: os snippets usam `slug` (ex: "barbearia-joao-x7k2") em vez do
 * empresaId real. O slug é resolvido internamente pela Cloud Function —
 * o empresaId nunca é exposto ao cliente final.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. SNIPPET HTML PURO (colar em qualquer landing page)
// ─────────────────────────────────────────────────────────────────────────────

export const SNIPPET_HTML = (slug) => `
<form id="assent-form">
  <input type="text"  name="nome"     placeholder="Seu nome"     required />
  <input type="email" name="email"    placeholder="Seu e-mail"   required />
  <input type="tel"   name="telefone" placeholder="Seu telefone" />
  <button type="submit">Quero saber mais</button>
  <p id="assent-msg" style="display:none"></p>
</form>

<script>
(function () {
  var SLUG     = "${slug}";
  var ENDPOINT = "https://southamerica-east1-assent-2b945.cloudfunctions.net/capturarLead";

  // Captura UTMs da URL automaticamente
  function getUTMs() {
    var p = new URLSearchParams(window.location.search);
    return {
      utm_source:   p.get("utm_source")   || "",
      utm_campaign: p.get("utm_campaign") || "",
      utm_medium:   p.get("utm_medium")   || "",
    };
  }

  document.getElementById("assent-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f   = e.target;
    var msg = document.getElementById("assent-msg");
    var btn = f.querySelector("button");
    btn.disabled = true;

    var payload = Object.assign(
      { slug: SLUG, landingPage: window.location.href },
      getUTMs(),
      { nome: f.nome.value, email: f.email.value, telefone: (f.telefone || {}).value || "" }
    );

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        msg.style.display = "block";
        if (data.ok) {
          msg.style.color   = "green";
          msg.textContent   = "Obrigado! Entraremos em contato em breve.";
          f.reset();
        } else {
          throw new Error(data.erro || "Erro desconhecido");
        }
      })
      .catch(function (err) {
        msg.style.display = "block";
        msg.style.color   = "red";
        msg.textContent   = "Erro ao enviar. Tente novamente.";
        btn.disabled      = false;
        console.error("[Assent]", err);
      });
  });
})();
</script>
`.trim();


// ─────────────────────────────────────────────────────────────────────────────
// 2. SNIPPET REACT (componente funcional, zero dependências externas)
// ─────────────────────────────────────────────────────────────────────────────

export const SNIPPET_REACT = (slug) => `
import { useState } from "react";

const ENDPOINT = "https://southamerica-east1-assent-2b945.cloudfunctions.net/capturarLead";

function getUTMs() {
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source:   p.get("utm_source")   ?? "",
    utm_campaign: p.get("utm_campaign") ?? "",
    utm_medium:   p.get("utm_medium")   ?? "",
  };
}

export default function AssentForm() {
  const [form, setForm]       = useState({ nome: "", email: "", telefone: "" });
  const [status, setStatus]   = useState(null); // null | "ok" | "erro"
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "${slug}",
          landingPage: window.location.href,
          ...getUTMs(),
          ...form,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.erro);
      setStatus("ok");
      setForm({ nome: "", email: "", telefone: "" });
    } catch (err) {
      console.error("[Assent]", err);
      setStatus("erro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <input name="nome"     value={form.nome}     onChange={handle} placeholder="Seu nome"     required />
      <input name="email"    value={form.email}    onChange={handle} placeholder="Seu e-mail"   type="email" required />
      <input name="telefone" value={form.telefone} onChange={handle} placeholder="Seu telefone" type="tel" />
      <button type="submit" disabled={loading}>
        {loading ? "Enviando..." : "Quero saber mais"}
      </button>
      {status === "ok"   && <p style={{ color: "green" }}>Obrigado! Em breve entraremos em contato.</p>}
      {status === "erro" && <p style={{ color: "red"   }}>Erro ao enviar. Tente novamente.</p>}
    </form>
  );
}
`.trim();


// ─────────────────────────────────────────────────────────────────────────────
// 3. SNIPPET API DIRETA (cURL / Postman / fetch manual)
// ─────────────────────────────────────────────────────────────────────────────

export const SNIPPET_API = (slug) => `
# cURL
curl -X POST \\
  https://southamerica-east1-assent-2b945.cloudfunctions.net/capturarLead \\
  -H "Content-Type: application/json" \\
  -d '{
    "slug":        "${slug}",
    "nome":        "João Silva",
    "email":       "joao@exemplo.com",
    "telefone":    "11999990000",
    "utm_source":  "google",
    "utm_campaign":"promo-maio",
    "utm_medium":  "cpc",
    "landingPage": "https://exemplo.com/landing"
  }'

# Resposta esperada (sucesso)
# { "ok": true, "leadId": "lead_1234567_abc123", "score": 55, "temperatura": "quente", "mensagem": "Lead capturado com sucesso" }

# Resposta esperada (erro de slug inválido)
# { "ok": false, "erro": "Empresa não encontrada" }
`.trim();
