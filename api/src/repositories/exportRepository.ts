import { getPool, sql } from "../services/sql";
import type { AppUser } from "../types/auth";

export async function getInspectionExport(user: AppUser): Promise<Record<string, unknown>[]> {
  const pool = await getPool();
  const request = pool.request();
  if (user.companyId) request.input("companyId", sql.UniqueIdentifier, user.companyId);
  const scope = user.role === "supplier" ? "WHERE i.company_id=@companyId" : "";
  const result = await request.query(`
    SELECT i.id AS ID_Vistoria,i.code AS Codigo,i.inspection_date AS Data,CONVERT(varchar(5),i.inspection_time,108) AS Hora,
      u.name AS Fiscalizador,c.name AS Cliente,co.legal_name AS Empresa,co.document AS CNPJ,co.unit AS Unidade,
      p.name AS Projeto,d.name AS Motorista,d.registration AS Matricula_Motorista,d.license_category AS Categoria_CNH,
      d.license_expiry AS Validade_CNH,v.plate AS Placa,v.brand AS Marca,v.model AS Modelo,v.year AS Ano,v.type AS Tipo_Veiculo,
      i.mileage AS Quilometragem,i.compliance_percentage AS Conformidade_Percentual,i.result AS Resultado_Vistoria,
      i.general_observations AS Observacoes,i.created_at AS Registrado_Em,
      MAX(CASE WHEN ii.item_key='pneus' THEN ii.status END) AS Pneus,
      MAX(CASE WHEN ii.item_key='estepe' THEN ii.status END) AS Estepe,
      MAX(CASE WHEN ii.item_key='farois' THEN ii.status END) AS Farois,
      MAX(CASE WHEN ii.item_key='lanternas' THEN ii.status END) AS Lanternas,
      MAX(CASE WHEN ii.item_key='setas' THEN ii.status END) AS Setas,
      MAX(CASE WHEN ii.item_key='luz_freio' THEN ii.status END) AS Luz_Freio,
      MAX(CASE WHEN ii.item_key='retrovisores' THEN ii.status END) AS Retrovisores,
      MAX(CASE WHEN ii.item_key='para_brisa' THEN ii.status END) AS ParaBrisa,
      MAX(CASE WHEN ii.item_key='limpadores' THEN ii.status END) AS Limpadores,
      MAX(CASE WHEN ii.item_key='cintos' THEN ii.status END) AS Cintos,
      MAX(CASE WHEN ii.item_key='buzina' THEN ii.status END) AS Buzina,
      MAX(CASE WHEN ii.item_key='documentacao' THEN ii.status END) AS Documentacao,
      MAX(CASE WHEN ii.item_key='condicao_externa' THEN ii.status END) AS Condicao_Externa,
      MAX(CASE WHEN ii.item_key='condicao_interna' THEN ii.status END) AS Condicao_Interna,
      MAX(CASE WHEN ii.item_key='vazamentos' THEN ii.status END) AS Vazamentos
    FROM dbo.inspections i JOIN dbo.inspection_items ii ON ii.inspection_id=i.id
    JOIN dbo.clients c ON c.id=i.client_id JOIN dbo.companies co ON co.id=i.company_id JOIN dbo.projects p ON p.id=i.project_id
    JOIN dbo.drivers d ON d.id=i.driver_id JOIN dbo.vehicles v ON v.id=i.vehicle_id JOIN dbo.app_users u ON u.id=i.inspector_user_id
    ${scope}
    GROUP BY i.id,i.code,i.inspection_date,i.inspection_time,u.name,c.name,co.legal_name,co.document,co.unit,p.name,d.name,d.registration,
      d.license_category,d.license_expiry,v.plate,v.brand,v.model,v.year,v.type,i.mileage,i.compliance_percentage,i.result,i.general_observations,i.created_at
    ORDER BY i.inspection_date DESC,i.inspection_time DESC
  `);
  return result.recordset;
}
