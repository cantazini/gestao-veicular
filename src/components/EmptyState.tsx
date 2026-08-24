import { Inbox } from "lucide-react";
export function EmptyState({ title = "Nenhum registro encontrado", text = "Ajuste os filtros ou adicione um novo registro." }) { return <div className="empty-state"><Inbox/><strong>{title}</strong><span>{text}</span></div>; }
