SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF COL_LENGTH('dbo.company_documents', 'issue_date') IS NULL
  ALTER TABLE dbo.company_documents ADD issue_date date NULL;
IF COL_LENGTH('dbo.company_documents', 'observation') IS NULL
  ALTER TABLE dbo.company_documents ADD observation nvarchar(500) NULL;

IF COL_LENGTH('dbo.driver_documents', 'issue_date') IS NULL
  ALTER TABLE dbo.driver_documents ADD issue_date date NULL;
IF COL_LENGTH('dbo.driver_documents', 'observation') IS NULL
  ALTER TABLE dbo.driver_documents ADD observation nvarchar(500) NULL;

IF COL_LENGTH('dbo.vehicle_documents', 'issue_date') IS NULL
  ALTER TABLE dbo.vehicle_documents ADD issue_date date NULL;
IF COL_LENGTH('dbo.vehicle_documents', 'observation') IS NULL
  ALTER TABLE dbo.vehicle_documents ADD observation nvarchar(500) NULL;

COMMIT TRANSACTION;
