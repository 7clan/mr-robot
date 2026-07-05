/**
 * Stemmer - Built from scratch (Porter-like algorithm)
 * Reduces words to their root form so "running", "runs", "ran" all map to "run".
 * This is a simplified Porter stemmer implementation - no external libs.
 */

export function stem(word: string): string {
  if (!word || word.length < 3) return word;
  let w = word.toLowerCase();

  // Step 1a - plurals & past tense
  if (w.endsWith("sses")) w = w.slice(0, -2);
  else if (w.endsWith("ies")) w = w.slice(0, -2);
  else if (w.endsWith("ss")) w = w; // no change
  else if (w.endsWith("s")) w = w.slice(0, -1);

  // Step 1b - past participle
  if (w.endsWith("eed")) {
    const stem = w.slice(0, -3);
    if (measure(stem) > 0) w = stem + "ee";
  } else if (w.endsWith("ed")) {
    const stem = w.slice(0, -2);
    if (containsVowel(stem)) w = stem;
  } else if (w.endsWith("ing")) {
    const stem = w.slice(0, -3);
    if (containsVowel(stem)) w = stem;
  }

  // Step 1c - y -> i
  if (w.endsWith("y") && containsVowel(w.slice(0, -1))) {
    w = w.slice(0, -1) + "i";
  }

  // Step 2 - common suffixes
  const step2: [string, string][] = [
    ["ational", "ate"], ["tional", "tion"], ["enci", "ence"],
    ["anci", "ance"], ["izer", "ize"], ["abli", "able"],
    ["alli", "al"], ["entli", "ent"], ["eli", "e"],
    ["ousli", "ous"], ["ization", "ize"], ["ation", "ate"],
    ["ator", "ate"], ["alism", "al"], ["iveness", "ive"],
    ["fulness", "ful"], ["ousness", "ous"], ["aliti", "al"],
    ["iviti", "ive"], ["biliti", "ble"],
  ];
  for (const [suffix, replacement] of step2) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (measure(stem) > 0) w = stem + replacement;
      break;
    }
  }

  // Step 3
  const step3: [string, string][] = [
    ["icate", "ic"], ["ative", ""], ["alize", "al"],
    ["iciti", "ic"], ["ical", "ic"], ["ful", ""], ["ness", ""],
  ];
  for (const [suffix, replacement] of step3) {
    if (w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length);
      if (measure(stem) > 0) w = stem + replacement;
      break;
    }
  }

  // Step 4 - remove common suffixes
  const step4 = [
    "al", "ance", "ence", "er", "ic", "able", "ible", "ant",
    "ement", "ment", "ent", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
  ];
  for (const suffix of step4) {
    if (w.endsWith(suffix) && suffix !== "ion") {
      const stem = w.slice(0, -suffix.length);
      if (measure(stem) > 1) {
        w = stem;
        break;
      }
    }
  }
  // Special: ion only if preceded by s or t
  if (w.endsWith("ion")) {
    const stem = w.slice(0, -3);
    if (measure(stem) > 1 && (stem.endsWith("s") || stem.endsWith("t"))) {
      w = stem;
    }
  }

  // Step 5a - remove trailing e
  if (w.endsWith("e")) {
    const stem = w.slice(0, -1);
    const m = measure(stem);
    if (m > 1 || (m === 1 && !cvc(stem))) w = stem;
  }

  return w;
}

function isVowel(c: string): boolean {
  return "aeiou".includes(c);
}

function containsVowel(s: string): boolean {
  return s.split("").some(isVowel);
}

// Count consonant sequences (Porter's measure)
function measure(stem: string): number {
  if (!stem) return 0;
  let m = 0;
  let prevIsVowel: boolean | null = null;
  for (const c of stem) {
    const v = isVowel(c);
    if (prevIsVowel === null) {
      // start
    } else if (prevIsVowel && !v) {
      m++;
    }
    prevIsVowel = v;
  }
  return m;
}

// Consonant-Vowel-Consonant check (last 3 chars)
function cvc(stem: string): boolean {
  if (stem.length < 3) return false;
  const last3 = stem.slice(-3);
  return (
    !isVowel(last3[0]) &&
    isVowel(last3[1]) &&
    !isVowel(last3[2]) &&
    !"wxy".includes(last3[2])
  );
}

export function stemAll(tokens: string[]): string[] {
  return tokens.map(stem);
}
