# Meta Gestão Veicular — Azure

Nova versão da aplicação corporativa de gestão e vistoria de veículos. O projeto preserva o fluxo funcional da V2, mas substitui a execução em Firebase/JavaScript puro por React, Azure Functions, Azure SQL e Blob Storage privado.

Esta pasta é independente. A V2 original não foi alterada e pode continuar servindo como contingência durante a homologação.

## O que está pronto

- autenticação corporativa pelo Microsoft Entra ID, integrada ao Azure Static Web Apps;
- perfis internos `admin`, `inspector` e `supplier`;
- isolamento de fornecedores por `company_id` validado pela API;
- dashboard, clientes, projetos, empresas, motoristas, veículos, usuários e perfis de acesso;
- documentos privados com URLs SAS curtas;
- checklist oficial com 39 itens, divididos em 10 + 12 + 9 + 8;
- cálculo de conformidade e resultado repetido no servidor;
- código sequencial por veículo e snapshots históricos;
- até oito posições fotográficas, com redução da imagem no navegador;
- histórico, reprovações e relatório profissional para impressão A4/PDF;
- registro fotográfico com três imagens por linha na impressão;
- credenciais veiculares individuais ou em lote;
- exportação XLSX achatada para Excel e Power BI;
- scripts SQL, migração controlada e workflow de implantação.

## Arquitetura

```text
Navegador
  React + Vite + TypeScript
          │ HTTPS /api
          ▼
Azure Static Web Apps + Microsoft Entra ID
          │ x-ms-client-principal
          ▼
Azure Functions (Node.js + TypeScript)
       ├── Azure SQL: dados relacionais, snapshots e auditoria
       └── Blob Storage privado: fotos, documentos e logos de clientes
```

O navegador nunca recebe senha do SQL, chave do Storage ou cadeia de conexão. Uploads usam uma URL SAS de escrita válida por 10 minutos. Downloads usam uma URL SAS de leitura válida por 5 minutos.

Nesta fase, a API é a Azure Functions gerenciada pelo Static Web Apps no plano Free. Por isso, SQL e Blob são acessados por connection strings mantidas exclusivamente nas **Application Settings do backend**. Elas não usam o prefixo `VITE_`, não são incluídas no build React e não podem ser versionadas.

## Estrutura de pastas

```text
src/                         interface React
  auth/                      sessão do usuário
  components/                layout e componentes reutilizáveis
  data/                      definição do checklist oficial
  lib/                       API, imagens, formatação e mock local
  pages/                     telas do sistema
api/                         Azure Functions
  src/functions/             rotas HTTP
  src/middleware/            autenticação e tratamento de erros
  src/repositories/          consultas parametrizadas ao SQL
  src/services/              SQL, Blob e regras do checklist
database/                    criação do banco e modelos auxiliares
migration/                   ferramentas isoladas da migração Firebase → Azure
public/assets/               logos fornecidas para a aplicação
.github/workflows/           CI/CD do Static Web Apps
staticwebapp.config.json      rotas, autenticação e cabeçalhos de segurança
```

## Recursos Azure já definidos

O projeto foi preparado somente para os recursos informados:

- Resource Group: `rg-meta-gestao-veicular`
- Região: `Brazil South`
- SQL Server: `sql-meta-gestao-veicular`
- Banco: `sqldb-meta-gestao-veicular`
- Storage Account: `stmetacsgestaoveicular`
- Container privado: `appfiles`
- Static Web App: `swa-meta-gestao-veicular`
- Repositório: `gestao-veicular`
- Branch: `main`

Nenhum recurso novo é criado pelo código.

## Primeira execução local — modo de demonstração

Este modo não acessa Azure, Firebase ou dados reais. Os registros de demonstração ficam apenas na memória do navegador e desaparecem ao reiniciar o servidor.

1. Instale Node.js 22 e pnpm 11.
2. Abra um terminal nesta pasta.
3. Execute:

   ```bash
   pnpm install
   ```

4. Copie `.env.example` para `.env.local`.
5. No arquivo `.env.local`, use explicitamente:

   ```env
   VITE_DEV_AUTH=true
   VITE_DEV_API=true
   ```

6. Execute:

   ```bash
   pnpm dev
   ```

7. Abra `http://127.0.0.1:5173`.

O mock só é aceito quando `import.meta.env.DEV` é verdadeiro **e** as duas variáveis acima estão habilitadas. Um build de produção não possui essa porta de entrada.

## Executar localmente com a API real

