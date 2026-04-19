import React, { useState } from 'react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

const LoginForm = ({ onLogin }) => {
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
      const ref = doc(db, "licencas", uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
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

      onLogin({ uid, empresaId: uid, email: cred.user.email });
    } catch (err) {
      const mensagens = {
        "auth/user-not-found":     "Usuário não encontrado.",
        "auth/wrong-password":     "Senha incorreta.",
        "auth/invalid-email":      "Email inválido.",
        "auth/too-many-requests":  "Muitas tentativas. Aguarde alguns minutos.",
        "auth/invalid-credential": "Email ou senha incorretos.",
      };
      setErro(mensagens[err.code] || "Erro ao entrar. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  async function resetSenha() {
    if (!email) { setErro("Digite seu email para redefinir a senha."); return; }
    try {
      await sendPasswordResetEmail(auth, email);
      setResetEnviado(true);
      setErro(null);
    } catch {
      setErro("Não foi possível enviar o email. Verifique o endereço.");
    }
  }

  return (
    <div className="login-form-card">
      <div className="login-header brand-header">
        <h2 className="brand-title">Assent <span>CRM</span></h2>
        <p className="brand-subtitle">Relacionamento que aumenta faturamento.</p>
      </div>

      <form onSubmit={entrar} className="login-form">
        <div className="input-group">
          <label htmlFor="email">E-mail</label>
          <input
            type="email"
            id="email"
            placeholder="Seu e-mail profissional"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="input-group" style={{ marginTop: '1rem' }}>
          <label htmlFor="password">Senha</label>
          <input
            type="password"
            id="password"
            placeholder="Sua senha"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        {erro && (
          <div style={{
            background: "#1a0a0a",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            marginTop: 12,
            fontSize: 12,
            color: "#f87171",
            lineHeight: 1.5,
          }}>
            {erro}
          </div>
        )}

        {resetEnviado && (
          <div style={{
            background: "#0a1a0a",
            border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 8,
            padding: "10px 14px",
            marginTop: 12,
            fontSize: 12,
            color: "#4ade80",
            lineHeight: 1.5,
          }}>
            Email de redefinição enviado. Verifique sua caixa de entrada.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={resetSenha}
            className="forgot-password"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            Esqueceu a senha?
          </button>
        </div>

        <button type="submit" className="btn-submit" disabled={carregando}>
          <span>{carregando ? "Entrando..." : "Entrar"}</span>
        </button>
      </form>
    </div>
  );
};

export default LoginForm;
