# PROJECT_CONTEXT.md

> Contexto funcional, histórico e de produto do **Meta Gestão Veicular**.
> Este arquivo complementa o `CLAUDE.md`: o `CLAUDE.md` deve continuar sendo a referência técnica curta do repositório; este documento registra decisões de negócio, evolução do produto, UX aprovada, infraestrutura operacional e cuidados de compatibilidade.
>
> **Atualizado em:** 2026-09-29

---

## 1. Visão geral do produto

O **Meta Gestão Veicular** é um sistema web corporativo criado para substituir um processo operacional que antes dependia fortemente de planilhas, arquivos Excel, documentos dispersos e organização manual em SharePoint.

O sistema centraliza:

- Clientes
- Empresas
- Projetos
- Motoristas
- Veículos
- Vistorias
- Documentos
- Perfis de circulação e acesso
- Aprovação e emissão de credenciais veiculares
- Importação e exportação XLSX
- Indicadores operacionais
- Auditoria e rastreabilidade

O público principal é o time operacional/fiscalizador em campo, com uso administrativo por responsáveis da Meta Central de Serviços.

O objetivo do produto não é apenas digitalizar uma planilha. Ele deve reduzir retrabalho, inconsistências, duplicidades e erros manuais, além de criar uma fonte única e rastreável para os dados usados em operação, credenciais e BI.

---

## 2. Situação anterior ao sistema

Antes do Meta Gestão Veicular, o fluxo era aproximadamente:

1. Checklist de vistoria preenchido manualmente.
2. Informações eram transferidas para um Excel contendo veículo, motorista, empresa, checklist e documentação.
3. Informações principais eram copiadas para outra base Excel que calculava métricas e apoiava a geração de credenciais.
4. Arquivos XLSX, fotos e documentos eram armazenados em SharePoint.
5. Para BI, múltiplos arquivos eram carregados e combinados em Power Query.
6. Indicadores dependiam de várias etapas manuais.

Problemas do fluxo antigo:

- duplicação de digitação;
- maior chance de divergência entre bases;
- pouca rastreabilidade;
- dificuldade de saber qual arquivo era o mais recente;
- arquivos e evidências espalhados;
- geração de credencial dependente de controles paralelos;
- BI dependente da padronização manual dos arquivos;
- dificuldade de escalar o processo.

O sistema atual deve sempre preservar a ideia de **fonte única, rastreável e operacional**, evitando reintroduzir controles paralelos que recriem o problema antigo.

---

## 3. Evolução arquitetural

### 3.1. Primeira fase — Firebase

O projeto começou originalmente utilizando Firebase para Authentication, Firestore, Storage e Hosting.

### 3.2. Segunda fase — Azure

Por questões de custo/conta e disponibilidade naquele momento, o projeto foi migrado para Azure.

A fase Azure utilizou:

- Azure Static Web Apps
- Azure Functions
- Azure SQL Database
- Azure Storage
- Microsoft/Entra para autenticação em parte do fluxo

Essa versão chegou a funcionar em piloto e os artefatos Azure permanecem no repositório como fallback/legado.

### 3.3. Arquitetura atual — Firebase Blaze

Após a liberação de uma conta Firebase Blaze, foi tomada a decisão de voltar integralmente para Firebase.

Projeto Firebase atual:

```text
Nome: GestaoVeicular
Project ID: gestaoveicular-47777
Project number: 579650096078
Região principal: southamerica-east1
```

A arquitetura Firebase atual é a principal e deve receber novas funcionalidades.

O Azure deve continuar compilando e com testes passando, mas **não deve receber novas funcionalidades por padrão**.

---

## 4. Repositório e ambiente local

Repositório:

```text
cantazini/gestao-veicular
```

Pasta local principal no Windows:

```text
C:\Users\Home\Documents\GitHub\gestao-veicular
```

Stack principal:

- React 19
- TypeScript
- Vite
- Node.js 22
- pnpm 11
- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Cloud Functions 2nd Gen
- Firebase Hosting

O `CLAUDE.md` contém a arquitetura técnica detalhada, comandos e contratos internos. Não duplicar desnecessariamente esses detalhes aqui.

---

## 5. Ambientes e URLs

URL principal personalizada:

```text
https://gestao-veicular.metacs.com.br
```

URL Firebase Hosting:

```text
https://gestaoveicular-47777.web.app
```

O domínio personalizado não deve ser hardcoded em regras de negócio. Quando houver URLs absolutas, preferir configuração apropriada.

