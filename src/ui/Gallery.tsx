// /dev/ui — every design-system component rendered in the light and dark themes side by side, for visual QA
// and for agents building views ("what does a Stat look like?"). Not linked from the product UI.
import { useState, type ReactNode } from "react";
import { Bell, Download, Filter, Pill, Printer, Search, Settings, Trash2 } from "lucide-react";
import { HelpDialog } from "../app/Help";
import {
  ACB_BANDS,
  ACB_THRESHOLD_NOTE,
  AIBadge,
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Chip,
  DemoDataChip,
  Disclosure,
  Drawer,
  EmptyState,
  EvidenceLink,
  IconButton,
  Logo,
  MedEventMarker,
  Meter,
  Modal,
  PageHeader,
  ProgressBar,
  Segmented,
  Select,
  Skeleton,
  SourceCitation,
  Stat,
  TabPanel,
  Tabs,
  TextArea,
  TextInput,
  TimelineDot,
  TimelineLegend,
  Tooltip,
  useToast,
} from "./index";
import type { MetricKey } from "../model/types";
import "./gallery.css";

const BEERS = {
  id: "beers2023",
  short: "AGS Beers Criteria® 2023",
  citation:
    "2023 American Geriatrics Society Beers Criteria® Update Expert Panel. J Am Geriatr Soc. 2023;71(7):2052-2081.",
  url: "https://doi.org/10.1111/jgs.18372",
};
const ACB = {
  short: "ACB scale (Boustani 2008)",
  citation: "Boustani M, et al. Impact of anticholinergics on the aging brain. Aging Health. 2008;4(3):311-320.",
  url: "https://doi.org/10.2217/1745509X.4.3.311",
};

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "dizziness", label: "Dizziness" },
  { key: "nearFall", label: "Near-fall" },
  { key: "fall", label: "Fall" },
  { key: "drowsiness", label: "Drowsiness" },
  { key: "confusion", label: "Confusion" },
  { key: "swelling", label: "Ankle swelling" },
  { key: "energy", label: "Energy (1–5)" },
  { key: "sleep", label: "Sleep (1–5)" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gal-section">
      <h3 className="gal-section__title">{title}</h3>
      <div className="gal-section__body">{children}</div>
    </section>
  );
}

