// Dev Centre · UI preview (14 Oct 2026). Every ui-v2 primitive with sample
// data, so the kit can be judged on its own in both themes. Dev only.

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Avatar, ButtonV2, Chip, DetailHeader, FactsStrip, HealthLabel, InputV2, MasterDetail, MasterRow,
  Meter, Panel, Pill, Row, RowList, RowName, RowNum, Spark, StatStrip, TabsRow, Timeline,
} from "@/components/ui-v2";

type PreviewTab = "stats" | "training" | "actions";
const TABS: { id: PreviewTab; label: string }[] = [{ id: "stats", label: "Stats" }, { id: "training", label: "Training" }, { id: "actions", label: "Actions" }];

export default function UiPreview() {
  const [tab, setTab] = useState<PreviewTab>("stats");
  const [chip, setChip] = useState("active");
  const [selected, setSelected] = useState("anthony");
  return (
    <DashboardLayout role="admin">
      <PageContainer>
        <PageHeader title="UI preview" subtitle="Every ui-v2 primitive with sample data. Toggle dark and light in the sidebar." />
        <div className="space-y-8">
          <StatStrip
            hero
            stats={[
              { label: "Today", value: 2, caption: "1 discovery, 1 follow-up" },
              { label: "To confirm", value: 1, delta: "−1 vs yesterday", deltaTone: "down", caption: "Brett Stephens, 10:00" },
              { label: "Rest of this week", value: 3, caption: "Fri 16 and beyond" },
              { label: "Cycle 26 Sep – 25 Oct", value: 17, delta: "+4 this week", deltaTone: "up", caption: "booked by both setters" },
            ]}
          />

          <div className="grid grid-cols-[1.2fr_1fr] gap-7">
            <Panel title="Today" meta="Wed 14 Oct" aside={<Pill variant="warn">1 to confirm</Pill>}>
              <Timeline
                groups={[{ label: "", items: [
                  { id: "1", time: "10:00", primary: <>Brett Stephens <span className="font-normal text-[var(--dim)]">· MoveATech</span></>, secondary: "Discovery · £5–10m · booked by Tom Reilly", focus: true, aside: <><ButtonV2 size="sm">No</ButtonV2><ButtonV2 size="sm" variant="primary">Confirmed</ButtonV2></> },
                  { id: "2", time: "17:00", primary: <>Arjun Mehta <span className="font-normal text-[var(--dim)]">· Persistent</span></>, secondary: "Follow-up · booked by Tom Reilly", aside: <Pill variant="ok">Confirmed</Pill> },
                ] }]}
              />
            </Panel>
            <Panel title="Rest of this week" meta="to Sun 18 Oct" aside={<Pill>3 booked</Pill>}>
              <Timeline
                groups={[
                  { label: "Fri", day: "16 Oct", items: [
                    { id: "3", time: "10:30", primary: "Victor Lane · Octave Systems", secondary: "Discovery · £1–5m · Ethan Cole", aside: <Pill variant="info">Booked</Pill> },
                    { id: "4", time: "12:30", primary: "Victor Lane · follow-up", secondary: "Follow-up · Marcus Hale", aside: <Pill variant="info">Booked</Pill> },
                  ] },
                  { label: "Mon", day: "19 Oct", items: [
                    { id: "5", time: "14:00", primary: "Imogen Hart · HireLoop", secondary: "Discovery · £1–5m · Ethan Cole", aside: <Pill variant="info">Booked</Pill> },
                  ] },
                ]}
              />
            </Panel>
          </div>

          <div>
            <div className="mb-4 flex flex-wrap gap-[6px]">
              {[["active", "Active · 7"], ["healthy", "Healthy · 3"], ["watch", "Watch · 1"], ["risk", "At risk · 1"], ["nodata", "No data · 2"]].map(([id, label]) => (
                <Chip key={id} selected={chip === id} onClick={() => setChip(id)}>{label}</Chip>
              ))}
              <Chip quiet>+ filter</Chip>
            </div>
            <RowList columns="minmax(220px,1.5fr) 110px 70px 1fr 110px 120px 28px" head={["Client", "Health", <span className="text-right pr-4" key="7d">7d</span>, "vs weekly target", "Last catch-up", "Industry", ""]}>
              {[
                ["BE", "Northgate Recruitment", "Owen Hartley", "ok", "Healthy", 0, 4, "—", [3, 3, 3, 3, 3, 3, 3]],
                ["FS", "Fenwick Search", "Paul Stanbridge", "ok", "Healthy", 2, 4, "Banks, Financial Services", [1, 2, 1, 1, 3, 1, 1]],
                ["LJ", "Ridgeway Legal", "James Toovey", "bad", "At risk", 7, 8, "All, but tech focuses", [2, 4, 3, 5, 2, 4, 3]],
                ["MR", "Brightwater Group", "Toby Winter", "ok", "Healthy", 6, 6, "SAP Software focus", [3, 2, 4, 2, 5, 3, 4]],
                ["WR", "Westbrook Recruitment", "Darren Oliver", "warn", "Watch", 6, 8, "Logistics, Transport", [4, 3, 2, 3, 2, 3, 1]],
              ].map(([ini, name, contact, health, label, n, target, industry, trend]) => (
                <Row key={String(name)} health={health as "ok" | "warn" | "bad"} onClick={() => undefined}>
                  <RowName lead={<Avatar name={String(name)} size={28} />} primary={name as string} secondary={contact as string} />
                  <HealthLabel health={health as "ok" | "warn" | "bad"}>{label as string}</HealthLabel>
                  <RowNum>{n as number}</RowNum>
                  <Meter value={n as number} target={target as number} />
                  <div className="text-[11.5px] text-[var(--dim)]">—</div>
                  <div className="truncate text-[11.5px] text-[var(--dim)]">{industry as string}</div>
                  <Spark values={trend as number[]} />
                </Row>
              ))}
            </RowList>
          </div>

          <MasterDetail
            list={
              <div>
                <MasterRow selected={selected === "anthony"} onClick={() => setSelected("anthony")} primary="Ethan Cole" secondary="ethan@meridiansales.example" aside={<>17 · 0 sat<br /><span className="text-[10px] uppercase tracking-[0.06em] text-[var(--dim)]">cycle</span></>} />
                <MasterRow selected={selected === "james"} onClick={() => setSelected("james")} primary="Tom Reilly" secondary="tom@meridiansales.example" aside={<>10 · 0 sat<br /><span className="text-[10px] uppercase tracking-[0.06em] text-[var(--dim)]">cycle</span></>} />
              </div>
            }
            detail={
              <div>
                <DetailHeader
                  avatar={<Avatar name="Ethan Cole" size={52} ring />}
                  name="Ethan Cole"
                  email="ethan@meridiansales.example"
                  pills={<><Pill variant="ok">Active</Pill><Pill>SDR</Pill><Pill variant="info">Acquisition</Pill></>}
                  actions={<><ButtonV2 size="sm">Book training</ButtonV2><ButtonV2 size="sm">Promote</ButtonV2></>}
                />
                <FactsStrip facts={[{ label: "Started", value: "9 Sep 2025 · 400d" }, { label: "Base salary", value: "£750" }, { label: "Per sat meeting", value: "$50" }, { label: "Birthday", value: "29 Jul" }]} />
                <TabsRow<PreviewTab> className="mt-3" tabs={TABS} value={tab} onChange={setTab} />
                <div className="mt-3">
                  <StatStrip stats={[{ label: "This week", value: 4, caption: "0 sat" }, { label: "This month", value: 13, caption: "0 sat" }, { label: "Cycle", value: 17, caption: "0 sat · $0 earned" }]} />
                </div>
              </div>
            }
          />

          <div className="grid max-w-md gap-4">
            <InputV2 id="p-name" label="Name" defaultValue="Rosa Hilmi" />
            <InputV2 id="p-mobile" label="Mobile" hint="for text reminders" placeholder="+44…" />
            <div className="flex gap-2">
              <ButtonV2 variant="primary">Book appointment</ButtonV2>
              <ButtonV2>Move</ButtonV2>
              <ButtonV2 variant="ghost">Cancel</ButtonV2>
            </div>
            <div className="flex gap-2"><Pill>Default</Pill><Pill variant="ok">Sat</Pill><Pill variant="warn">To confirm</Pill><Pill variant="bad">No show</Pill><Pill variant="info">Booked</Pill></div>
          </div>
        </div>
      </PageContainer>
    </DashboardLayout>
  );
}
