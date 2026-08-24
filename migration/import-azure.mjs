import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sql from "mssql";

const inputFile = process.env.MIGRATION_EXPORT_FILE || "firebase-export.json";
const sqlConnectionString = process.env.SQL_CONNECTION_STRING;
const apply = process.argv.includes("--apply");
const source = JSON.parse(await readFile(inputFile, "utf8"));
const groups = source.collections || {};
const expected = ["companies", "drivers", "vehicles", "inspections", "users", "settings", "projects", "accessProfiles"];
for (const name of expected) if (!Array.isArray(groups[name])) groups[name] = [];

const checksum = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function uuidFor(collection, sourceId) {
  const hex = createHash("sha256").update(`meta-v2:${collection}:${sourceId}`).digest("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
const id = (collection, value) => value ? uuidFor(collection, String(value)) : null;
const digits = value => String(value || "").replace(/\D/g, "");
const plate = value => String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const value = (item, ...names) => names.map(name => item?.[name]).find(candidate => candidate !== undefined && candidate !== null && candidate !== "");
const date = raw => raw ? String(raw).slice(0,10) : null;

console.table(expected.map(name => ({ collection: name, records: groups[name].length })));
if (!apply) {
  console.log("Validação concluída. Execute novamente com --apply depois de revisar as contagens.");
  process.exit(0);
}

if (!sqlConnectionString) throw new Error("Defina SQL_CONNECTION_STRING somente no ambiente seguro do operador.");
const pool = await new sql.ConnectionPool(sqlConnectionString).connect();
const transaction = new sql.Transaction(pool);
await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
const request = () => new sql.Request(transaction);
const actorId = uuidFor("users", "migration-service");
const defaultClientId = uuidFor("clients", process.env.MIGRATION_DEFAULT_CLIENT_NAME || "Cliente legado");
const defaultProjectId = uuidFor("projects", "legacy-default");
const defaultProfileId = uuidFor("accessProfiles", "legacy-default");

async function track(collection, sourceId, table, targetId, item) {
  await request().input("collection",sql.NVarChar(80),collection).input("sourceId",sql.NVarChar(220),String(sourceId)).input("table",sql.NVarChar(80),table).input("targetId",sql.UniqueIdentifier,targetId).input("checksum",sql.Char(64),checksum(item)).query(`
    MERGE dbo.migration_legacy_ids AS t USING(SELECT 'firebase' source_system,@collection source_collection,@sourceId source_id) s
    ON t.source_system=s.source_system AND t.source_collection=s.source_collection AND t.source_id=s.source_id
    WHEN NOT MATCHED THEN INSERT(source_system,source_collection,source_id,target_table,target_id,source_checksum) VALUES('firebase',@collection,@sourceId,@table,@targetId,@checksum);
  `);
}

try {
  for (const collection of expected) for (const item of groups[collection]) {
    await request().input("collection",sql.NVarChar(80),collection).input("sourceId",sql.NVarChar(220),String(item.id)).input("payload",sql.NVarChar(sql.MAX),JSON.stringify(item)).input("checksum",sql.Char(64),checksum(item)).query(`
      MERGE dbo.migration_raw_records AS t USING(SELECT 'firebase' source_system,@collection source_collection,@sourceId source_id) s
      ON t.source_system=s.source_system AND t.source_collection=s.source_collection AND t.source_id=s.source_id
      WHEN MATCHED AND t.source_checksum<>@checksum THEN UPDATE SET payload_json=@payload,source_checksum=@checksum,migrated_at=SYSUTCDATETIME(),normalized_at=NULL
      WHEN NOT MATCHED THEN INSERT(source_system,source_collection,source_id,payload_json,source_checksum) VALUES('firebase',@collection,@sourceId,@payload,@checksum);
    `);
  }
  await request().input("id",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.app_users WHERE id=@id)
    INSERT dbo.app_users(id,identity_provider_id,email,name,role,active) VALUES(@id,'migration-service','migration@invalid.local','Serviço de migração','admin',0)`);
  await request().input("id",sql.UniqueIdentifier,defaultClientId).input("name",sql.NVarChar(140),process.env.MIGRATION_DEFAULT_CLIENT_NAME || "Cliente legado").input("actor",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.clients WHERE id=@id)
    INSERT dbo.clients(id,name,legal_name,active,created_by,updated_by) VALUES(@id,@name,@name,1,@actor,@actor)`);
  await request().input("id",sql.UniqueIdentifier,defaultProjectId).input("client",sql.UniqueIdentifier,defaultClientId).input("actor",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.projects WHERE id=@id)
    INSERT dbo.projects(id,client_id,name,code,active,created_by,updated_by) VALUES(@id,@client,'Projeto legado','LEGADO',1,@actor,@actor)`);
  await request().input("id",sql.UniqueIdentifier,defaultProfileId).input("client",sql.UniqueIdentifier,defaultClientId).input("actor",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.access_profiles WHERE id=@id)
    INSERT dbo.access_profiles(id,client_id,name,description,color,active,created_by,updated_by) VALUES(@id,@client,'Acesso legado','Perfil criado pela migração','#0056A4',1,@actor,@actor)`);

  for (const item of groups.users) {
    const targetId=id("users",item.id); const rawRole=String(value(item,"role")||"").toLowerCase(); const role=rawRole.includes("admin")?"admin":rawRole.includes("fornec")||rawRole==="supplier"?"supplier":"inspector"; const companyId=null;
    await request().input("id",sql.UniqueIdentifier,targetId).input("provider",sql.NVarChar(200),String(value(item,"uid","identityProviderId")||item.id)).input("email",sql.NVarChar(180),String(value(item,"email")||`${item.id}@invalid.local`)).input("name",sql.NVarChar(160),String(value(item,"name","displayName")||"Usuário legado")).input("role",sql.NVarChar(20),role).input("company",sql.UniqueIdentifier,companyId).input("active",sql.Bit,value(item,"active","status")!==false).input("actor",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.app_users WHERE id=@id) INSERT dbo.app_users(id,identity_provider_id,email,name,role,company_id,active,created_by,updated_by) VALUES(@id,@provider,@email,@name,@role,@company,@active,@actor,@actor)`);
    await track("users",item.id,"app_users",targetId,item);
  }
  for (const item of groups.projects) {
    const targetId=id("projects",item.id);
    await request().input("id",sql.UniqueIdentifier,targetId).input("client",sql.UniqueIdentifier,defaultClientId).input("name",sql.NVarChar(140),String(value(item,"name")||"Projeto legado")).input("code",sql.NVarChar(40),String(value(item,"code")||String(item.id).slice(0,40))).input("active",sql.Bit,value(item,"active","status")!==false).input("actor",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.projects WHERE id=@id) INSERT dbo.projects(id,client_id,name,code,active,created_by,updated_by) VALUES(@id,@client,@name,@code,@active,@actor,@actor)`);
    await track("projects",item.id,"projects",targetId,item);
  }
  for (const item of groups.accessProfiles) {
    const targetId=id("accessProfiles",item.id);
    await request().input("id",sql.UniqueIdentifier,targetId).input("client",sql.UniqueIdentifier,defaultClientId).input("name",sql.NVarChar(100),String(value(item,"name")||"Perfil legado")).input("description",sql.NVarChar(500),String(value(item,"description")||"")).input("color",sql.Char(7),String(value(item,"color")||"#0056A4")).input("active",sql.Bit,value(item,"active","status")!==false).input("actor",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.access_profiles WHERE id=@id) INSERT dbo.access_profiles(id,client_id,name,description,color,active,created_by,updated_by) VALUES(@id,@client,@name,@description,@color,@active,@actor,@actor)`);
    for(const gate of value(item,"gates")||[]) await request().input("profile",sql.UniqueIdentifier,targetId).input("name",sql.NVarChar(100),String(gate)).query("IF NOT EXISTS(SELECT 1 FROM dbo.access_profile_gates WHERE access_profile_id=@profile AND gate_name=@name) INSERT dbo.access_profile_gates(access_profile_id,gate_name) VALUES(@profile,@name)");
    for(const area of value(item,"areas")||[]) await request().input("profile",sql.UniqueIdentifier,targetId).input("name",sql.NVarChar(100),String(area)).query("IF NOT EXISTS(SELECT 1 FROM dbo.access_profile_areas WHERE access_profile_id=@profile AND area_name=@name) INSERT dbo.access_profile_areas(access_profile_id,area_name) VALUES(@profile,@name)");
    await track("accessProfiles",item.id,"access_profiles",targetId,item);
  }

  for (const item of groups.companies) {
    const targetId=id("companies",item.id); const document=String(value(item,"document","cnpj")||"");
    await request().input("id",sql.UniqueIdentifier,targetId).input("client",sql.UniqueIdentifier,defaultClientId).input("name",sql.NVarChar(180),String(value(item,"legalName","name")||"Empresa sem nome")).input("trade",sql.NVarChar(160),String(value(item,"tradeName")||"")).input("document",sql.NVarChar(30),document).input("normalized",sql.NVarChar(30),digits(document)||`LEGACY${targetId}`).input("unit",sql.NVarChar(120),String(value(item,"unit")||"")).input("manager",sql.NVarChar(140),String(value(item,"managerName","responsible")||"")).input("contract",sql.NVarChar(80),String(value(item,"contractNumber")||"")).input("active",sql.Bit,value(item,"active","status")!==false).input("actor",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.companies WHERE id=@id) INSERT dbo.companies(id,client_id,legal_name,trade_name,document,document_normalized,unit,manager_name,contract_number,contract_type,active,created_by,updated_by) VALUES(@id,@client,@name,@trade,@document,@normalized,@unit,@manager,@contract,'direct',@active,@actor,@actor)`);
    await request().input("company",sql.UniqueIdentifier,targetId).input("project",sql.UniqueIdentifier,defaultProjectId).input("actor",sql.UniqueIdentifier,actorId).query("IF NOT EXISTS(SELECT 1 FROM dbo.company_projects WHERE company_id=@company AND project_id=@project) INSERT dbo.company_projects(company_id,project_id,created_by) VALUES(@company,@project,@actor)");
    await track("companies",item.id,"companies",targetId,item);
  }
  for (const item of groups.users) {
    const rawRole=String(value(item,"role")||"").toLowerCase();
    if (!(rawRole.includes("fornec")||rawRole==="supplier")) continue;
    const companyId=id("companies",value(item,"companyId","company_id"));
    if(companyId) await request().input("id",sql.UniqueIdentifier,id("users",item.id)).input("company",sql.UniqueIdentifier,companyId).query("UPDATE dbo.app_users SET company_id=@company WHERE id=@id AND EXISTS(SELECT 1 FROM dbo.companies WHERE id=@company)");
  }
  for (const item of groups.drivers) {
    const targetId=id("drivers",item.id), companyId=id("companies",value(item,"companyId","company_id")); if(!companyId) continue; const registration=String(value(item,"registration","employeeId")||item.id);
    await request().input("id",sql.UniqueIdentifier,targetId).input("company",sql.UniqueIdentifier,companyId).input("name",sql.NVarChar(160),String(value(item,"name")||"Motorista sem nome")).input("registration",sql.NVarChar(60),registration).input("normalized",sql.NVarChar(80),registration.toUpperCase()).input("category",sql.NVarChar(10),String(value(item,"licenseCategory","cnhCategory")||"B")).input("expiry",sql.Date,date(value(item,"licenseExpiry","cnhExpiry"))||"1900-01-01").input("active",sql.Bit,value(item,"active","status")!==false).input("actor",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.drivers WHERE id=@id) INSERT dbo.drivers(id,company_id,name,registration,registration_normalized,license_category,license_expiry,active,created_by,updated_by) VALUES(@id,@company,@name,@registration,@normalized,@category,@expiry,@active,@actor,@actor)`);
    await track("drivers",item.id,"drivers",targetId,item);
  }
  for (const item of groups.vehicles) {
    const targetId=id("vehicles",item.id), companyId=id("companies",value(item,"companyId","company_id")); if(!companyId) continue; const normalized=plate(value(item,"plate"))||`LG${targetId.slice(0,6).toUpperCase()}`;
    await request().input("id",sql.UniqueIdentifier,targetId).input("company",sql.UniqueIdentifier,companyId).input("project",sql.UniqueIdentifier,defaultProjectId).input("profile",sql.UniqueIdentifier,defaultProfileId).input("plate",sql.NVarChar(8),normalized).input("brand",sql.NVarChar(80),String(value(item,"brand")||"Não informada")).input("model",sql.NVarChar(100),String(value(item,"model")||"Não informado")).input("year",sql.Int,Number(value(item,"year")||2000)).input("type",sql.NVarChar(60),String(value(item,"type")||"Outro")).input("mileage",sql.Int,Number(value(item,"mileage")||0)).input("active",sql.Bit,value(item,"active","status")!==false).input("actor",sql.UniqueIdentifier,actorId).query(`IF NOT EXISTS(SELECT 1 FROM dbo.vehicles WHERE id=@id) INSERT dbo.vehicles(id,company_id,project_id,access_profile_id,plate,plate_normalized,brand,model,year,type,mileage,ownership,active,created_by,updated_by) VALUES(@id,@company,@project,@profile,@plate,@plate,@brand,@model,@year,@type,@mileage,'owned',@active,@actor,@actor)`);
    for(const driverId of value(item,"driverIds","drivers")||[]) await request().input("vehicle",sql.UniqueIdentifier,targetId).input("driver",sql.UniqueIdentifier,id("drivers",driverId)).input("actor",sql.UniqueIdentifier,actorId).query("IF EXISTS(SELECT 1 FROM dbo.drivers WHERE id=@driver) AND NOT EXISTS(SELECT 1 FROM dbo.vehicle_drivers WHERE vehicle_id=@vehicle AND driver_id=@driver) INSERT dbo.vehicle_drivers(vehicle_id,driver_id,created_by) VALUES(@vehicle,@driver,@actor)");
    await track("vehicles",item.id,"vehicles",targetId,item);
  }
  const sequenceByVehicle=new Map();
  const inspections=[...groups.inspections].sort((a,b)=>String(value(a,"createdAt","inspectionDate","date")||"").localeCompare(String(value(b,"createdAt","inspectionDate","date")||"")));
  for (const item of inspections) {
    const targetId=id("inspections",item.id),companyId=id("companies",value(item,"companyId","company_id")),vehicleId=id("vehicles",value(item,"vehicleId","vehicle_id")),driverId=id("drivers",value(item,"driverId","driver_id"));
    if(!companyId||!vehicleId||!driverId) { console.warn(`Vistoria ${item.id}: vínculo ausente; preservada em migration_raw_records.`); continue; }
    const rawItems=value(item,"items","checklist");
    if(!Array.isArray(rawItems)||rawItems.length!==39) { console.warn(`Vistoria ${item.id}: checklist não possui 39 itens; preservada para reconciliação.`); continue; }
    const statuses=rawItems.map(entry=>{const raw=String(value(entry,"status","result","value")||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"_");return raw==="conforme"?"conforme":raw.includes("nao_conforme")?"nao_conforme":"nao_se_aplica";});
    const compliant=statuses.filter(status=>status==="conforme").length,nonCompliant=statuses.filter(status=>status==="nao_conforme").length,notApplicable=statuses.filter(status=>status==="nao_se_aplica").length,applicable=compliant+nonCompliant,percentage=applicable?Number((compliant/applicable*100).toFixed(2)):0;
    const current=sequenceByVehicle.get(vehicleId)||0; const sequence=Number(value(item,"vehicleSequence","sequence")||current+1); sequenceByVehicle.set(vehicleId,Math.max(current,sequence));
    const inspectionDate=date(value(item,"inspectionDate","date"))||date(value(item,"createdAt"))||"1900-01-01"; const inspectionTime=String(value(item,"inspectionTime","time")||"00:00").slice(0,5); const threshold=Number(value(item,"thresholdPercentage")||90); const result=String(value(item,"result")||"").toUpperCase().includes("REPRO")||percentage<threshold?"REPROVADO":"APROVADO";
    const inspectorSource=value(item,"inspectorUserId","userId","inspectorId"); const inspectorId=inspectorSource?id("users",inspectorSource):actorId; const projectSource=value(item,"projectId","project_id"); const projectId=projectSource?id("projects",projectSource):defaultProjectId;
    const code=String(value(item,"code")||`LEG-${targetId.slice(0,12)}`).slice(0,40); const snapshot=value(item,"snapshot")||{};
    await request().input("id",sql.UniqueIdentifier,targetId).input("code",sql.NVarChar(40),code).input("sequence",sql.Int,sequence).input("client",sql.UniqueIdentifier,defaultClientId).input("company",sql.UniqueIdentifier,companyId).input("project",sql.UniqueIdentifier,projectId).input("vehicle",sql.UniqueIdentifier,vehicleId).input("driver",sql.UniqueIdentifier,driverId).input("inspector",sql.UniqueIdentifier,inspectorId).input("date",sql.Date,inspectionDate).input("time",sql.Time,inspectionTime).input("device",sql.DateTime2,`${inspectionDate}T${inspectionTime}:00`).input("mileage",sql.Int,Number(value(item,"mileage")||0)).input("compliant",sql.Int,compliant).input("nonCompliant",sql.Int,nonCompliant).input("notApplicable",sql.Int,notApplicable).input("applicable",sql.Int,applicable).input("percentage",sql.Decimal(5,2),percentage).input("threshold",sql.Decimal(5,2),threshold).input("result",sql.NVarChar(20),result).input("observations",sql.NVarChar(4000),String(value(item,"generalObservations","observations")||"")).input("snapshot",sql.NVarChar(sql.MAX),JSON.stringify(snapshot)).input("actor",sql.UniqueIdentifier,actorId).query(`IF EXISTS(SELECT 1 FROM dbo.app_users WHERE id=@inspector) AND EXISTS(SELECT 1 FROM dbo.projects WHERE id=@project) AND NOT EXISTS(SELECT 1 FROM dbo.inspections WHERE id=@id) INSERT dbo.inspections(id,code,vehicle_sequence,client_id,company_id,project_id,vehicle_id,driver_id,inspector_user_id,inspection_date,inspection_time,device_recorded_at,mileage,compliant_count,non_compliant_count,not_applicable_count,applicable_count,compliance_percentage,threshold_percentage,result,general_observations,snapshot_json,created_by,updated_by) VALUES(@id,@code,@sequence,@client,@company,@project,@vehicle,@driver,@inspector,@date,@time,@device,@mileage,@compliant,@nonCompliant,@notApplicable,@applicable,@percentage,@threshold,@result,@observations,@snapshot,@actor,@actor)`);
    for(let index=0;index<rawItems.length;index++){const entry=rawItems[index];await request().input("inspection",sql.UniqueIdentifier,targetId).input("key",sql.NVarChar(80),String(value(entry,"key","id")||`legacy_${index+1}`)).input("categoryKey",sql.NVarChar(80),String(value(entry,"categoryKey")||"legacy")).input("categoryLabel",sql.NVarChar(100),String(value(entry,"categoryLabel","category")||"Checklist legado")).input("label",sql.NVarChar(200),String(value(entry,"label","name")||`Item ${index+1}`)).input("status",sql.NVarChar(30),statuses[index]).input("observation",sql.NVarChar(500),String(value(entry,"observation","notes")||"")).input("order",sql.Int,index+1).query("IF EXISTS(SELECT 1 FROM dbo.inspections WHERE id=@inspection) AND NOT EXISTS(SELECT 1 FROM dbo.inspection_items WHERE inspection_id=@inspection AND item_key=@key) INSERT dbo.inspection_items(inspection_id,item_key,category_key,category_label,item_label,status,observation,display_order) VALUES(@inspection,@key,@categoryKey,@categoryLabel,@label,@status,@observation,@order)");}
    await request().input("inspection",sql.UniqueIdentifier,targetId).input("sourceId",sql.NVarChar(220),String(item.id)).input("vehicle",sql.UniqueIdentifier,vehicleId).input("driver",sql.UniqueIdentifier,driverId).input("sequence",sql.Int,sequence).input("mileage",sql.Int,Number(value(item,"mileage")||0)).query("IF EXISTS(SELECT 1 FROM dbo.inspections WHERE id=@inspection) BEGIN UPDATE dbo.vehicles SET inspection_sequence=CASE WHEN inspection_sequence<@sequence THEN @sequence ELSE inspection_sequence END,mileage=CASE WHEN mileage<@mileage THEN @mileage ELSE mileage END WHERE id=@vehicle; IF NOT EXISTS(SELECT 1 FROM dbo.vehicle_drivers WHERE vehicle_id=@vehicle AND driver_id=@driver) INSERT dbo.vehicle_drivers(vehicle_id,driver_id) VALUES(@vehicle,@driver); UPDATE dbo.migration_raw_records SET normalized_at=SYSUTCDATETIME() WHERE source_system='firebase' AND source_collection='inspections' AND source_id=@sourceId; END");
    await track("inspections",item.id,"inspections",targetId,item);
  }
  const legacySettings=groups.settings[0];
  if(legacySettings) await request().input("minimum",sql.Decimal(5,2),Number(value(legacySettings,"minimumInspectionCompliance")||90)).input("fleetAge",sql.Int,Number(value(legacySettings,"maximumFleetAge")||12)).input("alertDays",sql.Int,Number(value(legacySettings,"expiryAlertDays","documentExpiryWarningDays")||30)).input("provisional",sql.Bit,Boolean(value(legacySettings,"allowProvisionalLicense")||false)).input("blockDriver",sql.Bit,Boolean(value(legacySettings,"blockVehicleForAnyIrregularDriver")||false)).input("credentialDays",sql.Int,Number(value(legacySettings,"credentialMaximumDays")||365)).input("actor",sql.UniqueIdentifier,actorId).query("UPDATE dbo.system_settings SET minimum_inspection_compliance=@minimum,maximum_fleet_age=@fleetAge,expiry_alert_days=@alertDays,allow_provisional_license=@provisional,block_vehicle_for_any_irregular_driver=@blockDriver,credential_maximum_days=@credentialDays,updated_at=SYSUTCDATETIME(),updated_by=@actor WHERE id=1");
  await transaction.commit();
  console.log("Dados normalizados importados. Registros incompatíveis permanecem íntegros em migration_raw_records para reconciliação.");
} catch (error) { await transaction.rollback(); throw error; } finally { await pool.close(); }
