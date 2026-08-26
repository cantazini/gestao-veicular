# API — resumo de rotas

Todas as rotas ficam sob `/api`, exigem identidade autenticada no Static Web Apps e retornam JSON, salvo downloads/redirecionamentos.

| Método e rota | Uso |
| --- | --- |
| `GET /auth/me` | perfil interno atual |
| `GET /dashboard` | métricas e vistorias recentes |
| `GET/POST/PUT/DELETE /clients/{id?}` | clientes; escrita de administrador |
| `GET/POST/PUT/DELETE /projects/{id?}` | projetos; escrita de administrador |
| `GET/POST/PUT/DELETE /companies/{id?}` | empresas; escrita de administrador |
| `GET/POST/PUT/DELETE /drivers/{id?}` | motoristas; fornecedor limitado à própria empresa |
| `GET/POST/PUT/DELETE /vehicles/{id?}` | veículos; fornecedor limitado à própria empresa |
| `GET/POST/PUT/DELETE /accessProfiles/{id?}` | perfis de acesso |
| `GET/POST/PUT/DELETE /users/{id?}` | usuários; somente administrador |
| `GET/POST /inspections/{id?}` | histórico, detalhe e criação |
| `GET /documents` | central de documentos; filtros opcionais por entidade, cliente, empresa, tipo, status e busca |
| `PUT /documents/{id}` | atualiza tipo, nome, emissão, validade e observação de um documento autorizado |
| `POST /files/upload-url` | SAS curta de escrita |
| `POST /files/complete` | confirma metadados após upload |
| `GET/DELETE /files/{id}` | URL curta de leitura ou remoção autorizada |
| `GET/DELETE /clients/{id}/logo` | logo privada e dinâmica do cliente ou remoção por administrador |
| `GET/PUT /settings` | consulta/alteração de parâmetros |
| `GET /exports/inspections` | linhas achatadas para XLSX/Power BI |
| `GET /credentials/eligibility` | vínculos elegíveis e motivos de bloqueio; aceita IDs de cliente, empresa, veículo e perfil |

As consultas SQL usam parâmetros. `DELETE` de cadastros é uma desativação lógica; arquivos são removidos apenas por ação autorizada específica.
