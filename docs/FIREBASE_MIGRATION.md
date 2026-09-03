# Arquitetura Firebase da migração

## Decisão de transição

`src/lib/api.ts` é a única chave de provider. Com Firebase, ele carrega `firebaseApi.ts`; com Azure, conserva o `fetch('/api')` original. Componentes não possuem condicionais de infraestrutura. Arquivos seguem a mesma decisão em `src/lib/files.ts`.

## Coleções

- `users`: perfil interno, `admin` ou `inspector`, e estado ativo;
- `clients`, `companies`, `projects`, `drivers`, `vehicles`, `accessProfiles`: cadastros operacionais;
- `companyProjectAssignments`, `vehicleDriverAssignments`, `vehicleProjectAssignments`: histórico de vínculos;
- `documents`, `documentTypes`: metadata documental central;
- `inspections`: vistoria concluída, itens, score, resultado e snapshots;
- `inspections/{inspectionId}/photos`: metadata fotográfica;
- `credentialApprovals`, `credentials`: análise e emissão separadas;
- `uniqueKeys`: reservas transacionais de unicidade;
- `auditLogs`: eventos críticos somente pelo backend;
- `systemSettings`: parâmetros não sensíveis e sequência de vistoria.

IDs novos são Auto IDs do Firestore. O helper SQL GUID permanece apenas no fallback Azure.

## Functions 2nd gen

Todas usam Node 22 e `southamerica-east1`:

- `manageEntity`: Admin em Cliente/Projeto/Perfil; Admin ou Fiscalizador nas entidades operacionais;
- `manageUser`: somente Admin, sincroniza Auth e Firestore;
- `completeInspection`: Admin/Fiscalizador, valida 39 itens e grava a conclusão atomically;
- `updateInspection`: Admin/Fiscalizador, recalcula e invalida aprovação de credencial;
- `updateSettings`: somente Admin;
- `getCredentialEligibility`: Admin/Fiscalizador;
- `requestCredentialApproval`: Admin/Fiscalizador;
- `decideCredentialApproval`: Admin/Fiscalizador, nunca escrita direta pelo browser;
- `issueCredential`: Admin/Fiscalizador após aprovação;
- `bulkImport`: somente Admin, lotes de até 200 linhas, revalidação por linha.

## Storage

```text
clients/{clientId}/branding/{uuid}-{name}
documents/{entityType}/{entityId}/{documentId}/{name}
inspections/{inspectionId}/photos/{photoId}/{name}
```

O bucket default recebe `storage.default.rules` (deny all). O bucket adicional São Paulo recebe `storage.rules`. Os targets não podem ser inventados e devem ser aplicados com a Firebase CLI usando os nomes reais.

## Limitações deliberadas desta etapa

- não houve ETL dos dados Azure; somente a aplicação foi migrada;
- App Check está integrado, mas sem enforcement;
- o upload de fotos ocorre depois da transação da vistoria, como no fluxo atual; uma falha informa que a vistoria foi salva e permite nova tentativa;
- o PDF continua sendo produzido pelo diálogo nativo do navegador;
- a UI de importação preserva resolução sequencial de dependências; a Function em lote está disponível para evolução sem insert cego.
