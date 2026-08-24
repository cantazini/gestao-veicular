SET XACT_ABORT ON;
BEGIN TRANSACTION;

CREATE TABLE dbo.app_users (
  id uniqueidentifier NOT NULL CONSTRAINT PK_app_users PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  identity_provider_id nvarchar(200) NOT NULL, email nvarchar(180) NOT NULL, name nvarchar(160) NOT NULL,
  role nvarchar(20) NOT NULL, company_id uniqueidentifier NULL, active bit NOT NULL DEFAULT 1,
  created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by uniqueidentifier NULL, updated_by uniqueidentifier NULL,
  CONSTRAINT CK_app_users_role CHECK (role IN ('admin','inspector','supplier')),
  CONSTRAINT UQ_app_users_provider UNIQUE(identity_provider_id), CONSTRAINT UQ_app_users_email UNIQUE(email)
);

CREATE TABLE dbo.clients (
  id uniqueidentifier NOT NULL CONSTRAINT PK_clients PRIMARY KEY DEFAULT NEWSEQUENTIALID(),
  name nvarchar(140) NOT NULL, legal_name nvarchar(180) NULL, document nvarchar(30) NULL, document_normalized nvarchar(30) NULL,
  logo_blob_path nvarchar(700) NULL, active bit NOT NULL DEFAULT 1,
  created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by uniqueidentifier NULL, updated_by uniqueidentifier NULL
);

CREATE TABLE dbo.projects (
  id uniqueidentifier NOT NULL CONSTRAINT PK_projects PRIMARY KEY DEFAULT NEWSEQUENTIALID(), client_id uniqueidentifier NOT NULL,
  name nvarchar(140) NOT NULL, code nvarchar(40) NOT NULL, active bit NOT NULL DEFAULT 1,
  created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by uniqueidentifier NULL, updated_by uniqueidentifier NULL,
  CONSTRAINT FK_projects_clients FOREIGN KEY(client_id) REFERENCES dbo.clients(id), CONSTRAINT UQ_projects_code UNIQUE(client_id,code)
);

CREATE TABLE dbo.companies (
  id uniqueidentifier NOT NULL CONSTRAINT PK_companies PRIMARY KEY DEFAULT NEWSEQUENTIALID(), client_id uniqueidentifier NOT NULL,
  parent_company_id uniqueidentifier NULL, legal_name nvarchar(180) NOT NULL, trade_name nvarchar(160) NULL,
  document nvarchar(30) NOT NULL, document_normalized nvarchar(30) NOT NULL, unit nvarchar(120) NULL,
  manager_name nvarchar(140) NULL, phone nvarchar(30) NULL, email nvarchar(180) NULL, contract_number nvarchar(80) NULL,
  contract_type nvarchar(30) NOT NULL, contract_start date NULL, contract_end date NULL, active bit NOT NULL DEFAULT 1,
  created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by uniqueidentifier NULL, updated_by uniqueidentifier NULL,
  CONSTRAINT FK_companies_clients FOREIGN KEY(client_id) REFERENCES dbo.clients(id),
  CONSTRAINT FK_companies_parent FOREIGN KEY(parent_company_id) REFERENCES dbo.companies(id),
  CONSTRAINT CK_companies_contract_type CHECK(contract_type IN ('direct','subcontractor')),
  CONSTRAINT CK_companies_subcontractor CHECK(contract_type='direct' OR parent_company_id IS NOT NULL),
  CONSTRAINT UQ_companies_document UNIQUE(document_normalized)
);
ALTER TABLE dbo.app_users ADD CONSTRAINT FK_app_users_companies FOREIGN KEY(company_id) REFERENCES dbo.companies(id);

CREATE TABLE dbo.company_projects (
  company_id uniqueidentifier NOT NULL, project_id uniqueidentifier NOT NULL, created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), created_by uniqueidentifier NULL,
  CONSTRAINT PK_company_projects PRIMARY KEY(company_id,project_id),
  CONSTRAINT FK_company_projects_company FOREIGN KEY(company_id) REFERENCES dbo.companies(id),
  CONSTRAINT FK_company_projects_project FOREIGN KEY(project_id) REFERENCES dbo.projects(id)
);