---

## 6. Política de deploy

O deploy é uma ação controlada.

O agente de código **não deve executar deploy, commit ou push sem solicitação explícita**.

Comandos usados historicamente:

```powershell
pnpm.cmd build
pnpm.cmd exec firebase deploy --only "hosting,firestore:rules,storage" --project gestaoveicular-47777
```

Para Functions específicas:

```powershell
pnpm.cmd exec firebase deploy --only "functions:manageEntity,functions:bulkImport" --project gestaoveicular-47777
```

Para Hosting:

```powershell
pnpm.cmd exec firebase deploy --only hosting --project gestaoveicular-47777
```

Antes de publicar, sempre informar quais componentes realmente mudaram:

- Hosting
- Functions
- Firestore Rules
- Firestore Indexes
- Storage Rules

Não recomendar deploy de tudo sem necessidade.

### Atenção ao `main`

O workflow do GitHub pode publicar em produção quando há push em `main`.

Portanto:

- não fazer `git push` automaticamente;
- não fazer `git commit` automaticamente;
- sempre mostrar o diff e os testes antes;
- tratar `main` como branch com consequência real de produção.

---

## 7. Firebase atual

### Authentication

Provider principal:

- Email/Password

Perfis internos:

- `admin`
- `inspector`

O papel efetivo do usuário vem do documento `users/{uid}` e não de custom claims.

### Firestore

Banco:

```text
(default)
```

Região:

```text
southamerica-east1
```

Rules negam tudo por padrão e liberam apenas leituras/escritas específicas.

### Storage

Bucket de arquivos da aplicação:

```text
gestaoveicular-47777-files-sp
```

O projeto também possui bucket default protegido/deny-all.

Nunca usar um bucket paralelo sem necessidade.

---

## 8. IAM e problemas de infraestrutura já resolvidos

Este projeto já enfrentou falhas de IAM importantes. Evitar "corrigir" essas permissões sem entender o histórico.

### 8.1. Service account de execução/build

Conta relevante:

```text
579650096078-compute@developer.gserviceaccount.com
```

Ela funciona como conta técnica usada em partes da execução/build das Functions.

Permissões que já foram necessárias:

- Cloud Datastore User
- Firebase Authentication Admin
- Logs Writer
- Cloud Build Service Account (`roles/cloudbuild.builds.builder`)

Problemas já observados:

- Functions conseguiam subir, mas falhavam ao acessar Firestore sem `roles/datastore.user`;
- `manageUser` retornava `INTERNAL [500]` porque a conta não tinha permissão suficiente para Firebase Authentication;
- deploy de Functions falhou com `Could not build the function due to a missing permission on the build service account` quando o papel do Cloud Build não estava presente.

Não trocar permissões por papéis genéricos excessivos como Owner/Editor apenas para "fazer funcionar".

### 8.2. Storage + Firestore Rules

Upload de logos já falhou por falta de autorização entre Storage Rules e Firestore.

Foi necessário ajustar a permissão do service agent do Firebase Storage relacionada às regras/Firestore.

Evitar abrir Storage com:

```text
allow read, write: if true;
```

### 8.3. Cloud Run / callable Functions

As Functions 2nd Gen usam Cloud Run por baixo.

O transporte HTTP das callables pode estar público para permitir a chamada, mas a autorização real deve continuar sendo feita dentro das Functions com autenticação Firebase, usuário ativo e role apropriada.

Nunca remover `requireActiveUser` / `requireAdmin` para resolver problema de acesso.

---

## 9. Usuários e onboarding

A criação de usuários deve ser feita pelo próprio Meta Gestão Veicular.

Fluxo esperado:

```text
Administração
→ Novo usuário
→ nome
→ e-mail
→ role
→ empresa, quando aplicável
→ ativo/inativo
```

A Function `manageUser` deve criar:

1. usuário no Firebase Authentication;
2. documento `users/{uid}` com o MESMO UID.

### Regra crítica

Nunca recriar manualmente no Firebase Authentication um usuário já cadastrado pelo sistema mantendo um documento antigo em `users/{uid}`.

Isso gera:

```text
Auth UID A
Firestore users/UID B
```

e o login autentica, mas o perfil interno não é encontrado.

Esse problema já aconteceu durante testes.

### Senha

O cadastro administrativo não deve depender de senha padrão compartilhada.

Fluxo desejável:

- admin cria usuário;
- usuário define a própria senha via fluxo de redefinição/primeiro acesso.

