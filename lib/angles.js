// Question-angle taxonomy with deterministic rotation.
//
// WHY THIS EXISTS
// ---------------
// The previous design tried to prevent repetition with a negative constraint:
// "do NOT reuse these question angles: <verbatim text of prior questions>".
// That fails twice over. First, it was always empty, because memory never
// persisted. Second — and more importantly — even when populated it only
// blocks *lexical* repetition. A model handed "don't reuse this sentence"
// will happily generate a semantically identical question with new wording,
// which is exactly what happened: three of the four questions ever sent were
// the same calendar-vs-priorities audit in different clothes.
//
// The fix is structural, not exhortative. Each week we deterministically
// assign three angles from a fixed taxonomy and require one question per
// angle. The model cannot drift back to its favourite attractor because it is
// not being asked to choose. Rotation is a pure function of the week index,
// so it is inspectable and reproducible — you can run `nextAngles(n)` for any
// n and see exactly what is coming.

export const ANGLES = [
  {
    id: "revealed-vs-stated",
    label: "Revealed vs stated preference",
    brief:
      "Where observable behaviour contradicts a claimed priority. Note: the calendar audit is the most obvious version of this and has been used repeatedly — find a different instrument (money, attention, who gets your best hours, what you reread, what you postpone).",
  },
  {
    id: "opportunity-cost",
    label: "The cost of the yes",
    brief:
      "Every commitment forecloses others. What did a recent yes quietly cost — not in hours, but in the thing that never got started.",
  },
  {
    id: "winding-down",
    label: "Ending things well",
    brief:
      "Commitments held past their value, and the discomfort of leaving work visibly unfinished. What is being carried out of obligation, sunk cost, or fear of how the exit looks.",
  },
  {
    id: "collaboration",
    label: "Who you build with",
    brief:
      "Solitary work vs work with people who sharpen you. The quality of colleagues as an input to the quality of thinking.",
  },
  {
    id: "capacity",
    label: "The arithmetic of overcommitment",
    brief:
      "Honest accounting of what has been said yes to versus what can actually be delivered. Dependencies on other people's availability.",
  },
  {
    id: "systems-vs-heroics",
    label: "Systems vs heroics",
    brief:
      "The boring infrastructure done reactively and just-in-time, versus the ambitious thing that gets all the attention. What breaks when you are unavailable.",
  },
  {
    id: "identity",
    label: "Identity without the role",
    brief:
      "Who you are when the title, the org, or the project is removed. What you would still do.",
  },
  {
    id: "legibility",
    label: "Illegible work",
    brief:
      "Work that matters but is hard to describe at a dinner party. The tension between doing valuable things and being able to explain them.",
  },
  {
    id: "audience",
    label: "Whose approval",
    brief:
      "The specific person or imagined audience whose judgment is being optimised for, often unconsciously.",
  },
  {
    id: "energy",
    label: "Restoration and depletion",
    brief:
      "What reliably restores versus what reliably drains, and how much of the week is spent on each. Avoid wellness-speak.",
  },
  {
    id: "counterfactual",
    label: "The unlived path",
    brief:
      "A road not taken, examined analytically rather than nostalgically. What information the road-not-taken actually contains.",
  },
  {
    id: "failure-appetite",
    label: "If failure were cheap",
    brief:
      "What would be attempted if the downside were survivable, and what that reveals about how the downside is currently being estimated.",
  },
  {
    id: "finite-overlap",
    label: "Finite time with people",
    brief:
      "The countable, shrinking number of remaining occasions with specific people — children at a given age, ageing parents, friends in other cities. Unsentimental arithmetic.",
  },
  {
    id: "craft",
    label: "Depth vs breadth",
    brief:
      "Mastery of one thing against optionality across many. What a portfolio approach costs in craft.",
  },
  {
    id: "institution",
    label: "Independent vs inside",
    brief:
      "Building alone versus building within an institution that outlives you. What each makes possible and forecloses.",
  },
  {
    id: "avoided-conversation",
    label: "The conversation not being had",
    brief:
      "A specific unspoken thing with a partner, colleague, client, or self. What the avoidance is protecting.",
  },
  {
    id: "tempo",
    label: "Urgent vs important, in practice",
    brief:
      "Not the framework — the actual observed behaviour this week when the two conflicted.",
  },
  {
    id: "succession",
    label: "What continues without you",
    brief:
      "Which of the current efforts would survive your removal, and whether that is a feature or a warning.",
  },
  {
    id: "money-proxy",
    label: "Money as a distorting proxy",
    brief:
      "Where a financial frame has quietly been substituted for a non-financial goal, or where the reverse is being used as an excuse.",
  },
  {
    id: "enough",
    label: "Defining enough",
    brief:
      "The threshold beyond which more of something stops helping — and whether that threshold has ever been named out loud.",
  },
];

// Stride is coprime with ANGLES.length so consecutive weeks walk the whole
// taxonomy before any angle recurs, and the triples that co-occur change from
// cycle to cycle rather than always pairing the same neighbours.
const STRIDE = 7;
const PER_WEEK = 3;

/**
 * Angles for a given zero-indexed week. Pure and deterministic.
 * @param {number} weekIndex
 * @returns {Array<{id:string,label:string,brief:string}>}
 */
export function anglesForWeek(weekIndex) {
  const n = ANGLES.length;
  const out = [];
  for (let i = 0; i < PER_WEEK; i++) {
    const slot = weekIndex * PER_WEEK + i;
    out.push(ANGLES[(slot * STRIDE) % n]);
  }
  return out;
}

/**
 * How many weeks until an angle recurs, given the current index. Used by
 * /api/status so the rotation is auditable rather than a black box.
 */
export function upcomingSchedule(weekIndex, weeks = 4) {
  return Array.from({ length: weeks }, (_, i) => ({
    week: weekIndex + i,
    angles: anglesForWeek(weekIndex + i).map((a) => a.id),
  }));
}
