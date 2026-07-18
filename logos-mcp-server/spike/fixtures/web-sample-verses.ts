// Phase 3C verification spike — small WEB (World English Bible) test dataset.
//
// STATUS: Isolated spike fixture. NOT wired into src/, NOT used by index.ts,
// NOT part of the tsc build (this directory is outside tsconfig.json's
// "include": ["src/**/*"]). Exists only to support the spike tests under
// tests/spike/ and the findings documented in docs/18_Phase3C_Verifikations_Spike.md.
//
// ─── Source ──────────────────────────────────────────────────────────────
// Translation: World English Bible ("World English Bible Classic" edition)
// Source: https://ebible.org/eng-web/<BOOKCODE><CHAPTER>.htm
//   (e.g. https://ebible.org/eng-web/GEN01.htm, https://ebible.org/eng-web/PSA023.htm)
// Retrieved: 2026-07-19, via automated fetch of the above pages.
// License, as stated verbatim on every fetched page:
//   "The World English Bible is in the Public Domain. You may copy and
//   share it freely."
// (Cross-checked against https://ebible.org/eng-web/copyright.htm in
// docs/17_Phase3B_Korpus_Produktentscheidungen.md Abschnitt 5 — no
// restriction on the text itself, only a trademark on the name "World
// English Bible" if the text is altered. This fixture reproduces the text
// unaltered.)
//
// ─── Extraction method (important caveat, see docs/18 "Offene Risiken") ──
// Verses were retrieved through an AI-mediated web-fetch tool (prompted to
// extract literal, verbatim text), not through a raw HTML/USFM parser.
// Quote characters were normalized to plain ASCII ' and " for storage
// here. This is an acceptable extraction method for a small verification
// spike, but is NOT considered a reliable acquisition method for the
// production corpus in Phase C+ — see docs/18 for the explicit
// recommendation to re-acquire via a raw, non-AI-mediated download
// (e.g. USFM/text bulk download) before building the real corpus.
//
// Canonical book names match src/services/reference-parser.ts's
// BOOK_TO_LOGOS keys ("Genesis", "Psalms", "John", "Romans",
// "1 Corinthians", "Revelation") — single source of truth for book naming,
// per docs/17 Mindestanforderung "Deutsche und englische Buchnamen".