1. Instale Azure Functions Core Tools 4 e tenha acesso ao SQL/Storage de desenvolvimento.
2. Copie `api/local.settings.example.json` para `api/local.settings.json`.
3. Substitua os marcadores de `SQL_CONNECTION_STRING` e `AZURE_STORAGE_CONNECTION_STRING` por valores do ambiente de desenvolvimento. Se usar Azurite, substitua também o marcador de `AzureWebJobsStorage` por `UseDevelopmentStorage=true`.
4. Não versione esse arquivo: ele já está no `.gitignore` e deve permanecer apenas na máquina do desenvolvedor.
5. Para autenticação local explícita, configure no arquivo:

   ```json
   "AZURE_FUNCTIONS_ENVIRONMENT": "Development",
   "DEV_AUTH": "true",
   "DEV_AUTH_USER_ID": "local-admin",
   "DEV_AUTH_EMAIL": "seu-email-corporativo@empresa.com"
   ```

6. O `identity_provider_id` informado precisa existir em `dbo.app_users`.
7. Na raiz, deixe `VITE_DEV_AUTH=false` e `VITE_DEV_API=false`.
8. Em dois terminais, execute:

   ```bash
   cd api
   func start
   ```

   ```bash
   pnpm dev
   ```

O modo `DEV_AUTH` da API falha se o ambiente não for `Development` ou se a chamada não vier de `localhost`/`127.0.0.1`.

## Preparar o Azure SQL

1. No portal Azure, confirme um administrador do servidor SQL para `sql-meta-gestao-veicular`.
2. Conecte ao banco `sqldb-meta-gestao-veicular` usando essa conta administrativa.
3. Execute [database/001_schema.sql](database/001_schema.sql).
4. Crie um usuário SQL contido e exclusivo para a API, com senha forte gerada fora do repositório. Não use a conta administrativa na aplicação:

   ```sql
   CREATE USER [meta_gestao_api] WITH PASSWORD = '<SENHA_FORTE_FORA_DO_GIT>';
   ALTER ROLE db_datareader ADD MEMBER [meta_gestao_api];
   ALTER ROLE db_datawriter ADD MEMBER [meta_gestao_api];
   ```

5. Monte `SQL_CONNECTION_STRING` com esse usuário, apontando diretamente para o banco da aplicação:

   ```text
   Server=tcp:sql-meta-gestao-veicular.database.windows.net,1433;Initial Catalog=sqldb-meta-gestao-veicular;Persist Security Info=False;User ID=meta_gestao_api;Password=<SENHA_REAL>;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;
   ```

6. Cadastre a string somente nas Application Settings do backend, conforme a seção abaixo.
7. Crie o primeiro perfil interno usando [database/002_first_admin.template.sql](database/002_first_admin.template.sql). Substitua apenas os marcadores; o arquivo não contém credenciais.

`database/test_data.local.sql` é exclusivamente demonstrativo. Não execute em produção.

## Preparar o Blob Storage

1. Confirme que o container `appfiles` está com nível de acesso **Private**.
2. Na conta `stmetacsgestaoveicular`, abra **Security + networking → Access keys** e copie uma connection string.
3. Cadastre-a somente como `AZURE_STORAGE_CONNECTION_STRING` nas Application Settings do backend.
4. Não torne o container público, não crie SAS permanente e não coloque chave/connection string no React, GitHub, workflow ou qualquer arquivo versionado.
5. Se uma chave for exposta, rotacione-a no Storage Account e atualize imediatamente a Application Setting.

Caminhos usados:

```text
clients/{clientId}/branding/{uuid}.png
companies/{companyId}/documents/{uuid}.pdf
drivers/{driverId}/documents/{uuid}.pdf
vehicles/{vehicleId}/documents/{uuid}.pdf
inspections/{inspectionId}/photos/{uuid}.jpg
```

### CORS do Blob Storage

O upload é feito diretamente pelo navegador para uma SAS temporária. Configure uma regra CORS somente para o serviço **Blob**:

1. abra `stmetacsgestaoveicular` no Portal Azure;
2. acesse **Settings → Resource sharing (CORS)**;
3. na aba **Blob service**, adicione uma regra com:

   | Campo | Valor |
   | --- | --- |
   | Allowed origins | `https://<DOMINIO-PADRAO-DO-SWA>` |
   | Allowed methods | `GET`, `HEAD`, `PUT` |
   | Allowed headers | `content-type,x-ms-blob-type` |
   | Exposed headers | `etag,x-ms-request-id` |
   | Max age | `3600` |

4. copie o domínio exato exibido em **swa-meta-gestao-veicular → Overview → URL**; não inclua barra final;
5. adicione uma regra/origem explícita para cada domínio personalizado ou ambiente de homologação que realmente fará upload;
6. salve e teste um upload. Não use `*` em produção.

CORS não concede acesso aos blobs: a autorização continua dependendo da SAS curta gerada pela API, e o container permanece privado.

## Configurações do Static Web Apps

No Portal Azure, abra **swa-meta-gestao-veicular → Settings → Environment variables** (Application Settings do backend). Cadastre exatamente:

```text
SQL_CONNECTION_STRING=<CONNECTION_STRING_COMPLETA_DO_AZURE_SQL>
AZURE_STORAGE_CONNECTION_STRING=<CONNECTION_STRING_COMPLETA_DA_STORAGE_ACCOUNT>
AZURE_STORAGE_CONTAINER=appfiles
DEV_AUTH=false
```

