# CLAUDE.md

Este arquivo orienta o Claude Code (claude.ai/code) ao trabalhar com o código deste repositório.

## Projeto

Meta Gestão Veicular: SPA corporativa em React 19 + TypeScript + Vite para gestão de frota (clientes, empresas, projetos, motoristas, veículos, documentos, vistorias de 39 itens com fotos, aprovação e emissão de credenciais, importação e exportação XLSX). O Firebase (projeto `gestaoveicular-47777`, região `southamerica-east1`) é o backend principal. O backend Azure (`api/`, `database/`) é mantido como fallback reversível. Todos os textos da interface, mensagens de erro, docs e o histórico de commits estão em português do Brasil, então mantenha em pt-BR os novos textos exibidos ao usuário.

## Comandos

Use Node 22 e pnpm 11. É um workspace pnpm: a raiz é o frontend, e `api/` e `functions/` são pacotes do workspace.

```bash
pnpm install --frozen-lockfile
pnpm dev                 # Vite em http://127.0.0.1:5173 (strictPort); faz proxy de /api -> 127.0.0.1:7071 (Azure Functions)
pnpm typecheck           # tsc -b do frontend + api + functions
pnpm test                # somente o Vitest do frontend (src/**/*.test.ts, ambiente node)
pnpm test:all            # testes do frontend + api + functions
pnpm build:all           # vite build + tsc da api + tsc das functions (saída em functions/lib)
```

Para rodar um único teste:

```bash
pnpm exec vitest run src/lib/format.test.ts          # arquivo do frontend
pnpm exec vitest run -t "nome do teste"              # frontend, pelo nome do teste
pnpm --dir functions exec vitest run src/validation.test.ts
pnpm --dir api exec vitest run src/tests/checklist.test.ts
```

Não há script de lint. As validações são `pnpm typecheck`, `pnpm test:all` e `pnpm build:all`, que também é a ordem em que o CI as executa. Os testes usam apenas dados locais e mocks e nunca acessam o projeto Firebase real.

**Deploy:** um push em `main` dispara `.github/workflows/firebase-deploy.yml`, que roda as três validações e depois faz `firebase deploy` de tudo em produção. O workflow Azure é somente `workflow_dispatch`. Deploys manuais usam `firebase deploy --only <firestore|storage|functions|hosting> --project gestaoveicular-47777`. O deploy de Storage exige os targets de bucket `app` e `default-deny` aplicados no `.firebaserc`; nunca invente nomes de bucket.

## Desenvolvimento local sem Firebase

Defina `VITE_DEV_AUTH=true` e `VITE_DEV_API=true` no `.env.local` para direcionar todas as chamadas a `src/lib/mockApi.ts` (um backend falso em memória). Isso só funciona com `pnpm dev`, porque a verificação inclui `import.meta.env.DEV`. Com a configuração real do Firebase, o login também exige uma conta no Auth e um documento `users/{uid}` ativo no Firestore.

## Arquitetura

### Fachada única de backend: `api(path, init)`

Páginas e componentes nunca acessam o Firestore ou as Functions diretamente. Eles chamam `api<T>("/vehicles?active=true", { method, body })` de `src/lib/api.ts` com caminhos no estilo REST, geralmente via TanStack Query. O `api.ts` então escolhe uma de três implementações:

1. `mockApi.ts`: o modo mock de desenvolvimento descrito acima.
2. `firebaseApi.ts` (o padrão): `firebaseRequest` interpreta o caminho e o método e, em seguida, lê o Firestore diretamente (listas, contagens do dashboard, documentos, detalhe da vistoria com URLs de download do Storage) ou encaminha as gravações a uma callable Function (`manageEntity`, `manageUser`, `completeInspection`, `updateInspection`, `deleteInspection`, `updateSettings`, as Functions de credencial, `bulkImport`). Ele converte os códigos de `HttpsError` em status no estilo HTTP dentro de `ApiError`.
3. `VITE_DATA_BACKEND=azure`: um `fetch('/api' + path)` simples para as Azure Functions em `api/`.

Os caminhos REST são o contrato comum às três implementações. Uma nova operação normalmente exige uma rota em `firebaseApi.ts`, um export em `functions/src/index.ts` e (se o mock precisar suportá-la) um handler em `mockApi.ts`. Caminhos sem correspondência lançam "Operação ainda não disponível no adaptador Firebase."

