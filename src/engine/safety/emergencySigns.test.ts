// The emergency-sign check that decides whether the patient check-in shows the static 911 line. It only decides
// whether the fixed line appears; it never changes what the line says. A missed emergency is worse than a false
// alarm, so the positives are broad and only plain negated or clearly past mentions stay quiet.
import { describe, expect, it } from "vitest";
import { EMERGENCY_LINE } from "../brief/safetyNet";
import { EMERGENCY_SIGNS, EMERGENCY_SIGN_RULES, describesEmergencySign, findEmergencySigns } from "./emergencySigns";

describe("EMERGENCY_SIGNS", () => {
  it("is the same static sentence the brief and the Help dialog print (one constant, not a new list)", () => {
    expect(EMERGENCY_SIGNS).toBe(EMERGENCY_LINE);
  });

  it("has a named rule for each sign the sentence lists (sudden confusion, a fall with a head injury, trouble breathing)", () => {
    const names = EMERGENCY_SIGN_RULES.map((r) => r.name);
    expect(names).toContain("trouble breathing");
    expect(names).toContain("sudden confusion");
    expect(names).toContain("a knock to the head");
  });
});

describe("describesEmergencySign: shows the line", () => {
  it("the judge's note: chest pain, a numb left arm and can't catch my breath", () => {
    const signs = findEmergencySigns("I had chest pain and my left arm is numb and I can't catch my breath");
    expect(signs).toEqual(expect.arrayContaining(["chest pain or pressure", "weakness or numbness on one side", "trouble breathing"]));
  });

  it.each([
    // trouble breathing
    "I can't breathe properly",
    "Couldn’t catch my breath walking to the mailbox",
    "Struggling to breathe tonight",
    "having trouble breathing",
    "I was gasping for air",
    // chest pain or pressure
    "There's a pressure in my chest",
    "My chest feels tight and heavy",
    "Pain in my chest after breakfast",
    "I think I'm having a heart attack",
    // one side / stroke signs
    "Numbness in my left arm since lunch",
    "My right leg went weak",
    "Weak down one side",
    "The right side of my face is drooping",
    "My mouth is drooping",
    "I was slurring my words",
    "I had trouble speaking this afternoon",
    "I think I'm having a stroke",
    // sudden confusion
    "I suddenly got very confused",
    "All of a sudden I didn't know where I was",
    // unrousable, fainting, collapse
    "Alex couldn't wake me this morning",
    "I couldn't wake him",
    "I fainted in the bathroom",
    "Passed out in the kitchen",
    "I blacked out for a minute",
    // a fall with a head injury
    "I fell and hit my head on the table",
    "Banged my head when I slipped",
    // other signs on the app's emergency list (qa.ts)
    "I had a seizure",
    "My lips went blue",
    "I was coughing up blood",
  ])("%s", (text) => {
    expect(describesEmergencySign(text)).toBe(true);
  });

  // A past mention plus a sign of it now: the history marker no longer quiets it.
  it.each([
    "Chest pain last year, and it's back today",
    "Had chest pain last year. It came back this morning",
    "Chest pain again today, like two years ago",
    "No chest pain but I can't catch my breath",
    "No chest pain and my left arm went numb",
    "I'm not sure but I think I had chest pain",
    "Not sure if it was chest pain",
    // A "not" that belongs to another statement in the same sentence does not reach the sign.
    "I didn't sleep because I couldn't catch my breath",
    "Didn't go out today as there was pressure in my chest",
    "I did not want to worry Alex but my face is drooping",
    "Never felt anything like it in my whole life, my chest is tight",
    "Did not feel like doing much at all today with this chest pain",
  ])("still shows it: %s", (text) => {
    expect(describesEmergencySign(text)).toBe(true);
  });
});