Se a aplicação ainda não tiver um fluxo de onboarding automático por e-mail, tratar isso como melhoria de produto, não como motivo para criar contas manualmente.

### Loading infinito

Se Auth funcionar, mas `users/{uid}` não existir, a aplicação não deve ficar indefinidamente em "Entrando...".

Comportamento desejável:

- encerrar loading;
- informar que o perfil interno não foi encontrado;
- orientar o usuário a procurar um administrador.

---

## 10. Papéis e autorização

Papéis atuais:

```text
admin
inspector
```

Nomes de interface podem ser Administrador e Fiscalizador/Fiscal.

Regras:

- Admin: acesso administrativo/global.
- Inspector: operações de campo e funcionalidades autorizadas.
- Autorização crítica deve ser validada no backend.
- Ocultar botão no frontend não é segurança.

Quando criar nova Function ou operação administrativa:

1. validar Firebase Auth;
2. carregar `users/{uid}`;
3. validar `active`;
4. validar role;
5. só então executar a operação.

---

## 11. Entidades principais e relações

### Cliente

Representa a organização contratante/identidade principal atendida.

Exemplo atual:

- Klabin

Possui logo própria.

### Empresa

Representa empresas fornecedoras/contratadas/subcontratadas que participam da operação.

Regras importantes:

- CNPJ único;
- empresa vinculada a um Cliente;
- pode possuir logo;
- pode ser ativa/inativa;
- pode estar vinculada a Projetos;
- pode participar de hierarquia via `parentCompanyId`;
- não criar ciclos na hierarquia.

### Projeto

Pertence a um Cliente.

`project code` é único por Cliente.

Exemplos usados no ambiente:

- CDR-3
- Vertedouro
- Viaduto Max

### Motorista

Regras:

- matrícula;
- CNH;
- validade;
- status;
- vínculo com uma ou mais Empresas (ver 11.1);
- relações com Veículos;
- unicidades conforme regras existentes.

### Veículo

Regras:

- placa única;
- marca;
- modelo;
- ano;
- quilometragem;
- tipo;
- status;
- uma ou mais Empresas atendidas (ver 11.1);
- Projeto (único);
- Perfil de circulação;
- Motoristas vinculados;
- foto de capa opcional.

### 11.1. Veículos e motoristas em várias empresas (decisão de 2026-09-29)

Um mesmo veículo ou motorista pode atender simultaneamente mais de uma empresa (exemplo real: Winner atendendo Tequaly e Palmont).

Modelo adotado: **cadastro canônico + múltiplos vínculos de empresa**.

- O veículo e o motorista continuam sendo um único cadastro. Não se duplica a identidade para atender outra empresa.
- `companyIds` (lista) guarda as empresas atendidas.
- `companyId` continua existindo como **empresa principal**, para retrocompatibilidade (registros legados, documentos, fallback Azure). A principal é mantida enquanto continuar selecionada; caso contrário, passa a ser a primeira da lista.
- Registros legados com apenas `companyId` continuam funcionando: são lidos como `companyIds = [companyId]` e passam a gravar a lista no próximo salvamento. Não há migração obrigatória.
- O histórico dos vínculos fica em `vehicleCompanyAssignments` e `driverCompanyAssignments` (`active`/`endedAt`/`startedAt`), no mesmo padrão dos demais vínculos.
- O veículo continua com **um único projeto**, que precisa estar autorizado em ao menos uma das empresas vinculadas. Um perfil de acesso ligado a um cliente precisa ser compatível com o cliente de todas as empresas do veículo.
- Motoristas do veículo precisam atender ao menos uma das empresas do veículo. Não é possível retirar do motorista a empresa pela qual ele atende um veículo ativo.
- Na Nova Vistoria, ao escolher a Empresa, aparecem os veículos e motoristas com vínculo ativo com ela. O servidor valida empresa, projeto (autorizado para a empresa selecionada), veículo e motorista.
- Na importação XLSX, `Empresa_CNPJ` de Motoristas e Veículos aceita vários CNPJs separados por ponto e vírgula; o primeiro é o principal.
- A hierarquia de empresas continua com uma única contratante (`parentCompanyId`). Várias contratantes ficaram fora do escopo.

### Vistoria

Registra cliente, empresa, projeto, veículo, motorista, fiscalizador, perfil de acesso, checklist, fotos, resultado, conformidade e snapshot.

### Documento

Pode estar associado a entidades operacionais.

Deve preservar metadados, validade, Storage path, vínculo e controle de status/expiração.

### Credencial

