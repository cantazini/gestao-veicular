SET XACT_ABORT ON;
GO

IF EXISTS (
  SELECT document_normalized
  FROM dbo.clients
  WHERE document_normalized IS NOT NULL AND document_normalized <> ''
  GROUP BY document_normalized
  HAVING COUNT(*) > 1
)
  THROW 51001, 'Existem CNPJs duplicados em dbo.clients. Corrija-os antes de criar o índice.', 1;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID('dbo.clients') AND name = 'UX_clients_document_normalized'
)
  CREATE UNIQUE INDEX UX_clients_document_normalized
    ON dbo.clients(document_normalized)
    WHERE document_normalized IS NOT NULL AND document_normalized <> '';
GO