export interface SpikeVerse {
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

const TRANSLATION = "WEB";

export const WEB_SAMPLE_VERSES: SpikeVerse[] = [
  // ── Genesis 1:1-5 (chapter has 31 verses total per versification.ts; only 1-5 sampled) ──
  { translation: TRANSLATION, book: "Genesis", chapter: 1, verse: 1, text: "In the beginning, God created the heavens and the earth." },
  { translation: TRANSLATION, book: "Genesis", chapter: 1, verse: 2, text: "The earth was formless and empty. Darkness was on the surface of the deep and God's Spirit was hovering over the surface of the waters." },
  { translation: TRANSLATION, book: "Genesis", chapter: 1, verse: 3, text: "God said, 'Let there be light,' and there was light." },
  { translation: TRANSLATION, book: "Genesis", chapter: 1, verse: 4, text: "God saw the light, and saw that it was good. God divided the light from the darkness." },
  { translation: TRANSLATION, book: "Genesis", chapter: 1, verse: 5, text: "God called the light 'day', and the darkness he called 'night'. There was evening and there was morning, the first day." },

  // ── Psalm 1, complete (6 verses — matches versification.ts exactly) ──
  // No superscription/title on this page — content begins directly at verse 1.
  { translation: TRANSLATION, book: "Psalms", chapter: 1, verse: 1, text: "Blessed is the man who doesn't walk in the counsel of the wicked, nor stand on the path of sinners, nor sit in the seat of scoffers" },
  { translation: TRANSLATION, book: "Psalms", chapter: 1, verse: 2, text: "but his delight is in Yahweh's law. On his law he meditates day and night." },
  { translation: TRANSLATION, book: "Psalms", chapter: 1, verse: 3, text: "He will be like a tree planted by the streams of water, that produces its fruit in its season, whose leaf also does not wither. Whatever he does shall prosper." },
  { translation: TRANSLATION, book: "Psalms", chapter: 1, verse: 4, text: "The wicked are not so, but are like the chaff which the wind drives away." },
  { translation: TRANSLATION, book: "Psalms", chapter: 1, verse: 5, text: "Therefore the wicked shall not stand in the judgment, nor sinners in the congregation of the righteous." },
  { translation: TRANSLATION, book: "Psalms", chapter: 1, verse: 6, text: "For Yahweh knows the way of the righteous, but the way of the wicked shall perish." },

  // ── Psalm 23, complete (6 verses — matches versification.ts exactly) ──
  // Superscription "A Psalm by David" is rendered separately/unnumbered
  // before verse 1 — NOT stored here, consistent with English-tradition
  // versification already assumed by versification.ts.
  { translation: TRANSLATION, book: "Psalms", chapter: 23, verse: 1, text: "Yahweh is my shepherd; I shall lack nothing." },
  { translation: TRANSLATION, book: "Psalms", chapter: 23, verse: 2, text: "He makes me lie down in green pastures. He leads me beside still waters." },
  { translation: TRANSLATION, book: "Psalms", chapter: 23, verse: 3, text: "He restores my soul. He guides me in the paths of righteousness for his name's sake." },
  { translation: TRANSLATION, book: "Psalms", chapter: 23, verse: 4, text: "Even though I walk through the valley of the shadow of death, I will fear no evil, for you are with me. Your rod and your staff, they comfort me." },
  { translation: TRANSLATION, book: "Psalms", chapter: 23, verse: 5, text: "You prepare a table before me in the presence of my enemies. You anoint my head with oil. My cup runs over." },
  { translation: TRANSLATION, book: "Psalms", chapter: 23, verse: 6, text: "Surely goodness and loving kindness shall follow me all the days of my life, and I will dwell in Yahweh's house forever." },

  // ── Psalm 51:1-5 (chapter has 19 verses total per versification.ts; only 1-5 sampled) ──
  // Superscription ("For the Chief Musician. A Psalm by David, when Nathan
  // the prophet came to him, after he had gone in to Bathsheba") rendered
  // separately/unnumbered before verse 1 — NOT stored here, same pattern as Psalm 23.
  { translation: TRANSLATION, book: "Psalms", chapter: 51, verse: 1, text: "Have mercy on me, God, according to your loving kindness. According to the multitude of your tender mercies, blot out my transgressions." },
  { translation: TRANSLATION, book: "Psalms", chapter: 51, verse: 2, text: "Wash me thoroughly from my iniquity. Cleanse me from my sin." },
  { translation: TRANSLATION, book: "Psalms", chapter: 51, verse: 3, text: "For I know my transgressions. My sin is constantly before me." },
  { translation: TRANSLATION, book: "Psalms", chapter: 51, verse: 4, text: "Against you, and you only, I have sinned, and done that which is evil in your sight, so you may be proved right when you speak, and justified when you judge." },
  { translation: TRANSLATION, book: "Psalms", chapter: 51, verse: 5, text: "Behold, I was born in iniquity. My mother conceived me in sin." },

  // ── John 1:1-5 (chapter has 51 verses total per versification.ts; only 1-5 sampled) ──
  { translation: TRANSLATION, book: "John", chapter: 1, verse: 1, text: "In the beginning was the Word, and the Word was with God, and the Word was God." },
  { translation: TRANSLATION, book: "John", chapter: 1, verse: 2, text: "The same was in the beginning with God." },
  { translation: TRANSLATION, book: "John", chapter: 1, verse: 3, text: "All things were made through him. Without him, nothing was made that has been made." },
  { translation: TRANSLATION, book: "John", chapter: 1, verse: 4, text: "In him was life, and the life was the light of men." },
  { translation: TRANSLATION, book: "John", chapter: 1, verse: 5, text: "The light shines in the darkness, and the darkness hasn't overcome it." },

  // ── John 3:16-18 (chapter has 36 verses total per versification.ts; only 16-18 sampled) ──
  { translation: TRANSLATION, book: "John", chapter: 3, verse: 16, text: "For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life." },
  { translation: TRANSLATION, book: "John", chapter: 3, verse: 17, text: "For God didn't send his Son into the world to judge the world, but that the world should be saved through him." },
  { translation: TRANSLATION, book: "John", chapter: 3, verse: 18, text: "He who believes in him is not judged. He who doesn't believe has been judged already, because he has not believed in the name of the only born Son of God." },

  // ── Romans 8:28-30 (chapter has 39 verses total per versification.ts; only 28-30 sampled) ──
  { translation: TRANSLATION, book: "Romans", chapter: 8, verse: 28, text: "We know that all things work together for good for those who love God, for those who are called according to his purpose." },
  { translation: TRANSLATION, book: "Romans", chapter: 8, verse: 29, text: "For whom he foreknew, he also predestined to be conformed to the image of his Son, that he might be the firstborn among many brothers." },
  { translation: TRANSLATION, book: "Romans", chapter: 8, verse: 30, text: "Whom he predestined, those he also called. Whom he called, those he also justified. Whom he justified, those he also glorified." },

  // ── 1 Corinthians 13:1-7 (chapter has 13 verses total per versification.ts; only 1-7 sampled — NOT the complete chapter) ──
  { translation: TRANSLATION, book: "1 Corinthians", chapter: 13, verse: 1, text: "If I speak with the languages of men and of angels, but don't have love, I have become sounding brass or a clanging cymbal." },
  { translation: TRANSLATION, book: "1 Corinthians", chapter: 13, verse: 2, text: "If I have the gift of prophecy, and know all mysteries and all knowledge, and if I have all faith, so as to remove mountains, but don't have love, I am nothing." },
  { translation: TRANSLATION, book: "1 Corinthians", chapter: 13, verse: 3, text: "If I give away all my goods to feed the poor, and if I give my body to be burned, but don't have love, it profits me nothing." },
  { translation: TRANSLATION, book: "1 Corinthians", chapter: 13, verse: 4, text: "Love is patient and is kind. Love doesn't envy. Love doesn't brag, is not proud," },
  { translation: TRANSLATION, book: "1 Corinthians", chapter: 13, verse: 5, text: "doesn't behave itself inappropriately, doesn't seek its own way, is not provoked, takes no account of evil;" },
  { translation: TRANSLATION, book: "1 Corinthians", chapter: 13, verse: 6, text: "doesn't rejoice in unrighteousness, but rejoices with the truth;" },
  { translation: TRANSLATION, book: "1 Corinthians", chapter: 13, verse: 7, text: "bears all things, believes all things, hopes all things, and endures all things." },

  // ── Revelation 22:18-21 (chapter has 21 verses total per versification.ts — 18-21 is the tail end) ──
  { translation: TRANSLATION, book: "Revelation", chapter: 22, verse: 18, text: "I testify to everyone who hears the words of the prophecy of this book: if anyone adds to them, God will add to him the plagues which are written in this book." },
  { translation: TRANSLATION, book: "Revelation", chapter: 22, verse: 19, text: "If anyone takes away from the words of the book of this prophecy, God will take away his part from the tree of life, and out of the holy city, which are written in this book." },
  { translation: TRANSLATION, book: "Revelation", chapter: 22, verse: 20, text: "He who testifies these things says, 'Yes, I am coming soon.' Amen! Yes, come, Lord Jesus!" },
  { translation: TRANSLATION, book: "Revelation", chapter: 22, verse: 21, text: "The grace of the Lord Jesus Christ be with all the saints. Amen." },
];