É resultado de um fluxo separado da vistoria.

Vistoria aprovada NÃO significa emissão automática.

Fluxo:

```text
elegibilidade
→ solicitação de aprovação
→ decisão
→ emissão
→ impressão/PDF
```

---

## 12. Checklist e vistorias

Checklist oficial:

```text
39 itens
```

Os itens precisam permanecer sincronizados entre frontend, Firebase Functions e fallback Azure.

Resultado da vistoria:

- calculado no servidor;
- usa itens aplicáveis;
- compara conformidade com configuração do sistema;
- default histórico: 90%.

Resultados:

```text
APROVADO
REPROVADO
```

Código:

```text
VST-000001
VST-000002
...
```

### Sequência por veículo (decisão de 2026-09-29)

A interface exibe `1ª vistoria`, `2ª vistoria` etc. A sequência é por veículo e **não se confunde com o código global `VST-XXXXXX`**.

A sequência passou a ser **persistida e editável** (campo `sequence` da vistoria), para permitir lançar vistorias antigas fora da ordem de criação:

- a Nova Vistoria sugere automaticamente a próxima sequência do veículo (maior sequência + 1);
- o usuário pode informar outro número inteiro positivo (1 a 9999);
- lacunas são permitidas (ex.: existir 1ª e 4ª e depois lançar 2ª e 3ª);
- não podem existir duas vistorias do mesmo veículo com a mesma sequência (validado no servidor, com reserva em `uniqueKeys`); veículos diferentes podem repetir o número;
- lançamentos retroativos não alteram o código global `VST-XXXXXX`;
- exclusões não renumeram o histórico.

Registros antigos sem `sequence` mantêm a numeração exibida antes (ordem cronológica entre as vistorias legadas do veículo). Na primeira gravação que envolve o veículo, o servidor persiste a sequência dessas vistorias legadas. Não há backfill obrigatório.

A sequência aparece no Dashboard, no Histórico, em Reprovações, no relatório da vistoria, na revisão da Nova Vistoria e na exportação (`Sequencia_Veiculo`).

### Veículos pendentes

Dashboard possui card "Veículos pendentes" baseado no resultado da vistoria de **maior sequência** do veículo (com lançamentos retroativos, a última vistoria cadastrada não é necessariamente a mais recente da história do veículo).

### Edição de vistoria concluída

É permitida, porém o resultado deve ser recalculado e credenciais/aprovações dependentes podem ser invalidadas conforme implementação atual.

### Exclusão (decisão de 2026-09-29)

A exclusão de vistoria passou a ser **definitiva**, mediante apenas uma tela de confirmação. A regra anterior de exclusão lógica (`deleted: true`) deixou de ser a desejada para vistorias.

- Somente Administrador ativo pode excluir (validado na Function `deleteInspection`).
- Não há motivo obrigatório nem checkbox adicional.
- **Credencial ativa, aprovação ou fotos vinculadas não bloqueiam a exclusão.** Elas são removidas junto com a vistoria para não deixar registros órfãos: subcoleção `photos`, arquivos em `inspections/{id}/` no Storage, `credentialApprovals` e `credentials` com o mesmo `inspectionId` e a chave de sequência.
- Um `auditLog` mínimo (`inspection.purged`) guarda a identificação anterior à exclusão: código, veículo/placa, empresa, data, resultado, sequência, executor, horário e as credenciais removidas.
- Se a limpeza do Storage falhar no servidor, a exclusão não é desfeita; o navegador tenta remover os arquivos restantes.
- Vistorias que já tinham exclusão lógica continuam ocultas e também podem ser removidas definitivamente.

Para os demais cadastros operacionais, continua valendo evitar exclusão física.

---

## 13. Fotos de vistoria

Fotos fazem parte da evidência operacional.

Tipos esperados historicamente incluem:

- frontal
- traseira
- cabine

e o sistema suporta evidências adicionais conforme implementação atual.

Relatórios devem preservar visualização das fotos.

---

## 14. Documentos

A documentação é parte importante da elegibilidade e conformidade.

O sistema deve:

- armazenar metadados;
- controlar emissão/validade;
- vincular arquivos;
- permitir identificar documentos próximos do vencimento;
- manter arquivos privados;
- evitar URL pública permanente sem necessidade.

O Dashboard possui três indicadores de documentos, mutuamente exclusivos (cada documento ativo entra em exatamente um):

