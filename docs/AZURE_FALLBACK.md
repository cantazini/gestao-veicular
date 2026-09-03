# Fallback Azure preservado

A migração não excluiu nem alterou o backend Azure:

- `api/`: Azure Functions gerenciadas pelo Static Web Apps;
- `database/`: schema e migrations do Azure SQL;
- `staticwebapp.config.json`: runtime Node 22 e rotas SWA;
- `api/local.settings.example.json`: placeholders das Application Settings;
- Blob Storage privado, SAS temporária e container `appfiles`;
- `SQL_CONNECTION_STRING`, `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER` e `DEV_AUTH` continuam exclusivamente no backend Azure;
- `.github/workflows/azure-static-web-apps.yml`: deploy manual, com token e paths originais preservados.

## Acionar rollback

1. Configure o build do frontend com `VITE_DATA_BACKEND=azure` e `VITE_AUTH_PROVIDER=azure`.
2. Confirme que as Application Settings Azure ainda existem.
3. No GitHub, abra **Actions → Azure Static Web Apps CI/CD → Run workflow**.
4. Homologue login Entra, leitura SQL e upload SAS.
5. Mantenha o domínio Firebase separado até o aceite; não há necessidade de apagar dados Firebase para o rollback.

Esse caminho não sincroniza automaticamente gravações feitas depois do corte. Antes de um rollback produtivo, defina qual ambiente é a fonte de verdade e trate reconciliação de dados como uma operação separada e auditada.
