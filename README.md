# Meta Gestão Veicular — Firebase Blaze

Aplicação corporativa React + TypeScript para cadastros, documentos, vistorias, fotos, relatórios, credenciais e exportação XLSX. O Firebase é o provedor principal; a API Azure, o Azure SQL e o Blob Storage continuam no projeto como fallback reversível durante a homologação.

> Estado desta cópia: a arquitetura e o código Firebase estão preparados e testados localmente. A publicação depende das configurações manuais descritas abaixo: nome exato do bucket adicional de São Paulo, primeiro Admin, targets de Storage, identidade do GitHub Actions e autenticação/permissão da Firebase CLI.

## Arquitetura

```text
React + Vite + TypeScript
        │
        ├── Firebase Authentication (e-mail/senha)
        ├── Cloud Firestore (dados e metadados)
        ├── Cloud Storage adicional em São Paulo (arquivos privados)
        └── Callable Cloud Functions 2nd gen / Node 22 / southamerica-east1
                ├── validação e relacionamentos
                ├── unicidade transacional
                ├── conclusão/edição de vistorias
                ├── usuários, configurações e importação
                └── aprovação/emissão de credenciais + auditoria

Fallback: VITE_DATA_BACKEND=azure + VITE_AUTH_PROVIDER=azure
        └── Azure Static Web Apps + Functions + SQL + Blob privado
```

O React nunca recebe credenciais administrativas. A configuração `VITE_FIREBASE_*` identifica o Firebase Web App, mas não concede privilégios de Admin. A segurança efetiva é formada por Authentication, Rules e autorização nas Functions.

## O que cada área faz

```text
src/firebase/config.ts       inicialização central do SDK Web, bucket e App Check
src/auth/AuthContext.tsx     sessão, persistência, login, logout e redefinição de senha
src/lib/api.ts               fachada única; seleciona Firebase ou fallback Azure
src/lib/firebaseApi.ts       adapter Firestore/Functions compatível com as telas atuais
src/lib/files.ts             upload direto e privado para Storage + metadados Firestore
src/pages/                   telas existentes, relatório, edição e credenciais
functions/src/               operações confiáveis no backend Firebase
functions/scripts/           bootstrap opcional, sem senha ou chave versionada
firestore.rules              autorização Firestore, deny by default
storage.rules                regras do bucket da aplicação
storage.default.rules        bloqueio total do bucket default US-EAST1
firestore.indexes.json       índices compostos utilizados pelas consultas
firebase.json                Hosting, Functions, Firestore e dois targets de Storage
.firebaserc                  projeto Firebase autorizado
.github/workflows/           deploy Firebase e fallback Azure manual
api/, database/              backend e modelo Azure preservados
```

Detalhes técnicos da migração estão em [docs/FIREBASE_MIGRATION.md](docs/FIREBASE_MIGRATION.md). A contingência Azure está em [docs/AZURE_FALLBACK.md](docs/AZURE_FALLBACK.md).

## Pré-requisitos

- Node.js 22;
- pnpm 11;
- acesso ao projeto Firebase `gestaoveicular-47777`;
- plano Blaze ativo;
- Firebase CLI para configuração/deploy;
- um Web App Firebase já existente — não crie outro;
- bucket adicional do Cloud Storage localizado em São Paulo.

O ambiente de validação desta tarefa possuía Node 24, por isso os comandos exibem apenas um aviso de `engines`; o CI e o runtime estão fixados em Node 22.

## 1. Preparar o Firebase Console

### Authentication

