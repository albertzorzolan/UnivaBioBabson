// My medicines (/p/meds) — Margaret's list in large, read-only cards, each with "things to mention to your
// doctor if you notice them" from the knowledge base: "what to watch for" lists for high-harm classes (blood
// thinners, insulin, sulfonylureas…) plus recognised effects that match her diary questions (see medInfo.ts).
// Information only: no flags, scores or review findings here (the caregiver view has those).
import { useMemo } from "react";
import { CalendarDays, ClipboardList, Pill, ShieldCheck, Stethoscope, Store, Sun } from "lucide-react";
import { daysBetween, formatLong, parseDate } from "../../model/dates";
import { useStore } from "../../app/StoreProvider";
import { useDerived } from "../../app/useDerived";
import { href } from "../../app/router";
import { describeMed, joinWords, type MedInfo } from "./medInfo";
import { Badge, ButtonLink, Disclosure, EmptyState, PageHeader, SourceCitation } from "../../ui";
import "./patient.css";

/** "16 days", "5 weeks", "4 months", "2 years" — how long she has been taking it. */
export function durationWords(start: string, today: string): string {
  const n = daysBetween(start, today);
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
  if (n <= 0) return "today";
  if (n < 14) return plural(n, "day");
  if (n < 60) return plural(Math.round(n / 7), "week");
  if (n < 365) return plural(Math.min(11, Math.round(n / 30.44)), "month");
  return plural(Math.round(n / 365.25), "year");
}

function MedCard({ info, today }: { info: MedInfo; today: string }) {
  const { med } = info;
  const schedule = [med.dose, med.frequency].filter((s) => s && s.trim()).join(" · ");
  const startText = parseDate(med.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const started =
    med.startDate <= today ? (
      <>
        {startText} <span className="pt-med__since">· {durationWords(med.startDate, today)}</span>
      </>
    ) : (
      `Starts ${startText}`
    );
  return (
    <li className="pt-med">
      <div className="pt-med__head">
        <span className="pt-med__icon" aria-hidden="true">
          <Pill size={26} />
        </span>
        <div className="pt-med__names">
          <h2 className="pt-med__name">{med.name}</h2>
          {info.generic && <p className="pt-med__generic">{info.generic}</p>}
        </div>
      </div>
      {(med.otc || med.asNeeded) && (
        <div className="pt-med__badges">
          {med.otc && (
            <Badge tone="neutral" icon={<Store size={14} aria-hidden="true" />}>
              Bought without a prescription
            </Badge>
          )}
          {med.asNeeded && <Badge tone="neutral">Only when needed</Badge>}
        </div>
      )}

      {schedule && <p className="pt-med__schedule">{schedule}</p>}

      <dl className="pt-med__facts">
        {med.reason && (
          <div>
            <dt>
              <ClipboardList size={18} aria-hidden="true" /> What it’s for
            </dt>
            <dd>{med.reason}</dd>
          </div>
        )}
        {med.prescriber && (
          <div>
            <dt>
              <Stethoscope size={18} aria-hidden="true" /> Prescribed by
            </dt>
            <dd>{med.prescriber}</dd>
          </div>
        )}
        <div>
          <dt>
            <CalendarDays size={18} aria-hidden="true" /> Started
          </dt>
          <dd>{started}</dd>
        </div>
      </dl>

      {info.phrases.length > 0 ? (
        <div className="pt-med__mention">
          <p className="pt-med__mention-title">Mention to your doctor if you notice</p>
          <p className="pt-med__mention-text">{joinWords(info.phrases)}.</p>
          <p className="pt-med__source">
            {info.usedFor && <span>Commonly used for {info.usedFor.replace(/\.$/, "").toLowerCase()}. </span>}
            {info.sources.length > 0 ? (
              <>
                {info.sources.length === 1 ? "Source: " : "Sources: "}
                {info.sources.map((src, i) => (
                  <span key={src.id}>
                    {i > 0 && "; "}
                    <SourceCitation source={src} variant="inline" />
                  </span>
                ))}
              </>
            ) : (
              <span>From Kinwise’s reference list.</span>
            )}
          </p>
        </div>
      ) : info.known ? (
        <p className="pt-med__note">Your pharmacist can tell you what to look out for with this medicine.</p>
      ) : (
        <p className="pt-med__note">
          Kinwise doesn’t have reference information for this medicine. That doesn’t say anything about it — your pharmacist can tell
          you what to look out for.
        </p>
      )}
    </li>
  );
}

export function MyMedicines() {
  const { data, today } = useStore();
  const { active } = useDerived();
  const current = useMemo(() => active.map((m) => describeMed(m)).sort((a, b) => a.med.name.localeCompare(b.med.name)), [active]);
  const stopped = useMemo(
    () => data.medications.filter((m) => !active.some((a) => a.id === m.id)).map((m) => describeMed(m)),
    [data.medications, active],
  );
  const caregiver = data.profile.caregiverName || "your family";

  return (
    <div className="pt-meds">
      <PageHeader
        eyebrow="My medicines"
        title="Your medicines"
        subtitle={
          current.length > 0
            ? `${current.length} ${current.length === 1 ? "medicine" : "medicines"} on the list ${caregiver} keeps with you.`
            : `The list ${caregiver} keeps with you.`
        }
        className="pt-page-header"
      />
      <div className="pt-meds__flow">
        <p className="pt-meds__intro">
          <ShieldCheck size={22} aria-hidden="true" />
          <span>Don’t stop or change a medicine without talking to the person who prescribed it.</span>
        </p>

        {current.length === 0 ? (
          <section className="pt-panel">
            <EmptyState icon={<Pill size={28} />} title="No medicines on the list yet">
              {caregiver} can add your medicines in the family view. You can still do your daily check-in.
            </EmptyState>
            <div className="pt-meds__empty-action">
              <ButtonLink href={href("/p/today")} variant="secondary" size="lg" iconLeft={<Sun size={20} aria-hidden="true" />}>
                Go to today’s check-in
              </ButtonLink>
            </div>
          </section>
        ) : (
          <ul role="list" className="pt-med-list">
            {current.map((info) => (
              <MedCard key={info.med.id} info={info} today={today} />
            ))}
          </ul>
        )}

        {stopped.length > 0 && (
          <Disclosure variant="card" summary={`Medicines you’ve stopped (${stopped.length})`} className="pt-meds__stopped">
            <ul role="list" className="pt-stopped">
              {stopped.map(({ med }) => (
                <li key={med.id}>
                  <strong>{med.name}</strong>
                  {med.endDate && <span className="pt-stopped__when"> · stopped {formatLong(med.endDate)}</span>}
                </li>
              ))}
            </ul>
          </Disclosure>
        )}

        {current.length > 0 && (
          <div className="pt-meds__tell">
            <p className="pt-week__footnote">
              If you notice any of these, you can tell me in today’s check-in. {caregiver.charAt(0).toUpperCase() + caregiver.slice(1)} can see it next time they open Kinwise,
              and it can go into the summary for your next visit.
            </p>
            <ButtonLink href={href("/p/today")} variant="secondary" size="lg" iconLeft={<Sun size={20} aria-hidden="true" />}>
              Go to today’s check-in
            </ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}
