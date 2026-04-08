export default async function handler(req, res) {
  // Só aceita POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { system, user } = req.body;

  if (!system || !user) {
    return res.status(400).json({ error: "Campos 'system' e 'user' são obrigatórios." });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    const texto = data.content?.[0]?.text || "";
    return res.status(200).json({ texto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro interno ao chamar a IA." });
  }
}
