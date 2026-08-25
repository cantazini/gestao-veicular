# Proposta de autenticação própria — análise prévia

## Decisão desta versão

O Microsoft Entra ID e a autenticação integrada do Azure Static Web Apps permanecem ativos e inalterados. Esta proposta não adiciona login por senha, não muda rotas, não altera o `staticwebapp.config.json` e não cria tabelas no Azure SQL.

Essa separação é intencional: o mecanismo atual está em produção e deve continuar sendo a opção de retorno até que uma autenticação própria seja implementada, testada em homologação e aprovada formalmente.

## Estado atual confirmado

1. O navegador redireciona para `/.auth/login/aad`.
2. O Static Web Apps autentica a identidade e injeta `x-ms-client-principal` na chamada da API.
3. A API decodifica esse principal, localiza o `identity_provider_id` em `dbo.app_users` e aplica os papéis `admin`, `inspector` e `supplier`.
4. O escopo de fornecedor continua sendo validado no backend pelo `company_id`.
5. O frontend não armazena token de acesso em `localStorage` ou `sessionStorage`.

## Arquitetura proposta para uma fase futura

Usar sessões opacas, mantidas no servidor, em vez de JWT persistido no navegador:

```text
Login (e-mail + senha)
        │ HTTPS
        ▼
Azure Function /api/auth/login
        ├── valida limite de tentativas
        ├── verifica hash forte da senha
        ├── cria token aleatório de 256 bits
        └── salva somente o hash do token no Azure SQL
                 │
                 ▼
Cookie: HttpOnly; Secure; SameSite=Lax; Path=/
```

As chamadas seguintes enviariam o cookie automaticamente. A API buscaria a sessão ativa no SQL, renovaria sua validade de forma controlada e continuaria usando o mesmo objeto interno `AppUser`, preservando todas as verificações de papel e empresa já existentes.

## Estrutura de dados sugerida

- `app_users`: acrescentar `password_hash`, `password_changed_at` e um indicador explícito de método de autenticação; nunca armazenar senha reversível.
- `auth_sessions`: `id`, `user_id`, `token_hash`, criação, última atividade, expiração, revogação e metadados mínimos de segurança.
- `auth_login_attempts`: chave normalizada, janela de tempo, quantidade de tentativas e bloqueio temporário.
- `auth_audit_events`: login bem-sucedido, falha, logout, revogação e troca de senha, sem registrar senha, token ou cookie.

Uma migração SQL separada deverá criar essas estruturas. Ela não deve ser executada automaticamente pelo frontend nem durante o build.

## Controles obrigatórios

- hash de senha com Argon2id e parâmetros revistos para o ambiente da Function; selecionar uma biblioteca compatível com Node.js 22 e validar seu empacotamento no Azure antes do uso;
- token de sessão gerado com CSPRNG, salvo no cookie em texto opaco e armazenado no SQL apenas como hash SHA-256;
- cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, com vida curta e renovação controlada;
- rotação da sessão após login e alteração de privilégio;
- revogação no logout, inativação do usuário e troca de senha;
- limite progressivo de tentativas por conta e origem, com resposta que não revele se o usuário existe;
- validação de `Origin` nas operações mutáveis e proteção CSRF adicional se algum fluxo futuro exigir `SameSite=None`;
- política de senha, troca inicial obrigatória e processo administrativo seguro de redefinição;
- nenhum token em `localStorage`, parâmetros de URL, logs ou mensagens de erro;
- segredos e eventuais chaves somente nas Application Settings do backend.

## Migração segura e reversível

1. Criar as tabelas e testes em um banco de homologação.
2. Implementar o novo middleware atrás de `AUTH_MODE=entra`, mantendo esse valor como padrão.
3. Adicionar `AUTH_MODE=hybrid` apenas em homologação. Nesse modo, aceitar uma sessão própria válida ou o principal confiável do Entra.
4. Liberar a rota de login próprio no Static Web Apps somente quando o middleware de todas as rotas protegidas estiver coberto por testes. Hoje `/api/*` exige o papel `authenticated` do SWA e deve continuar assim.
5. Executar testes de fixação/roubo de sessão, CSRF, enumeração de usuário, força bruta, expiração, revogação, papéis e isolamento de fornecedor.
6. Homologar com um grupo pequeno, mantendo o botão do Entra disponível para retorno.
7. Somente após aceite, avaliar `AUTH_MODE=local`. A remoção do Entra deve ser uma mudança posterior e independente.

## Critérios antes de implementar

- definição do responsável por criar, redefinir e desbloquear contas;
- política aprovada de senha, expiração de sessão e retenção de auditoria;
- decisão sobre recuperação de conta e segundo fator;
- ambiente de homologação separado e plano de rollback testado;
- revisão de segurança do pacote de hash escolhido no runtime Node.js 22;
- testes automatizados e de integração cobrindo autenticação e autorização.

Até esses critérios serem aprovados, o Entra ID é o único mecanismo de autenticação de produção.
