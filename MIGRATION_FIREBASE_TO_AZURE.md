# Migração Firebase → Azure

Este processo foi desenhado para ser auditável, repetível e sem exclusão da origem. Os scripts de migração ficam isolados em `migration/`; o código ativo da aplicação não importa SDK Firebase.

## Estado desta entrega

Os recursos Azure foram informados, mas esta cópia de trabalho não possui credenciais, sessão Azure, acesso ao projeto Firebase, export real ou repositório Git. Portanto, **nenhum dado real foi transferido e nenhum deploy foi executado**. As etapas abaixo precisam ser realizadas por uma pessoa autorizada nos ambientes da empresa.

## Regras de segurança

- nunca colocar JSON de service account no projeto;
- usar Application Default Credentials somente para a leitura autorizada do Firebase;
- fornecer `SQL_CONNECTION_STRING` e `AZURE_STORAGE_CONNECTION_STRING` apenas no ambiente temporário e seguro do operador;
- nunca salvar connection strings em scripts, arquivos `.env`, histórico compartilhado do terminal ou repositório;
- manter `firebase-export.json` fora do Git;
- executar primeiro em um banco de homologação ou backup restaurável;
- não apagar Firebase/Storage após o primeiro teste;
- congelar alterações na V2 durante o corte final;
- registrar contagens, hashes e responsáveis pela aprovação.

## 1. Preparação

1. Execute `database/001_schema.sql` no Azure SQL vazio.
2. Confirme que `appfiles` é privado.
3. Dê ao operador temporário acesso de leitura no Firebase e escrita no SQL/Blob.
4. Na pasta `migration`, execute `npm install` ou `pnpm install`.
5. Autentique localmente no Firebase sem salvar credenciais no repositório:

   ```bash
   gcloud auth application-default login
   ```

## 2. Exportar Firestore e arquivos

Defina as variáveis no terminal do operador:

```text
FIREBASE_PROJECT_ID=<id-real-do-projeto>
FIREBASE_STORAGE_BUCKET=<bucket-real>
MIGRATION_EXPORT_FILE=<caminho-seguro>/firebase-export.json
```

Execute:

```bash
pnpm export:firestore
```

O script exporta as coleções da V2 e, quando `FIREBASE_STORAGE_BUCKET` está presente, incorpora fotos/documentos privados em Base64. O arquivo resultante contém dados corporativos: proteja-o e remova-o com o processo de descarte da empresa depois do aceite.

Para uma V2 que ainda usa `localStorage`, gere primeiro o backup JSON pela própria tela de exportação/backup da V2 e adapte-o para o mesmo formato:

```json
{
  "source": "localStorage",
  "collections": {
    "companies": [],
    "drivers": [],
    "vehicles": [],
    "inspections": [],
    "users": [],
    "settings": [],
    "projects": [],
    "accessProfiles": []
  }
}
```

Não leia `localStorage` por scripts de console copiados de terceiros. Use um backup criado pela aplicação e revise o conteúdo localmente.

## 3. Validar antes de gravar

Configure:

```text
MIGRATION_EXPORT_FILE=<caminho-seguro>/firebase-export.json
MIGRATION_DEFAULT_CLIENT_NAME=Klabin
```

Execute sem `--apply`:

```bash
pnpm import:azure
```

O modo padrão só mostra as contagens. Guarde esse resultado como evidência.

## 4. Importar dados relacionais

Depois da revisão:

```text
SQL_CONNECTION_STRING=<CONNECTION_STRING_SQL_TEMPORARIA_DO_OPERADOR>
```

```bash
node import-azure.mjs --apply
```

Use uma credencial de migração temporária com os privilégios estritamente necessários, revogue-a ao concluir e remova a variável da sessão do terminal.

O importador:

- gera UUIDs determinísticos a partir dos IDs legados;
- grava todos os documentos brutos em `migration_raw_records` antes da normalização;
- mantém a relação origem/destino em `migration_legacy_ids`;
- cria cliente/projeto/perfil padrão somente quando a V2 não fornece a nova dimensão;
- importa usuários, projetos, perfis, empresas, motoristas, veículos e vínculos;
- importa vistorias cujo checklist possui os 39 itens;
- preserva código, data/hora, quilometragem, resultado, observações e snapshot;
- recalcula contagens apenas para validação estrutural;
- mantém registros incompatíveis integralmente na área de reconciliação;
- executa a fase dentro de transação SQL.

