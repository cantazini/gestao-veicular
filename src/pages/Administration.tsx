import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EntityPage } from "./EntityPage";

type AdministrationTab = "users" | "accessProfiles";

export function Administration() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [tab, setTab] = useState<AdministrationTab>(requestedTab === "accessProfiles" ? "accessProfiles" : "users");
  const selectTab = (next: AdministrationTab) => {
    setTab(next);
    setSearchParams(next === "users" ? {} : { tab: next }, { replace: true });
  };

  return <>
    <div className="tabs" role="tablist" aria-label="Áreas da administração">
      <button role="tab" aria-selected={tab === "users"} className={tab === "users" ? "active" : ""} onClick={() => selectTab("users")}>Usuários e papéis</button>
      <button role="tab" aria-selected={tab === "accessProfiles"} className={tab === "accessProfiles" ? "active" : ""} onClick={() => selectTab("accessProfiles")}>Perfis de circulação e acesso</button>
    </div>
    <EntityPage entity={tab}/>
  </>;
}