// Review probes: sentences that describe a sign happening now, where a "not", "never", "without" or a past-time
// word sits nearby but does not apply to the sign. Each one returned no line before the negation-scope, novelty and
// comparison rules were added. A missed emergency is worse than a false alarm.
describe("describesEmergencySign: must show (negation or history does not apply)", () => {
  it.each([
    // The negator belongs to another verb ("didn't help", "doesn't touch", "didn't sleep", "don't like").
    "Nitro didn't help the chest pain",
    "Nitro not helping my chest pain",
    "My pills are not helping the chest pain",
    "Tylenol doesn't touch the chest pain",
    "Didn't sleep with this chest pain",
    "Didn't sleep with the chest pain all night",
    "Not sleeping well with the chest pain",
    "I don't like this chest pain",
    "Didn't call anyone about my chest pain",
    "Didn't feel great today with chest tightness",
    "The inhaler is not helping my trouble breathing",
    // "just" / "only" reopen the sign after a negated word.
    "No headache just chest pain",
    "No headache, only chest pain",
    // NOVELTY: "never ... like this / this bad / before" says it is happening now and is new.
    "Never had chest pain like this before",
    "Never felt chest pressure this bad",
    "I've never felt chest pressure this bad",
    "I haven't had chest pain like this before",
    "Never had chest pain before today",
    // "without" after a verb: "can't walk without X" means X happens.
    "Can't walk to the mailbox without chest pain",
    "Can't lie down without gasping",
    // COMPARISON: a past event named only to compare with today's.
    "Chest pain like my heart attack in 2019",
    "Same chest pain as last year",
    "Chest pain worse than last year",
    // A fall is not a past deficit: new one-sided weakness after a fall shows the line.
    "Left leg weak since my fall",
    "Since the fall yesterday my left arm is weak",
  ])("%s", (text) => {
    expect(describesEmergencySign(text)).toBe(true);
  });
});

// Review probes: common first-person wordings of the listed signs that the rules did not match.
describe("describesEmergencySign: must show (wording of the listed signs)", () => {
  it.each([
    // trouble breathing
    "I can barely breathe",
    "I can hardly breathe",
    "Barely able to breathe",
    "The inhaler is not helping, I can barely breathe",
    "Could scarcely get enough air",
    "Couldn't get any air",
    // chest pain or pressure
    "Chest discomfort and sweating",
    "Discomfort in my chest since lunch",
    // one side
    "Left side of my face feels numb",
    "Left side of my face is numb",
    // trouble speaking
    "My husband said my words were jumbled",
    // not waking
    "Nobody could wake me",
    "No one could rouse her this morning",
    // throat swelling or closing (qa.ts "anaphyla\\w*", "throat (?:is )?(?:swelling|closing)")
    "My throat is closing up",
    "my throat is swelling",
    "Throat feels tight after the new pill",
    "My tongue is swelling",
    "My lips are swollen",
    "I think it's anaphylaxis",
  ])("%s", (text) => {
    expect(describesEmergencySign(text)).toBe(true);
  });

  it("names the throat rule", () => {
    expect(findEmergencySigns("My throat is closing up")).toEqual(["throat swelling or closing"]);
  });
});

// Second review round: missed emergencies the reviewers probed. Each returned no line before these rules were added.
describe("describesEmergencySign: must show (second review round)", () => {
  it.each([
    // trouble breathing: bare "not able to", everyday wordings, too breathless to finish a sentence
    "Not able to breathe properly",
    "Not able to catch my breath",
    "Breathing is hard",
    "Breathing is really hard today",
    "it's hard to catch my breath",
    "I'm so short of breath I can't finish a sentence",
    // chest pain or pressure: spreading from the chest, heavy or crushing sensations
    "Pain spreading from my chest to my left arm",
    "Pain going down my left arm from my chest",
    "Crushing feeling in my chest",
    "Heavy feeling in my chest and sweating",
    "My chest is killing me",
    "My chest feels like an elephant is sitting on it",
    "Something heavy on my chest",
    // a knock to the head: part of the head, present tense, a bleeding head
    "Took a tumble and hit the back of my head",
    "Hit the side of my head when I fell",
    "I fell and my head is bleeding",
    "I wouldn't call it a fall, more of a stumble, but I did bang my head.",
    // ONSET_AFTER_NEGATION: the "no" covers only the time before
    "No chest pain until this evening",
    "No chest pain yesterday but today it is bad",
    "No chest pain this morning but now it hurts a lot",
    "Haven't had any chest pain until today",
    "No chest pain until this morning",
    "Never had chest pain till today",
    "Didn't have chest pain until lunch",
    // SINCE_ONGOING: chest pain since a heart attack is ongoing, not past
    "Chest pain since my heart attack last week",
    "Since my heart attack I've had chest pain",
    "I've had chest pain ever since my heart attack 3 days ago",
    "Since my heart attack I've had chest pain every day this week",
    // RETURN: a plural return
    "My stroke symptoms are back",
    "My heart attack symptoms are back",
    // throat swelling or closing, with words between
    "Throat feels like it's closing",
    "I'm worried the new pill is making my throat swell up",
    // stroke wordings: a crooked face, word-finding trouble, one limb, sudden numbness or weakness
    "My smile is crooked",
    "My mouth is crooked",
    "half my face won't move",
    "Can't find my words",
    "Suddenly couldn't find my words",
    "I couldn't find my words this afternoon",
    "I can't move my arm",
    "My arm went numb and weak suddenly",
    "Alex said I wasn't making sense all of a sudden",
  ])("%s", (text) => {
    expect(describesEmergencySign(text)).toBe(true);
  });

  it.each([
    "Haven't had any chest pain",
    "No chest pain today",
    "Chest pain last year, none today",
    "No chest pain this morning, fine now",
    "Short of breath walking up stairs as usual",
    "Doing my breathing exercises",
    "Couldn't find my words for the crossword",
    "I couldn't find the words to thank her",
    "My throat is not swollen",
    "My back is killing me",
    "Suddenly remembered the numbers",
  ])("stays quiet: %s", (text) => {
    expect(describesEmergencySign(text)).toBe(false);
  });
});

