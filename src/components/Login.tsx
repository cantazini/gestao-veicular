import { useState } from "react";
import { ArrowRight, CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const benefits = ["Vistorias rastreáveis", "Evidências centralizadas", "Conformidade em tempo real"];

export function Login() {
  const { signIn, error } = useAuth();
  const [redirecting, setRedirecting] = useState(false);

  const handleSignIn = () => {
    setRedirecting(true);
    signIn();
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
          <p>Use sua identidade corporativa Microsoft para acessar a plataforma.</p>
        </div>
        {error && <div className="alert error" role="alert">{error}</div>}
        <button className="button primary wide login-submit" onClick={handleSignIn} disabled={redirecting}>
          <span className="microsoft-mark" aria-hidden="true"><i/><i/><i/><i/></span>
          <span>{redirecting ? "Redirecionando…" : "Continuar com Microsoft"}</span>
          {redirecting ? <span className="button-spinner" aria-hidden="true"/> : <ArrowRight size={18}/>} 
        </button>
        <div className="login-trust"><LockKeyhole size={16}/><span>O acesso utiliza login único (SSO). Sua senha nunca é recebida pela aplicação.</span></div>
        <footer><span>Meta Central de Serviços</span><span>·</span><span>Ambiente protegido</span></footer>
      </div>
    </section>
  </main>;
}
