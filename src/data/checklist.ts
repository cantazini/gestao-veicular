import type { ChecklistItem, ChecklistStatus } from "../types";

export const CHECKLIST_GROUPS = [
  { key: "security_hygiene", label: "Segurança e Higiene", items: [
    ["interior_cleanliness", "Limpeza interna"], ["exterior_cleanliness", "Limpeza externa"], ["seats", "Poltronas"],
    ["bumpers", "Para-choques dianteiro e traseiro"], ["windows", "Estado das janelas, para-brisa e vidro traseiro"],
    ["fire_extinguisher", "Extintor de segurança"], ["warning_triangle", "Triângulo de segurança"], ["jack", "Macaco"],
    ["wheel_wrench", "Chave de rodas"], ["seat_belts", "Cinto de segurança"]
  ] },
  { key: "operation", label: "Funcionamento", items: [
    ["starter_motor", "Motor de partida"], ["engine", "Motor do veículo"], ["battery", "Bateria"], ["service_brake", "Freio de pé"],
    ["parking_brake", "Freio de estacionamento"], ["washer_wiper", "Limpador e lavador de para-brisa"],
    ["dashboard_indicators", "Indicadores de painel"], ["mirrors", "Espelhos retrovisores internos e externos"],
    ["front_tires", "Pneus dianteiros"], ["rear_tires", "Pneus traseiros"], ["spare_tire", "Pneus sobressalentes"],
    ["oil_fuel_leak", "Vazamento de óleo/combustível"]
  ] },
  { key: "electrical", label: "Sistema Elétrico", items: [
    ["horn", "Buzina"], ["headlights", "Faróis — faroletes, baixo e alto"], ["plate_light", "Luz de placa"],
    ["hazard_lights", "Pisca-alerta"], ["left_turn_signals", "Setas lado esquerdo"], ["right_turn_signals", "Setas lado direito"],
    ["brake_light", "Luz de freio"], ["reverse_light", "Luz de ré"], ["interior_lighting", "Iluminação interna"]
  ] },
  { key: "miscellaneous", label: "Diversos", items: [
    ["company_branding", "Logotipo da empresa"], ["vehicle_registration", "Certificado de Registro, Licenciamento e DPVAT"],
    ["third_party_insurance", "Seguro contra terceiros"], ["bodywork", "Condições gerais da lataria"],
    ["license_plates", "Placas dianteira e traseira"], ["diesel_emissions", "Controle da emissão de gases poluentes e ruídos — veículos a diesel"],
    ["headrest", "Assento com apoio de cabeça"], ["rear_plate_seal", "Lacre da placa traseira, quando aplicável"]
  ] }
] as const;

export const newChecklist = (status: ChecklistStatus = "conforme"): ChecklistItem[] => CHECKLIST_GROUPS.flatMap((group) => group.items.map(([key, label]) => ({ key, label, categoryKey: group.key, categoryLabel: group.label, status, observation: "" })));
export const statusLabel = (status: ChecklistStatus) => ({ conforme: "Conforme", nao_conforme: "Não conforme", nao_se_aplica: "Não se aplica" })[status];
