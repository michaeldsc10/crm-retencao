# Deploy da Cloud Function `capturarLead`

## Pré-requisitos

```bash
npm install -g firebase-tools
firebase login
```

## Estrutura esperada

```
assent-crm/
├── firebase.json          ← atualizado (incluso)
├── firestore.rules        ← sem alterações
├── functions/
│   ├── index.js           ← Cloud Function (incluso)
│   └── package.json       ← incluso
└── src/
    └── snippets/
        └── capturaSnippets.js  ← snippets atualizados (incluso)
```

## 1. Instalar dependências

```bash
cd functions
npm install
cd ..
```

## 2. Testar localmente com emulador

```bash
firebase emulators:start --only functions,firestore
```

Testar com cURL:
```bash
curl -X POST http://localhost:5001/assent-2b945/southamerica-east1/capturarLead \
  -H "Content-Type: application/json" \
  -d '{"empresaId":"SEU_UID","nome":"Teste","email":"teste@email.com"}'
```

## 3. Deploy em produção

```bash
firebase deploy --only functions
```

URL final:
```
https://southamerica-east1-assent-2b945.cloudfunctions.net/capturarLead
```

## 4. Ativar Billing (obrigatório para Cloud Functions)

Cloud Functions v2 exige o plano **Blaze** (pay-as-you-go).  
O free tier cobre ~2 milhões de invocações/mês — mais que suficiente para começar.

Firebase Console → Projeto → Spark → Fazer upgrade para Blaze.

---

## Payload da requisição

| Campo          | Tipo   | Obrigatório | Descrição                        |
|----------------|--------|-------------|----------------------------------|
| `empresaId`    | string | ✅           | UID do usuário no Firebase Auth  |
| `nome`         | string | —           | Nome do lead                     |
| `email`        | string | —           | E-mail (validado no server)      |
| `telefone`     | string | —           | Telefone com DDD                 |
| `utm_source`   | string | —           | Ex: `google`, `instagram`        |
| `utm_campaign` | string | —           | Nome da campanha                 |
| `utm_medium`   | string | —           | Ex: `cpc`, `email`, `organic`    |
| `landingPage`  | string | —           | URL completa da página de origem |

> Pelo menos um de `nome`, `email` ou `telefone` é obrigatório.

## Cálculo de Score automático

| Condição                          | Pontos |
|-----------------------------------|--------|
| Form submit (sempre)              | +10    |
| Nome preenchido                   | +5     |
| E-mail preenchido                 | +5     |
| Telefone preenchido               | +5     |
| Landing page de preço/planos      | +20    |
| utm_medium = cpc ou paid          | +15    |
| utm_source = google               | +10    |
| utm_source = instagram/facebook   | +8     |

**Temperatura**: quente (≥50) · morno (25–49) · frio (<25)

---

## Integração com `useLeads.js`

O lead salvo tem a mesma estrutura esperada pelo hook:

```js
{
  id: "lead_TIMESTAMP_RANDOM",
  nome, email, telefone,
  score,           // calculado automaticamente
  temperatura,     // "quente" | "morno" | "frio"
  status: "novo",
  origem,          // utm_source || "direto"
  utm: { source, campaign, medium },
  landingPage,
  eventos: [{ tipo: "form_submit", timestamp, descricao, pontos: 10 }],
  criadoEm,
  atualizadoEm,
}
```

Nenhuma alteração necessária em `useLeads.js` — o `onSnapshot` já vai pegar o novo lead em tempo real.