1. Abra [Firebase Console](https://console.firebase.google.com/) e selecione `gestaoveicular-47777`.
2. Acesse **Build → Authentication → Sign-in method**.
3. Habilite **E-mail/senha**; não habilite cadastro público na interface da aplicação.
4. Em **Settings → Authorized domains**, confirme os domínios padrão do Firebase Hosting depois do primeiro deploy.

### Firestore

1. Acesse **Build → Firestore Database**.
2. Confirme o banco `(default)` no modo **Standard** e na localização `southamerica-east1`.
3. Não escolha regras de teste. As regras versionadas deste projeto começam negando tudo.

### Storage

1. Acesse **Build → Storage** e liste os buckets.
2. Copie o nome exato do bucket adicional localizado em São Paulo. Não suponha o sufixo.
3. Mantenha o bucket default em US-EAST1 fechado e sem arquivos da aplicação.
4. Não torne nenhum bucket público.

O upload usa o Firebase Storage SDK. Não é necessário criar CORS manual para o funcionamento normal do SDK. Se no futuro existir integração HTTP fora do SDK, permita somente as origens e métodos realmente usados.

## 2. Configurar o Web App local

1. No Console, abra **Project settings → General → Your apps**.
2. Selecione o Web App que já existe.
3. Em **SDK setup and configuration**, escolha **Config**.
4. Copie `.env.example` para `.env.local`.
5. Preencha somente as variáveis `VITE_FIREBASE_*` com a configuração exibida e o nome exato do bucket adicional.

```env
VITE_DATA_BACKEND=firebase
VITE_AUTH_PROVIDER=firebase
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=gestaoveicular-47777
VITE_FIREBASE_STORAGE_BUCKET=BUCKET_ADICIONAL_DE_SAO_PAULO
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_APPCHECK_SITE_KEY=
```

`.env.local` já está ignorado. Não coloque service account, private key, senha, token ou connection string em variáveis `VITE_*`.

## 3. Instalar e executar

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Abra `http://127.0.0.1:5173`. Sem uma conta Auth e um documento `users/{uid}` ativo, o login será corretamente negado.

### Modo de demonstração isolado

Para validar apenas a interface sem Firebase, use em `.env.local`:

```env
VITE_DEV_AUTH=true
VITE_DEV_API=true
```

Esse modo só funciona com `pnpm dev`. Builds de produção não ativam o mock.

## 4. Configurar os targets dos buckets

Esta etapa é propositalmente obrigatória. Sem ela, o deploy de Storage falha com segurança, evitando aplicar regras no bucket errado.

1. Autentique a CLI:

   ```bash
   firebase login
   firebase use gestaoveicular-47777
   ```

2. Associe o target `app` ao nome exato do bucket adicional de São Paulo:

   ```bash
   firebase target:apply storage app NOME_EXATO_BUCKET_SAO_PAULO
   ```

3. Associe `default-deny` ao bucket default de US-EAST1:

   ```bash
   firebase target:apply storage default-deny NOME_EXATO_BUCKET_DEFAULT
   ```

4. Confira a seção `targets` gerada em `.firebaserc`. Nomes de bucket não são secrets e essa associação deve ser versionada depois de revisada.
5. Nunca troque `storage.rules` por regras públicas para “fazer funcionar”.

## 5. Primeiro Administrador

Não existe bootstrap público. Faça uma única vez:

1. Em **Authentication → Users**, clique em **Add user**.
2. Informe o e-mail real do primeiro administrador.
3. Gere uma senha aleatória forte e descartável em um gerenciador; não a envie nem a registre no repositório.
4. Copie o **User UID** criado.
5. Em **Firestore Database**, crie a coleção `users` e um documento cujo ID seja exatamente esse UID.
6. Adicione os campos:

   | Campo | Tipo | Valor |
   | --- | --- | --- |
   | `name` | string | nome do administrador |
   | `email` | string | mesmo e-mail do Auth |
   | `role` | string | `admin` |
   | `active` | boolean | `true` |

7. Na tela de login, use **Esqueci minha senha** para definir uma senha conhecida somente pelo titular.
8. Entre e crie os demais usuários em **Administração → Usuários**. Eles também podem definir a senha pelo fluxo de redefinição.

Existe um bootstrap opcional em `functions/scripts/bootstrap.mjs` para settings, tipos documentais e perfil inicial. Ele requer Application Default Credentials e variáveis `FIREBASE_ADMIN_UID`, `FIREBASE_ADMIN_EMAIL` e `FIREBASE_ADMIN_NAME`; não recebe senha e se recusa a executar em outro projeto.

## 6. Dados iniciais sem dados fictícios

O documento `systemSettings/default` pode ser criado pelo script:

```bash
set GOOGLE_CLOUD_PROJECT=gestaoveicular-47777
pnpm --dir functions bootstrap
```

No Linux/macOS use `export` no lugar de `set`. Se não houver Application Default Credentials, crie manualmente o documento com:

- `minimumInspectionCompliance`: `90`;
- `maximumFleetAge`: `12`;
- `expiryAlertDays`: `30`;
- `credentialMaximumDays`: `365`;
- `allowProvisionalLicense`: `false`;
- `blockVehicleForAnyIrregularDriver`: `false`;
- `documentRequirements`: array vazio;
- `credentialDimensions`: array vazio.

Esses são parâmetros, não registros operacionais de demonstração.

## 7. Fluxos principais

- **Cadastros:** Functions validam campos, CNPJ, placa, IDs Firestore e vínculos reais.
- **Unicidade:** `uniqueKeys` impede CNPJ duplicado entre Cliente/Empresa, placa global, código de projeto por Cliente e matrícula por Empresa.
- **Relacionamentos:** assignments preservam histórico com `active`/`endedAt`; as entidades mantêm campos denormalizados necessários à UI.
- **Documentos:** upload privado direto, metadata central, status de validade calculado, substituição e inativação.
- **Vistorias:** 39 itens oficiais, horário `HH:mm`, data `YYYY-MM-DD`, resultado oficial na Function, snapshots e auditoria.
- **Edição:** Admin/Fiscalizador podem revisar uma vistoria concluída; score/resultado são recalculados e aprovações anteriores são invalidadas.
- **Fotos:** oito posições sugeridas e fotos adicionais dinâmicas; novas fotos podem ser anexadas em uma revisão.
- **Credenciais:** vistoria aprovada não libera credencial. O fluxo é solicitação → análise do Fiscalizador/Admin → emissão persistida → impressão.
- **Relatórios:** impressão A4/PDF pelo navegador, checklist, não conformidades, fotos e logos dinâmicas.
- **Importação:** preview local; cada gravação passa novamente pela Function e pelas mesmas validações de unicidade/relacionamento. A Function `bulkImport` aceita lotes de até 200 linhas para evolução controlada.
- **Exportação:** XLSX achatado continua disponível para Excel/Power BI.

## 8. Testes e build

Os testes automatizados usam dados locais/mocks e não escrevem no Firebase real.

```bash
pnpm typecheck
pnpm test:all
pnpm build:all
```

Não há script `lint` nesta base. TypeScript strict, Vitest e o build Vite/Functions são os gates existentes.

## 9. Deploy manual

Somente depois de configurar os dois targets de Storage e executar os três comandos acima:

```bash
firebase use gestaoveicular-47777
firebase deploy --only firestore --project gestaoveicular-47777
firebase deploy --only storage --project gestaoveicular-47777
firebase deploy --only functions --project gestaoveicular-47777
firebase deploy --only hosting --project gestaoveicular-47777
```

Ou, após validar cada parte:

```bash
pnpm firebase:deploy
```

O Hosting publica `dist`, reescreve rotas da SPA para `index.html`, não cacheia agressivamente o HTML e aplica cache imutável aos assets com hash.

## 10. GitHub Actions

O workflow `.github/workflows/firebase-deploy.yml` executa install, typecheck, todos os testes e `build:all` antes do deploy. Ele usa Workload Identity Federation, sem JSON de service account no repositório.

Configure no environment/repositório GitHub:

### Secrets

- `VITE_FIREBASE_API_KEY`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

### Variables

- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_APPCHECK_SITE_KEY` (deixe vazio enquanto App Check não for configurado)

No Google Cloud IAM, a identidade federada deve poder personificar uma service account de deploy com somente as permissões necessárias para Hosting, Firestore Rules/Indexes, Storage Rules e Functions do projeto.

O workflow Azure continua em `.github/workflows/azure-static-web-apps.yml`, mas agora só executa manualmente por `workflow_dispatch`. Seu secret `AZURE_STATIC_WEB_APPS_API_TOKEN` e os parâmetros originais de deploy foram preservados.

## 11. App Check

O código está preparado para reCAPTCHA Enterprise quando `VITE_FIREBASE_APPCHECK_SITE_KEY` estiver preenchida em produção. `enforceAppCheck` permanece desabilitado nas Functions para não bloquear o primeiro deploy.

Sequência segura:

1. publique e valide Auth, Rules, Functions e Storage;
2. crie uma chave reCAPTCHA Enterprise para os domínios do Hosting;
3. preencha a variável;
4. observe métricas App Check;
5. somente depois habilite enforcement no Console e altere `enforceAppCheck` para `true` nas Functions.

## 12. Segurança e custos

- Rules começam com negação e não usam acesso público.
- `users/{uid}` é a fonte de verdade de role e estado ativo.
- operações críticas passam por Functions/Admin SDK e geram `auditLogs`.
- fotos, documentos e logos ficam em bucket privado.
- uploads com metadata inválida tentam limpar o objeto recém-enviado.
- listas possuem limite; dashboard usa agregações de contagem.
- não há listeners globais nem leitura em tempo real de coleções grandes.
- não há secret novo versionado.

## 13. Fallback Azure

Para voltar temporariamente ao Azure, gere o frontend com:

```env
VITE_DATA_BACKEND=azure
VITE_AUTH_PROVIDER=azure
```

Depois execute manualmente o workflow **Azure Static Web Apps CI/CD**. A pasta `api`, migrations SQL, `staticwebapp.config.json`, SAS/Blob e Application Settings não foram removidos nem modificados pela migração funcional Firebase.

Nunca versione `.env.local`, `api/local.settings.json`, credenciais Google, service account JSON, tokens, connection strings, exports ou senhas.
