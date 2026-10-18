// The words the caregiver screens use for the person being cared for (Overview, Medications, Review, Visit brief).
//
// With a name: "Margaret", "Margaret’s", "Margaret takes". After "Delete everything" the names are empty strings
// (store.ts emptyRecord deliberately stores no placeholder), so each screen needs a grammatical fallback:
//   name       "your family member"      mid-sentence ("When your family member saves …")
//   Name       "Your family member"      only at the start of a sentence or label
//   possessive "their"                   mid-sentence ("From their check-ins and …"); a pronoun reads better than
//                                        repeating "your family member’s" in every subtitle
//   Possessive "Your family member’s"    sentence start ("Your family member’s last 30 days at a glance"); a bare
//                                        "Their" would open a page with a pronoun that refers to nothing
//   takes      "they take"               verb agrees with the pronoun (never "They takes")
//   their      her / his / their         from the recorded sex, so "saves her first check-in" is only said of a woman
// `hasName` lets a screen leave out a name-only prefix (an eyebrow such as "Margaret · medicines").
import type { PatientProfile } from "../../model/types";

export interface PersonWords {
  hasName: boolean;
  name: string;
  Name: string;
  possessive: string;
  Possessive: string;
  takes: string;
  their: string;
}

export function personWords(profile: Pick<PatientProfile, "preferredName" | "displayName" | "sex">): PersonWords {
  const name = profile.preferredName?.trim() || profile.displayName?.trim() || "";
  const their = profile.sex === "female" ? "her" : profile.sex === "male" ? "his" : "their";
  if (!name) {
    return {
      hasName: false,
      name: "your family member",
      Name: "Your family member",
      possessive: "their",
      Possessive: "Your family member’s",
      takes: "they take",
      their,
    };
  }
  return { hasName: true, name, Name: name, possessive: `${name}’s`, Possessive: `${name}’s`, takes: `${name} takes`, their };
}
