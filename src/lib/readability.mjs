// Rough Flesch-Kincaid grade for English text. A guide, not a rule.

export function stripMarkdown(md) {
  return md
    .replace(/^:::.*$/gm, '')
    .replace(/:(todo|data)\[[^\]]*\]/g, 'it')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`|]/g, ' ')
    .replace(/^\s*[-\d.]+\s+/gm, '')
    .replace(/\p{Extended_Pictographic}/gu, ' ');
}

export function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const s = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouy]{1,2}/g);
  return Math.max(1, s ? s.length : 1);
}

export function fleschKincaidGrade(text) {
  // List items and headings count as sentences: each line is its own idea.
  const sentences = text.split(/[.!?:;\n]+/).map((s) => s.trim()).filter((s) => /[a-z]/i.test(s));
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  if (!sentences.length || !words.length) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
}