CREATE TABLE dbo.access_profiles (
  id uniqueidentifier NOT NULL CONSTRAINT PK_access_profiles PRIMARY KEY DEFAULT NEWSEQUENTIALID(), client_id uniqueidentifier NULL,
  name nvarchar(100) NOT NULL, description nvarchar(500) NULL, color char(7) NOT NULL DEFAULT '#0056A4', active bit NOT NULL DEFAULT 1,
  created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by uniqueidentifier NULL, updated_by uniqueidentifier NULL,
  CONSTRAINT FK_access_profiles_clients FOREIGN KEY(client_id) REFERENCES dbo.clients(id)
);
CREATE TABLE dbo.access_profile_gates (
  access_profile_id uniqueidentifier NOT NULL, gate_name nvarchar(100) NOT NULL,
  CONSTRAINT PK_access_profile_gates PRIMARY KEY(access_profile_id,gate_name),
  CONSTRAINT FK_access_profile_gates_profile FOREIGN KEY(access_profile_id) REFERENCES dbo.access_profiles(id) ON DELETE CASCADE
);
CREATE TABLE dbo.access_profile_areas (
  access_profile_id uniqueidentifier NOT NULL, area_name nvarchar(100) NOT NULL,
  CONSTRAINT PK_access_profile_areas PRIMARY KEY(access_profile_id,area_name),
  CONSTRAINT FK_access_profile_areas_profile FOREIGN KEY(access_profile_id) REFERENCES dbo.access_profiles(id) ON DELETE CASCADE
);

CREATE TABLE dbo.drivers (
  id uniqueidentifier NOT NULL CONSTRAINT PK_drivers PRIMARY KEY DEFAULT NEWSEQUENTIALID(), company_id uniqueidentifier NOT NULL,
  name nvarchar(160) NOT NULL, registration nvarchar(60) NOT NULL, registration_normalized nvarchar(80) NOT NULL,
  job_title nvarchar(100) NULL, license_category nvarchar(10) NOT NULL, license_number nvarchar(40) NULL,
  license_expiry date NOT NULL, provisional_license bit NOT NULL DEFAULT 0, active bit NOT NULL DEFAULT 1,
  created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by uniqueidentifier NULL, updated_by uniqueidentifier NULL,
  CONSTRAINT FK_drivers_companies FOREIGN KEY(company_id) REFERENCES dbo.companies(id),
  CONSTRAINT UQ_drivers_registration UNIQUE(company_id,registration_normalized)
);

CREATE TABLE dbo.vehicles (
  id uniqueidentifier NOT NULL CONSTRAINT PK_vehicles PRIMARY KEY DEFAULT NEWSEQUENTIALID(), company_id uniqueidentifier NOT NULL,
  project_id uniqueidentifier NOT NULL, access_profile_id uniqueidentifier NOT NULL, plate nvarchar(8) NOT NULL,
  plate_normalized nvarchar(8) NOT NULL, brand nvarchar(80) NOT NULL, model nvarchar(100) NOT NULL, year int NOT NULL,
  type nvarchar(60) NOT NULL, color nvarchar(50) NULL, fuel nvarchar(50) NULL, mileage int NOT NULL DEFAULT 0,
  ownership nvarchar(20) NOT NULL, rental_company nvarchar(160) NULL, inspection_sequence int NOT NULL DEFAULT 0,
  active bit NOT NULL DEFAULT 1, created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  created_by uniqueidentifier NULL, updated_by uniqueidentifier NULL,
  CONSTRAINT FK_vehicles_companies FOREIGN KEY(company_id) REFERENCES dbo.companies(id),
  CONSTRAINT FK_vehicles_projects FOREIGN KEY(project_id) REFERENCES dbo.projects(id),
  CONSTRAINT FK_vehicles_access_profiles FOREIGN KEY(access_profile_id) REFERENCES dbo.access_profiles(id),
  CONSTRAINT CK_vehicles_year CHECK(year BETWEEN 1950 AND 2200), CONSTRAINT CK_vehicles_mileage CHECK(mileage>=0),
  CONSTRAINT CK_vehicles_ownership CHECK(ownership IN ('owned','rented')), CONSTRAINT UQ_vehicles_plate UNIQUE(plate_normalized)
);
CREATE TABLE dbo.vehicle_drivers (
  vehicle_id uniqueidentifier NOT NULL, driver_id uniqueidentifier NOT NULL, created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(), created_by uniqueidentifier NULL,
  CONSTRAINT PK_vehicle_drivers PRIMARY KEY(vehicle_id,driver_id),
  CONSTRAINT FK_vehicle_drivers_vehicle FOREIGN KEY(vehicle_id) REFERENCES dbo.vehicles(id),
  CONSTRAINT FK_vehicle_drivers_driver FOREIGN KEY(driver_id) REFERENCES dbo.drivers(id)
);