function ThemePanel({ theme }: { theme: "light" | "dark" }) {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const [chips, setChips] = useState({ dizzy: true, falls: false });
  const [energy, setEnergy] = useState<number | null>(null);
  const [dizzy, setDizzy] = useState<string | null>("yes");
  const [tab, setTab] = useState<"findings" | "signals" | "notes">("findings");
  const [pill, setPill] = useState<"7" | "14" | "30">("14");
  const [story, setStory] = useState("Felt woozy after breakfast and nearly went over in the kitchen.");
  const [loading, setLoading] = useState(false);

  return (
    <div className="gal-theme" data-theme={theme}>
      <div className="gal-theme__head">
        <Logo size={28} />
        <Badge tone="neutral">{theme === "light" ? "Light theme" : "Dark theme"}</Badge>
      </div>

      <Section title="Buttons">
        <div className="ui-row">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger-quiet" iconLeft={<Trash2 size={16} aria-hidden="true" />}>
            Delete entry
          </Button>
          <Button variant="accent">Accent</Button>
        </div>
        <div className="ui-row">
          <Button size="sm" variant="primary">
            Small
          </Button>
          <Button size="md" variant="primary">
            Medium
          </Button>
          <Button size="lg" variant="primary">
            Large
          </Button>
          <Button size="xl" variant="primary">
            Extra large
          </Button>
        </div>
        <div className="ui-row">
          <Button
            variant="primary"
            loading={loading}
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 1500);
            }}
          >
            {loading ? "Saving…" : "Click to load"}
          </Button>
          <Button disabled>Disabled</Button>
          <ButtonLink href="#/dev/ui" variant="secondary" iconLeft={<Printer size={16} aria-hidden="true" />}>
            Link as button
          </ButtonLink>
          <IconButton label="Search" icon={<Search size={20} aria-hidden="true" />} />
          <IconButton label="Settings" variant="secondary" icon={<Settings size={20} aria-hidden="true" />} />
          <IconButton label="Notifications" variant="primary" icon={<Bell size={20} aria-hidden="true" />} />
        </div>
      </Section>

      <Section title="Badges, chips, provenance">
        <div className="ui-row">
          <Badge>Neutral</Badge>
          <Badge tone="primary">To discuss</Badge>
          <Badge tone="info" icon>
            Info
          </Badge>
          <Badge tone="caution" icon>
            Worth asking about
          </Badge>
          <Badge tone="attention" icon>
            Recorded 3 times
          </Badge>
          <Badge tone="success" icon>
            Discussed
          </Badge>
        </div>
        <div className="ui-row">
          <Chip pressed={chips.dizzy} onPressedChange={(v) => setChips((c) => ({ ...c, dizzy: v }))} count={8}>
            Dizziness
          </Chip>
          <Chip
            pressed={chips.falls}
            onPressedChange={(v) => setChips((c) => ({ ...c, falls: v }))}
            icon={<Filter size={16} aria-hidden="true" />}
          >
            Falls only
          </Chip>
        </div>
        <div className="ui-row">
          <SourceCitation source={BEERS} />
          <SourceCitation source={ACB} />
          <EvidenceLink count={14} />
          <AIBadge model="Qwen2.5-3B" ms={4210} />
          <DemoDataChip align="start" />
        </div>
        <p>
          Lorazepam is listed in the <SourceCitation source={BEERS} variant="inline" /> as a medicine older adults should
          generally avoid.
        </p>
      </Section>

      <Section title="Cards + stats">
        <Card>
          <CardHeader
            eyebrow="Medication review"
            title="Lorazepam (Ativan)"
            subtitle="Started Sep 25 · Urgent care"
            icon={<Pill size={20} />}
            actions={<Badge tone="caution" icon>Worth asking about</Badge>}
            level={4}
          />
          <CardBody>
            <p>
              Benzodiazepines are listed as medicines older adults should generally avoid because they can add to
              drowsiness, confusion and falls.
            </p>
          </CardBody>
          <CardFooter>
            <SourceCitation source={BEERS} />
            <EvidenceLink count={9} />
          </CardFooter>
        </Card>
        <div className="gal-grid">
          <Stat
            label="Dizziness recorded"
            value="9"
            unit="of 14 answered days"
            detail="since lorazepam started on Sep 25"
            trend={{ direction: "up", text: "from 2 of 19 before", tone: "attention" }}
            onShowRecords={() => setDrawer(true)}
            recordCount={9}
          />
          <Stat label="Diary coverage" value="38" unit="of 45 days" detail="7 days without a check-in" tone="tint" />
        </div>
        <Card tone="tint">
          <CardHeader title="Tint card" subtitle="For calm emphasis" level={4} />
        </Card>
        <Card tone="primary">
          <CardHeader eyebrow="Next visit" title="Dr. Lee · Oct 21" subtitle="Brief ready to review" level={4} />
        </Card>
      </Section>

      <Section title="Meter + progress">
        <Meter
          label="Anticholinergic burden (ACB)"
          value={7}
          max={9}
          bands={ACB_BANDS}
          description={`Diphenhydramine 3 + oxybutynin 3 + furosemide 1. ${ACB_THRESHOLD_NOTE}`}
        />
        <Meter label="ACB example (total 1)" value={1} max={9} bands={ACB_BANDS} description={ACB_THRESHOLD_NOTE} />
        <ProgressBar label="Downloading on-device model" value={0.42} detail="812 MB of 1.9 GB · stays on this device" />
        <ProgressBar label="Preparing" value={null} />
      </Section>

      <Section title="Fields">
        <TextInput label="Medicine name" hint="Brand or generic, e.g. Ativan or lorazepam" placeholder="Start typing…" />
        <TextInput label="Dose" error="Enter a dose, e.g. 0.5 mg" defaultValue="" />
        <TextArea label="In your own words" optional showCount maxLength={2000} value={story} onChange={(e) => setStory(e.target.value)} />
        <Select
          label="Period"
          defaultValue="30"
          options={[
            { value: "14", label: "Last 14 days" },
            { value: "30", label: "Last 30 days" },
            { value: "90", label: "Last 90 days" },
          ]}
        />
      </Section>

      <Section title="Segmented (radio group)">
        <Segmented
          label="Did you feel dizzy today?"
          value={dizzy}
          onChange={setDizzy}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unsure", label: "Not sure" },
          ]}
        />
        <Segmented
          label="How was your energy?"
          hint="Patient size: 56px+ tap cards"
          size="lg"
          value={energy}
          onChange={setEnergy}
          options={[
            { value: 1, label: "1", description: "Very tired" },
            { value: 2, label: "2", description: "Tired" },
            { value: 3, label: "3", description: "Okay" },
            { value: 4, label: "4", description: "Good" },
            { value: 5, label: "5", description: "Great" },
          ]}
        />
      </Section>

      <Section title="Tabs">
        <Tabs
          idBase={`gal-${theme}-tabs`}
          label="Review sections"
          value={tab}
          onChange={setTab}
          items={[
            { id: "findings", label: "Findings", badge: 7 },
            { id: "signals", label: "Signals", badge: 3 },
            { id: "notes", label: "Notes" },
          ]}
        />
        <TabPanel idBase={`gal-${theme}-tabs`} id="findings" value={tab}>
          <p>Findings panel content.</p>
        </TabPanel>
        <TabPanel idBase={`gal-${theme}-tabs`} id="signals" value={tab}>
          <p>Signals panel content.</p>
        </TabPanel>
        <TabPanel idBase={`gal-${theme}-tabs`} id="notes" value={tab}>
          <p>Notes panel content.</p>
        </TabPanel>
        <Tabs
          idBase={`gal-${theme}-pill`}
          label="Period"
          variant="pill"
          withPanels={false}
          value={pill}
          onChange={setPill}
          items={[
            { id: "7", label: "7 days" },
            { id: "14", label: "14 days" },
            { id: "30", label: "30 days" },
          ]}
        />
      </Section>

      <Section title="Callouts + disclosure">
        <Callout tone="info" title="How this was calculated">
          Rates use answered days only. A day without a check-in is not counted as “no”.
        </Callout>
        <Callout tone="caution" title="Worth asking about">
          Three medicines on the list add to anticholinergic burden.
        </Callout>
        <Callout tone="success" title="Brief reviewed">
          You reviewed every sentence on Oct 10.
        </Callout>
        <Callout tone="attention" title="Could not save">
          The change would leave the record incomplete.
        </Callout>
        <Disclosure summary="Show the statistics">
          <p>Fisher’s exact test, two-sided: p = 0.0023 (9/14 vs 2/19).</p>
        </Disclosure>
        <Disclosure variant="card" summary="Why is diphenhydramine on this list?" defaultOpen>
          <p>It is the sleep ingredient in Tylenol PM, a first-generation antihistamine with strong anticholinergic effects.</p>
        </Disclosure>
      </Section>

      <Section title="Timeline kit">
        <TimelineLegend items={METRICS.map((m) => ({ label: m.label, metric: m.key }))} />
        <div className="ui-row">
          {METRICS.map((m) => (
            <TimelineDot key={m.key} metric={m.key} size={16} />
          ))}
          <TimelineDot color="var(--chart-missing)" shape="square" size={16} label="No check-in" />
        </div>
        <div className="ui-row">
          <MedEventMarker label="Lorazepam started · Sep 25" />
          <MedEventMarker kind="stopped" label="Omeprazole stopped · Oct 1" />
        </div>
      </Section>

      <Section title="Overlays">
        <div className="ui-row">
          <Button onClick={() => setModal(true)}>Open modal</Button>
          <Button onClick={() => setDrawer(true)}>Open evidence drawer</Button>
          <Button onClick={() => toast.show({ title: "Check-in saved", description: "Thursday, Oct 8", tone: "success" })}>
            Show toast
          </Button>
          <Button
            onClick={() =>
              toast.show({
                title: "Couldn’t export",
                description: "Try again.",
                tone: "attention",
                action: { label: "Retry", onClick: () => undefined },
              })
            }
          >
            Error toast
          </Button>
          <Button variant="danger-quiet" onClick={() => setHelp(true)}>
            Need help now?
          </Button>
          <Tooltip content="Tooltips open on hover, focus or tap and close with Esc.">
            <span className="gal-tooltip-trigger">Hover me</span>
          </Tooltip>
        </div>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Add a visit question"
          description="It will appear in “Our questions” on the visit brief."
          footer={
            <>
              <Button onClick={() => setModal(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setModal(false)}>
                Add question
              </Button>
            </>
          }
        >
          <TextArea label="Question" defaultValue="Could the new sleeping pill be adding to her dizziness?" />
        </Modal>
        <Drawer open={drawer} onClose={() => setDrawer(false)} eyebrow="Evidence" title="Dizziness · 9 of 14 answered days" description="Since lorazepam started on Sep 25">
          <ul className="gal-evidence" role="list">
            {["Oct 9", "Oct 8", "Oct 7", "Oct 6", "Oct 5", "Oct 2", "Sep 30", "Sep 27", "Sep 26"].map((d) => (
              <li key={d}>
                <TimelineDot metric="dizziness" />
                <span className="ui-num">{d}</span>
                <span className="ui-quote">“a bit woozy this morning”</span>
              </li>
            ))}
          </ul>
        </Drawer>
        <HelpDialog open={help} onClose={() => setHelp(false)} />
      </Section>

      <Section title="Empty, loading, page header">
        <Card padding="none">
          <EmptyState
            level={3}
            icon={<Download size={24} />}
            title="No briefs yet"
            action={<Button variant="primary">Prepare a visit brief</Button>}
          >
            A brief collects what you’ve noticed and your questions on one page.
          </EmptyState>
        </Card>
        <Skeleton lines={3} />
        <Card>
          <PageHeader
            eyebrow="Margaret · last 30 days"
            title="Medication review"
            subtitle="Questions worth asking, each backed by a published source."
            actions={<Button variant="primary">Prepare brief</Button>}
          />
        </Card>
        <div className="ui-row">
          <Avatar name="Margaret Rivera" />
          <Avatar name="Alex Rivera" size="lg" />
        </div>
      </Section>

      <Section title="Table + description list">
        <div className="ui-table-wrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">Medicine</th>
                <th scope="col">Dose</th>
                <th scope="col">Started</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Lorazepam (Ativan)</td>
                <td>0.5 mg at bedtime</td>
                <td>Sep 25</td>
              </tr>
              <tr>
                <td>Furosemide (Lasix)</td>
                <td>20 mg once daily</td>
                <td>Jul 8</td>
              </tr>
            </tbody>
          </table>
        </div>
        <dl className="ui-dl">
          <dt>Prescriber</dt>
          <dd>Urgent care</dd>
          <dt>Reason</dt>
          <dd>Anxiety / sleep</dd>
        </dl>
      </Section>
    </div>
  );
}

/** The /dev/ui page. */
export function Gallery() {
  return (
    <div className="gal">
      <PageHeader
        eyebrow="Developer"
        title="Kinwise design system"
        subtitle="Every shared component in both themes. Tokens live in src/ui/tokens.css; contrast is tested in tokens.test.ts."
      />
      <div className="gal-themes">
        <ThemePanel theme="light" />
        <ThemePanel theme="dark" />
      </div>
    </div>
  );
}
