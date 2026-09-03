import { setGlobalOptions } from "firebase-functions/v2";

setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

export { manageEntity } from "./entities.js";
export { manageUser } from "./users.js";
export { completeInspection, updateInspection } from "./inspections.js";
export { updateSettings } from "./settings.js";
export { getCredentialEligibility, requestCredentialApproval, decideCredentialApproval, issueCredential } from "./credentials.js";
export { bulkImport } from "./import.js";