CREATE TABLE dbo.company_documents (
  id uniqueidentifier NOT NULL CONSTRAINT PK_company_documents PRIMARY KEY DEFAULT NEWSEQUENTIALID(), company_id uniqueidentifier NOT NULL,
  document_type nvarchar(60) NOT NULL,label nvarchar(140) NOT NULL,original_filename nvarchar(220) NOT NULL,blob_path nvarchar(700) NOT NULL,
  mime_type nvarchar(120) NOT NULL,file_size bigint NOT NULL,expiry_date date NULL,created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),created_by uniqueidentifier NULL,updated_by uniqueidentifier NULL,
  CONSTRAINT FK_company_documents_company FOREIGN KEY(company_id) REFERENCES dbo.companies(id)
);
CREATE TABLE dbo.driver_documents (
  id uniqueidentifier NOT NULL CONSTRAINT PK_driver_documents PRIMARY KEY DEFAULT NEWSEQUENTIALID(), driver_id uniqueidentifier NOT NULL,
  document_type nvarchar(60) NOT NULL,label nvarchar(140) NOT NULL,original_filename nvarchar(220) NOT NULL,blob_path nvarchar(700) NOT NULL,
  mime_type nvarchar(120) NOT NULL,file_size bigint NOT NULL,expiry_date date NULL,created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),created_by uniqueidentifier NULL,updated_by uniqueidentifier NULL,
  CONSTRAINT FK_driver_documents_driver FOREIGN KEY(driver_id) REFERENCES dbo.drivers(id)
);
CREATE TABLE dbo.vehicle_documents (
  id uniqueidentifier NOT NULL CONSTRAINT PK_vehicle_documents PRIMARY KEY DEFAULT NEWSEQUENTIALID(), vehicle_id uniqueidentifier NOT NULL,
  document_type nvarchar(60) NOT NULL,label nvarchar(140) NOT NULL,original_filename nvarchar(220) NOT NULL,blob_path nvarchar(700) NOT NULL,
  mime_type nvarchar(120) NOT NULL,file_size bigint NOT NULL,expiry_date date NULL,created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),created_by uniqueidentifier NULL,updated_by uniqueidentifier NULL,
  CONSTRAINT FK_vehicle_documents_vehicle FOREIGN KEY(vehicle_id) REFERENCES dbo.vehicles(id)
);