- **Documentos válidos:** dentro da validade, ou sem validade informada (semântica histórica do sistema);
- **Documentos a vencer:** validade entre hoje e hoje + janela configurada (`documentExpiryWarningDays`, depois `expiryAlertDays`, padrão 30 dias);
- **Vencidos/inválidos:** validade anterior a hoje.

O modelo atual não possui status explícito de documento "inválido" ou "reprovado". Documentos removidos (`active: false`) não entram na contagem. Cada card abre a central de Documentos já filtrada (`/documentos?status=...`).

---

## 15. Credenciais veiculares

A credencial atual foi redesenhada para lembrar o modelo histórico usado em Excel.

### Layout

Possui frente, verso, proporções fixas e impressão/PDF.

Dimensão usada no layout de impressão:

```text
70 × 118 mm
```

### Frente

Elementos principais:

- faixa superior;
- mensagem de liberação/acesso;
- nome/identidade de empresa conforme apresentação;
- placa em destaque;
- validade;
- logo do Cliente;
- logo Meta.

### Verso

Elementos principais:

- código da credencial;
- bloco de orientações;
- responsáveis/condutores;
- data da inspeção;
- rodapé Meta Central de Serviços.

### Condutores

1º condutor: motorista principal da credencial.

2º e 3º: outros motoristas vinculados ao veículo quando disponíveis.

### Impressão

A impressão deve:

- imprimir somente credenciais selecionadas;
- preservar cores;
- ocultar sidebar e controles;
- evitar quebra incorreta;
- suportar múltiplas credenciais.

---

## 16. Perfis de circulação e acesso

Existe cadastro administrativo de perfis.

Exemplos:

- Selo Laranja
- Selo Azul
- Selo Preto
- Selo Amarelo
- outros perfis legados/inativos

Cada perfil possui:

- nome;
- descrição;
- cor;
- status.

Exemplos de cores observadas:

```text
Selo Laranja → #fda50d
Selo Azul    → #0056A4
Selo Preto   → #292929
Selo Amarelo → #fafd44
```

### Decisão de produto recente

A credencial deve usar a cor do Perfil de circulação selecionado.

Não criar mapa hardcoded por nome do selo.

Fonte oficial deve ser o campo `color` do próprio perfil.

Comportamento desejado:

```text
Perfil selecionado
→ profile.color
→ preview
→ frente
→ verso
→ impressão/PDF
```

Para cores claras, usar contraste automático de texto.

Fallback histórico aceitável:

```text
#0056A4
```

**Status desta melhoria:** foi solicitada e planejada recentemente; confirmar no código antes de assumir que já está implementada.

---

## 17. UI/UX — princípios aprovados

O sistema deve ter aparência:

- corporativa;
- clean;
- compacta;
- profissional;
- coerente;
- operacional.

Evitar:

- fontes exageradamente grandes;
- cards gigantes;
- espaços vazios sem propósito;
- visual genérico de template;
- excesso de sombras;
- animações lentas.

Priorizar:

- leitura rápida;
- densidade moderada;
- boa hierarquia;
- consistência;
- responsividade;
- uso eficiente da tela.

---

## 18. Sidebar

A sidebar passou por várias iterações.

### Desktop

Estado recolhido: aproximadamente `78 px`.

Estado expandido: aproximadamente `258 px`.

Comportamento:

- expandir em hover/focus;
- sobrepor conteúdo;
- NÃO deslocar o layout principal.

### Motion

Uma implementação anterior chegou a usar `2400ms` e ficou lenta demais em máquinas mais modestas.

A preferência é velocidade normal e responsiva, aproximadamente na faixa `500–750ms` se a implementação atual ainda precisar de ajuste.

### Bug já observado

A sidebar já ficou presa aberta após navegação porque `:focus-within` mantinha foco em link clicado.

O comportamento correto:

- saiu o mouse;
- sidebar recolhe;
- navegação não deve mantê-la aberta até clicar em outra área.

### Grupos

Estrutura desejada:

```text
OPERAÇÃO
Dashboard
Nova vistoria
Histórico
Reprovações

CADASTROS
Veículos
Motoristas
Empresas
Clientes
Projetos

CONFORMIDADE
Documentos
Credenciais

DADOS
Exportar dados
Importar dados

ADMINISTRAÇÃO
Administração
Configurações
```

A separação visual entre categorias deve ser perceptível, sem criar grandes buracos no modo recolhido.

---

## 19. Login

O login foi redesenhado em layout split-screen.

Decisões aprovadas:

