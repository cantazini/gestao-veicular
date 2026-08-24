-- DADOS DE DEMONSTRAÇÃO, SOMENTE PARA BANCO LOCAL/DESCARTÁVEL.
-- Não execute em produção. IDs fixos facilitam os testes manuais documentados.
DECLARE @admin uniqueidentifier='00000000-0000-4000-8000-000000000001';
DECLARE @client uniqueidentifier='00000000-0000-4000-8000-000000000010';
DECLARE @project uniqueidentifier='00000000-0000-4000-8000-000000000020';
DECLARE @company uniqueidentifier='00000000-0000-4000-8000-000000000030';
DECLARE @profile uniqueidentifier='00000000-0000-4000-8000-000000000040';
DECLARE @driver uniqueidentifier='00000000-0000-4000-8000-000000000050';
DECLARE @vehicle uniqueidentifier='00000000-0000-4000-8000-000000000060';
INSERT INTO dbo.app_users(id,identity_provider_id,email,name,role,active) VALUES(@admin,'local-admin','admin@local.test','Administrador local','admin',1);
INSERT INTO dbo.clients(id,name,legal_name,document,document_normalized,active,created_by,updated_by) VALUES(@client,'Cliente demonstração','Cliente demonstração','','',1,@admin,@admin);
INSERT INTO dbo.projects(id,client_id,name,code,active,created_by,updated_by) VALUES(@project,@client,'Projeto demonstração','DEMO',1,@admin,@admin);
INSERT INTO dbo.companies(id,client_id,legal_name,trade_name,document,document_normalized,unit,contract_type,active,created_by,updated_by)
VALUES(@company,@client,'Empresa demonstração Ltda.','Empresa demo','00.000.000/0001-00','00000000000100','Unidade demo','direct',1,@admin,@admin);
INSERT INTO dbo.company_projects(company_id,project_id,created_by) VALUES(@company,@project,@admin);
INSERT INTO dbo.access_profiles(id,client_id,name,description,color,active,created_by,updated_by) VALUES(@profile,@client,'Acesso padrão','Perfil local','#0056A4',1,@admin,@admin);
INSERT INTO dbo.drivers(id,company_id,name,registration,registration_normalized,license_category,license_expiry,active,created_by,updated_by)
VALUES(@driver,@company,'Motorista demonstração','DEMO-01','DEMO-01','D','2030-12-31',1,@admin,@admin);
INSERT INTO dbo.vehicles(id,company_id,project_id,access_profile_id,plate,plate_normalized,brand,model,year,type,mileage,ownership,active,created_by,updated_by)
VALUES(@vehicle,@company,@project,@profile,'ABC1D23','ABC1D23','Marca demo','Modelo demo',2025,'Utilitário',1000,'owned',1,@admin,@admin);
INSERT INTO dbo.vehicle_drivers(vehicle_id,driver_id,created_by) VALUES(@vehicle,@driver,@admin);
