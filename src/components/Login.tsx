import { useState } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const benefits = ["Vistorias rastreáveis", "Evidências centralizadas", "Conformidade em tempo real"];

export function Login() {
  const { signIn, error } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [feedback, setFeedback] = useState("");
  const { resetPassword } = useAuth();

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setRedirecting(true);
    setFeedback("");
    try { await signIn(email, password); }
    catch { setRedirecting(false); }
  };

  const handleReset = async () => {
    setFeedback("");
    try { await resetPassword(email); setFeedback("Se o e-mail estiver cadastrado, você receberá as instruções de redefinição."); }
    catch (reason) { setFeedback(reason instanceof Error ? reason.message : "Não foi possível solicitar a redefinição."); }
  };

  return <main className="login-shell">
    <div className="login-orb login-orb-one" aria-hidden="true"/>
    <div className="login-orb login-orb-two" aria-hidden="true"/>
    <section className="login-card" aria-labelledby="login-title">
      <div className="login-brand">
        <div className="login-brand-top">
          <img src="/assets/logo-meta-branca.png" alt="Meta Central de Serviços"/>
          <span className="login-security-chip"><ShieldCheck size={15}/> Ambiente corporativo</span>
        </div>
        <div className="login-hero-copy">
          <p className="eyebrow">Operação com confiança</p>
          <h1>Gestão veicular<br/>mais segura e inteligente.</h1>
          <p>Uma visão única para controlar inspeções, documentos, credenciais e conformidade da frota.</p>
        </div>
        <div className="login-benefits" aria-label="Benefícios da plataforma">
          {benefits.map((benefit) => <span key={benefit}><CheckCircle2 size={16}/>{benefit}</span>)}
        </div>
      </div>
      <div className="login-content">
        <div className="login-product-mark"><span>MGV</span><small>Meta Gestão Veicular</small></div>
        <div className="login-welcome">
          <p className="eyebrow">Acesso seguro</p>
          <h2 id="login-title">Bem-vindo</h2>
          <p>Use seu e-mail corporativo e sua senha para acessar a plataforma.</p>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        {feedback && <div className="alert info" role="status">{feedback}</div>}
        <form className="login-form" onSubmit={handleSignIn}>
          <label><span>E-mail</span><span className="login-input"><Mail/><input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nome@empresa.com.br"/></span></label>
          <label><span>Senha</span><span className="login-input"><LockKeyhole/><input type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha"/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff/> : <Eye/>}</button></span></label>
          <button type="button" className="login-reset" onClick={() => void handleReset()}>Esqueci minha senha</button>
          <button className="button primary wide login-submit" type="submit" disabled={redirecting}>
            <span>{redirecting ? "Entrando…" : "Entrar"}</span>
            {redirecting ? <span className="button-spinner" aria-hidden="true"/> : <ArrowRight size={18}/>}
          </button>
        </form>
        <div className="login-trust"><LockKeyhole size={16}/><span>Autenticação protegida pelo Firebase. A senha não é armazenada pela aplicação.</span></div>
        <footer><span>Meta Central de Serviços</span><span>·</span><span>Ambiente protegido</span></footer>
      </div>
    </section>
  </main>;
}