- identidade Meta;
- título: `Gestão veicular mais segura e inteligente.`;
- visual corporativo;
- sem protagonismo de cliente específico;
- remover referências desnecessárias a Klabin;
- Meta é a marca principal.

---

## 20. Favicon / ícone

O favicon usa o ícone oficial da Meta (círculo azul com a seta), em `public/`: `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`, `apple-touch-icon.png` (180×180) e `favicon.ico` (16, 32 e 48 px).

Uso planejado:

- favicon da webpage;
- posteriormente elementos compactos do sistema.

Não substituir automaticamente o logo completo da Meta por esse ícone em todas as áreas.

---

## 21. Motoristas — UX atual aprovada

A página Motoristas deixou de ser uma tabela simples.

Estrutura atual:

```text
Empresa
→ expandir
→ cards dos motoristas
```

### Card da Empresa

Contém:

- ícone de pessoa/motorista;
- razão/nome da empresa;
- quantidade de motoristas;
- logo discreta;
- chevron.

Nome longo pode usar até 2 linhas.

### Filtros

Filtros implementados:

- Razão Social
- Nome do Motorista
- Matrícula
- CNH
- Status: Todos / Ativos / Inativos
- Limpar filtros

Filtros funcionam combinados.

Contagem da Empresa deve refletir resultado filtrado.

Empresas sem resultado devem desaparecer.

### Logos

A tela usa logos cadastradas em Empresas.

Fallback por iniciais quando necessário.

Esta tela é uma referência importante de qualidade, mas outras páginas NÃO devem simplesmente copiá-la.

---

## 22. Veículos — direção de UX

Foi definida uma direção visual mais rica para Veículos.

Hierarquia desejada:

```text
Tipo de Veículo
→ Empresa
→ Cards dos Veículos
```

Tipos operacionais definidos para novos cadastros:

- Carros Leves
- Micro-Ônibus
- Motocicleta
- Ônibus
- Van

Existem valores legados que podem exigir normalização.

Mapeamentos seguros:

```text
Carro → Carros Leves
Moto  → Motocicleta
Van   → Van
```

Não converter silenciosamente valores ambíguos como Utilitário, Caminhão e Outro.

### Card do veículo

Desejado:

- foto de capa;
- placa;
- marca;
- modelo;
- ano;
- quilometragem;
- status;
- Editar.

Foto de capa:

- opcional;
- Storage;
- placeholder por tipo quando ausente.

### Filtros desejados

- Razão Social / Empresa
- Placa
- Marca
- Modelo
- Tipo
- Status

**Status:** essa direção foi especificada; confirmar no código se toda a reformulação já foi implementada.

---

## 23. Clientes — direção de UX

Tela histórica era tabela simples.

Nova direção desejada:

- cards;
- logo do Cliente em destaque;
- nome fantasia;
- razão social;
- CNPJ;
- status;
- Editar;
- ordenação A–Z/Z–A;
- busca.

A logo do Cliente pode ser mais protagonista que a logo de Empresa em outras telas.

**Status:** melhoria especificada recentemente; confirmar implementação atual antes de assumir conclusão.

---

## 24. Projetos — direção de UX

Problema identificado:

A visualização simples não deixava claro de qual Cliente cada Projeto fazia parte.

Direção desejada:

- cards;
- ícone de pasta/projeto;
- nome;
- código;
- Cliente;
- logo do Cliente;
- status;
- Editar.

Filtros desejados:

- Cliente
- Projeto
- Código
- Status

Ordenação:

- Projeto A–Z/Z–A;
- Código crescente/decrescente.

Não hardcode Klabin. Resolver via `clientId`.

**Status:** melhoria especificada recentemente; confirmar implementação atual.

---

## 25. Empresas — direção de UX

Empresas têm uso mais complexo que Motoristas.

Parte dos usuários prefere lista.

Decisão de UX:

```text
Cards | Lista
```

Manter as duas visões quando possível.

Salvar preferência visual em `localStorage`, não no Firestore.

### Cards

Diferentes dos cards de Motoristas.

Desejado:

- ícone de prédio/empresa;
- razão social;
- logo discreta;
- CNPJ;
- Cliente;
- Unidade;
- Tipo de contrato;
- status;
- Editar.

### Lista

Manter tabela elegante para usuários que preferem conferência rápida.

### Filtros desejados

- Razão Social
- CNPJ
- Cliente
- Unidade
- Tipo de contrato
- Status
- Limpar filtros

### Ordenação

- A–Z
- Z–A
- outras opções úteis sem complicar excessivamente.

