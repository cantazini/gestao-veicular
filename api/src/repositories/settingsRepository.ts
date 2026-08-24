import { getPool, sql, withTransaction } from "../services/sql";
import type { SettingsInput } from "../validation/settings";

export async function getSettings(): Promise<SettingsInput> {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT minimum_inspection_compliance, maximum_fleet_age, expiry_alert_days, allow_provisional_license,
           block_vehicle_for_any_irregular_driver, credential_maximum_days
    FROM dbo.system_settings WHERE id=1;
    SELECT entity_type, document_type, label, required FROM dbo.document_requirements ORDER BY entity_type, display_order;
    SELECT vehicle_type, width_mm, height_mm FROM dbo.credential_dimensions ORDER BY vehicle_type;
  `);
  const sets = result.recordsets as unknown as Record<string, unknown>[][];
  const general = sets[0][0];
  return {
    minimumInspectionCompliance: Number(general.minimum_inspection_compliance),
    maximumFleetAge: Number(general.maximum_fleet_age),
    expiryAlertDays: Number(general.expiry_alert_days),
    allowProvisionalLicense: Boolean(general.allow_provisional_license),
    blockVehicleForAnyIrregularDriver: Boolean(general.block_vehicle_for_any_irregular_driver),
    credentialMaximumDays: Number(general.credential_maximum_days),
    documentRequirements: sets[1].map((row) => ({ entityType: row.entity_type as "company" | "driver" | "vehicle", documentType: String(row.document_type), label: String(row.label), required: Boolean(row.required) })),
    credentialDimensions: sets[2].map((row) => ({ vehicleType: String(row.vehicle_type), widthMm: Number(row.width_mm), heightMm: Number(row.height_mm) }))
  };
}

export async function saveSettings(settings: SettingsInput, actorId: string): Promise<void> {
  await withTransaction(async (transaction) => {
    await new sql.Request(transaction)
      .input("minimum", sql.Decimal(5, 2), settings.minimumInspectionCompliance)
      .input("fleetAge", sql.Int, settings.maximumFleetAge)
      .input("alertDays", sql.Int, settings.expiryAlertDays)
      .input("provisional", sql.Bit, settings.allowProvisionalLicense)
      .input("blockDriver", sql.Bit, settings.blockVehicleForAnyIrregularDriver)
      .input("credentialDays", sql.Int, settings.credentialMaximumDays)
      .input("actorId", sql.UniqueIdentifier, actorId)
      .query(`UPDATE dbo.system_settings SET minimum_inspection_compliance=@minimum, maximum_fleet_age=@fleetAge,
        expiry_alert_days=@alertDays, allow_provisional_license=@provisional,
        block_vehicle_for_any_irregular_driver=@blockDriver, credential_maximum_days=@credentialDays,
        updated_at=SYSUTCDATETIME(), updated_by=@actorId WHERE id=1`);

    for (const requirement of settings.documentRequirements) {
      await new sql.Request(transaction)
        .input("entityType", sql.NVarChar(20), requirement.entityType)
        .input("documentType", sql.NVarChar(60), requirement.documentType)
        .input("label", sql.NVarChar(100), requirement.label)
        .input("required", sql.Bit, requirement.required)
        .query(`UPDATE dbo.document_requirements SET label=@label, required=@required
                WHERE entity_type=@entityType AND document_type=@documentType`);
    }
    for (const dimension of settings.credentialDimensions) {
      await new sql.Request(transaction)
        .input("vehicleType", sql.NVarChar(60), dimension.vehicleType)
        .input("width", sql.Decimal(7, 2), dimension.widthMm)
        .input("height", sql.Decimal(7, 2), dimension.heightMm)
        .query(`MERGE dbo.credential_dimensions AS target USING (SELECT @vehicleType AS vehicle_type) AS source
                ON target.vehicle_type=source.vehicle_type
                WHEN MATCHED THEN UPDATE SET width_mm=@width,height_mm=@height
                WHEN NOT MATCHED THEN INSERT(vehicle_type,width_mm,height_mm) VALUES(@vehicleType,@width,@height);`);
    }
  });
}
