import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
export function EmptyState({ title = "Nenhum registro encontrado", text = "Ajuste os filtros ou adicione um novo registro.", action }: { title?: string; text?: string; action?: ReactNode }) { return <div className="empty-state"><Inbox/><strong>{title}</strong><span>{text}</span>{action}</div>; }