### Hierarquia

Algumas empresas são subcontratadas de outras.

Existe suporte de domínio a:

```text
parentCompanyId
```

e validação de hierarquia.

Direção de UX:

Botão `Ver hierarquia`, abrindo modal grande, drawer ou árvore organizacional.

Requisitos:

- multinível;
- sem ciclos;
- não esconder empresas legadas sem `parentCompanyId`;
- opcionalmente agrupá-las em `Hierarquia não informada`.

**Status:** o modelo de hierarquia existe; confirmar se a visualização em árvore já foi implementada.

---

## 26. Logos de Clientes e Empresas

Uploads de logo já fazem parte do sistema.

Formatos aceitos historicamente:

- PNG
- JPG/JPEG

Tamanho máximo usado:

```text
5 MB
```

A imagem é apoio visual, não campo crítico para salvar a entidade.

Deve existir fallback quando não houver logo.

Não transformar logo em conteúdo público irrestrito.

---

## 27. Importação e exportação

Importação XLSX é funcionalidade importante.

Existe Function:

```text
bulkImport
```

Exportação deve produzir dados adequados para análise/Power BI.

A meta do sistema continua sendo eliminar manipulações manuais desnecessárias antes do BI.

Ao alterar schema de entidades:

- revisar importação;
- revisar exportação;
- preservar compatibilidade;
- evitar quebrar arquivos existentes sem estratégia.

---

## 28. Dashboard

Dashboard apresenta indicadores como:

- vistorias realizadas;
- veículos ativos;
- motoristas ativos;
- empresas ativas;
- veículos pendentes;
- documentos válidos, a vencer e vencidos/inválidos;
- últimas vistorias.

Não transformar Dashboard em relatório analítico pesado sem necessidade.

A tela é operacional.

---

## 29. Identidade visual

Marca:

```text
Meta Central de Serviços
```

A Meta deve ter protagonismo maior que clientes e fornecedores.

Cliente pode aparecer quando funcionalmente necessário, como credencial, projeto e contexto operacional.

Evitar branding de Klabin fora de fluxos onde o Cliente realmente é relevante.

Paleta predominante:

- azul institucional;
- fundos claros;
- branco;
- estados verde/vermelho/amarelo conforme status.

---

## 30. Regras de integridade

Regras importantes já estabelecidas:

- CNPJ único;
- placa única (global, mesmo com veículo em várias empresas);
- matrícula de motorista única por empresa, reservada em cada empresa vinculada;
- CPF não existe no cadastro e a CNH (`licenseNumber`) ainda **não** tem unicidade no servidor; isso é uma pendência conhecida, mantida de propósito para não travar a edição de motoristas que hoje possam estar duplicados;
- sequência de vistoria única por veículo;
- código de Projeto único por Cliente;
- usuário ativo vinculado ao escopo permitido;
- evitar delete físico, exceto a exclusão definitiva de vistoria (ver seção 12);
- preservar histórico de vínculos;
- validar relações no servidor;
- auditoria para operações críticas;
- compatibilidade com dados legados.

Nunca enfraquecer unicidade apenas para contornar erro de cadastro.

---

## 31. Estratégia para mudanças de schema

Antes de adicionar campos:

1. verificar se o campo/relação já existe;
2. procurar equivalentes;
3. revisar Functions;
4. revisar types;
5. revisar mock;
6. revisar import/export;
7. revisar Rules;
8. revisar Indexes;
9. revisar dados existentes.

Preferir campo opcional, fallback e normalização a exigir migração destrutiva imediata.

---

## 32. Estratégia de performance

Evitar N+1.

Quando possível:

- carregar datasets necessários;
- criar maps por ID;
- agrupar em memória;
- usar memoização somente quando fizer diferença.

Não adicionar subscriptions/listeners em excesso sem necessidade operacional.

---

## 33. Estratégia de testes

Validações mínimas esperadas ao final de uma missão relevante:

```text
pnpm typecheck
pnpm test
pnpm test:all
pnpm build
pnpm build:all
git diff --check
```

O repositório não possui lint script.

Ao alterar Functions, testar também pacote Functions.

Ao alterar rules, considerar testes textuais existentes.

Ao alterar visual, validar:

- 1440+
- 1280
- 1024
- mobile ~390

E também:

- sem overflow horizontal;
- nomes longos;
- vazio;
- poucos registros;
- muitos registros;
- ativo/inativo;
- logos ausentes;
- responsividade.

---

## 34. Como trabalhar com o Claude Code neste projeto