Esses quatro valores são configurações da API. Não os duplique em `.env`, `.env.local`, variáveis `VITE_*`, código React, GitHub Actions ou secrets usados no build do frontend. Configure-os no ambiente de produção e em cada ambiente de homologação que precisar acessar SQL/Blob, usando credenciais próprias quando possível. Após salvar, reinicie/reimplante a aplicação e faça um teste de saúde e upload.

O arquivo `staticwebapp.config.json` protege `/api/*`, mantém o login visível e aplica CSP, proteção contra iframe e políticas de conteúdo.

O login usa `/.auth/login/aad`. Depois que o Entra autentica a identidade, a API procura o usuário em `dbo.app_users`; uma conta corporativa sem perfil interno recebe acesso negado.

## Implantação pelo GitHub

O workflow está em `.github/workflows/azure-static-web-apps.yml` e executa instalação, testes e build antes do deploy.

Como esta cópia de trabalho não continha a pasta `.git` nem um workflow anterior, não foi possível preservar o nome exato do secret gerado pelo portal. Antes do primeiro push:

1. abra o workflow que já existe no repositório `gestao-veicular`;
2. compare o nome do secret de token;
3. mantenha o secret existente ou ajuste `AZURE_STATIC_WEB_APPS_API_TOKEN` para esse nome;
4. copie estes arquivos para o repositório;
5. abra um Pull Request para `main`;
6. valide o ambiente de preview;
7. faça o merge somente depois da homologação.

Não há credencial no workflow incluído.

## Fotos e documentos

Fotografias são preparadas no navegador com dimensão máxima de 1920 px e qualidade JPEG de 82%. O original nunca é salvo em `localStorage`. No Azure:

1. a API valida permissão, tipo e tamanho;
2. gera uma SAS curta para um caminho controlado;
3. o navegador envia o arquivo diretamente ao container privado;
4. a API confirma metadados no SQL;
5. relatórios recebem apenas uma URL temporária de leitura.

Documentos aceitos: PDF, JPG, PNG, DOCX e XLSX, até 10 MB. Fotos: JPG ou PNG, até 20 MB antes da redução.

## Clientes e identidade visual

A marca Meta é global e usa a nova logo branca fornecida no login/menu. Klabin não é fixa na aplicação: é um cliente de demonstração e sua logo aparece somente porque o registro do cliente aponta para ela. Em produção, faça upload da logo de cada cliente no cadastro correspondente. O snapshot da vistoria guarda a identidade do cliente existente na data da inspeção.

## Relatórios e PDF

Abra **Histórico → Relatório → Imprimir / Salvar PDF**. O navegador mostra sua janela de impressão. Escolha **Salvar como PDF**.

Os estilos incluem `@page { size: A4 }`, removem navegação/botões, evitam cortes nos cards e criam uma página separada para o registro fotográfico.

## Testes e verificação

```bash
pnpm typecheck
pnpm test:all
pnpm build:all
```

Testes atuais cobrem autenticação, decodificação segura do principal, checklist oficial, cálculo de conformidade, estrutura das categorias e interpretação segura da connection string do Blob.

Checklist manual recomendado:

1. entrar com administrador, fiscalizador e fornecedor;
2. confirmar que o fornecedor enxerga apenas sua empresa;
3. cadastrar cada entidade e editar o registro;
4. anexar e abrir um documento;
5. criar vistoria sem fotos;
6. criar vistoria com fotos e substituir/remover antes de salvar;
7. abrir relatório e conferir snapshots, checklist e fotos;
8. usar a visualização de impressão A4 e salvar PDF;
9. exportar XLSX e abrir no Excel/Power BI;
10. verificar o console do navegador e logs da Function.

## Migração da V2

Leia [MIGRATION_FIREBASE_TO_AZURE.md](MIGRATION_FIREBASE_TO_AZURE.md) antes de manipular dados reais. A migração usa exportação imutável, IDs determinísticos, tabela de rastreio, cópia dos arquivos e consultas de reconciliação. Ela não apaga dados do Firebase.

## Segurança e próximos passos

- revisar políticas de retenção e backup do SQL/Blob;
- restringir o Entra ao grupo corporativo autorizado;
- ativar alertas e monitoramento no Azure;
- aplicar regras de rede compatíveis com o plano do Static Web Apps;
- executar teste de restauração antes do corte definitivo;
- remover o acesso à V2 somente após aceite formal e período de contingência.

Managed Identity pode substituir essas credenciais futuramente se a API migrar para uma **Function App dedicada** e for integrada ao Static Web Apps em um plano compatível com backend próprio. Até essa mudança arquitetural, não ative nem conceda identidade do Static Web App para acesso a SQL ou Blob.

Nunca versione `.env.local`, `api/local.settings.json`, exports da migração, tokens, chaves ou senhas.
