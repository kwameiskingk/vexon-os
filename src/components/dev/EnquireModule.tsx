// Dev Centre › Enquire (15 Oct 2026, the owner's ruling): the whole builder lives
// here. List, builder and responses are the same screens as /admin/forms/*,
// mounted in place; navigation between them is state, not routes.

import { useState } from "react";
import { EnquireEmbedContext, type EnquireView } from "@/lib/forms/enquireNav";
import { FormsListBody } from "@/pages/admin/forms/FormsPage";
import { FormEditorBody } from "@/pages/admin/forms/FormEditorPage";
import { FormResponsesBody } from "@/pages/admin/forms/FormResponsesPage";

export function EnquireModule() {
  const [view, setView] = useState<EnquireView>({ view: "list" });
  return (
    <EnquireEmbedContext.Provider value={setView}>
      {view.view === "list" ? (
        <FormsListBody />
      ) : view.view === "editor" ? (
        <FormEditorBody key={view.id} id={view.id} />
      ) : (
        <FormResponsesBody key={view.id} id={view.id} openToken={view.open ?? null} />
      )}
    </EnquireEmbedContext.Provider>
  );
}