O Claude Code é o executor principal de código nesta fase.

Fluxo preferido:

```text
1. Receber missão
2. Ler CLAUDE.md
3. Ler PROJECT_CONTEXT.md quando relevante
4. Inspecionar implementação atual
5. Planejar
6. Identificar riscos e impacto
7. Implementar
8. Rodar testes
9. Mostrar diff/resumo
10. Informar componentes de deploy
11. NÃO fazer deploy/commit/push
```

Para missões grandes, preferir Plan Mode antes de editar.

### Critério de qualidade

O objetivo é manter qualidade equivalente a um agente de engenharia sênior:

- investigar antes de alterar;
- não assumir schema;
- não inventar campos;
- preservar comportamento;
- testar;
- relatar claramente;
- minimizar regressões.

---

## 35. Regras operacionais do agente

Nunca executar sem solicitação explícita:

```text
git commit
git push
firebase deploy
```

Também não executar automaticamente:

- alterações IAM/GCP;
- remoção de usuários;
- deleção de dados;
- migração destrutiva;
- mudança de domínio;
- rotação de secrets.

Antes de recomendar alteração IAM:

- diagnosticar via logs;
- identificar service account;
- identificar permissão exata;
- preferir least privilege.

---

## 36. O que não deve ser "simplificado" sem análise

Não substituir por implementação genérica:

- `api()` facade;
- regras de unicidade;
- snapshots;
- fluxo de credencial;
- hierarchy de empresas;
- vínculos históricos;
- Storage privado;
- autenticação baseada em `users/{uid}`;
- checklist replicado nos 3 backends.

Essas estruturas existem por motivos de compatibilidade, segurança ou histórico.

---

## 37. Itens que exigem confirmação no código

Algumas melhorias foram definidas recentemente e podem ou não estar implementadas na branch atual.

Antes de assumir que estão prontas, verificar:

- credencial com cor dinâmica do Perfil de circulação;
- reformulação visual de Clientes;
- reformulação visual de Projetos;
- Cards/Lista/Filtros de Empresas;
- árvore visual de hierarquia;
- nova visualização de Veículos por tipo → empresa → cards;
- onboarding automático de senha para novos usuários;
- tratamento explícito de Auth sem `users/{uid}`.

Este documento registra a intenção/decisão de produto, não substitui a leitura do código atual.

---

## 38. Política de documentação

Quando código e documento divergirem:

1. não sobrescrever código automaticamente para "bater" com documentação;
2. identificar a divergência;
3. considerar código atual como evidência de implementação;
4. usar este documento para entender intenção de produto;
5. perguntar quando a divergência implicar mudança de regra.

Documentos Azure antigos podem estar desatualizados em relação à arquitetura Firebase.

---

## 39. Resumo de prioridades

Ao tomar decisões de implementação, priorizar nesta ordem:

1. segurança;
2. integridade dos dados;
3. regra de negócio;
4. compatibilidade com dados existentes;
5. experiência operacional;
6. performance;
7. estética;
8. conveniência de implementação.

Uma solução visualmente bonita que enfraquece regra ou segurança não é aceitável.

---

## 40. Resumo rápido para novas sessões

Se precisar entender o projeto rapidamente:

```text
Meta Gestão Veicular
→ React/TypeScript/Vite
→ Firebase Blaze
→ Auth + users/{uid}
→ Firestore
→ Storage privado
→ Functions 2nd Gen
→ Hosting
→ Admin/Fiscalizador
→ Clientes
→ Empresas
→ Projetos
→ Motoristas
→ Veículos
→ Vistorias 39 itens
→ Documentos
→ Aprovação/Emissão de Credenciais
→ XLSX/Power BI
```

Filosofia:

```text
Operação simples na interface,
regras fortes no backend,
dados rastreáveis,
sem retrabalho manual.
```

---

## 41. Pacote de melhorias operacionais de 2026-09-29

Decisões mais recentes, que substituem regras anteriores deste documento:

1. Dashboard com três indicadores de documentos (seção 14).
2. Veículos e motoristas com múltiplos vínculos de empresa, sem duplicar a identidade (seção 11.1).
3. Sequência de vistoria persistida e editável, com lançamentos retroativos (seção 12).
4. Correção do stepper da Nova Vistoria no desktop, sem mudar o mobile.
5. Exclusão definitiva de vistoria, sem bloqueio por credencial (seção 12).

A sidebar não fez parte deste pacote. As demais regras antigas continuam válidas.