Registros brutos com `normalized_at IS NULL` precisam ser revisados antes do corte.

## 5. Importar fotos e documentos

Configure também:

```text
SQL_CONNECTION_STRING=<CONNECTION_STRING_SQL_TEMPORARIA_DO_OPERADOR>
AZURE_STORAGE_CONNECTION_STRING=<CONNECTION_STRING_STORAGE_TEMPORARIA_DO_OPERADOR>
AZURE_STORAGE_CONTAINER=appfiles
```

Execute:

```bash
pnpm import:files
```

O script envia somente conteúdo incorporado no export, cria caminhos privados e grava metadados no SQL de forma idempotente. Se informar arquivos ausentes, repita a exportação com `FIREBASE_STORAGE_BUCKET` configurado.

Essas variáveis dos utilitários de migração são exclusivas da sessão segura do operador. Na aplicação publicada, as mesmas chaves existem somente nas Application Settings da API do Static Web Apps, nunca no React.

## 6. Reconciliação obrigatória

Execute e arquive os resultados:

```sql
SELECT source_collection,COUNT(*) AS exportados,
       SUM(CASE WHEN normalized_at IS NOT NULL THEN 1 ELSE 0 END) AS normalizados
FROM dbo.migration_raw_records
GROUP BY source_collection;

SELECT COUNT(*) AS vistorias FROM dbo.inspections;
SELECT COUNT(DISTINCT inspection_id) AS vistorias_com_39_itens
FROM dbo.inspection_items
GROUP BY inspection_id
HAVING COUNT(*)=39;

SELECT i.id,i.code,COUNT(ii.id) AS itens
FROM dbo.inspections i LEFT JOIN dbo.inspection_items ii ON ii.inspection_id=i.id
GROUP BY i.id,i.code
HAVING COUNT(ii.id)<>39;

SELECT v.id,v.plate,v.inspection_sequence,MAX(i.vehicle_sequence) AS maior_vistoria
FROM dbo.vehicles v LEFT JOIN dbo.inspections i ON i.vehicle_id=v.id
GROUP BY v.id,v.plate,v.inspection_sequence
HAVING ISNULL(MAX(i.vehicle_sequence),0)<>v.inspection_sequence;

SELECT COUNT(*) AS fotos_sql FROM dbo.inspection_photos;
SELECT COUNT(*) AS documentos_sql FROM (
  SELECT id FROM dbo.company_documents UNION ALL
  SELECT id FROM dbo.driver_documents UNION ALL
  SELECT id FROM dbo.vehicle_documents
) d;
```

Além das contagens:

1. compare uma amostra de aprovados e reprovados;
2. abra relatórios antigos com e sem fotos;
3. confira sequenciais de veículos com várias vistorias;
4. compare datas de CNH/documentos e regras de vencimento;
5. valide credenciais e vínculos empresa/projeto/motorista;
6. gere XLSX nos dois sistemas e compare totais e chaves.

## 7. Corte e rollback

1. Coloque a V2 em somente leitura.
2. Faça uma exportação final.
3. Repita os imports; IDs determinísticos evitam duplicação.
4. Execute toda a reconciliação.
5. Homologue com fiscalizador, administrador e fornecedor.
6. Direcione usuários para o Static Web App.
7. Mantenha Firebase intacto durante o período de contingência.

Se a homologação falhar, volte o link para a V2 e preserve o banco Azure para diagnóstico. Não tente “desfazer” apagando coleções ou blobs durante o incidente.

## Mapeamento principal

| Origem V2 | Destino Azure |
| --- | --- |
| `companies` | `companies`, `company_projects`, `company_documents` |
| `drivers` | `drivers`, `driver_documents` |
| `vehicles` | `vehicles`, `vehicle_drivers`, `vehicle_documents` |
| `projects` | `projects` |
| `accessProfiles` | `access_profiles`, `access_profile_gates`, `access_profile_areas` |
| `users` | `app_users` |
| `inspections` | `inspections`, `inspection_items`, `inspection_photos` |
| dados sem equivalência | `migration_raw_records` |

O novo `clients` torna Klabin e futuros contratantes dinâmicos. Na primeira migração, `MIGRATION_DEFAULT_CLIENT_NAME` associa os dados legados ao cliente correto; depois, projetos e empresas podem ser redistribuídos pelo administrador.