CREATE TABLE dbo.system_settings (
  id tinyint NOT NULL CONSTRAINT PK_system_settings PRIMARY KEY CONSTRAINT CK_system_settings_single CHECK(id=1),
  minimum_inspection_compliance decimal(5,2) NOT NULL DEFAULT 90,
  maximum_fleet_age int NOT NULL DEFAULT 12, expiry_alert_days int NOT NULL DEFAULT 30,
  allow_provisional_license bit NOT NULL DEFAULT 0, block_vehicle_for_any_irregular_driver bit NOT NULL DEFAULT 0,
  credential_maximum_days int NOT NULL DEFAULT 365,
  updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),updated_by uniqueidentifier NULL
);
INSERT INTO dbo.system_settings(id) VALUES(1);
CREATE TABLE dbo.document_requirements (
  entity_type nvarchar(20) NOT NULL,document_type nvarchar(60) NOT NULL,label nvarchar(100) NOT NULL,required bit NOT NULL DEFAULT 1,display_order int NOT NULL DEFAULT 0,
  CONSTRAINT PK_document_requirements PRIMARY KEY(entity_type,document_type),CONSTRAINT CK_document_requirements_entity CHECK(entity_type IN('company','driver','vehicle'))
);
INSERT INTO dbo.document_requirements(entity_type,document_type,label,required,display_order) VALUES
('company','contract','Contrato social / contrato',1,1),('driver','license','Carteira Nacional de Habilitação',1,1),('vehicle','registration','CRLV',1,1),('vehicle','insurance','Seguro contra terceiros',1,2);
CREATE TABLE dbo.credential_dimensions (
  vehicle_type nvarchar(60) NOT NULL CONSTRAINT PK_credential_dimensions PRIMARY KEY,width_mm decimal(7,2) NOT NULL,height_mm decimal(7,2) NOT NULL
);
INSERT INTO dbo.credential_dimensions(vehicle_type,width_mm,height_mm) VALUES('default',85.60,53.98),('Caminhão',90,60),('Van',85.60,53.98);