`src/lib/files.ts` (`uploadManagedFile`) segue a mesma divisão em três para uploads. No modo Firebase, ele envia o arquivo direto ao Storage, depois grava o documento de metadados e apaga o objeto enviado se a gravação dos metadados falhar. Os caminhos no Storage são `documents/{entityType}/{entityId}/{docId}/{name}`, `inspections/{id}/photos/{photoId}/{name}` e `{clients|companies|vehicles}/{id}/{branding|cover}/...`.

A autenticação segue o mesmo padrão: `src/auth/AuthContext.tsx` alterna conforme `VITE_AUTH_PROVIDER`. O Firebase usa e-mail e senha (`src/firebase/authService.ts`), e o papel do usuário vem de `users/{uid}`, não de claims do Auth. O Azure usa o fluxo `/.auth/me` do Static Web Apps com Microsoft Entra ID. Os módulos do SDK Firebase são carregados por imports dinâmicos para que os builds mock e Azure não inicializem o Firebase. `src/firebase/config.ts` é o único lugar em que o SDK é inicializado (incluindo o App Check).

### Fronteira de confiança: Rules + Functions

- `firestore.rules` nega tudo por padrão. O navegador pode **ler** um conjunto permitido de coleções, mas só pode **gravar** poucas coisas específicas: metadados em `documents`, metadados de fotos em `inspections/{id}/photos` e os campos de caminho de logo/capa em clientes, empresas e veículos. Todo o resto é gravado somente pelas Functions via Admin SDK: entidades, usuários, vistorias, configurações, credenciais, `uniqueKeys` e `auditLogs`.
- Os papéis são apenas `admin` e `inspector` ("Fiscalizador"). `functions/src/auth.ts` (`requireActiveUser`/`requireAdmin`) relê `users/{uid}` a cada chamada. As proteções de rota em `src/App.tsx` servem apenas à experiência do usuário.
- As Functions (`functions/src/`, 2nd gen, Node 22) validam a entrada com Zod (`validation.ts` contém os helpers de CNPJ, placa, ID do Firestore e datas), verificam os relacionamentos dentro de uma transação do Firestore, reservam a unicidade por meio de documentos em `uniqueKeys` (`cnpj:`, `plate:`, `project-code:{clientId}:`, `driver-registration:{companyId}:` em cada empresa vinculada ao motorista, `inspection-sequence:{vehicleId}:{n}`) e gravam uma entrada em `auditLogs` na mesma transação.
- Os testes das Functions que precisam de transação usam `functions/src/transactionFixture.ts`, que simula leituras, consultas (casadas por `Query.isEqual`) e gravações em memória.
- `functions/src/rules.test.ts` verifica as invariantes por **correspondência de texto** nos arquivos de rules, então reescrever as rules pode quebrá-lo.
- Novas consultas compostas precisam de uma entrada em `firestore.indexes.json`. Uma coleção que passe a ser lida pelo navegador precisa ser adicionada à lista permitida em `firestore.rules`.

### Regras de domínio que envolvem vários arquivos