// Known false alarms, accepted on purpose: a missed emergency is worse than a false alarm. Pinned here so that any
// later change to them is a deliberate choice, not drift. The line itself stays static; it only appears.
describe("describesEmergencySign: known false alarms (accepted: a missed emergency is worse)", () => {
  it.each([
    "Watched a movie about a heart attack",
    "Worried about having a stroke someday",
    "Doctor checked for stroke symptoms, all clear",
    "Not a single bit of chest pain",
    "Woke up without chest pain",
    "Rash on the left side of my face",
    "Not much chest pain",
    "Not even a little chest pain",
  ])("%s", (text) => {
    expect(describesEmergencySign(text)).toBe(true);
  });
});

describe("describesEmergencySign: must stay quiet (review list)", () => {
  it.each([
    "No chest pain today, slept well.",
    "Chest pain last year, none today",
    "No chest pain or trouble breathing",
    "I didn't have any chest pain",
    "I haven't had any problems with chest pain",
    "Haven't had chest pain since I started the new pill",
    "Breathing fine, no chest pressure",
    "No numbness in my left arm",
    "I did not faint",
    "Never passed out",
    "My stroke in 2019 left me tired",
    "Nose blocked, can't breathe through my nose",
    "I can barely breathe through my nose with this cold",
    "Took my seizure medicine",
    "Felt faint when I stood up",
    "Couldn't wake up this morning, so tired",
    "Sore throat from the cold",
    "My throat is sore",
    "No throat swelling",
    // A later sign word that names the past event the negated sign is measured from.
    "No chest pain since my heart attack",
    "Never really had chest pain",
  ])("%s", (text) => {
    expect(describesEmergencySign(text)).toBe(false);
  });
});

describe("describesEmergencySign: stays quiet", () => {
  it.each([
    // plain negated mentions
    "No chest pain today",
    "no chest pain or trouble breathing",
    "I didn't have any chest pain",
    "Haven't fainted since the new tablets",
    "Never passed out",
    "Neither chest pain nor trouble breathing",
    "No chest pain, no trouble breathing, no falls",
    // history, with nothing that says it is happening now
    "Chest pain last year, none today",
    "I had a stroke in 2019",
    "My left arm has been weak since my stroke",
    "I fainted once as a child",
    "Chest pain a few years ago but fine today",
    // everyday words that only share a word with a sign
    "A bit short of breath on the stairs",
    "Couldn't wake up this morning, so tired",
    "A bit confused this afternoon",
    "I can't breathe through my nose with this cold",
    "My eyes were drooping after lunch",
    "Felt a bit faint getting up",
    "I couldn't talk to Alex today",
    "I don't know where I put my glasses",
    "Took my seizure medicine on time",
    "My back hurts",
    "Slept badly, no falls",
  ])("%s", (text) => {
    expect(describesEmergencySign(text)).toBe(false);
  });

  it("is false for an empty note", () => {
    expect(describesEmergencySign("")).toBe(false);
    expect(describesEmergencySign("   ")).toBe(false);
  });
});
