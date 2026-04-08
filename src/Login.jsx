import { useState } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, senha);
      const uid = cred.user.uid;

      // Busca o documento do usuário no Firestore
      const ref = doc(db, "usuarios", uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        // Cria o documento se não existir (primeiro login)
        await setDoc(ref, {
          email: cred.user.email,
          clienteCRM: false,
          clienteAG: false,
          criadoEm: new Date().toISOString(),
        });
        setErro("Sua conta não tem acesso ao CRM. Entre em contato com o suporte.");
        await auth.signOut();
        return;
      }

      const dados = snap.data();

      if (!dados.clienteCRM) {
        setErro("Sua conta não tem acesso ao CRM. Entre em contato com o suporte.");
        await auth.signOut();
        return;
      }

      // Acesso liberado — passa o empresaId para o App
      onLogin({ uid, empresaId: dados.empresaId || null, email: cred.user.email });
    } catch (err) {
      const mensagens = {
        "auth/user-not-found": "Usuário não encontrado.",
        "auth/wrong-password": "Senha incorreta.",
        "auth/invalid-email": "Email inválido.",
        "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
        "auth/invalid-credential": "Email ou senha incorretos.",
      };
      setErro(mensagens[err.code] || "Erro ao entrar. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  async function resetSenha() {
    if (!email) {
      setErro("Digite seu email para redefinir a senha.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetEnviado(true);
      setErro(null);
    } catch {
      setErro("Não foi possível enviar o email. Verifique o endereço.");
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center",
      justifyContent: "center", background: "#fafaf9", fontFamily: "system-ui, sans-serif",
    }}>
      <div style={{
        width: "100%", maxWidth: 380,
        background: "#fff", border: "0.5px solid #e5e5e3",
        borderRadius: 16, padding: "32px 28px",
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            <span style={{
              display: "inline-block", width: 7, height: 7,
              borderRadius: "50%", background: "#22c55e", marginRight: 6,
            }} />
            CRM Retenção
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>via Assent Gestão</div>
        </div>

        <form onSubmit={entrar}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="seu@email.com"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: "0.5px solid #ddd", fontSize: 13,
                outline: "none", fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: "#555", display: "block", marginBottom: 6 }}>
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: "100%", padding: "10px 12px", borderRadius: 8,
                border: "0.5px solid #ddd", fontSize: 13,
                outline: "none", fontFamily: "inherit",
              }}
            />
          </div>

          {erro && (
            <div style={{
              background: "#FCEBEB", border: "0.5px solid #F09595",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: 12, color: "#A32D2D", lineHeight: 1.5,
            }}>
              {erro}
            </div>
          )}

          {resetEnviado && (
            <div style={{
              background: "#EAF3DE", border: "0.5px solid #97C459",
              borderRadius: 8, padding: "10px 14px", marginBottom: 16,
              fontSize: 12, color: "#3B6D11", lineHeight: 1.5,
            }}>
              Email de redefinição enviado. Verifique sua caixa de entrada.
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            style={{
              width: "100%", padding: "11px", borderRadius: 8,
              background: "#185FA5", color: "#fff", border: "none",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
              opacity: carregando ? 0.6 : 1, fontFamily: "inherit",
            }}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <button
          onClick={resetSenha}
          style={{
            width: "100%", marginTop: 12, padding: "8px",
            background: "none", border: "none", fontSize: 12,
            color: "#888", cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Esqueci minha senha
        </button>
      </div>
    </div>
  );
}