- **Checklist:** os 39 itens oficiais estão definidos em três lugares e precisam permanecer idênticos: `src/data/checklist.ts` (interface), `functions/src/checklist.ts` (validação no servidor) e `api/src/services/checklist.ts` (Azure).
- **Vistorias:** o resultado é calculado no servidor (`calculateInspection` em `functions/src/inspections.ts`): o percentual de conformidade sobre os itens aplicáveis, comparado a `systemSettings/default.minimumInspectionCompliance` (padrão 90), resulta em `APROVADO` ou `REPROVADO`. Os códigos são `VST-000001`, obtidos do contador `systemSettings/inspectionSequence`. A sequência por veículo ("1ª vistoria") é outra coisa: fica persistida em `inspection.sequence`, é editável (lançamentos retroativos, lacunas permitidas) e única por veículo. Vistorias legadas sem `sequence` são numeradas em ordem cronológica entre as legadas, com o mesmo algoritmo em `functions/src/inspectionSequence.ts` e `src/lib/inspectionTimeline.ts` (mantenha os dois idênticos). O servidor congela essas sequências legadas na primeira gravação que envolve o veículo. Cada vistoria guarda um `snapshot` denormalizado de cliente, empresa, projeto, veículo, motorista, perfil de acesso e fiscalizador, e as listas e relatórios leem os nomes desse snapshot. Editar uma vistoria concluída recalcula o resultado, preserva `createdAt`/`completedAt` e invalida os `credentialApprovals` aprovados. A exclusão é **definitiva** (`purgeInspection` em `functions/src/inspectionDeletion.ts`, somente admin): na mesma transação apaga a vistoria, a subcoleção `photos`, os `credentialApprovals` e `credentials` do mesmo `inspectionId` e a chave de sequência, e grava `auditLogs` (`inspection.purged`). Depois remove `inspections/{id}/` do Storage pelo Admin SDK (bucket do parâmetro `APP_STORAGE_BUCKET`, padrão igual ao target `app`). Se essa limpeza falhar, retorna `pendingStoragePaths` e o `firebaseApi.ts` tenta apagar os arquivos com a sessão do usuário. Registros antigos com `deleted: true` continuam filtrados na leitura. As fotos são enviadas depois que a transação da vistoria é confirmada.
- **Credenciais:** uma vistoria aprovada não emite credencial por si só. O fluxo é elegibilidade, depois solicitação de aprovação, depois decisão de um admin ou fiscalizador, depois emissão persistida e, por fim, impressão pelo navegador.
- **Relacionamentos:** as coleções de vínculo (`companyProjectAssignments`, `vehicleDriverAssignments`, `vehicleProjectAssignments`, `vehicleCompanyAssignments`, `driverCompanyAssignments`) preservam o histórico por meio de `active`/`endedAt`, enquanto as entidades também guardam IDs denormalizados (por exemplo `vehicle.driverIds`) dos quais a interface e as Functions dependem. Veículos e motoristas podem atender várias empresas: `companyIds` é a lista e `companyId` é a empresa principal, mantida para retrocompatibilidade. Registros legados só têm `companyId`, então sempre leia os vínculos pelos helpers `entityCompanyIds`/`isLinkedToCompany` (`src/lib/companyLinks.ts`) e `linkedCompanyIds`/`isLinkedToCompany` (`functions/src/companyLinks.ts`), nunca comparando `companyId` diretamente. O veículo continua com um único `projectId`. Empresas podem ser aninhadas (`parentCompanyId`, subcontratadas) e são validadas por `companyHierarchy.ts`.
- Datas são strings `YYYY-MM-DD` e horários são `HH:mm`. Os Timestamps do Firestore são convertidos em strings ISO em `firebaseApi.ts` (`plain`).

### Estrutura do frontend

`src/` é praticamente plano: `pages/` (rotas definidas em `App.tsx` com caminhos em português, como `/vistorias` e `/veiculos`), `components/` e `lib/` (lógica pura com `*.test.ts` ao lado, além dos adaptadores de API). `EntityPage.tsx` é uma única página CRUD genérica, controlada pela prop `entity`, para veículos, motoristas, empresas, clientes e projetos. O CSS é composto por folhas de estilo globais simples por área (`src/*.css`). Os diretórios `src/hooks`, `src/services`, `src/utils`, `src/config`, `src/contexts`, `src/types`, `src/mocks`, `src/styles`, `src/test` e `src/assets` são estrutura vazia. Os tipos compartilhados ficam em `src/types.ts`, e `@/` é alias de `src/`.

### Fallback Azure e pastas legadas

- `api/`: Azure Functions v4 com `mssql` e uploads via SAS do Blob, organizada em `functions/`, `repositories/`, `validation/` e `middleware/withApi.ts`, com testes em `api/src/tests`. `database/*.sql` contém o schema e as migrations do Azure SQL. Mantenha essas partes compilando e com os testes passando, mas não adicione funcionalidades nelas sem que isso seja pedido. Veja `docs/AZURE_FALLBACK.md`.
- `migration/` e `MIGRATION_FIREBASE_TO_AZURE.md` são um ETL antigo e pontual da aplicação legada V2 para o Azure SQL. Não fazem parte da aplicação Firebase atual. `docs/FIREBASE_MIGRATION.md` descreve o design Firebase atual.

## Secrets e configuração

As variáveis `VITE_*` são apenas configuração pública do Web App (veja `.env.example`). Service accounts, connection strings e senhas nunca devem ir para variáveis `VITE_*` nem para o repositório. Os secrets do Azure (`SQL_CONNECTION_STRING`, `AZURE_STORAGE_CONNECTION_STRING`) ficam somente em `api/local.settings.json` e nas configurações do SWA. O CI se autentica no GCP via Workload Identity Federation. `enforceAppCheck` está intencionalmente `false` em todas as callables até a implantação do App Check (veja o README, seção 11).

Para contexto funcional, histórico e decisões de produto, consulte `PROJECT_CONTEXT.md` antes de implementar alterações relevantes.