CREATE TABLE dbo.inspections (
  id uniqueidentifier NOT NULL CONSTRAINT PK_inspections PRIMARY KEY, code nvarchar(40) NOT NULL,vehicle_sequence int NOT NULL,
  client_id uniqueidentifier NOT NULL,company_id uniqueidentifier NOT NULL,project_id uniqueidentifier NOT NULL,
  vehicle_id uniqueidentifier NOT NULL,driver_id uniqueidentifier NOT NULL,inspector_user_id uniqueidentifier NOT NULL,
  inspection_date date NOT NULL,inspection_time time(0) NOT NULL,device_recorded_at datetime2 NOT NULL,server_recorded_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  mileage int NOT NULL,compliant_count int NOT NULL,non_compliant_count int NOT NULL,not_applicable_count int NOT NULL,applicable_count int NOT NULL,
  compliance_percentage decimal(5,2) NOT NULL,threshold_percentage decimal(5,2) NOT NULL,result nvarchar(20) NOT NULL,
  general_observations nvarchar(4000) NULL,snapshot_json nvarchar(max) NOT NULL,created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),created_by uniqueidentifier NOT NULL,updated_by uniqueidentifier NOT NULL,
  CONSTRAINT UQ_inspections_code UNIQUE(code),CONSTRAINT UQ_inspections_vehicle_sequence UNIQUE(vehicle_id,vehicle_sequence),
  CONSTRAINT FK_inspections_client FOREIGN KEY(client_id) REFERENCES dbo.clients(id),CONSTRAINT FK_inspections_company FOREIGN KEY(company_id) REFERENCES dbo.companies(id),
  CONSTRAINT FK_inspections_project FOREIGN KEY(project_id) REFERENCES dbo.projects(id),CONSTRAINT FK_inspections_vehicle FOREIGN KEY(vehicle_id) REFERENCES dbo.vehicles(id),
  CONSTRAINT FK_inspections_driver FOREIGN KEY(driver_id) REFERENCES dbo.drivers(id),CONSTRAINT FK_inspections_inspector FOREIGN KEY(inspector_user_id) REFERENCES dbo.app_users(id),
  CONSTRAINT CK_inspections_result CHECK(result IN ('APROVADO','REPROVADO')),CONSTRAINT CK_inspections_percentage CHECK(compliance_percentage BETWEEN 0 AND 100)
);
CREATE TABLE dbo.inspection_items (
  id uniqueidentifier NOT NULL CONSTRAINT PK_inspection_items PRIMARY KEY DEFAULT NEWSEQUENTIALID(),inspection_id uniqueidentifier NOT NULL,
  item_key nvarchar(80) NOT NULL,category_key nvarchar(80) NOT NULL,category_label nvarchar(100) NOT NULL,item_label nvarchar(200) NOT NULL,
  status nvarchar(30) NOT NULL,observation nvarchar(500) NULL,display_order int NOT NULL,
  CONSTRAINT FK_inspection_items_inspection FOREIGN KEY(inspection_id) REFERENCES dbo.inspections(id) ON DELETE CASCADE,
  CONSTRAINT UQ_inspection_items_key UNIQUE(inspection_id,item_key),CONSTRAINT CK_inspection_items_status CHECK(status IN ('conforme','nao_conforme','nao_se_aplica'))
);
CREATE TABLE dbo.inspection_photos (
  id uniqueidentifier NOT NULL CONSTRAINT PK_inspection_photos PRIMARY KEY,inspection_id uniqueidentifier NOT NULL,photo_type nvarchar(60) NOT NULL,
  label nvarchar(120) NOT NULL,description nvarchar(300) NULL,original_filename nvarchar(220) NOT NULL,blob_path nvarchar(700) NOT NULL,
  mime_type nvarchar(120) NOT NULL,original_size bigint NOT NULL,stored_size bigint NOT NULL,width int NULL,height int NULL,display_order int NOT NULL DEFAULT 0,
  created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),created_by uniqueidentifier NOT NULL,
  CONSTRAINT FK_inspection_photos_inspection FOREIGN KEY(inspection_id) REFERENCES dbo.inspections(id) ON DELETE CASCADE
);
CREATE TABLE dbo.audit_logs (
  id bigint IDENTITY(1,1) NOT NULL CONSTRAINT PK_audit_logs PRIMARY KEY,actor_user_id uniqueidentifier NULL,action nvarchar(80) NOT NULL,
  entity_type nvarchar(80) NOT NULL,entity_id nvarchar(80) NULL,details_json nvarchar(max) NULL,occurred_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE TABLE dbo.migration_legacy_ids (
  source_system nvarchar(40) NOT NULL,source_collection nvarchar(80) NOT NULL,source_id nvarchar(220) NOT NULL,
  target_table nvarchar(80) NOT NULL,target_id uniqueidentifier NOT NULL,source_checksum char(64) NULL,migrated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_migration_legacy_ids PRIMARY KEY(source_system,source_collection,source_id),
  CONSTRAINT UQ_migration_target UNIQUE(target_table,target_id)
);
CREATE TABLE dbo.migration_raw_records (
  source_system nvarchar(40) NOT NULL,source_collection nvarchar(80) NOT NULL,source_id nvarchar(220) NOT NULL,
  payload_json nvarchar(max) NOT NULL,source_checksum char(64) NOT NULL,normalized_at datetime2 NULL,
  migrated_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_migration_raw_records PRIMARY KEY(source_system,source_collection,source_id),
  CONSTRAINT CK_migration_raw_json CHECK(ISJSON(payload_json)=1)
);

CREATE INDEX IX_companies_client ON dbo.companies(client_id,active);
CREATE INDEX IX_drivers_company ON dbo.drivers(company_id,active);
CREATE INDEX IX_vehicles_company_project ON dbo.vehicles(company_id,project_id,active);
CREATE INDEX IX_inspections_date ON dbo.inspections(inspection_date DESC,inspection_time DESC);
CREATE INDEX IX_inspections_company ON dbo.inspections(company_id,inspection_date DESC);
CREATE INDEX IX_inspection_items_status ON dbo.inspection_items(inspection_id,status);
CREATE INDEX IX_company_documents_expiry ON dbo.company_documents(expiry_date);
CREATE INDEX IX_driver_documents_expiry ON dbo.driver_documents(expiry_date);
CREATE INDEX IX_vehicle_documents_expiry ON dbo.vehicle_documents(expiry_date);

COMMIT TRANSACTION;
