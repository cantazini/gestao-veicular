-- Execute depois de entrar uma vez pelo Microsoft Entra ID e copiar o userDetails
-- retornado por /.auth/me. Substitua SOMENTE os valores entre < >.
-- Este arquivo é um modelo: não contém credenciais ou dados reais.
INSERT INTO dbo.app_users(identity_provider_id,email,name,role,active)
VALUES (N'<IDENTITY_PROVIDER_ID>',N'<EMAIL_CORPORATIVO>',N'<NOME>',N'admin',1);
