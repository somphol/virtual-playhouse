/* ============================================================================
   THE VIRTUAL PLAYHOUSE
   AI Classic Theatre & Audience Simulator
   ----------------------------------------------------------------------------
   Vanilla ES6 + HTML5 Canvas + Web Audio.
   No frameworks, no image assets, no sound files.

   Sections
   01. Utilities
   02. The repertory (bundled play scripts)
   03. Web Audio orchestra
   04. Stage renderer — backdrops, actors, lighting, curtain, particles
   05. Playback engine — parser, blocking, dialogue, cues
   06. Audience & UI — seats, reactions, playbill, script lab, DeepSeek
   ========================================================================== */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   01. UTILITIES
   ────────────────────────────────────────────────────────────────────────── */

const W = 1600;
const H = 900;
const OPENING = { x: 112, y: 88, w: 1376, h: 712 };
const FLOOR_Y = 726;
const STAGE_LEFT = 300;
const STAGE_RIGHT = 1300;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const clean = String(hex || '#ffffff').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return { r: 255, g: 255, b: 255 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const rgba = (rgb, a) => `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${a})`;

function wrapLines(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function slugify(str) {
  return String(str || 'actor')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'actor';
}

const POSITIONS = {
  'far-left': 0.11,
  left: 0.22,
  'center-left': 0.37,
  center: 0.5,
  'center-right': 0.63,
  right: 0.78,
  'far-right': 0.89,
};

function positionToX(position) {
  if (typeof position === 'number' && Number.isFinite(position)) {
    return STAGE_LEFT + clamp(position, 0, 1) * (STAGE_RIGHT - STAGE_LEFT);
  }
  const key = String(position || 'center').toLowerCase().trim();
  if (POSITIONS[key] !== undefined) return STAGE_LEFT + POSITIONS[key] * (STAGE_RIGHT - STAGE_LEFT);
  const numeric = parseFloat(key);
  if (Number.isFinite(numeric)) return STAGE_LEFT + clamp(numeric, 0, 1) * (STAGE_RIGHT - STAGE_LEFT);
  return (STAGE_LEFT + STAGE_RIGHT) / 2;
}

const COSTUME_SKINS = {
  scientist: '#e8b89a',
  creature: '#9fbd8a',
  alice: '#f3d2b8',
  hatter: '#e9c2a6',
  hare: '#c49a74',
  queen: '#efd3bc',
  prince: '#e6c3a8',
  ghost: '#c8d6df',
  royal: '#e3bd9f',
  gown: '#f0cdb2',
  fairy_queen: '#e2e8d4',
  fairy_king: '#d4e2cc',
  puck: '#d8c9a8',
  donkey: '#8a6a4a',
  regency: '#f0d2bc',
  dandy: '#e8c6a8',
  vampire: '#e6e0d8',
  bride: '#e9e2ea',
  victorian: '#e6c3a8',
  default: '#e6c1a5',
};

const COSTUME_LABEL = {
  scientist: 'Scientist',
  creature: 'The Creature',
  alice: 'Wonderland',
  hatter: 'Hatter',
  hare: 'Hare',
  queen: 'Royalty',
  prince: 'Prince',
  ghost: 'Ghost',
  royal: 'Royalty',
  gown: 'Lady',
  default: 'Player',
};

function guessCostume(name) {
  const n = String(name).toLowerCase();
  if (/(creature|monster|frankenstein'?s? monster|caliban)/.test(n)) return 'creature';
  if (/(ghost|spectre|spirit|apparition)/.test(n)) return 'ghost';
  if (/(alice)/.test(n)) return 'alice';
  if (/(hatter|mad hatter)/.test(n)) return 'hatter';
  if (/(hare|rabbit|bunny)/.test(n)) return 'hare';
  if (/(titania|fairy queen)/.test(n)) return 'fairy_queen';
  if (/(oberon|fairy king)/.test(n)) return 'fairy_king';
  if (/(puck|robin goodfellow)/.test(n)) return 'puck';
  if (/(bottom|donkey|ass\b)/.test(n)) return 'donkey';
  if (/(dracula|vampire|count)/.test(n)) return 'vampire';
  if (/(bride)/.test(n)) return 'bride';
  if (/(bennet|regency|lizzy)/.test(n)) return 'regency';
  if (/(darcy|bingley|dandy)/.test(n)) return 'dandy';
  if (/(harker|jonathan|victorian)/.test(n)) return 'victorian';
  if (/(queen|majesty|empress)/.test(n)) return 'queen';
  if (/(king|claudius|duke|lord)/.test(n)) return 'royal';
  if (/(hamlet|prince)/.test(n)) return 'prince';
  if (/(victor|scientist|doctor|frankenstein)/.test(n)) return 'scientist';
  if (/(elizabeth|ophelia|lady|duchess)/.test(n)) return 'gown';
  return 'default';
}

function shortName(name) {
  const clean = String(name || 'Player').trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return clean;
  if (/^(the|mad|queen|king|lord|lady|sir|doctor|dr\.?)$/i.test(parts[0])) return parts.slice(0, 2).join(' ');
  return parts[0];
}

/* ─────────────────────────────────────────────────────────────────────────────
   02. THE REPERTORY
   ────────────────────────────────────────────────────────────────────────── */

const ACTS = [
  {
    id: 'frankenstein',
    act: 'Act I',
    title: "Frankenstein's Awakening",
    setting: 'Gothic Laboratory',
    subtitle: 'A gothic laboratory. A storm. A spark of forbidden life.',
    backdrop: 'gothic_lab',
    ambient: 'gothic',
    duration: '≈ 4–5 min',
    art: 'gothic',
    cast: [
      { id: 'victor', name: 'Victor Frankenstein', short: 'Victor', costume: 'scientist', color: '#7fd6c4', position: 'left', height: 1.0 },
      { id: 'creature', name: 'The Creature', short: 'Creature', costume: 'creature', color: '#a9d98d', position: 'right', height: 1.15 },
      { id: 'elizabeth', name: 'Elizabeth Lavenza', short: 'Elizabeth', costume: 'gown', color: '#e7a9b8', position: 'center', height: 0.94 },
    ],
    actions: [
      { type: 'CAPTION', text: 'A storm-torn night in Ingolstadt. The lamps gutter. The dead do not sleep.' },
      { type: 'BACKDROP', backdrop: 'gothic_lab' },
      { type: 'LIGHTING', color: '#3f6bff', intensity: 0.42 },
      { type: 'SOUND', cue: 'rain' },
      { type: 'SOUND', cue: 'wind' },
      { type: 'CAPTION', text: 'Victor Frankenstein has spent three years assembling a body from the quiet parts of the earth.' },
      { type: 'ENTER', actor: 'Victor', position: 'left' },
      { type: 'GESTURE', actor: 'Victor', gesture: 'clasp' },
      { type: 'DIALOGUE', actor: 'Victor', text: 'Another storm. Another night without sleep. If the spark will not come to me, I shall drag it down from heaven myself.' },
      { type: 'SOUND', cue: 'thunder_clap' },
      { type: 'EFFECT', effect: 'lightning' },
      { type: 'LIGHTING', color: '#7fe6d2', intensity: 0.82 },
      { type: 'CAPTION', text: 'The apparatus shudders. Somewhere beneath the floor, a heart begins to beat.' },
      { type: 'SOUND', cue: 'heartbeat' },
      { type: 'ENTER', actor: 'Creature', position: 'right' },
      { type: 'GESTURE', actor: 'Creature', gesture: 'raise' },
      { type: 'DIALOGUE', actor: 'Creature', text: 'I… remember… light.' },
      { type: 'DIALOGUE', actor: 'Victor', text: 'It speaks. Merciful God — it speaks.' },
      { type: 'GESTURE', actor: 'Victor', gesture: 'recoil' },
      { type: 'DIALOGUE', actor: 'Creature', text: 'You made me. You owe me a name.' },
      { type: 'DIALOGUE', actor: 'Victor', text: 'I owe you nothing but the grave I robbed.' },
      { type: 'SOUND', cue: 'door_creak' },
      { type: 'ENTER', actor: 'Elizabeth', position: 'center' },
      { type: 'LIGHTING', color: '#ffb36b', intensity: 0.56 },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'Victor? The whole house is awake. What have you done?' },
      { type: 'DIALOGUE', actor: 'Victor', text: 'I have done what no man should. Look at it, Elizabeth. It is alive.' },
      { type: 'GESTURE', actor: 'Creature', gesture: 'beckon' },
      { type: 'DIALOGUE', actor: 'Creature', text: 'She is not afraid. Are you, lady?' },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'I am afraid of what you are becoming, Victor. Not of him.' },
      { type: 'CAPTION', text: 'The Creature reaches for the light. Victor reaches for the chain.' },
      { type: 'GESTURE', actor: 'Victor', gesture: 'point' },
      { type: 'DIALOGUE', actor: 'Victor', text: 'Back. Back into the dark where I found you.' },
      { type: 'LIGHTING', color: '#ff2f4f', intensity: 0.9 },
      { type: 'SOUND', cue: 'thunder_clap' },
      { type: 'EFFECT', effect: 'sparks' },
      { type: 'DIALOGUE', actor: 'Creature', text: 'You will not leave me in the dark. I will learn to make a fire of my own.' },
      { type: 'EXIT', actor: 'Creature' },
      { type: 'SOUND', cue: 'wind' },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'He called you his maker. What will you call him?' },
      { type: 'DIALOGUE', actor: 'Victor', text: 'A mistake.' },
      { type: 'LIGHTING', color: '#4f7fff', intensity: 0.3 },
      { type: 'CAPTION', text: 'The storm passes. The house does not.' },
      { type: 'BOW', actor: 'Victor' },
      { type: 'BOW', actor: 'Elizabeth' },
      { type: 'BOW', actor: 'Creature' },
    ],
  },
  {
    id: 'teaparty',
    act: 'Act II',
    title: 'The Mad Tea Party',
    setting: 'Tea Party Garden',
    subtitle: 'A garden where the clocks have given up and the tea is mostly riddle.',
    backdrop: 'tea_garden',
    ambient: 'wonderland',
    duration: '≈ 4–5 min',
    art: 'tea',
    cast: [
      { id: 'alice', name: 'Alice', short: 'Alice', costume: 'alice', color: '#8fc7ff', position: 'far-left', height: 0.9 },
      { id: 'hare', name: 'The March Hare', short: 'Hare', costume: 'hare', color: '#d6a273', position: 'center-left', height: 0.98 },
      { id: 'hatter', name: 'The Mad Hatter', short: 'Hatter', costume: 'hatter', color: '#b98cff', position: 'center-right', height: 1.0 },
      { id: 'queen', name: 'The Queen of Hearts', short: 'Queen', costume: 'queen', color: '#ff6b85', position: 'far-right', height: 1.02 },
    ],
    actions: [
      { type: 'CAPTION', text: 'A garden where the clocks have given up.' },
      { type: 'BACKDROP', backdrop: 'tea_garden' },
      { type: 'LIGHTING', color: '#ffd27a', intensity: 0.82 },
      { type: 'SOUND', cue: 'magic_chime' },
      { type: 'ENTER', actor: 'Alice', position: 'far-left' },
      { type: 'DIALOGUE', actor: 'Alice', text: 'I have followed a rabbit for a very long time. I do hope this is the right sort of madness.' },
      { type: 'SOUND', cue: 'bell' },
      { type: 'ENTER', actor: 'Hatter', position: 'center-right' },
      { type: 'ENTER', actor: 'Hare', position: 'center-left' },
      { type: 'DIALOGUE', actor: 'Hatter', text: "You're late! You're late! For a tea party that never began!" },
      { type: 'DIALOGUE', actor: 'Hare', text: 'We have been waiting since Tuesday. Or was it the other Tuesday?' },
      { type: 'DIALOGUE', actor: 'Alice', text: 'There is no one at the table.' },
      { type: 'DIALOGUE', actor: 'Hatter', text: 'Precisely! That is the most exclusive party in Wonderland.' },
      { type: 'GESTURE', actor: 'Hatter', gesture: 'raise' },
      { type: 'SOUND', cue: 'clock_tick' },
      { type: 'DIALOGUE', actor: 'Hare', text: 'Have some tea. It is not tea. It is a riddle with a cup.' },
      { type: 'DIALOGUE', actor: 'Alice', text: 'Why is a raven like a writing desk?' },
      { type: 'DIALOGUE', actor: 'Hatter', text: "I haven't the faintest idea. Neither has the raven. That is what makes it a classic." },
      { type: 'EFFECT', effect: 'petals' },
      { type: 'SOUND', cue: 'magic_chime' },
      { type: 'ENTER', actor: 'Queen', position: 'far-right' },
      { type: 'LIGHTING', color: '#ff4f6d', intensity: 0.95 },
      { type: 'DIALOGUE', actor: 'Queen', text: 'OFF WITH THEIR HEADS!' },
      { type: 'DIALOGUE', actor: 'Hatter', text: 'Ah. The Queen. The party has found its punctuation.' },
      { type: 'DIALOGUE', actor: 'Queen', text: 'Who has been eating my tarts?' },
      { type: 'DIALOGUE', actor: 'Hare', text: 'The cat. He is not here. He is also not not here.' },
      { type: 'DIALOGUE', actor: 'Alice', text: 'Your Majesty, I believe this is a tea party.' },
      { type: 'DIALOGUE', actor: 'Queen', text: 'A tea party without an execution is merely breakfast.' },
      { type: 'GESTURE', actor: 'Queen', gesture: 'point' },
      { type: 'EFFECT', effect: 'cards' },
      { type: 'SOUND', cue: 'bell' },
      { type: 'DIALOGUE', actor: 'Alice', text: 'Then I shall have my tea, and my head, and be home before supper.' },
      { type: 'DIALOGUE', actor: 'Hatter', text: 'A toast! To Alice — the only sane person in the garden!' },
      { type: 'DIALOGUE', actor: 'Hare', text: 'And to the Queen — the only person in the garden!' },
      { type: 'DIALOGUE', actor: 'Queen', text: 'OFF WITH THEIR— oh, very well. One cup.' },
      { type: 'LIGHTING', color: '#ffd27a', intensity: 0.78 },
      { type: 'SOUND', cue: 'magic_chime' },
      { type: 'CAPTION', text: 'They drank until the moon came up. Nobody could remember whose turn it was.' },
      { type: 'BOW', actor: 'Alice' },
      { type: 'BOW', actor: 'Hatter' },
      { type: 'BOW', actor: 'Hare' },
      { type: 'BOW', actor: 'Queen' },
      { type: 'EFFECT', effect: 'confetti' },
    ],
  },
  {
    id: 'hamlet',
    act: 'Act III',
    title: 'Hamlet on the Ramparts',
    setting: 'Castle Ramparts',
    subtitle: 'Elsinore, midnight. The guard changes, and the dead keep their appointments.',
    backdrop: 'ramparts',
    ambient: 'tragedy',
    duration: '≈ 4–5 min',
    art: 'ramparts',
    cast: [
      { id: 'horatio', name: 'Horatio', short: 'Horatio', costume: 'default', color: '#c9a86a', position: 'center-left', height: 0.98 },
      { id: 'hamlet', name: 'Hamlet', short: 'Hamlet', costume: 'prince', color: '#b8c7ff', position: 'center', height: 1.0 },
      { id: 'ghost', name: 'The Ghost', short: 'Ghost', costume: 'ghost', color: '#c9f0ff', position: 'right', height: 1.08 },
      { id: 'claudius', name: 'King Claudius', short: 'Claudius', costume: 'royal', color: '#e0a14a', position: 'far-left', height: 1.0 },
    ],
    actions: [
      { type: 'CAPTION', text: 'Elsinore. Midnight. The guard changes, and the dead keep their appointments.' },
      { type: 'BACKDROP', backdrop: 'ramparts' },
      { type: 'LIGHTING', color: '#6f8dff', intensity: 0.32 },
      { type: 'SOUND', cue: 'wind' },
      { type: 'SOUND', cue: 'bell' },
      { type: 'ENTER', actor: 'Horatio', position: 'center-left' },
      { type: 'ENTER', actor: 'Hamlet', position: 'center' },
      { type: 'DIALOGUE', actor: 'Horatio', text: 'My lord, the ghost walks again. It will not answer the guard.' },
      { type: 'DIALOGUE', actor: 'Hamlet', text: 'Then it shall answer me. I have questions enough for both of us.' },
      { type: 'EFFECT', effect: 'fog' },
      { type: 'ENTER', actor: 'Ghost', position: 'right' },
      { type: 'LIGHTING', color: '#b9e6ff', intensity: 0.72 },
      { type: 'GESTURE', actor: 'Horatio', gesture: 'recoil' },
      { type: 'DIALOGUE', actor: 'Horatio', text: 'Angels and ministers of grace defend us!' },
      { type: 'DIALOGUE', actor: 'Hamlet', text: 'Something is rotten in the state of Denmark. Let us see how deep the rot goes.' },
      { type: 'DIALOGUE', actor: 'Ghost', text: 'Hamlet. Son. Listen.' },
      { type: 'DIALOGUE', actor: 'Hamlet', text: 'I will follow thee. Speak.' },
      { type: 'GESTURE', actor: 'Ghost', gesture: 'beckon' },
      { type: 'DIALOGUE', actor: 'Ghost', text: "The serpent that did sting thy father's life now wears his crown." },
      { type: 'SOUND', cue: 'thunder_clap' },
      { type: 'EFFECT', effect: 'lightning' },
      { type: 'DIALOGUE', actor: 'Hamlet', text: 'My uncle? My father\u2019s brother?' },
      { type: 'DIALOGUE', actor: 'Ghost', text: 'Revenge his foul and most unnatural murder.' },
      { type: 'DIALOGUE', actor: 'Hamlet', text: 'Murder most foul — and I the fool who must carry it.' },
      { type: 'GESTURE', actor: 'Hamlet', gesture: 'kneel' },
      { type: 'DIALOGUE', actor: 'Horatio', text: 'Do not follow it, my lord. The night is full of lies.' },
      { type: 'DIALOGUE', actor: 'Hamlet', text: 'Then I shall be the lie that tells the truth.' },
      { type: 'EXIT', actor: 'Ghost' },
      { type: 'LIGHTING', color: '#6f8dff', intensity: 0.38 },
      { type: 'SOUND', cue: 'bell' },
      { type: 'ENTER', actor: 'Claudius', position: 'far-left' },
      { type: 'LIGHTING', color: '#ffb36b', intensity: 0.64 },
      { type: 'DIALOGUE', actor: 'Claudius', text: 'Still awake, nephew? The night air is bad for princes.' },
      { type: 'DIALOGUE', actor: 'Hamlet', text: 'And bad for kings, uncle. Especially those who sleep too well.' },
      { type: 'DIALOGUE', actor: 'Claudius', text: 'You speak in riddles.' },
      { type: 'DIALOGUE', actor: 'Hamlet', text: 'I speak in Denmark. You should learn the language.' },
      { type: 'GESTURE', actor: 'Claudius', gesture: 'point' },
      { type: 'DIALOGUE', actor: 'Claudius', text: 'Mind your tongue, or I shall find a use for it.' },
      { type: 'DIALOGUE', actor: 'Horatio', text: 'My lord—' },
      { type: 'DIALOGUE', actor: 'Hamlet', text: 'Let him threaten. The dead have already told me the ending.' },
      { type: 'LIGHTING', color: '#ff2f4f', intensity: 0.85 },
      { type: 'SOUND', cue: 'sword_clash' },
      { type: 'EFFECT', effect: 'sparks' },
      { type: 'CAPTION', text: 'The ghost is gone. The king is smiling. The night is only beginning.' },
      { type: 'BOW', actor: 'Hamlet' },
      { type: 'BOW', actor: 'Horatio' },
      { type: 'BOW', actor: 'Ghost' },
      { type: 'BOW', actor: 'Claudius' },
    ],
  },
  {
    id: 'midsummer',
    act: 'Act IV',
    title: "A Midsummer Night's Dream",
    setting: 'The Fairy Wood',
    subtitle: 'The wood outside Athens, where moonlight has opinions and love is a flower with a wicked sense of humour.',
    backdrop: 'fairy_wood',
    ambient: 'enchanted',
    duration: '≈ 4–5 min',
    art: 'fairy',
    cast: [
      { id: 'puck', name: 'Puck', short: 'Puck', costume: 'puck', color: '#8fe6c0', position: 'far-left', height: 0.9 },
      { id: 'titania', name: 'Titania', short: 'Titania', costume: 'fairy_queen', color: '#c9a7ff', position: 'center-left', height: 0.98 },
      { id: 'bottom', name: 'Nick Bottom', short: 'Bottom', costume: 'donkey', color: '#d6a273', position: 'center-right', height: 1.02 },
      { id: 'oberon', name: 'Oberon', short: 'Oberon', costume: 'fairy_king', color: '#7fd6c4', position: 'right', height: 1.05 },
    ],
    actions: [
      { type: 'CAPTION', text: 'The wood outside Athens, where the moonlight has opinions.' },
      { type: 'BACKDROP', backdrop: 'fairy_wood' },
      { type: 'LIGHTING', color: '#8fe6c0', intensity: 0.7 },
      { type: 'SOUND', cue: 'magic_chime' },
      { type: 'EFFECT', effect: 'fireflies' },
      { type: 'ENTER', actor: 'Puck', position: 'far-left' },
      { type: 'DIALOGUE', actor: 'Puck', text: 'The king and queen are quarrelling again. The flowers have taken sides.' },
      { type: 'ENTER', actor: 'Titania', position: 'center-left' },
      { type: 'DIALOGUE', actor: 'Titania', text: 'I have sworn to keep this changeling child. Oberon may have the whole wood, but not my boy.' },
      { type: 'ENTER', actor: 'Oberon', position: 'right' },
      { type: 'DIALOGUE', actor: 'Oberon', text: 'Then the wood will have no seasons until you yield.' },
      { type: 'DIALOGUE', actor: 'Puck', text: 'And I have a flower that makes people fall in love with the next thing they see. This is going to be delightful.' },
      { type: 'ENTER', actor: 'Bottom', position: 'center-right' },
      { type: 'GESTURE', actor: 'Bottom', gesture: 'raise' },
      { type: 'DIALOGUE', actor: 'Bottom', text: 'Are we all met? I shall play the lion, and I shall roar so gently the ladies will beg for more.' },
      { type: 'SOUND', cue: 'magic_chime' },
      { type: 'EFFECT', effect: 'fireflies' },
      { type: 'GESTURE', actor: 'Puck', gesture: 'point' },
      { type: 'DIALOGUE', actor: 'Puck', text: 'A lion? No, sir. Tonight you are a donkey.' },
      { type: 'EFFECT', effect: 'sparks' },
      { type: 'LIGHTING', color: '#ffd27a', intensity: 0.82 },
      { type: 'DIALOGUE', actor: 'Bottom', text: 'I am… a donkey? Well, it is a better part than most.' },
      { type: 'DIALOGUE', actor: 'Titania', text: 'What angel wakes me from my flowery bed?' },
      { type: 'DIALOGUE', actor: 'Bottom', text: 'I am no angel, madam. I am Bottom, the weaver, and I have the head of an ass.' },
      { type: 'DIALOGUE', actor: 'Titania', text: 'Then I shall love thee for thy honesty. Sing, sweet donkey.' },
      { type: 'DIALOGUE', actor: 'Bottom', text: 'He-haw. He-haw.' },
      { type: 'DIALOGUE', actor: 'Puck', text: 'The queen is in love with a donkey. The king will laugh for a century.' },
      { type: 'DIALOGUE', actor: 'Oberon', text: 'Enough, Robin. I have my revenge, and it is smaller than I thought.' },
      { type: 'GESTURE', actor: 'Oberon', gesture: 'raise' },
      { type: 'DIALOGUE', actor: 'Oberon', text: 'Release her. The dawn is coming, and love that is forced is no love at all.' },
      { type: 'SOUND', cue: 'magic_chime' },
      { type: 'LIGHTING', color: '#b9a7ff', intensity: 0.75 },
      { type: 'EFFECT', effect: 'petals' },
      { type: 'DIALOGUE', actor: 'Titania', text: 'I dreamed I loved a donkey. How strange. How very strange.' },
      { type: 'DIALOGUE', actor: 'Bottom', text: 'And I dreamed I was adored. I shall write a ballad about it.' },
      { type: 'DIALOGUE', actor: 'Puck', text: 'If we shadows have offended, think but this, and all is mended: that you have but slumbered here while these visions did appear.' },
      { type: 'CAPTION', text: 'The lovers wake. The wood forgives. The donkey keeps the ballad.' },
      { type: 'BOW', actor: 'Titania' },
      { type: 'BOW', actor: 'Oberon' },
      { type: 'BOW', actor: 'Puck' },
      { type: 'BOW', actor: 'Bottom' },
      { type: 'EFFECT', effect: 'confetti' },
    ],
  },
  {
    id: 'pride',
    act: 'Act V',
    title: 'Pride and Prejudice',
    setting: 'The Netherfield Ball',
    subtitle: 'Candles, consequence, and a room full of mothers with plans.',
    backdrop: 'ballroom',
    ambient: 'ballroom',
    duration: '≈ 4–5 min',
    art: 'ballroom',
    cast: [
      { id: 'jane', name: 'Jane Bennet', short: 'Jane', costume: 'regency', color: '#e7a9b8', position: 'far-left', height: 0.96 },
      { id: 'elizabeth', name: 'Elizabeth Bennet', short: 'Elizabeth', costume: 'regency', color: '#7fd6c4', position: 'center-left', height: 0.97 },
      { id: 'darcy', name: 'Mr. Darcy', short: 'Darcy', costume: 'dandy', color: '#8fa7d6', position: 'center-right', height: 1.03 },
      { id: 'bingley', name: 'Mr. Bingley', short: 'Bingley', costume: 'dandy', color: '#d6a273', position: 'far-right', height: 1.0 },
    ],
    actions: [
      { type: 'CAPTION', text: 'Netherfield Park. Candles, consequence, and a room full of mothers with plans.' },
      { type: 'BACKDROP', backdrop: 'ballroom' },
      { type: 'LIGHTING', color: '#ffd9a0', intensity: 0.86 },
      { type: 'SOUND', cue: 'waltz' },
      { type: 'ENTER', actor: 'Jane', position: 'far-left' },
      { type: 'ENTER', actor: 'Bingley', position: 'far-right' },
      { type: 'DIALOGUE', actor: 'Bingley', text: 'Miss Bennet, the room has been waiting for you to make it worth looking at.' },
      { type: 'DIALOGUE', actor: 'Jane', text: 'You flatter me, sir. I was only admiring the candles.' },
      { type: 'DIALOGUE', actor: 'Bingley', text: 'Then I shall have the candles replaced at once. They are stealing your attention.' },
      { type: 'ENTER', actor: 'Elizabeth', position: 'center-left' },
      { type: 'ENTER', actor: 'Darcy', position: 'center-right' },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'Mr. Darcy. I believe this dance is ours.' },
      { type: 'DIALOGUE', actor: 'Darcy', text: 'I believe it is. I am told dancing is a punishment for pride.' },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'And for prejudice? I have heard the sentence is the same.' },
      { type: 'DIALOGUE', actor: 'Darcy', text: 'You delight in finding fault with me.' },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'I delight in finding something worth the trouble.' },
      { type: 'GESTURE', actor: 'Darcy', gesture: 'clasp' },
      { type: 'DIALOGUE', actor: 'Darcy', text: 'Then let me give you something worth the trouble. I admire you, Miss Bennet. Against my better judgment.' },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'Your better judgment has never been introduced to me.' },
      { type: 'DIALOGUE', actor: 'Jane', text: 'Lizzy, everyone is looking.' },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'Let them look. I am only dancing.' },
      { type: 'DIALOGUE', actor: 'Bingley', text: 'And I am only falling in love. It is a very simple dance.' },
      { type: 'DIALOGUE', actor: 'Darcy', text: 'I am not a man who dances easily.' },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'No. You are a man who stands very still and hopes the world will come to him.' },
      { type: 'DIALOGUE', actor: 'Darcy', text: 'And yet here I am, asking.' },
      { type: 'SOUND', cue: 'waltz' },
      { type: 'EFFECT', effect: 'petals' },
      { type: 'LIGHTING', color: '#ffb36b', intensity: 0.92 },
      { type: 'DIALOGUE', actor: 'Elizabeth', text: 'Then ask me again when you have learned the steps.' },
      { type: 'DIALOGUE', actor: 'Darcy', text: 'I shall practise every night.' },
      { type: 'DIALOGUE', actor: 'Jane', text: 'And I shall pretend not to notice.' },
      { type: 'DIALOGUE', actor: 'Bingley', text: 'I shall notice everything.' },
      { type: 'SOUND', cue: 'clock_tick' },
      { type: 'CAPTION', text: 'The music ends. The dance does not.' },
      { type: 'BOW', actor: 'Elizabeth' },
      { type: 'BOW', actor: 'Darcy' },
      { type: 'BOW', actor: 'Jane' },
      { type: 'BOW', actor: 'Bingley' },
      { type: 'EFFECT', effect: 'confetti' },
    ],
  },
  {
    id: 'dracula',
    act: 'Act VI',
    title: 'Dracula',
    setting: "Dracula's Castle",
    subtitle: 'The Carpathians. A castle on a rock, and a door that opens by itself.',
    backdrop: 'dracula_castle',
    ambient: 'horror',
    duration: '≈ 4–5 min',
    art: 'castle',
    cast: [
      { id: 'bride', name: 'The First Bride', short: 'Bride', costume: 'bride', color: '#d8c8ff', position: 'far-left', height: 0.96 },
      { id: 'jonathan', name: 'Jonathan Harker', short: 'Jonathan', costume: 'victorian', color: '#c9a86a', position: 'center-left', height: 1.0 },
      { id: 'dracula', name: 'Count Dracula', short: 'Dracula', costume: 'vampire', color: '#ff6b85', position: 'right', height: 1.08 },
    ],
    actions: [
      { type: 'CAPTION', text: 'The Carpathians. A castle on a rock, and a door that opens by itself.' },
      { type: 'BACKDROP', backdrop: 'dracula_castle' },
      { type: 'LIGHTING', color: '#6f3bff', intensity: 0.28 },
      { type: 'SOUND', cue: 'wolf_howl' },
      { type: 'EFFECT', effect: 'fog' },
      { type: 'ENTER', actor: 'Jonathan', position: 'center-left' },
      { type: 'DIALOGUE', actor: 'Jonathan', text: 'The driver would not come past the gate. I begin to understand why.' },
      { type: 'SOUND', cue: 'door_creak' },
      { type: 'ENTER', actor: 'Dracula', position: 'right' },
      { type: 'LIGHTING', color: '#ff6b4a', intensity: 0.55 },
      { type: 'DIALOGUE', actor: 'Dracula', text: 'Welcome to my house. Enter freely, and of your own will.' },
      { type: 'DIALOGUE', actor: 'Jonathan', text: 'Count Dracula? I am Jonathan Harker, solicitor. I have come about the London property.' },
      { type: 'DIALOGUE', actor: 'Dracula', text: 'London. Yes. I have a hunger for London.' },
      { type: 'GESTURE', actor: 'Dracula', gesture: 'beckon' },
      { type: 'DIALOGUE', actor: 'Dracula', text: 'You will stay a while. The mountains are not kind to travellers.' },
      { type: 'SOUND', cue: 'wolf_howl' },
      { type: 'EFFECT', effect: 'bats' },
      { type: 'DIALOGUE', actor: 'Jonathan', text: 'I would prefer to leave at dawn.' },
      { type: 'DIALOGUE', actor: 'Dracula', text: 'Dawn is a difficult hour for me. Let us say… dusk.' },
      { type: 'CAPTION', text: 'A door closes somewhere behind him. Jonathan does not hear it. The castle does.' },
      { type: 'ENTER', actor: 'Bride', position: 'far-left' },
      { type: 'LIGHTING', color: '#b9a7ff', intensity: 0.5 },
      { type: 'SOUND', cue: 'heartbeat' },
      { type: 'DIALOGUE', actor: 'Bride', text: 'A young man. How thoughtful of the Count to bring us supper.' },
      { type: 'DIALOGUE', actor: 'Jonathan', text: 'I am not supper. I am a solicitor.' },
      { type: 'DIALOGUE', actor: 'Bride', text: 'Then you will be a very dry meal.' },
      { type: 'DIALOGUE', actor: 'Dracula', text: 'Back. This one is mine. He has work to do.' },
      { type: 'DIALOGUE', actor: 'Bride', text: 'You never let us play.' },
      { type: 'DIALOGUE', actor: 'Dracula', text: 'I let you play with the village. Look what happened.' },
      { type: 'GESTURE', actor: 'Dracula', gesture: 'point' },
      { type: 'LIGHTING', color: '#ff2f4f', intensity: 0.82 },
      { type: 'SOUND', cue: 'thunder_clap' },
      { type: 'EFFECT', effect: 'lightning' },
      { type: 'DIALOGUE', actor: 'Jonathan', text: 'I am a prisoner.' },
      { type: 'DIALOGUE', actor: 'Dracula', text: 'A guest. The distinction is one of paperwork.' },
      { type: 'DIALOGUE', actor: 'Jonathan', text: 'Then I shall write it down. Every word.' },
      { type: 'DIALOGUE', actor: 'Dracula', text: 'Write. The castle has many rooms, and none of them are locked from the inside.' },
      { type: 'CAPTION', text: 'Jonathan opens his journal. The candle leans toward him, as if reading.' },
      { type: 'SOUND', cue: 'organ' },
      { type: 'LIGHTING', color: '#6f3bff', intensity: 0.25 },
      { type: 'DIALOGUE', actor: 'Bride', text: 'The sun will be up soon.' },
      { type: 'DIALOGUE', actor: 'Dracula', text: 'Then we shall have to be quick.' },
      { type: 'DIALOGUE', actor: 'Jonathan', text: 'I have never been so glad to hear a cock crow.' },
      { type: 'CAPTION', text: 'The castle sleeps. The journal does not.' },
      { type: 'BOW', actor: 'Jonathan' },
      { type: 'BOW', actor: 'Dracula' },
      { type: 'BOW', actor: 'Bride' },
      { type: 'EFFECT', effect: 'fog' },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   03. WEB AUDIO ORCHESTRA
   ────────────────────────────────────────────────────────────────────────── */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.noise = null;
    this.muted = false;
    this.ambientNodes = null;
    this.ambientMood = 'none';
    this.ambientEnabled = false; // the old drone is off unless explicitly requested
    this.unlocked = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0.0001 : 1;
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 24;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      this.master.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      this.noise = this.createNoiseBuffer(2.4);
      this.unlocked = true;
      return true;
    } catch (err) {
      console.warn('Audio unavailable', err);
      return false;
    }
  }

  unlock() {
    if (!this.ensure()) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  createNoiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0.0001 : 1, this.ctx.currentTime, 0.03);
    }
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  tone({ freq = 440, freqEnd = null, dur = 0.3, type = 'sine', gain = 0.08, when = 0, detune = 0 }) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    if (detune) osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noiseBurst({ dur = 0.3, type = 'bandpass', freq = 1200, freqEnd = null, q = 1, gain = 0.15, when = 0 }) {
    if (!this.ensure()) return;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.06, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  typeClick() {
    if (!this.ctx || this.muted) return;
    this.tone({ freq: rand(1250, 1600), dur: 0.025, type: 'square', gain: 0.014 });
  }

  voiceTick(pitch = 170) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const formant = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(pitch * rand(0.9, 1.1), t0);
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(pitch * rand(3.6, 5.2), t0);
    formant.Q.value = 2.8;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.022, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
    osc.connect(formant).connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + 0.13);
  }

  thunder() {
    if (!this.ensure()) return;
    this.tone({ freq: 58, freqEnd: 26, dur: 1.8, type: 'sine', gain: 0.34 });
    this.tone({ freq: 41, freqEnd: 20, dur: 2.2, type: 'triangle', gain: 0.18, when: 0.08 });
    this.noiseBurst({ dur: 1.5, type: 'lowpass', freq: 620, freqEnd: 90, q: 0.7, gain: 0.32 });
    this.noiseBurst({ dur: 0.28, type: 'highpass', freq: 1400, gain: 0.1, when: 0.02 });
  }

  rain() {
    if (!this.ensure()) return;
    this.noiseBurst({ dur: 3.2, type: 'highpass', freq: 900, q: 0.4, gain: 0.055 });
    for (let i = 0; i < 18; i++) {
      this.noiseBurst({ dur: 0.05, type: 'bandpass', freq: rand(1600, 3600), q: 6, gain: 0.02, when: rand(0, 2.8) });
    }
  }

  wind() {
    if (!this.ensure()) return;
    this.noiseBurst({ dur: 2.8, type: 'bandpass', freq: 480, freqEnd: 820, q: 0.6, gain: 0.075 });
    this.noiseBurst({ dur: 2.4, type: 'lowpass', freq: 300, q: 0.4, gain: 0.05, when: 0.4 });
  }

  magic() {
    if (!this.ensure()) return;
    const notes = [1046.5, 1318.5, 1568, 2093, 2637];
    notes.forEach((f, i) => {
      this.tone({ freq: f, dur: 1.1, type: 'sine', gain: 0.055, when: i * 0.09 });
      this.tone({ freq: f * 2, dur: 0.7, type: 'triangle', gain: 0.014, when: i * 0.09 });
    });
  }

  doorCreak() {
    if (!this.ensure()) return;
    this.tone({ freq: 160, freqEnd: 68, dur: 1.2, type: 'sawtooth', gain: 0.035 });
    this.noiseBurst({ dur: 1.1, type: 'bandpass', freq: 780, freqEnd: 300, q: 4, gain: 0.035 });
  }

  heartbeat() {
    if (!this.ensure()) return;
    [0, 0.26, 0.95, 1.2].forEach((when, i) => {
      this.tone({ freq: 62, freqEnd: 38, dur: 0.16, type: 'sine', gain: i % 2 ? 0.16 : 0.22, when });
    });
  }

  clockTick() {
    if (!this.ensure()) return;
    this.noiseBurst({ dur: 0.035, type: 'bandpass', freq: 2400, q: 8, gain: 0.09 });
    this.noiseBurst({ dur: 0.035, type: 'bandpass', freq: 1900, q: 8, gain: 0.07, when: 0.5 });
  }

  bell() {
    if (!this.ensure()) return;
    [880, 1320, 1760, 2640].forEach((f, i) => {
      this.tone({ freq: f, dur: 2.2 - i * 0.3, type: 'sine', gain: 0.055 / (i + 1) });
    });
  }

  sword() {
    if (!this.ensure()) return;
    this.noiseBurst({ dur: 0.22, type: 'highpass', freq: 2800, gain: 0.14 });
    this.tone({ freq: 2100, freqEnd: 1750, dur: 0.55, type: 'triangle', gain: 0.05 });
    this.tone({ freq: 3100, freqEnd: 2600, dur: 0.4, type: 'sine', gain: 0.025, when: 0.02 });
  }

  laugh() {
    if (!this.ensure()) return;
    for (let i = 0; i < 7; i++) {
      const when = i * 0.12 + rand(0, 0.03);
      const f = rand(190, 280);
      this.tone({ freq: f, freqEnd: f * 0.72, dur: 0.13, type: 'sawtooth', gain: 0.022, when });
      this.noiseBurst({ dur: 0.12, type: 'bandpass', freq: 900, q: 2.5, gain: 0.03, when });
    }
    this.noiseBurst({ dur: 0.9, type: 'bandpass', freq: 500, q: 0.7, gain: 0.025 });
  }

  gasp() {
    if (!this.ensure()) return;
    this.noiseBurst({ dur: 0.75, type: 'bandpass', freq: 700, freqEnd: 1400, q: 1.4, gain: 0.11 });
    this.tone({ freq: 320, freqEnd: 470, dur: 0.55, type: 'sine', gain: 0.015 });
  }

  applause(intensity = 0.7) {
    if (!this.ensure()) return;
    const count = Math.round(26 + intensity * 30);
    for (let i = 0; i < count; i++) {
      const when = rand(0, 1.5);
      this.noiseBurst({
        dur: rand(0.03, 0.07),
        type: 'bandpass',
        freq: rand(900, 2600),
        q: rand(2, 7),
        gain: rand(0.02, 0.055) * (0.6 + intensity * 0.6),
        when,
      });
    }
    this.noiseBurst({ dur: 1.8, type: 'bandpass', freq: 1200, q: 0.5, gain: 0.05 + intensity * 0.05 });
  }

  rose() {
    if (!this.ensure()) return;
    this.noiseBurst({ dur: 0.7, type: 'bandpass', freq: 400, freqEnd: 1800, q: 1.2, gain: 0.045 });
    this.tone({ freq: 784, dur: 0.9, type: 'sine', gain: 0.03, when: 0.18 });
    this.tone({ freq: 1175, dur: 0.7, type: 'sine', gain: 0.016, when: 0.26 });
  }

  crowdGasp() {
    this.gasp();
  }

  waltz() {
    if (!this.ensure()) return;
    const melody = [523.25, 659.25, 783.99, 659.25, 523.25, 587.33, 659.25, 523.25];
    melody.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.55, type: 'triangle', gain: 0.045, when: i * 0.24 });
      this.tone({ freq: f * 2, dur: 0.3, type: 'sine', gain: 0.012, when: i * 0.24 });
    });
    [130.81, 146.83, 130.81, 174.61].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.7, type: 'sine', gain: 0.06, when: i * 0.72 });
    });
  }

  wolfHowl() {
    if (!this.ensure()) return;
    this.tone({ freq: 420, freqEnd: 170, dur: 1.5, type: 'sine', gain: 0.055, detune: 8 });
    this.tone({ freq: 620, freqEnd: 250, dur: 1.2, type: 'triangle', gain: 0.018, when: 0.08 });
    this.noiseBurst({ dur: 1.3, type: 'bandpass', freq: 780, freqEnd: 300, q: 4, gain: 0.035 });
  }

  organ() {
    if (!this.ensure()) return;
    [65.41, 98.0, 130.81, 155.56].forEach((f, i) => {
      this.tone({ freq: f, dur: 2.6, type: i % 2 ? 'sine' : 'triangle', gain: 0.07 / (i + 1) });
      this.tone({ freq: f * 2, dur: 1.8, type: 'sine', gain: 0.018, when: 0.08 });
    });
    this.tone({ freq: 32.7, dur: 3.0, type: 'triangle', gain: 0.08 });
  }

  play(cue) {
    const map = {
      thunder_clap: () => this.thunder(),
      thunder: () => this.thunder(),
      rain: () => this.rain(),
      wind: () => this.wind(),
      magic_chime: () => this.magic(),
      door_creak: () => this.doorCreak(),
      heartbeat: () => this.heartbeat(),
      clock_tick: () => this.clockTick(),
      bell: () => this.bell(),
      sword_clash: () => this.sword(),
      crowd_gasp: () => this.gasp(),
      applause: () => this.applause(0.9),
      laugh: () => this.laugh(),
      rose: () => this.rose(),
      waltz: () => this.waltz(),
      wolf_howl: () => this.wolfHowl(),
      organ: () => this.organ(),
    };
    const fn = map[String(cue || '').toLowerCase()];
    if (fn) fn();
  }

  setAmbient(mood = 'none') {
    if (!this.ensure()) return;
    this.ambientMood = mood;
    if (!this.ambientEnabled) {
      if (this.ambientNodes) {
        this.ambientNodes.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.4);
      }
      return;
    }
    const ctx = this.ctx;
    const t = ctx.currentTime;

    if (!this.ambientNodes) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const oscA = ctx.createOscillator();
      const oscB = ctx.createOscillator();
      const oscC = ctx.createOscillator();
      oscA.type = 'sine';
      oscB.type = 'triangle';
      oscC.type = 'sine';
      oscA.connect(filter);
      oscB.connect(filter);
      oscC.connect(filter);
      filter.connect(gain).connect(this.master);
      oscA.start();
      oscB.start();
      oscC.start();
      this.ambientNodes = { gain, filter, oscA, oscB, oscC };
    }

    const { gain, filter, oscA, oscB, oscC } = this.ambientNodes;
    const chords = {
      gothic: [73.42, 110.0, 146.83],
      wonderland: [130.81, 164.81, 196.0],
      tragedy: [55.0, 82.41, 110.0],
      enchanted: [110.0, 164.81, 220.0],
      ballroom: [130.81, 164.81, 196.0],
      horror: [55.0, 77.78, 110.0],
      none: [73.42, 110.0, 146.83],
    };
    const chord = chords[mood] || chords.none;
    oscA.frequency.setTargetAtTime(chord[0], t, 1.2);
    oscB.frequency.setTargetAtTime(chord[1], t, 1.4);
    oscC.frequency.setTargetAtTime(chord[2], t, 1.6);
    filter.frequency.setTargetAtTime(
      mood === 'wonderland' || mood === 'ballroom' ? 1500 : mood === 'tragedy' || mood === 'horror' ? 500 : 780,
      t,
      1,
    );
    const target = mood === 'none' || this.muted ? 0.0001 : 0.009;
    gain.gain.setTargetAtTime(target, t, 0.9);
  }

  setAmbientEnabled(enabled) {
    this.ambientEnabled = !!enabled;
    if (!this.ambientEnabled) {
      if (this.ambientNodes && this.ctx) {
        this.ambientNodes.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.3);
      }
      return;
    }
    this.setAmbient(this.ambientMood === 'none' ? 'gothic' : this.ambientMood);
  }
}

const audio = new AudioEngine();

/* ─────────────────────────────────────────────────────────────────────────────
   03b. VOICE CAST — browser speech synthesis
   ────────────────────────────────────────────────────────────────────────── */

const FEMALE_VOICE_RE = /(female|woman|samantha|victoria|karen|moira|tessa|serena|allison|ava|susan|zira|jenny|aria|salli|joanna|amy|emma|kate|sonia|fiona|veena|lekha|google uk english female)/i;
const MALE_VOICE_RE = /\b(male|man)\b|(daniel|alex|fred|tom|david|mark|george|james|guy|ryan|brian|arthur|oliver|thomas|google uk english male)/i;
const NOVELTY_VOICE_RE = /(bad news|good news|bahh|bells|boing|bubbles|cellos|jester|pipe organ|superstar|trinoids|whisper|wobble|zarvox)/i;

class VoiceEngine {
  constructor() {
    this.supported = typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && 'SpeechSynthesisUtterance' in window;
    this.enabled = this.supported;
    this.volume = 0.95;
    this.rate = 1;
    this.voices = [];
    this.token = 0;
    this.current = null;
    this.lastError = '';
    this.castVoices = new Map();
    this.onVoicesChanged = null;
    if (this.supported) {
      this.loadVoices();
      try {
        window.speechSynthesis.addEventListener('voiceschanged', () => this.loadVoices());
      } catch (_) {
        window.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  loadVoices() {
    if (!this.supported) return;
    const all = window.speechSynthesis.getVoices() || [];
    const english = all.filter((v) => /^en([-_]|$)/i.test(v.lang || ''));
    const pool = english.length ? english : all;
    const usable = pool.filter((v) => !NOVELTY_VOICE_RE.test(v.name || ''));
    const finalPool = usable.length ? usable : pool;
    finalPool.sort((a, b) => Number(b.localService) - Number(a.localService) || String(a.name).localeCompare(String(b.name)));
    this.voices = finalPool;
    if (this.onVoicesChanged) this.onVoicesChanged(this.voices);
  }

  voiceFor(actor) {
    if (actor && this.castVoices.has(actor.id)) return this.castVoices.get(actor.id);
    if (!this.voices.length) return null;
    const female = actor && actor.voiceGender === 'female';
    const re = female ? FEMALE_VOICE_RE : MALE_VOICE_RE;
    const preferred = this.voices.filter((v) => re.test(v.name || ''));
    const pool = preferred.length ? preferred : this.voices;
    const index = actor ? (actor.voiceIndex || 0) : 0;
    return pool[index % pool.length] || null;
  }

  assignCast(actors) {
    this.castVoices.clear();
    if (!this.voices.length) return;
    const used = new Set();
    const list = Array.from(actors || []);
    list.forEach((actor) => {
      const female = actor.voiceGender === 'female';
      const re = female ? FEMALE_VOICE_RE : MALE_VOICE_RE;
      let pool = this.voices.filter((v) => re.test(v.name || ''));
      if (!pool.length) pool = this.voices;
      let chosen = pool.find((v) => !used.has(v.name));
      if (!chosen) chosen = pool[(actor.voiceIndex || 0) % pool.length];
      used.add(chosen.name);
      this.castVoices.set(actor.id, chosen);
    });
  }

  estimateDuration(text, actor) {
    if (!this.enabled || !this.supported || audio.muted) return 0;
    const words = String(text || '').trim().split(/\s+/).filter(Boolean).length || 1;
    const wpm = 168 * (this.rate || 1) * ((actor && actor.voiceRate) || 1);
    const punctuation = (String(text).match(/[.,;:!?—–]/g) || []).length * 0.11;
    return clamp((words / wpm) * 60 + punctuation + 0.35, 1.1, 32);
  }

  speak(text, actor, handlers = {}) {
    if (!this.supported || !this.enabled || audio.muted) return false;
    const clean = String(text || '').trim();
    if (!clean) return false;
    this.cancel();
    this.lastError = '';
    const token = ++this.token;
    const utterance = new window.SpeechSynthesisUtterance(clean);
    const chosen = this.voiceFor(actor);
    if (chosen) utterance.voice = chosen;
    utterance.pitch = clamp((actor && actor.voicePitch) || 1, 0.3, 2);
    utterance.rate = clamp(((actor && actor.voiceRate) || 1) * (this.rate || 1), 0.55, 1.7);
    utterance.volume = clamp(this.volume, 0, 1);
    utterance.onboundary = (event) => {
      if (token !== this.token) return;
      if (handlers.onBoundary) handlers.onBoundary(event.charIndex || 0, event.charLength || 0);
    };
    utterance.onend = () => {
      if (token !== this.token) return;
      if (handlers.onEnd) handlers.onEnd();
    };
    utterance.onerror = (event) => {
      if (token !== this.token) return;
      this.lastError = (event && event.error) || 'speech-error';
      if (handlers.onError) handlers.onError(event);
      else if (handlers.onEnd) handlers.onEnd();
    };
    this.current = utterance;
    try {
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      this.lastError = String(err && err.message || err);
      return false;
    }
    return true;
  }

  cancel() {
    this.token += 1;
    this.current = null;
    if (this.supported) {
      try { window.speechSynthesis.cancel(); } catch (_) { /* noop */ }
    }
  }

  pause() {
    if (!this.supported) return;
    try {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) window.speechSynthesis.pause();
    } catch (_) { /* noop */ }
  }

  resume() {
    if (!this.supported) return;
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch (_) { /* noop */ }
  }

  preview(actor, text = 'The play is the thing.', onEnd = null) {
    const wasEnabled = this.enabled;
    this.enabled = true;
    const ok = this.speak(text, actor, { onEnd });
    this.enabled = wasEnabled;
    return ok;
  }

  prime() {
    if (!this.supported || audio.muted) return false;
    const narrator = { voiceGender: 'male', voiceIndex: 0, voicePitch: 0.86, voiceRate: 0.95 };
    const wasEnabled = this.enabled;
    this.enabled = true;
    const ok = this.speak('Welcome to the Virtual Playhouse.', narrator, {});
    this.enabled = wasEnabled;
    return ok;
  }
}

const voice = new VoiceEngine();


/* ─────────────────────────────────────────────────────────────────────────────
   04. STAGE RENDERER
   ────────────────────────────────────────────────────────────────────────── */

const canvas = $('#stage');
const ctx = canvas.getContext('2d');
let dpr = 1;

const stage = {
  time: 0,
  play: null,
  cast: [],
  actions: [],
  index: 0,
  elapsed: 0,
  duration: 1,
  playing: false,
  speed: 1,
  startDelay: 0,
  actors: new Map(),
  seat: 'front',
  camera: { zoom: 1, tx: 0, ty: 0, skew: 0, rot: 0 },
  cameraTarget: { zoom: 1, tx: 0, ty: 0, skew: 0, rot: 0 },
  curtain: { open: 0, target: 0 },
  light: {
    current: { r: 80, g: 110, b: 255, intensity: 0.42 },
    target: { r: 80, g: 110, b: 255, intensity: 0.42 },
  },
  backdrop: { current: 'gothic_lab', prev: null, mix: 1 },
  ambient: 'none',
  bubble: null,
  caption: '',
  flash: 0,
  shake: 0,
  bolt: null,
  energy: 0.32,
  fxParticles: [],
  reactionParticles: [],
  motes: [],
  fog: [],
  ended: false,
  endTimer: 0,
  endShown: false,
  awaitingEntry: false,
  currentAction: null,
  lastClickChar: 0,
  playingCustom: false,
};

function resizeCanvas() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.aspectRatio = '16 / 9';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ── Backdrop cache ─────────────────────────────────────────────────────── */

const backdropCache = new Map();

function getBackdrop(name) {
  const key = String(name || 'grand_hall');
  if (backdropCache.has(key)) return backdropCache.get(key);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const painter = BACKDROP_PAINTERS[key] || BACKDROP_PAINTERS.grand_hall;
  painter(g);
  backdropCache.set(key, c);
  return c;
}

const BACKDROP_LABELS = {
  gothic_lab: 'Gothic Laboratory',
  tea_garden: 'Tea Party Garden',
  ramparts: 'Castle Ramparts',
  grand_hall: 'Grand Hall',
  fairy_wood: 'The Fairy Wood',
  ballroom: 'Netherfield Ballroom',
  dracula_castle: "Dracula's Castle",
};

function paintGothicLab(g) {
  const rng = mulberry32(0x51a7e);
  const wall = g.createLinearGradient(0, 0, 0, 660);
  wall.addColorStop(0, '#15242a');
  wall.addColorStop(0.5, '#101b20');
  wall.addColorStop(1, '#080f13');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, 660);

  // stone courses
  for (let row = 0; row < 11; row++) {
    const bh = 58;
    const y = 12 + row * bh;
    const offset = row % 2 ? -66 : 0;
    for (let col = 0; col < 14; col++) {
      const x = offset + col * 132;
      const shade = 18 + Math.floor(rng() * 14);
      g.fillStyle = `rgb(${shade + 10},${shade + 22},${shade + 25})`;
      g.fillRect(x + 1, y + 1, 130, bh - 2);
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1;
      g.strokeRect(x + 1.5, y + 1.5, 129, bh - 3);
      if (rng() > 0.72) {
        g.strokeStyle = 'rgba(120,170,170,0.08)';
        g.beginPath();
        g.moveTo(x + 18 + rng() * 40, y + 12);
        g.lineTo(x + 26 + rng() * 50, y + 40);
        g.lineTo(x + 18 + rng() * 60, y + bh - 8);
        g.stroke();
      }
    }
  }

  // huge gothic window
  const wx = 1010;
  const wy = 120;
  const ww = 300;
  const wh = 400;
  g.save();
  g.beginPath();
  g.moveTo(wx, wy + wh);
  g.lineTo(wx, wy + 140);
  g.quadraticCurveTo(wx, wy, wx + ww / 2, wy);
  g.quadraticCurveTo(wx + ww, wy, wx + ww, wy + 140);
  g.lineTo(wx + ww, wy + wh);
  g.closePath();
  const sky = g.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, '#24415a');
  sky.addColorStop(0.55, '#14283b');
  sky.addColorStop(1, '#070d16');
  g.fillStyle = sky;
  g.fill();
  g.clip();
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(150,205,230,${0.05 + rng() * 0.18})`;
    g.lineWidth = 1;
    g.beginPath();
    const x = wx + rng() * ww;
    const y = wy + rng() * wh;
    g.moveTo(x, y);
    g.lineTo(x - 5, y + 20 + rng() * 22);
    g.stroke();
  }
  // lightning silhouette
  g.strokeStyle = 'rgba(160,235,255,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(wx + 210, wy + 40);
  g.lineTo(wx + 188, wy + 120);
  g.lineTo(wx + 205, wy + 126);
  g.lineTo(wx + 176, wy + 220);
  g.stroke();
  g.restore();

  // window frame
  g.strokeStyle = '#2d4247';
  g.lineWidth = 16;
  g.beginPath();
  g.moveTo(wx, wy + wh);
  g.lineTo(wx, wy + 140);
  g.quadraticCurveTo(wx, wy, wx + ww / 2, wy);
  g.quadraticCurveTo(wx + ww, wy, wx + ww, wy + 140);
  g.lineTo(wx + ww, wy + wh);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 4;
  g.stroke();
  g.strokeStyle = '#1b2c31';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(wx + ww / 2, wy + 18);
  g.lineTo(wx + ww / 2, wy + wh);
  g.moveTo(wx + 12, wy + 240);
  g.lineTo(wx + ww - 12, wy + 240);
  g.stroke();

  // arched door at far left
  const dx = 96;
  const dy = 300;
  const dw = 188;
  const dh = 330;
  g.fillStyle = '#2a1a16';
  g.beginPath();
  g.moveTo(dx, dy + dh);
  g.lineTo(dx, dy + 80);
  g.quadraticCurveTo(dx, dy, dx + dw / 2, dy);
  g.quadraticCurveTo(dx + dw, dy, dx + dw, dy + 80);
  g.lineTo(dx + dw, dy + dh);
  g.closePath();
  g.fill();
  g.strokeStyle = '#0d0706';
  g.lineWidth = 12;
  g.stroke();
  g.strokeStyle = 'rgba(120,80,50,0.4)';
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(dx + 20 + i * 36, dy + 26);
    g.lineTo(dx + 20 + i * 36, dy + dh);
    g.stroke();
  }
  g.fillStyle = '#b08a46';
  g.beginPath();
  g.arc(dx + dw - 32, dy + 190, 6, 0, Math.PI * 2);
  g.fill();

  // shelves with specimen jars
  g.fillStyle = '#2b1c18';
  g.fillRect(318, 196, 300, 13);
  g.fillRect(318, 306, 300, 13);
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(318, 209, 300, 8);
  const jarColors = ['#6ad9a5', '#7fc7d8', '#d8b56a', '#c86a8f'];
  for (let i = 0; i < 6; i++) {
    const jx = 330 + i * 47;
    const jh = 34 + rng() * 26;
    const col = jarColors[i % jarColors.length];
    g.fillStyle = 'rgba(190,220,210,0.14)';
    g.fillRect(jx, 300 - jh, 30, jh);
    g.fillStyle = col;
    g.globalAlpha = 0.32;
    g.fillRect(jx + 3, 300 - jh + 10, 24, jh - 12);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(190,220,210,0.3)';
    g.strokeRect(jx, 300 - jh, 30, jh);
    g.fillStyle = '#4b332a';
    g.fillRect(jx - 2, 300 - jh - 6, 34, 7);
    g.beginPath();
    g.arc(jx + 15, 300 - jh + 22, 4 + rng() * 3, 0, Math.PI * 2);
    g.fillStyle = col;
    g.globalAlpha = 0.5;
    g.fill();
    g.globalAlpha = 1;
  }
  // books on second shelf
  for (let i = 0; i < 9; i++) {
    const bx = 326 + i * 31;
    g.fillStyle = ['#5d2b2b', '#3c4a3b', '#4b3b5c'][i % 3];
    g.fillRect(bx, 258 - rng() * 10, 22, 48 + rng() * 10);
    g.fillStyle = 'rgba(214,174,106,0.25)';
    g.fillRect(bx + 3, 266, 16, 2);
  }

  // worktable
  g.fillStyle = '#3a241b';
  g.fillRect(400, 520, 360, 18);
  g.fillStyle = '#241410';
  g.fillRect(420, 538, 16, 120);
  g.fillRect(720, 538, 16, 120);
  // glassware
  const beakers = [
    { x: 450, w: 44, h: 70, col: '#65e0b0' },
    { x: 510, w: 30, h: 52, col: '#7fd0e6' },
    { x: 560, w: 52, h: 84, col: '#d7b25f' },
    { x: 635, w: 34, h: 60, col: '#d06c90' },
  ];
  beakers.forEach((b) => {
    g.fillStyle = 'rgba(200,235,235,0.12)';
    g.fillRect(b.x, 520 - b.h, b.w, b.h);
    g.strokeStyle = 'rgba(200,235,235,0.4)';
    g.lineWidth = 1.5;
    g.strokeRect(b.x, 520 - b.h, b.w, b.h);
    g.fillStyle = b.col;
    g.globalAlpha = 0.45;
    g.fillRect(b.x + 3, 520 - b.h * 0.45, b.w - 6, b.h * 0.45 - 3);
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(b.x + b.w / 2, 520 - b.h * 0.4, 3 + rng() * 2, 0, Math.PI * 2);
    g.fill();
  });
  // candles
  [820, 862].forEach((x, i) => {
    g.fillStyle = '#d9c9a8';
    g.fillRect(x, 486 - i * 12, 9, 34 + i * 12);
    g.fillStyle = '#ffd27a';
    g.beginPath();
    g.ellipse(x + 4.5, 480 - i * 12, 4, 8, 0, 0, Math.PI * 2);
    g.fill();
  });

  // the apparatus — coil rings
  const mx = 860;
  g.strokeStyle = 'rgba(130,200,200,0.4)';
  g.lineWidth = 8;
  g.beginPath();
  g.arc(mx, 300, 78, Math.PI, Math.PI * 2);
  g.stroke();
  g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(mx, 330 + i * 28, 50 - i * 6, Math.PI, Math.PI * 2);
    g.strokeStyle = `rgba(120,200,200,${0.35 - i * 0.04})`;
    g.stroke();
  }
  g.fillStyle = '#1b2b2e';
  g.fillRect(mx - 56, 470, 112, 120);
  g.strokeStyle = 'rgba(130,200,200,0.3)';
  g.strokeRect(mx - 56, 470, 112, 120);
  // glowing orb
  const orb = g.createRadialGradient(mx, 268, 2, mx, 268, 54);
  orb.addColorStop(0, 'rgba(190,255,235,0.95)');
  orb.addColorStop(0.25, 'rgba(90,230,200,0.55)');
  orb.addColorStop(1, 'rgba(60,200,180,0)');
  g.fillStyle = orb;
  g.beginPath();
  g.arc(mx, 268, 54, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#c8fff0';
  g.beginPath();
  g.arc(mx, 268, 8, 0, Math.PI * 2);
  g.fill();

  // operating slab
  g.fillStyle = '#2e3436';
  g.fillRect(1120, 548, 300, 24);
  g.fillStyle = '#1b2022';
  g.fillRect(1140, 572, 20, 86);
  g.fillRect(1380, 572, 20, 86);
  g.strokeStyle = 'rgba(180,200,200,0.16)';
  g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(1140 + i * 58, 552);
    g.lineTo(1140 + i * 58, 568);
    g.stroke();
  }
  // chains
  [[470, 0, 220], [1280, 0, 280], [340, 0, 150]].forEach(([x, y1, y2]) => {
    g.strokeStyle = 'rgba(120,140,140,0.35)';
    g.lineWidth = 3;
    for (let y = y1; y < y2; y += 12) {
      g.beginPath();
      g.ellipse(x + (y % 24 === 0 ? 2 : -2), y + 6, 4, 6, 0, 0, Math.PI * 2);
      g.stroke();
    }
  });
  // pipes
  g.strokeStyle = 'rgba(90,120,120,0.28)';
  g.lineWidth = 10;
  g.beginPath();
  g.moveTo(0, 150);
  g.lineTo(300, 150);
  g.lineTo(300, 120);
  g.lineTo(470, 120);
  g.stroke();
  g.beginPath();
  g.moveTo(1490, 180);
  g.lineTo(1400, 180);
  g.lineTo(1400, 260);
  g.stroke();

  // vignette
  const vg = g.createRadialGradient(W / 2, 380, 220, W / 2, 420, 900);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, 660);
}

function paintTeaGarden(g) {
  const rng = mulberry32(0x7ea9a);
  const sky = g.createLinearGradient(0, 0, 0, 660);
  sky.addColorStop(0, '#2a1538');
  sky.addColorStop(0.32, '#5d2f5c');
  sky.addColorStop(0.62, '#a8566f');
  sky.addColorStop(0.82, '#e7957e');
  sky.addColorStop(1, '#f3c18e');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, 660);

  // sun
  const sun = g.createRadialGradient(800, 330, 10, 800, 330, 260);
  sun.addColorStop(0, 'rgba(255,230,180,0.8)');
  sun.addColorStop(0.3, 'rgba(255,190,150,0.25)');
  sun.addColorStop(1, 'rgba(255,190,150,0)');
  g.fillStyle = sun;
  g.fillRect(400, 80, 800, 560);
  g.fillStyle = 'rgba(255,235,190,0.5)';
  g.beginPath();
  g.arc(800, 330, 52, 0, Math.PI * 2);
  g.fill();

  // clouds
  for (let i = 0; i < 9; i++) {
    const cx = rng() * W;
    const cy = 80 + rng() * 230;
    const cw = 90 + rng() * 180;
    g.fillStyle = `rgba(255,220,215,${0.06 + rng() * 0.08})`;
    g.beginPath();
    g.ellipse(cx, cy, cw, 18 + rng() * 18, 0, 0, Math.PI * 2);
    g.fill();
  }

  // distant hedge line
  g.fillStyle = '#2d3a2c';
  g.beginPath();
  g.moveTo(0, 620);
  for (let x = 0; x <= W; x += 60) {
    g.quadraticCurveTo(x + 30, 520 + Math.sin(x * 0.01) * 34 + rng() * 24, x + 60, 590 + rng() * 16);
  }
  g.lineTo(W, 660);
  g.lineTo(0, 660);
  g.closePath();
  g.fill();

  // giant mushrooms
  function mushroom(x, baseY, h, capW, capColor) {
    g.fillStyle = '#f1ddbd';
    g.beginPath();
    g.moveTo(x - capW * 0.1, baseY);
    g.quadraticCurveTo(x - capW * 0.18, baseY - h * 0.5, x - capW * 0.07, baseY - h);
    g.lineTo(x + capW * 0.07, baseY - h);
    g.quadraticCurveTo(x + capW * 0.18, baseY - h * 0.5, x + capW * 0.1, baseY);
    g.closePath();
    g.fill();
    g.fillStyle = capColor;
    g.beginPath();
    g.ellipse(x, baseY - h, capW * 0.55, capW * 0.3, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 6; i++) {
      const a = Math.PI + rng() * Math.PI;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * capW * 0.3, baseY - h + Math.sin(a) * capW * 0.14, 6 + rng() * 7, 4 + rng() * 5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  mushroom(170, 630, 250, 200, '#c95b78');
  mushroom(300, 640, 130, 120, '#e08a68');
  mushroom(1420, 632, 270, 220, '#b34f84');
  mushroom(1290, 646, 120, 110, '#e0a15f');
  mushroom(1120, 650, 88, 84, '#d9788f');

  // crooked trees
  function tree(x, flip = 1) {
    g.save();
    g.translate(x, 650);
    g.scale(flip, 1);
    g.strokeStyle = '#3c2433';
    g.lineCap = 'round';
    g.lineWidth = 26;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-30, -150, 18, -270);
    g.quadraticCurveTo(52, -370, 4, -450);
    g.stroke();
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(8, -250);
    g.quadraticCurveTo(-100, -310, -140, -400);
    g.moveTo(16, -330);
    g.quadraticCurveTo(110, -380, 130, -460);
    g.stroke();
    // spiral canopy
    for (let i = 0; i < 4; i++) {
      g.fillStyle = `rgba(${90 + i * 18},${150 + i * 12},${120 + i * 10},0.22)`;
      g.beginPath();
      g.arc(-20 + i * 42, -430 - i * 20, 70 - i * 10, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  tree(60, 1);
  tree(1540, -1);

  // bunting
  g.strokeStyle = 'rgba(255,230,200,0.35)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(120, 100);
  g.quadraticCurveTo(800, 200, 1480, 100);
  g.stroke();
  const buntColors = ['#e05a78', '#f2c14e', '#8fd6c2', '#c78bd6'];
  for (let i = 0; i < 15; i++) {
    const t = i / 14;
    const x = lerp(120, 1480, t);
    const y = 100 + Math.sin(t * Math.PI) * 98;
    g.fillStyle = buntColors[i % buntColors.length];
    g.beginPath();
    g.moveTo(x - 14, y);
    g.lineTo(x + 14, y);
    g.lineTo(x, y + 28);
    g.closePath();
    g.fill();
  }

  // hanging lanterns
  function lantern(x, y, color) {
    g.strokeStyle = 'rgba(255,220,180,0.28)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, y);
    g.stroke();
    const glow = g.createRadialGradient(x, y + 14, 2, x, y + 14, 54);
    glow.addColorStop(0, color.replace('1)', '0.55)'));
    glow.addColorStop(1, color.replace('1)', '0)'));
    g.fillStyle = glow;
    g.beginPath();
    g.arc(x, y + 14, 54, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(x, y + 14, 16, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(80,40,40,0.45)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = '#3b2330';
    g.fillRect(x - 12, y - 4, 24, 5);
    g.fillRect(x - 9, y + 34, 18, 4);
  }
  lantern(340, 160, 'rgba(255,190,120,1)');
  lantern(800, 120, 'rgba(255,160,190,1)');
  lantern(1260, 170, 'rgba(160,230,210,1)');

  // tea table
  const tx = 620;
  const ty = 520;
  const tw = 380;
  g.fillStyle = '#f7ead3';
  g.beginPath();
  g.moveTo(tx, ty);
  g.lineTo(tx + tw, ty);
  g.lineTo(tx + tw + 22, ty + 86);
  g.lineTo(tx - 22, ty + 86);
  g.closePath();
  g.fill();
  g.save();
  g.beginPath();
  g.moveTo(tx, ty);
  g.lineTo(tx + tw, ty);
  g.lineTo(tx + tw + 22, ty + 86);
  g.lineTo(tx - 22, ty + 86);
  g.closePath();
  g.clip();
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) {
        g.fillStyle = 'rgba(205,85,105,0.55)';
        g.fillRect(tx - 30 + c * 58, ty + r * 22, 58, 22);
      }
    }
  }
  g.restore();
  g.strokeStyle = 'rgba(120,70,60,0.3)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(tx, ty);
  g.lineTo(tx + tw, ty);
  g.stroke();
  // table legs
  g.fillStyle = '#5b3540';
  g.fillRect(tx + 24, ty + 86, 16, 60);
  g.fillRect(tx + tw - 40, ty + 86, 16, 60);
  // teapot & cups
  g.fillStyle = '#f2e5cf';
  g.beginPath();
  g.ellipse(760, 500, 34, 26, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(760, 480, 20, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f2e5cf';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(798, 498, 16, -1.2, 1.2);
  g.stroke();
  g.beginPath();
  g.arc(760, 470, 6, 0, Math.PI * 2);
  g.fillStyle = '#e0a15f';
  g.fill();
  for (let i = 0; i < 4; i++) {
    const cx = 680 + i * 80;
    const cy = 512 + (i % 2) * 12;
    g.fillStyle = '#f8eeda';
    g.beginPath();
    g.ellipse(cx, cy, 14, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(180,120,90,0.5)';
    g.beginPath();
    g.ellipse(cx, cy - 4, 10, 4, 0, 0, Math.PI * 2);
    g.fill();
  }
  // cake
  g.fillStyle = '#e7b7c6';
  g.fillRect(890, 470, 54, 44);
  g.fillStyle = '#f8e9ea';
  g.beginPath();
  g.ellipse(917, 470, 27, 10, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d65a78';
  g.beginPath();
  g.arc(917, 458, 6, 0, Math.PI * 2);
  g.fill();

  // chairs silhouettes
  g.fillStyle = 'rgba(60,35,50,0.75)';
  [580, 1020].forEach((x) => {
    g.fillRect(x, 500, 10, 140);
    g.fillRect(x, 500, 54, 10);
    g.fillRect(x + 44, 500, 10, 120);
  });

  // foreground flowers
  for (let i = 0; i < 30; i++) {
    const x = rng() * W;
    const y = 620 + rng() * 30;
    g.strokeStyle = 'rgba(90,140,90,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y + 14);
    g.lineTo(x, y);
    g.stroke();
    g.fillStyle = ['#f3a6bb', '#f6d06e', '#c9a6f3', '#fff0d0'][i % 4];
    g.beginPath();
    g.arc(x, y - 2, 4 + rng() * 3, 0, Math.PI * 2);
    g.fill();
  }

  const vg = g.createRadialGradient(W / 2, 380, 250, W / 2, 420, 900);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(30,8,30,0.45)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, 660);
}

function paintRamparts(g) {
  const rng = mulberry32(0x9a4d1);
  const sky = g.createLinearGradient(0, 0, 0, 660);
  sky.addColorStop(0, '#040716');
  sky.addColorStop(0.45, '#0d1533');
  sky.addColorStop(0.78, '#202c52');
  sky.addColorStop(1, '#3a4468');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, 660);

  // stars
  for (let i = 0; i < 170; i++) {
    const x = rng() * W;
    const y = rng() * 470;
    const r = rng() * 1.8 + 0.3;
    g.fillStyle = `rgba(230,240,255,${0.25 + rng() * 0.65})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // moon
  const moonX = 1190;
  const moonY = 170;
  const moonGlow = g.createRadialGradient(moonX, moonY, 20, moonX, moonY, 240);
  moonGlow.addColorStop(0, 'rgba(240,235,200,0.28)');
  moonGlow.addColorStop(1, 'rgba(240,235,200,0)');
  g.fillStyle = moonGlow;
  g.fillRect(moonX - 240, moonY - 240, 480, 480);
  g.fillStyle = '#f2e8c8';
  g.beginPath();
  g.arc(moonX, moonY, 56, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(200,190,160,0.25)';
  [[-18, -12, 12], [16, 8, 9], [4, 28, 6], [-6, 18, 4]].forEach(([dx, dy, r]) => {
    g.beginPath();
    g.arc(moonX + dx, moonY + dy, r, 0, Math.PI * 2);
    g.fill();
  });

  // clouds
  for (let i = 0; i < 8; i++) {
    const cx = rng() * W;
    const cy = 80 + rng() * 260;
    g.fillStyle = `rgba(120,140,190,${0.04 + rng() * 0.06})`;
    g.beginPath();
    g.ellipse(cx, cy, 100 + rng() * 160, 14 + rng() * 20, 0, 0, Math.PI * 2);
    g.fill();
  }

  // distant mountains
  g.fillStyle = '#0a1124';
  g.beginPath();
  g.moveTo(0, 620);
  for (let x = 0; x <= W; x += 80) {
    g.lineTo(x, 470 + Math.sin(x * 0.006) * 70 + rng() * 30);
  }
  g.lineTo(W, 660);
  g.lineTo(0, 660);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(40,55,90,0.55)';
  g.beginPath();
  g.moveTo(0, 620);
  for (let x = 0; x <= W; x += 70) {
    g.lineTo(x, 540 + Math.sin(x * 0.008 + 2) * 46 + rng() * 20);
  }
  g.lineTo(W, 660);
  g.lineTo(0, 660);
  g.closePath();
  g.fill();

  // distant castle
  g.fillStyle = '#060a17';
  g.fillRect(80, 420, 260, 220);
  g.beginPath();
  g.moveTo(60, 430);
  g.lineTo(120, 340);
  g.lineTo(180, 430);
  g.closePath();
  g.fill();
  g.beginPath();
  g.moveTo(210, 430);
  g.lineTo(280, 360);
  g.lineTo(350, 430);
  g.closePath();
  g.fill();
  g.fillRect(250, 300, 46, 140);
  g.beginPath();
  g.moveTo(240, 305);
  g.lineTo(273, 240);
  g.lineTo(306, 305);
  g.closePath();
  g.fill();
  for (let i = 0; i < 7; i++) {
    g.fillStyle = 'rgba(255,190,100,0.5)';
    g.fillRect(110 + i * 32, 470 + (i % 3) * 40, 8, 14);
  }

  // crenellated wall
  const wallTop = 548;
  g.fillStyle = '#1b2237';
  g.fillRect(0, wallTop, W, 112);
  for (let x = 0; x < W; x += 96) {
    g.fillStyle = '#1b2237';
    g.fillRect(x, wallTop - 42, 54, 44);
    g.fillStyle = '#252e47';
    g.fillRect(x + 4, wallTop - 38, 46, 6);
  }
  // stone courses
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 18; col++) {
      const x = (row % 2 ? -60 : 0) + col * 96;
      g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.strokeRect(x + 1, wallTop + row * 54 + 1, 94, 52);
      g.fillStyle = `rgba(255,255,255,${0.015 + rng() * 0.02})`;
      g.fillRect(x + 1, wallTop + row * 54 + 1, 94, 52);
    }
  }
  // wall top highlight
  g.fillStyle = 'rgba(160,180,230,0.16)';
  g.fillRect(0, wallTop, W, 4);

  // torches
  function torch(x, y) {
    g.fillStyle = '#2a2230';
    g.fillRect(x - 5, y, 10, 78);
    g.fillStyle = '#6b4a2a';
    g.beginPath();
    g.moveTo(x - 18, y);
    g.lineTo(x + 18, y);
    g.lineTo(x + 10, y + 24);
    g.lineTo(x - 10, y + 24);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffb15c';
    g.beginPath();
    g.ellipse(x, y - 12, 12, 24, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffe6a8';
    g.beginPath();
    g.ellipse(x, y - 8, 6, 13, 0, 0, Math.PI * 2);
    g.fill();
  }
  torch(330, 430);
  torch(800, 410);
  torch(1300, 430);

  // banners
  function banner(x, y, color, sigil) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x - 34, y);
    g.lineTo(x + 34, y);
    g.lineTo(x + 34, y + 150);
    g.lineTo(x, y + 178);
    g.lineTo(x - 34, y + 150);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(230,200,140,0.55)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = 'rgba(240,220,170,0.75)';
    g.font = '28px serif';
    g.textAlign = 'center';
    g.fillText(sigil, x, y + 92);
  }
  banner(500, 250, '#5c1628', '♛');
  banner(1050, 250, '#1f3050', '✦');

  // fog band
  const fog = g.createLinearGradient(0, 560, 0, 660);
  fog.addColorStop(0, 'rgba(120,150,190,0)');
  fog.addColorStop(0.6, 'rgba(120,150,190,0.12)');
  fog.addColorStop(1, 'rgba(120,150,190,0.03)');
  g.fillStyle = fog;
  g.fillRect(0, 540, W, 120);

  const vg = g.createRadialGradient(W / 2, 340, 240, W / 2, 400, 920);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,10,0.6)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, 660);
}

function paintGrandHall(g) {
  const rng = mulberry32(0x4c21f);
  const wall = g.createLinearGradient(0, 0, 0, 660);
  wall.addColorStop(0, '#241018');
  wall.addColorStop(0.6, '#180b12');
  wall.addColorStop(1, '#0c0609');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, 660);
  // columns
  for (let i = 0; i < 5; i++) {
    const x = 120 + i * 340;
    const col = g.createLinearGradient(x - 40, 0, x + 40, 0);
    col.addColorStop(0, '#2b1720');
    col.addColorStop(0.45, '#5a3a3a');
    col.addColorStop(0.55, '#3d2428');
    col.addColorStop(1, '#1a0d12');
    g.fillStyle = col;
    g.fillRect(x - 38, 80, 76, 560);
    g.fillStyle = '#6b4a3a';
    g.fillRect(x - 52, 66, 104, 24);
    g.fillRect(x - 52, 624, 104, 26);
    g.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let f = 0; f < 5; f++) {
      g.beginPath();
      g.moveTo(x - 26 + f * 13, 96);
      g.lineTo(x - 26 + f * 13, 616);
      g.stroke();
    }
  }
  // drapes
  g.fillStyle = 'rgba(92,16,36,0.65)';
  [0, W - 180].forEach((x) => {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 180, 0);
    for (let y = 0; y <= 660; y += 60) {
      g.lineTo(x + 180 - Math.sin(y * 0.02) * 26, y);
    }
    g.lineTo(x, 660);
    g.closePath();
    g.fill();
  });
  // central arched alcove
  const ax = 570;
  const ay = 120;
  const aw = 460;
  const ah = 420;
  g.save();
  g.beginPath();
  g.moveTo(ax, ay + ah);
  g.lineTo(ax, ay + 120);
  g.quadraticCurveTo(ax, ay, ax + aw / 2, ay);
  g.quadraticCurveTo(ax + aw, ay, ax + aw, ay + 120);
  g.lineTo(ax + aw, ay + ah);
  g.closePath();
  const alcove = g.createLinearGradient(0, ay, 0, ay + ah);
  alcove.addColorStop(0, '#3a1c2c');
  alcove.addColorStop(0.55, '#1d0d18');
  alcove.addColorStop(1, '#0d060b');
  g.fillStyle = alcove;
  g.fill();
  g.strokeStyle = 'rgba(214,174,106,0.42)';
  g.lineWidth = 5;
  g.stroke();
  g.clip();
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = `rgba(214,174,106,${0.08 + i * 0.02})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(ax + aw / 2, ay + ah * 0.82, 60 + i * 34, Math.PI, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  // alcove pilasters
  [ax - 14, ax + aw - 14].forEach((px) => {
    const grad = g.createLinearGradient(px, 0, px + 28, 0);
    grad.addColorStop(0, '#5a3a22');
    grad.addColorStop(0.5, '#d6ae6a');
    grad.addColorStop(1, '#4a2c1a');
    g.fillStyle = grad;
    g.fillRect(px, ay + 60, 28, ah - 60);
  });

  // wainscoting
  g.fillStyle = 'rgba(70,35,32,0.55)';
  g.fillRect(0, 520, W, 130);
  g.strokeStyle = 'rgba(214,174,106,0.18)';
  g.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const px = 30 + i * 132;
    g.strokeRect(px, 536, 108, 92);
    g.strokeRect(px + 10, 546, 88, 72);
  }
  g.strokeStyle = 'rgba(214,174,106,0.4)';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, 520);
  g.lineTo(W, 520);
  g.stroke();

  // sconces
  [220, 1380].forEach((sx) => {
    const glow = g.createRadialGradient(sx, 330, 4, sx, 330, 110);
    glow.addColorStop(0, 'rgba(255,196,110,0.3)');
    glow.addColorStop(1, 'rgba(255,196,110,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(sx, 330, 110, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d6ae6a';
    g.fillRect(sx - 3, 330, 6, 70);
    for (let i = -1; i <= 1; i++) {
      g.fillStyle = '#ffe2a0';
      g.beginPath();
      g.ellipse(sx + i * 18, 322, 4, 9, 0, 0, Math.PI * 2);
      g.fill();
    }
  });

  // chandelier
  g.strokeStyle = 'rgba(214,174,106,0.4)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(800, 0);
  g.lineTo(800, 150);
  g.stroke();
  g.fillStyle = 'rgba(214,174,106,0.55)';
  g.beginPath();
  g.ellipse(800, 175, 120, 34, 0, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 9; i++) {
    const x = 700 + i * 25;
    g.fillStyle = '#ffe2a0';
    g.beginPath();
    g.arc(x, 168 - (i % 2) * 8, 4, 0, Math.PI * 2);
    g.fill();
  }
  const vg = g.createRadialGradient(W / 2, 380, 220, W / 2, 420, 900);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, 660);
}

function paintFairyWood(g) {
  const rng = mulberry32(0x51fae);
  const sky = g.createLinearGradient(0, 0, 0, 660);
  sky.addColorStop(0, '#06121c');
  sky.addColorStop(0.42, '#102a35');
  sky.addColorStop(0.72, '#26334d');
  sky.addColorStop(1, '#4a3458');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, 660);

  // stars
  for (let i = 0; i < 110; i++) {
    const x = rng() * W;
    const y = rng() * 430;
    g.fillStyle = `rgba(220,245,235,${0.18 + rng() * 0.55})`;
    g.beginPath();
    g.arc(x, y, rng() * 1.6 + 0.3, 0, Math.PI * 2);
    g.fill();
  }

  // moon
  const moonX = 1190;
  const moonY = 145;
  const glow = g.createRadialGradient(moonX, moonY, 20, moonX, moonY, 250);
  glow.addColorStop(0, 'rgba(200,255,230,0.3)');
  glow.addColorStop(1, 'rgba(200,255,230,0)');
  g.fillStyle = glow;
  g.fillRect(moonX - 260, moonY - 260, 520, 520);
  g.fillStyle = '#d9f5dc';
  g.beginPath();
  g.arc(moonX, moonY, 52, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(140,190,170,0.22)';
  [[-16, -10, 10], [12, 12, 7], [4, 28, 5]].forEach(([dx, dy, r]) => {
    g.beginPath();
    g.arc(moonX + dx, moonY + dy, r, 0, Math.PI * 2);
    g.fill();
  });

  // distant tree line
  g.fillStyle = '#08171c';
  g.beginPath();
  g.moveTo(0, 620);
  for (let x = 0; x <= W; x += 44) {
    g.lineTo(x, 500 + Math.sin(x * 0.012) * 34 + rng() * 24);
  }
  g.lineTo(W, 660);
  g.lineTo(0, 660);
  g.closePath();
  g.fill();

  // giant trees
  function tree(x, scale, flip) {
    g.save();
    g.translate(x, 660);
    g.scale(flip * scale, scale);
    g.strokeStyle = '#1d1518';
    g.lineCap = 'round';
    g.lineWidth = 46;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-30, -150, 22, -300);
    g.quadraticCurveTo(70, -430, 8, -560);
    g.stroke();
    g.lineWidth = 20;
    g.beginPath();
    g.moveTo(14, -280);
    g.quadraticCurveTo(-110, -350, -170, -450);
    g.moveTo(20, -370);
    g.quadraticCurveTo(120, -430, 170, -540);
    g.moveTo(10, -470);
    g.quadraticCurveTo(-60, -540, -90, -610);
    g.stroke();
    // roots
    g.lineWidth = 18;
    g.beginPath();
    g.moveTo(0, -10);
    g.quadraticCurveTo(-70, -30, -120, 10);
    g.moveTo(0, -10);
    g.quadraticCurveTo(70, -30, 130, 12);
    g.stroke();
    // canopy
    const canopy = ['rgba(40,90,70,0.55)', 'rgba(55,120,90,0.42)', 'rgba(70,140,110,0.28)'];
    for (let i = 0; i < 5; i++) {
      g.fillStyle = canopy[i % canopy.length];
      g.beginPath();
      g.arc(-40 + i * 38, -540 - (i % 3) * 40, 90 - i * 8, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
  tree(80, 1.1, 1);
  tree(1540, 1.15, -1);
  tree(330, 0.6, 1);
  tree(1280, 0.55, -1);

  // hanging vines
  for (let i = 0; i < 18; i++) {
    const x = rng() * W;
    const len = 80 + rng() * 260;
    g.strokeStyle = `rgba(80,150,110,${0.18 + rng() * 0.25})`;
    g.lineWidth = 2 + rng() * 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.quadraticCurveTo(x + Math.sin(i) * 20, len * 0.5, x + Math.sin(i * 2) * 12, len);
    g.stroke();
    for (let j = 0; j < 5; j++) {
      const y = (j / 5) * len;
      g.fillStyle = `rgba(100,190,140,${0.12 + rng() * 0.15})`;
      g.beginPath();
      g.ellipse(x + Math.sin(i + j) * 8, y, 5, 10, 0.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  // mushrooms
  function mushroom(x, baseY, h, capW, capColor) {
    g.fillStyle = 'rgba(230,220,190,0.75)';
    g.beginPath();
    g.moveTo(x - capW * 0.07, baseY);
    g.quadraticCurveTo(x - capW * 0.13, baseY - h * 0.5, x - capW * 0.04, baseY - h);
    g.lineTo(x + capW * 0.04, baseY - h);
    g.quadraticCurveTo(x + capW * 0.13, baseY - h * 0.5, x + capW * 0.07, baseY);
    g.closePath();
    g.fill();
    g.fillStyle = capColor;
    g.beginPath();
    g.ellipse(x, baseY - h, capW * 0.55, capW * 0.3, 0, Math.PI, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(230,255,235,0.55)';
    for (let i = 0; i < 5; i++) {
      const a = Math.PI + rng() * Math.PI;
      g.beginPath();
      g.ellipse(x + Math.cos(a) * capW * 0.28, baseY - h + Math.sin(a) * capW * 0.13, 4 + rng() * 5, 3 + rng() * 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  mushroom(260, 648, 150, 120, '#7fc9a3');
  mushroom(1360, 650, 170, 140, '#6fb9a8');
  mushroom(1210, 654, 90, 80, '#c78bd6');

  // ferns
  for (let i = 0; i < 40; i++) {
    const x = rng() * W;
    const y = 620 + rng() * 40;
    g.strokeStyle = `rgba(90,170,120,${0.25 + rng() * 0.3})`;
    g.lineWidth = 2;
    for (let j = 0; j < 4; j++) {
      const a = -Math.PI / 2 + (j - 1.5) * 0.35;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a) * 18, y + Math.sin(a) * 28, x + Math.cos(a) * 32, y + Math.sin(a) * 42);
      g.stroke();
    }
  }

  // fairy ring
  g.strokeStyle = 'rgba(180,255,210,0.15)';
  g.lineWidth = 3;
  g.beginPath();
  g.ellipse(800, 700, 220, 48, 0, 0, Math.PI * 2);
  g.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.fillStyle = `rgba(190,255,215,${0.2 + rng() * 0.3})`;
    g.beginPath();
    g.arc(800 + Math.cos(a) * 220, 700 + Math.sin(a) * 48, 1.6, 0, Math.PI * 2);
    g.fill();
  }

  const vg = g.createRadialGradient(W / 2, 380, 240, W / 2, 420, 900);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,8,12,0.6)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, 660);
}

function paintBallroom(g) {
  const rng = mulberry32(0xba11);
  const wall = g.createLinearGradient(0, 0, 0, 660);
  wall.addColorStop(0, '#3a211b');
  wall.addColorStop(0.5, '#4a2a22');
  wall.addColorStop(1, '#2a1512');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, 660);

  // wall panels
  for (let i = 0; i < 6; i++) {
    const x = 80 + i * 250;
    g.fillStyle = 'rgba(255,220,170,0.035)';
    g.fillRect(x, 90, 210, 440);
    g.strokeStyle = 'rgba(214,174,106,0.22)';
    g.lineWidth = 2;
    g.strokeRect(x, 90, 210, 440);
    g.strokeStyle = 'rgba(214,174,106,0.12)';
    g.strokeRect(x + 14, 104, 182, 412);
  }

  // tall windows
  function windowAt(x, w, h) {
    const y = 100;
    g.save();
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + 90);
    g.quadraticCurveTo(x, y, x + w / 2, y);
    g.quadraticCurveTo(x + w, y, x + w, y + 90);
    g.lineTo(x + w, y + h);
    g.closePath();
    const night = g.createLinearGradient(0, y, 0, y + h);
    night.addColorStop(0, '#1a2a4a');
    night.addColorStop(1, '#070d1c');
    g.fillStyle = night;
    g.fill();
    g.clip();
    g.fillStyle = 'rgba(240,235,200,0.75)';
    g.beginPath();
    g.arc(x + w * 0.7, y + 100, 30, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `rgba(230,240,255,${0.2 + rng() * 0.5})`;
      g.beginPath();
      g.arc(x + rng() * w, y + rng() * h, 1.2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.strokeStyle = '#8d6f3f';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(x, y + h);
    g.lineTo(x, y + 90);
    g.quadraticCurveTo(x, y, x + w / 2, y);
    g.quadraticCurveTo(x + w, y, x + w, y + 90);
    g.lineTo(x + w, y + h);
    g.stroke();
    g.strokeStyle = 'rgba(214,174,106,0.4)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x + w / 2, y + 8);
    g.lineTo(x + w / 2, y + h);
    g.moveTo(x, y + h * 0.6);
    g.lineTo(x + w, y + h * 0.6);
    g.stroke();
    // drape
    g.fillStyle = 'rgba(100,20,40,0.55)';
    g.beginPath();
    g.moveTo(x - 20, y - 10);
    g.lineTo(x + 34, y - 10);
    for (let yy = 0; yy <= h; yy += 50) {
      g.lineTo(x + 34 - Math.sin(yy * 0.03) * 18, y + yy);
    }
    g.lineTo(x - 20, y + h);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(100,20,40,0.55)';
    g.beginPath();
    g.moveTo(x + w + 20, y - 10);
    g.lineTo(x + w - 34, y - 10);
    for (let yy = 0; yy <= h; yy += 50) {
      g.lineTo(x + w - 34 + Math.sin(yy * 0.03) * 18, y + yy);
    }
    g.lineTo(x + w + 20, y + h);
    g.closePath();
    g.fill();
  }
  windowAt(250, 180, 430);
  windowAt(1170, 180, 430);

  // columns
  [150, 1450].forEach((cx) => {
    const grad = g.createLinearGradient(cx - 30, 0, cx + 30, 0);
    grad.addColorStop(0, '#6b4a2a');
    grad.addColorStop(0.45, '#f0d49a');
    grad.addColorStop(0.6, '#c9a15b');
    grad.addColorStop(1, '#4a2c1a');
    g.fillStyle = grad;
    g.fillRect(cx - 28, 70, 56, 580);
    g.fillStyle = '#d6ae6a';
    g.fillRect(cx - 42, 58, 84, 20);
    g.fillRect(cx - 40, 636, 80, 24);
    g.strokeStyle = 'rgba(80,50,20,0.3)';
    g.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(cx + i * 10, 86);
      g.lineTo(cx + i * 10, 628);
      g.stroke();
    }
  });

  // chandeliers
  function chandelier(cx, cy, scale) {
    g.strokeStyle = 'rgba(214,174,106,0.5)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, 0);
    g.lineTo(cx, cy - 20 * scale);
    g.stroke();
    const glow = g.createRadialGradient(cx, cy, 4, cx, cy, 130 * scale);
    glow.addColorStop(0, 'rgba(255,220,150,0.22)');
    glow.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(cx, cy, 130 * scale, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(214,174,106,0.65)';
    g.beginPath();
    g.ellipse(cx, cy, 80 * scale, 20 * scale, 0, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const x = cx + Math.cos(a) * 64 * scale;
      const y = cy + Math.sin(a) * 14 * scale;
      g.fillStyle = '#ffe8b0';
      g.beginPath();
      g.arc(x, y - 8 * scale, 4 * scale, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(214,174,106,0.5)';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - 18 * scale);
      g.stroke();
    }
  }
  chandelier(800, 170, 1.1);
  chandelier(480, 140, 0.75);
  chandelier(1120, 140, 0.75);

  // sconces
  [80, 1520].forEach((sx) => {
    const glow = g.createRadialGradient(sx, 300, 2, sx, 300, 80);
    glow.addColorStop(0, 'rgba(255,210,140,0.28)');
    glow.addColorStop(1, 'rgba(255,210,140,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(sx, 300, 80, 0, Math.PI * 2);
    g.fill();
  });

  // floral urns
  [70, 1530].forEach((x) => {
    g.fillStyle = '#3b2614';
    g.fillRect(x - 24, 560, 48, 70);
    g.fillStyle = '#d6ae6a';
    g.fillRect(x - 28, 556, 56, 8);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = ['#e7a9b8', '#f6ead0', '#c9a7ff'][i % 3];
      g.beginPath();
      g.arc(x - 18 + rng() * 36, 530 + rng() * 26, 4 + rng() * 4, 0, Math.PI * 2);
      g.fill();
    }
  });

  const vg = g.createRadialGradient(W / 2, 380, 240, W / 2, 420, 900);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,6,8,0.48)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, 660);
}

function paintDraculaCastle(g) {
  const rng = mulberry32(0xdac1a);
  const wall = g.createLinearGradient(0, 0, 0, 660);
  wall.addColorStop(0, '#0d0812');
  wall.addColorStop(0.5, '#1b0d17');
  wall.addColorStop(1, '#0a0509');
  g.fillStyle = wall;
  g.fillRect(0, 0, W, 660);

  // stone blocks
  for (let row = 0; row < 11; row++) {
    const bh = 58;
    const y = 10 + row * bh;
    const offset = row % 2 ? -60 : 0;
    for (let col = 0; col < 15; col++) {
      const x = offset + col * 120;
      const shade = 12 + Math.floor(rng() * 12);
      g.fillStyle = `rgb(${shade + 8},${shade + 4},${shade + 8})`;
      g.fillRect(x + 1, y + 1, 118, bh - 2);
      g.strokeStyle = 'rgba(0,0,0,0.4)';
      g.strokeRect(x + 1.5, y + 1.5, 117, bh - 3);
    }
  }

  // great window
  const wx = 930;
  const wy = 100;
  const ww = 300;
  const wh = 420;
  g.save();
  g.beginPath();
  g.moveTo(wx, wy + wh);
  g.lineTo(wx, wy + 130);
  g.quadraticCurveTo(wx, wy, wx + ww / 2, wy);
  g.quadraticCurveTo(wx + ww, wy, wx + ww, wy + 130);
  g.lineTo(wx + ww, wy + wh);
  g.closePath();
  const night = g.createLinearGradient(0, wy, 0, wy + wh);
  night.addColorStop(0, '#1a2448');
  night.addColorStop(0.55, '#0c1226');
  night.addColorStop(1, '#05070f');
  g.fillStyle = night;
  g.fill();
  g.clip();
  const moon = g.createRadialGradient(wx + 220, wy + 110, 8, wx + 220, wy + 110, 80);
  moon.addColorStop(0, 'rgba(240,235,200,0.75)');
  moon.addColorStop(1, 'rgba(240,235,200,0)');
  g.fillStyle = moon;
  g.beginPath();
  g.arc(wx + 220, wy + 110, 80, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#f0e8c8';
  g.beginPath();
  g.arc(wx + 220, wy + 110, 34, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(230,240,255,${0.15 + rng() * 0.5})`;
    g.beginPath();
    g.arc(wx + rng() * ww, wy + rng() * wh, rng() * 1.5 + 0.3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  g.strokeStyle = '#2a2230';
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(wx, wy + wh);
  g.lineTo(wx, wy + 130);
  g.quadraticCurveTo(wx, wy, wx + ww / 2, wy);
  g.quadraticCurveTo(wx + ww, wy, wx + ww, wy + 130);
  g.lineTo(wx + ww, wy + wh);
  g.stroke();
  g.strokeStyle = '#1a1520';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(wx + ww / 2, wy + 10);
  g.lineTo(wx + ww / 2, wy + wh);
  g.moveTo(wx + 10, wy + 260);
  g.lineTo(wx + ww - 10, wy + 260);
  g.stroke();

  // red drapes
  [wx - 30, wx + ww + 30].forEach((dx, side) => {
    g.fillStyle = '#5c0f1f';
    g.beginPath();
    g.moveTo(dx, wy - 20);
    g.lineTo(dx + (side ? 100 : -100), wy - 20);
    for (let y = 0; y <= wh; y += 40) {
      g.lineTo(dx + (side ? 100 : -100) - Math.sin(y * 0.04) * 22, wy + y);
    }
    g.lineTo(dx, wy + wh);
    g.closePath();
    g.fill();
  });

  // staircase
  g.fillStyle = '#211720';
  g.beginPath();
  g.moveTo(650, 660);
  g.lineTo(650, 610);
  for (let i = 0; i < 9; i++) {
    const y = 610 - i * 34;
    const inset = i * 18;
    g.lineTo(660 + inset, y);
    g.lineTo(660 + inset, y - 34);
  }
  g.lineTo(820, 280);
  g.lineTo(980, 280);
  for (let i = 8; i >= 0; i--) {
    const y = 610 - i * 34;
    const inset = i * 18;
    g.lineTo(960 - inset, y);
    g.lineTo(960 - inset, y - 34);
  }
  g.lineTo(970, 660);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(214,174,106,0.2)';
  g.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const y = 610 - i * 34;
    g.beginPath();
    g.moveTo(660 + i * 18, y);
    g.lineTo(960 - i * 18, y);
    g.stroke();
  }
  // banisters
  g.strokeStyle = '#4a2c1a';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(650, 610);
  g.lineTo(820, 280);
  g.moveTo(970, 610);
  g.lineTo(980, 280);
  g.stroke();

  // candelabras
  [250, 1330].forEach((cx) => {
    const glow = g.createRadialGradient(cx, 420, 4, cx, 420, 130);
    glow.addColorStop(0, 'rgba(255,170,90,0.22)');
    glow.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(cx, 420, 130, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#3b2614';
    g.lineWidth = 8;
    g.beginPath();
    g.moveTo(cx, 420);
    g.lineTo(cx, 620);
    g.stroke();
    g.fillStyle = '#d6ae6a';
    g.fillRect(cx - 40, 414, 80, 8);
    for (let i = -2; i <= 2; i++) {
      g.fillStyle = '#f6ead0';
      g.fillRect(cx + i * 18 - 2, 384, 4, 30);
      g.fillStyle = '#ffb15c';
      g.beginPath();
      g.ellipse(cx + i * 18, 378, 4, 8, 0, 0, Math.PI * 2);
      g.fill();
    }
  });

  // fireplace
  g.fillStyle = '#0b070c';
  g.fillRect(80, 400, 260, 240);
  g.fillStyle = '#2a1c1a';
  g.fillRect(60, 390, 300, 26);
  const fire = g.createRadialGradient(210, 590, 4, 210, 590, 120);
  fire.addColorStop(0, 'rgba(255,140,60,0.4)');
  fire.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = fire;
  g.beginPath();
  g.arc(210, 590, 120, 0, Math.PI * 2);
  g.fill();

  // portrait
  g.fillStyle = '#2a1c1a';
  g.fillRect(460, 170, 150, 210);
  g.strokeStyle = '#8d6f3f';
  g.lineWidth = 6;
  g.strokeRect(460, 170, 150, 210);
  const portrait = g.createLinearGradient(0, 180, 0, 370);
  portrait.addColorStop(0, '#3b2a3a');
  portrait.addColorStop(1, '#120a10');
  g.fillStyle = portrait;
  g.fillRect(470, 180, 130, 190);
  g.fillStyle = 'rgba(210,200,190,0.5)';
  g.beginPath();
  g.arc(535, 250, 28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(40,10,20,0.75)';
  g.beginPath();
  g.moveTo(495, 370);
  g.quadraticCurveTo(535, 300, 575, 370);
  g.closePath();
  g.fill();

  // cobwebs
  g.strokeStyle = 'rgba(200,210,220,0.09)';
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(0, 0, 80 + i * 34, 0, Math.PI / 2);
    g.stroke();
  }
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(W, 0, 70 + i * 30, Math.PI / 2, Math.PI);
    g.stroke();
  }

  const vg = g.createRadialGradient(W / 2, 360, 230, W / 2, 420, 920);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  g.fillStyle = vg;
  g.fillRect(0, 0, W, 660);
}

const BACKDROP_PAINTERS = {
  gothic_lab: paintGothicLab,
  tea_garden: paintTeaGarden,
  ramparts: paintRamparts,
  grand_hall: paintGrandHall,
  fairy_wood: paintFairyWood,
  ballroom: paintBallroom,
  dracula_castle: paintDraculaCastle,
};

/* ── Shared stage floor ─────────────────────────────────────────────────── */

function drawFrontEdge() {
  // front edge gold trim
  const edge = ctx.createLinearGradient(0, 792, 0, 824);
  edge.addColorStop(0, '#c9a15b');
  edge.addColorStop(0.35, '#f3d797');
  edge.addColorStop(0.6, '#8d6f3f');
  edge.addColorStop(1, '#3b2614');
  ctx.fillStyle = edge;
  ctx.fillRect(0, 792, W, 30);
  ctx.fillStyle = 'rgba(20,10,8,0.55)';
  for (let x = 0; x < W; x += 26) {
    ctx.fillRect(x, 806, 12, 3);
  }
  // footlight glow reflection
  const lightRgb = stage.light.current;
  const refl = ctx.createLinearGradient(0, 780, 0, 700);
  refl.addColorStop(0, rgba(lightRgb, 0.16 * lightRgb.intensity));
  refl.addColorStop(1, rgba(lightRgb, 0));
  ctx.fillStyle = refl;
  ctx.fillRect(0, 700, W, 100);
}

function drawBallroomFloor() {
  const grad = ctx.createLinearGradient(0, 630, 0, H);
  grad.addColorStop(0, '#5a3826');
  grad.addColorStop(0.45, '#3a2119');
  grad.addColorStop(1, '#1d0f0b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 630, W, H - 630);

  const vpx = 800;
  const vpy = 600;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 630, W, H - 630);
  ctx.clip();
  // parquet border
  ctx.fillStyle = 'rgba(214,174,106,0.1)';
  ctx.fillRect(0, 630, W, 12);
  // perspective parquet tiles
  const rows = [640, 664, 694, 730, 774, 826, 886];
  for (let r = 0; r < rows.length - 1; r++) {
    const y1 = rows[r];
    const y2 = rows[r + 1];
    const t1 = (y1 - 620) / 300;
    const t2 = (y2 - 620) / 300;
    for (let c = -12; c <= 24; c++) {
      const xBottom1 = c * 82 - 40;
      const xBottom2 = (c + 1) * 82 - 40;
      const x1a = vpx + (xBottom1 - vpx) * t1;
      const x1b = vpx + (xBottom2 - vpx) * t1;
      const x2a = vpx + (xBottom1 - vpx) * t2;
      const x2b = vpx + (xBottom2 - vpx) * t2;
      ctx.fillStyle = (r + c) % 2 === 0 ? 'rgba(255,220,170,0.055)' : 'rgba(20,8,6,0.16)';
      ctx.beginPath();
      ctx.moveTo(x1a, y1);
      ctx.lineTo(x1b, y1);
      ctx.lineTo(x2b, y2);
      ctx.lineTo(x2a, y2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  // gold inlay lines
  ctx.strokeStyle = 'rgba(243,215,151,0.12)';
  ctx.lineWidth = 2;
  [700, 790, 860].forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  });
  // sheen
  const sheen = ctx.createLinearGradient(0, 630, W, 900);
  sheen.addColorStop(0, 'rgba(255,225,180,0.06)');
  sheen.addColorStop(0.5, 'rgba(255,225,180,0)');
  sheen.addColorStop(1, 'rgba(255,225,180,0.04)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 630, W, H - 630);
  ctx.restore();
  drawFrontEdge();
}

function drawFairyWoodFloor() {
  const grad = ctx.createLinearGradient(0, 630, 0, H);
  grad.addColorStop(0, '#2c3226');
  grad.addColorStop(0.5, '#1d241c');
  grad.addColorStop(1, '#0d120d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 630, W, H - 630);
  const rng = mulberry32(0xfa11);
  // moss patches
  for (let i = 0; i < 40; i++) {
    const x = rng() * W;
    const y = 650 + rng() * 230;
    const r = 18 + rng() * 80;
    const moss = ctx.createRadialGradient(x, y, 2, x, y, r);
    moss.addColorStop(0, `rgba(80,150,100,${0.08 + rng() * 0.08})`);
    moss.addColorStop(1, 'rgba(80,150,100,0)');
    ctx.fillStyle = moss;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // roots
  ctx.strokeStyle = 'rgba(60,45,35,0.55)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const x = 100 + i * 190 + rng() * 50;
    ctx.lineWidth = 6 + rng() * 8;
    ctx.beginPath();
    ctx.moveTo(x, 650);
    ctx.quadraticCurveTo(x + rng() * 80 - 40, 730, x + rng() * 120 - 60, 850);
    ctx.stroke();
  }
  // fallen leaves / flowers
  for (let i = 0; i < 60; i++) {
    const x = rng() * W;
    const y = 660 + rng() * 230;
    ctx.fillStyle = ['rgba(160,210,140,0.18)', 'rgba(220,190,140,0.12)', 'rgba(180,140,220,0.12)'][i % 3];
    ctx.beginPath();
    ctx.ellipse(x, y, 3 + rng() * 4, 1.5 + rng() * 2, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // faint fairy ring
  ctx.strokeStyle = 'rgba(170,255,210,0.1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(800, 760, 300, 60, 0, 0, Math.PI * 2);
  ctx.stroke();
  drawFrontEdge();
}

function drawCastleFloor() {
  const grad = ctx.createLinearGradient(0, 630, 0, H);
  grad.addColorStop(0, '#2a242c');
  grad.addColorStop(0.5, '#18131b');
  grad.addColorStop(1, '#09060b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 630, W, H - 630);
  const rng = mulberry32(0xdac1f);
  // stone flags
  const vpx = 800;
  const vpy = 610;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 630, W, H - 630);
  ctx.clip();
  const rows = [640, 672, 712, 762, 824, 900];
  for (let r = 0; r < rows.length - 1; r++) {
    const y1 = rows[r];
    const y2 = rows[r + 1];
    const t1 = (y1 - 620) / 300;
    const t2 = (y2 - 620) / 300;
    for (let c = -10; c <= 22; c++) {
      const xb1 = c * 100 - 30;
      const xb2 = (c + 1) * 100 - 30;
      const x1a = vpx + (xb1 - vpx) * t1;
      const x1b = vpx + (xb2 - vpx) * t1;
      const x2a = vpx + (xb1 - vpx) * t2;
      const x2b = vpx + (xb2 - vpx) * t2;
      const shade = 0.03 + rng() * 0.05;
      ctx.fillStyle = `rgba(255,220,200,${shade})`;
      ctx.beginPath();
      ctx.moveTo(x1a, y1);
      ctx.lineTo(x1b, y1);
      ctx.lineTo(x2b, y2);
      ctx.lineTo(x2a, y2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.32)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  // red carpet
  const carpet = ctx.createLinearGradient(0, 630, 0, 900);
  carpet.addColorStop(0, 'rgba(92,15,31,0.55)');
  carpet.addColorStop(1, 'rgba(60,8,20,0.85)');
  ctx.fillStyle = carpet;
  ctx.beginPath();
  ctx.moveTo(700, 630);
  ctx.lineTo(900, 630);
  ctx.lineTo(1010, 900);
  ctx.lineTo(590, 900);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(214,174,106,0.18)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(700, 630);
  ctx.lineTo(590, 900);
  ctx.moveTo(900, 630);
  ctx.lineTo(1010, 900);
  ctx.stroke();
  // cracks
  for (let i = 0; i < 20; i++) {
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    const x = rng() * W;
    const y = 650 + rng() * 230;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + rng() * 40 - 20, y + 20 + rng() * 30);
    ctx.stroke();
  }
  ctx.restore();
  drawFrontEdge();
}

function drawFloor(now) {
  const current = stage.backdrop.current;
  if (current === 'ballroom') {
    drawBallroomFloor();
    return;
  }
  if (current === 'fairy_wood') {
    drawFairyWoodFloor();
    return;
  }
  if (current === 'dracula_castle') {
    drawCastleFloor();
    return;
  }
  const grad = ctx.createLinearGradient(0, 630, 0, H);
  grad.addColorStop(0, '#4a2c20');
  grad.addColorStop(0.4, '#382016');
  grad.addColorStop(1, '#1a0e0b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 630, W, H - 630);

  // perspective boards
  const vpx = 800;
  const vpy = 610;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 630, W, H - 630);
  ctx.clip();
  const bottomXs = [];
  for (let i = -8; i <= 24; i++) bottomXs.push(i * 86 - 40);
  bottomXs.forEach((bx, i) => {
    const shade = i % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(255,190,120,0.035)';
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(vpx, vpy);
    ctx.lineTo(bx, H);
    ctx.lineTo(bx + 86, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(vpx, vpy);
    ctx.lineTo(bx, H);
    ctx.stroke();
  });
  // horizontal seams
  [646, 668, 700, 744, 800, 868].forEach((y, i) => {
    ctx.strokeStyle = `rgba(0,0,0,${0.18 + i * 0.03})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,200,140,0.035)';
    ctx.beginPath();
    ctx.moveTo(0, y + 2);
    ctx.lineTo(W, y + 2);
    ctx.stroke();
  });
  // grain scratches
  const rng = mulberry32(0x77f2);
  for (let i = 0; i < 70; i++) {
    const y = 640 + rng() * 250;
    const x = rng() * W;
    ctx.strokeStyle = `rgba(0,0,0,${0.05 + rng() * 0.1})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 30, y + rng() * 6 - 3, x + 60 + rng() * 90, y);
    ctx.stroke();
  }
  // stage marks
  ctx.strokeStyle = 'rgba(240,220,180,0.07)';
  ctx.setLineDash([8, 18]);
  ctx.beginPath();
  ctx.moveTo(300, 690);
  ctx.lineTo(1300, 690);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  drawFrontEdge();
}

/* ── Animated backdrop details ──────────────────────────────────────────── */

function drawBackdropFX(name, now) {
  const t = now / 1000;
  if (name === 'gothic_lab') {
    // rain on window
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(1010, 520);
    ctx.lineTo(1010, 260);
    ctx.quadraticCurveTo(1010, 120, 1160, 120);
    ctx.quadraticCurveTo(1310, 120, 1310, 260);
    ctx.lineTo(1310, 520);
    ctx.closePath();
    ctx.clip();
    const rng = mulberry32(Math.floor(t * 12) + 9);
    for (let i = 0; i < 26; i++) {
      const x = 1020 + rng() * 280;
      const y = 130 + ((rng() * 400 + t * 260) % 390);
      ctx.strokeStyle = `rgba(160,210,235,${0.08 + rng() * 0.16})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 16);
      ctx.stroke();
    }
    ctx.restore();

    // apparatus pulse
    const pulse = 0.55 + Math.sin(t * 3.1) * 0.2;
    const orb = ctx.createRadialGradient(860, 268, 2, 860, 268, 62);
    orb.addColorStop(0, `rgba(210,255,240,${0.55 * pulse})`);
    orb.addColorStop(0.35, `rgba(90,230,200,${0.22 * pulse})`);
    orb.addColorStop(1, 'rgba(60,200,180,0)');
    ctx.fillStyle = orb;
    ctx.beginPath();
    ctx.arc(860, 268, 62, 0, Math.PI * 2);
    ctx.fill();

    // candle flicker
    [824, 866].forEach((x, i) => {
      const fy = 474 - i * 12;
      const flick = 0.65 + Math.sin(t * 9 + i * 2) * 0.2 + Math.random() * 0.1;
      const glow = ctx.createRadialGradient(x + 4.5, fy, 1, x + 4.5, fy, 46);
      glow.addColorStop(0, `rgba(255,200,110,${0.3 * flick})`);
      glow.addColorStop(1, 'rgba(255,200,110,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x + 4.5, fy, 46, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (name === 'tea_garden') {
    // floating cards
    for (let i = 0; i < 6; i++) {
      const x = 240 + i * 220 + Math.sin(t * 0.6 + i) * 24;
      const y = 200 + Math.sin(t * 0.9 + i * 1.7) * 26 + (i % 3) * 60;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(t * 0.7 + i) * 0.24);
      ctx.fillStyle = 'rgba(250,240,220,0.8)';
      roundRectPath(ctx, -13, -19, 26, 38, 3);
      ctx.fill();
      ctx.fillStyle = i % 2 ? '#c94b63' : '#2a1a30';
      ctx.font = '13px serif';
      ctx.textAlign = 'center';
      ctx.fillText(i % 2 ? '♥' : '♠', 0, 6);
      ctx.restore();
    }
    // lantern bobbing glow
    [340, 800, 1260].forEach((x, i) => {
      const y = [174, 134, 184][i] + Math.sin(t * 1.1 + i) * 5;
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 58);
      glow.addColorStop(0, `rgba(255,205,140,${0.18 + Math.sin(t * 2 + i) * 0.05})`);
      glow.addColorStop(1, 'rgba(255,205,140,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 58, 0, Math.PI * 2);
      ctx.fill();
    });
    // sparkles
    for (let i = 0; i < 18; i++) {
      const x = 200 + ((i * 97 + t * 12) % 1200);
      const y = 180 + ((i * 53) % 380) + Math.sin(t + i) * 6;
      const a = 0.15 + 0.15 * Math.sin(t * 2 + i);
      ctx.fillStyle = `rgba(255,240,190,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (name === 'ramparts') {
    // twinkling stars
    for (let i = 0; i < 40; i++) {
      const x = ((i * 173) % W);
      const y = ((i * 89) % 420);
      const a = 0.18 + 0.22 * (0.5 + Math.sin(t * 1.6 + i) * 0.5);
      ctx.fillStyle = `rgba(235,245,255,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // torch flames
    [[330, 418], [800, 398], [1300, 418]].forEach(([x, y], i) => {
      const sway = Math.sin(t * 6 + i * 2.4) * 5;
      const h = 22 + Math.sin(t * 9 + i) * 5;
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 90);
      glow.addColorStop(0, 'rgba(255,170,80,0.3)');
      glow.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,190,90,0.85)';
      ctx.beginPath();
      ctx.ellipse(x + sway, y - h * 0.4, 8, h, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,180,0.9)';
      ctx.beginPath();
      ctx.ellipse(x + sway * 0.5, y - h * 0.3, 4, h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // drifting fog
    for (let i = 0; i < 5; i++) {
      const x = ((i * 340 + t * 16) % (W + 400)) - 200;
      const y = 590 + Math.sin(t * 0.5 + i) * 12;
      const fog = ctx.createRadialGradient(x, y, 10, x, y, 190);
      fog.addColorStop(0, 'rgba(140,170,210,0.05)');
      fog.addColorStop(1, 'rgba(140,170,210,0)');
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.ellipse(x, y, 200, 34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (name === 'fairy_wood') {
    // fireflies
    for (let i = 0; i < 36; i++) {
      const x = 180 + ((i * 137 + t * 14) % 1240);
      const y = 240 + ((i * 71) % 380) + Math.sin(t * 1.4 + i) * 12;
      const a = 0.18 + 0.35 * (0.5 + Math.sin(t * 2.2 + i * 1.7) * 0.5);
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 10);
      glow.addColorStop(0, `rgba(190,255,210,${a})`);
      glow.addColorStop(1, 'rgba(190,255,210,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(230,255,220,${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // drifting spores
    for (let i = 0; i < 14; i++) {
      const x = 200 + ((i * 211 + t * 8) % 1200);
      const y = 300 + ((i * 53) % 320) + Math.sin(t + i) * 18;
      ctx.fillStyle = `rgba(180,240,200,${0.08 + 0.08 * Math.sin(t * 1.5 + i)})`;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (name === 'ballroom') {
    // chandelier candle flicker
    [[480, 140, 0.75], [800, 170, 1.1], [1120, 140, 0.75]].forEach(([x, y, s], i) => {
      const flick = 0.7 + Math.sin(t * 6 + i * 2) * 0.18 + Math.random() * 0.06;
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 120 * s);
      glow.addColorStop(0, `rgba(255,220,150,${0.14 * flick})`);
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 120 * s, 0, Math.PI * 2);
      ctx.fill();
    });
    // dust and candle sparks
    for (let i = 0; i < 24; i++) {
      const x = (i * 97 + t * 6) % W;
      const y = 160 + ((i * 43 + t * 3) % 440);
      ctx.fillStyle = `rgba(255,235,190,${0.04 + 0.06 * Math.sin(t + i)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (name === 'dracula_castle') {
    // bats across the great window
    for (let i = 0; i < 7; i++) {
      const x = 960 + ((i * 71 + t * 22) % 260);
      const y = 180 + ((i * 47) % 220) + Math.sin(t * 2 + i) * 16;
      const wing = 5 + Math.sin(t * 12 + i) * 4;
      ctx.fillStyle = 'rgba(10,6,14,0.8)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - wing, y - wing, x - wing * 2, y + 2);
      ctx.quadraticCurveTo(x - wing, y + 1, x, y + 3);
      ctx.quadraticCurveTo(x + wing, y + 1, x + wing * 2, y + 2);
      ctx.quadraticCurveTo(x + wing, y - wing, x, y);
      ctx.fill();
    }
    // candle flicker
    [[250, 378], [1330, 378]].forEach(([x, y], i) => {
      const flick = 0.65 + Math.sin(t * 8 + i * 2) * 0.2 + Math.random() * 0.08;
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 80);
      glow.addColorStop(0, `rgba(255,150,70,${0.18 * flick})`);
      glow.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 80, 0, Math.PI * 2);
      ctx.fill();
    });
    // low fog
    for (let i = 0; i < 4; i++) {
      const x = ((i * 420 + t * 10) % (W + 300)) - 150;
      const y = 600 + Math.sin(t * 0.4 + i) * 10;
      const fog = ctx.createRadialGradient(x, y, 10, x, y, 220);
      fog.addColorStop(0, 'rgba(120,100,150,0.05)');
      fog.addColorStop(1, 'rgba(120,100,150,0)');
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.ellipse(x, y, 230, 30, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // grand hall dust
    for (let i = 0; i < 20; i++) {
      const x = (i * 89 + t * 6) % W;
      const y = 200 + ((i * 47 + t * 4) % 400);
      ctx.fillStyle = 'rgba(255,230,190,0.1)';
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ── Actor rendering ────────────────────────────────────────────────────── */

function drawLimb(x1, y1, x2, y2, x3, y3, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.stroke();
}

function drawActor(a, now) {
  if (!a.visible || a.alpha <= 0.01) return;
  const t = now / 1000;
  const Hh = 190 * a.height;
  const walking = a.walking;
  const bob = walking ? Math.sin(a.walkPhase) * 2.4 : Math.sin(t * 1.4 + a.seed) * 1.2;
  const legLen = Hh * 0.33;
  const hipY = -legLen;
  const torsoH = Hh * 0.34;
  const shoulderY = hipY - torsoH;
  const shoulderW = Hh * 0.27;
  const headR = Hh * 0.083;
  const headY = shoulderY - headR * 1.72;
  const skin = a.skin;
  const coat = a.coat;
  const coat2 = a.coat2;
  const accent = a.accent;

  // shadow
  ctx.save();
  ctx.globalAlpha = a.alpha * 0.38;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(a.x, FLOOR_Y + 3, Hh * 0.27, Hh * 0.038, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = a.alpha;
  ctx.translate(a.x, FLOOR_Y + bob);
  ctx.scale(a.facing, 1);

  // fairy wings
  if (['fairy_queen', 'fairy_king', 'puck'].includes(a.costume)) {
    const wingY = shoulderY - Hh * 0.06;
    const wingColor = a.costume === 'puck' ? 'rgba(140,220,150,0.35)' : 'rgba(180,210,255,0.3)';
    ctx.save();
    ctx.globalAlpha = 0.75;
    [-1, 1].forEach((side) => {
      ctx.save();
      ctx.scale(side, 1);
      ctx.fillStyle = wingColor;
      ctx.strokeStyle = a.costume === 'puck' ? 'rgba(160,240,170,0.55)' : 'rgba(210,230,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, wingY);
      ctx.bezierCurveTo(shoulderW * 1.2, wingY - Hh * 0.28, shoulderW * 1.9, wingY - Hh * 0.12, shoulderW * 1.75, wingY + Hh * 0.16);
      ctx.bezierCurveTo(shoulderW * 1.4, wingY + Hh * 0.08, shoulderW * 0.7, wingY + Hh * 0.1, 0, wingY + Hh * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, wingY);
      ctx.quadraticCurveTo(shoulderW * 1.1, wingY - Hh * 0.08, shoulderW * 1.6, wingY + Hh * 0.08);
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  }

  if (a.pose === 'kneel') {
    ctx.translate(0, Hh * 0.13);
    ctx.scale(1, 0.9);
  } else if (a.pose === 'bow') {
    ctx.translate(0, Hh * 0.02);
    ctx.rotate(0.12);
  }

  // ghost aura
  if (a.costume === 'ghost' || a.costume === 'vampire') {
    const aura = ctx.createRadialGradient(0, shoulderY - headR, 10, 0, shoulderY - headR, Hh * 0.75);
    if (a.costume === 'vampire') {
      aura.addColorStop(0, 'rgba(255,80,110,0.14)');
      aura.addColorStop(0.55, 'rgba(160,30,60,0.06)');
      aura.addColorStop(1, 'rgba(160,30,60,0)');
    } else {
      aura.addColorStop(0, 'rgba(160,230,255,0.28)');
      aura.addColorStop(0.55, 'rgba(110,190,240,0.12)');
      aura.addColorStop(1, 'rgba(110,190,240,0)');
    }
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, shoulderY - headR * 0.5, Hh * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }

  // capes / robes behind
  if (a.costume === 'prince' || a.costume === 'royal' || a.costume === 'queen' || a.costume === 'fairy_king' || a.costume === 'vampire' || a.costume === 'bride') {
    const capeColor = a.costume === 'prince'
      ? '#17121f'
      : a.costume === 'royal'
        ? '#6b1726'
        : a.costume === 'queen'
          ? '#7a1b33'
          : a.costume === 'fairy_king'
            ? '#162e28'
            : a.costume === 'vampire'
              ? '#0b0509'
              : 'rgba(230,225,240,0.6)';
    ctx.fillStyle = capeColor;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.55, shoulderY + 2);
    ctx.quadraticCurveTo(-shoulderW * 1.1, hipY, -shoulderW * 0.9, -2);
    ctx.lineTo(shoulderW * 0.9, -2);
    ctx.quadraticCurveTo(shoulderW * 1.1, hipY, shoulderW * 0.55, shoulderY + 2);
    ctx.closePath();
    ctx.fill();
    if (a.costume === 'vampire') {
      ctx.fillStyle = '#5c0f1f';
      ctx.beginPath();
      ctx.moveTo(-shoulderW * 0.36, shoulderY + 8);
      ctx.quadraticCurveTo(-shoulderW * 0.78, hipY, -shoulderW * 0.62, -2);
      ctx.lineTo(shoulderW * 0.62, -2);
      ctx.quadraticCurveTo(shoulderW * 0.78, hipY, shoulderW * 0.36, shoulderY + 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  // legs
  const stride = walking ? Math.sin(a.walkPhase) * Hh * 0.11 : 0;
  const liftA = walking ? Math.max(0, Math.sin(a.walkPhase)) * Hh * 0.045 : 0;
  const liftB = walking ? Math.max(0, -Math.sin(a.walkPhase)) * Hh * 0.045 : 0;
  const pants = a.pants;
  const legW = Hh * 0.062;
  drawLimb(-shoulderW * 0.2, hipY, -shoulderW * 0.2 - stride * 0.4, -legLen * 0.42 - liftA * 0.5, -shoulderW * 0.24 - stride, -2 - liftA, legW, pants);
  drawLimb(shoulderW * 0.2, hipY, shoulderW * 0.2 + stride * 0.4, -legLen * 0.42 - liftB * 0.5, shoulderW * 0.24 + stride, -2 - liftB, legW, pants);
  // boots
  ctx.fillStyle = a.boots;
  [[-shoulderW * 0.24 - stride, -2 - liftA], [shoulderW * 0.24 + stride, -2 - liftB]].forEach(([bx, by]) => {
    ctx.beginPath();
    ctx.ellipse(bx + 4, by + 1, Hh * 0.055, Hh * 0.026, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // skirt / dress
  const isDress = ['alice', 'queen', 'gown', 'fairy_queen', 'regency', 'bride'].includes(a.costume);
  if (isDress) {
    const skirtColor = a.costume === 'alice'
      ? '#5b8fd6'
      : a.costume === 'queen'
        ? '#9c1f3b'
        : a.costume === 'fairy_queen'
          ? '#6a4a9a'
          : a.costume === 'regency'
            ? '#c9a7b8'
            : a.costume === 'bride'
              ? '#d8d0e0'
              : '#d8a7a0';
    ctx.fillStyle = skirtColor;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.42, hipY - 6);
    ctx.quadraticCurveTo(-shoulderW * 0.95, hipY * 0.5, -shoulderW * 1.05, -Hh * 0.1);
    ctx.quadraticCurveTo(0, -Hh * 0.04, shoulderW * 1.05, -Hh * 0.1);
    ctx.quadraticCurveTo(shoulderW * 0.95, hipY * 0.5, shoulderW * 0.42, hipY - 6);
    ctx.closePath();
    ctx.fill();
    // hem trim
    ctx.strokeStyle = a.costume === 'queen'
      ? '#f0cf8b'
      : a.costume === 'fairy_queen'
        ? 'rgba(185,167,255,0.7)'
        : a.costume === 'bride'
          ? 'rgba(255,255,255,0.6)'
          : a.costume === 'regency'
            ? 'rgba(246,234,208,0.7)'
            : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 1.03, -Hh * 0.105);
    ctx.quadraticCurveTo(0, -Hh * 0.05, shoulderW * 1.03, -Hh * 0.105);
    ctx.stroke();
    if (a.costume === 'alice') {
      ctx.fillStyle = 'rgba(255,250,240,0.9)';
      ctx.beginPath();
      ctx.moveTo(-shoulderW * 0.3, hipY - 2);
      ctx.lineTo(shoulderW * 0.3, hipY - 2);
      ctx.lineTo(shoulderW * 0.48, -Hh * 0.13);
      ctx.lineTo(-shoulderW * 0.48, -Hh * 0.13);
      ctx.closePath();
      ctx.fill();
    }
    if (a.costume === 'queen') {
      ctx.fillStyle = 'rgba(240,207,139,0.55)';
      for (let i = -2; i <= 2; i++) {
        const hx = i * shoulderW * 0.36;
        const hy = -Hh * 0.2 + Math.abs(i) * 5;
        ctx.beginPath();
        ctx.arc(hx, hy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (a.costume === 'fairy_queen') {
      ctx.fillStyle = 'rgba(210,190,255,0.55)';
      for (let i = 0; i < 9; i++) {
        const hx = (i % 3 - 1) * shoulderW * 0.55;
        const hy = -Hh * 0.16 + Math.floor(i / 3) * 12;
        ctx.beginPath();
        ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (a.costume === 'regency') {
      ctx.fillStyle = 'rgba(255,245,235,0.55)';
      ctx.beginPath();
      ctx.moveTo(-shoulderW * 0.4, hipY - 2);
      ctx.lineTo(shoulderW * 0.4, hipY - 2);
      ctx.lineTo(shoulderW * 0.5, -Hh * 0.14);
      ctx.lineTo(-shoulderW * 0.5, -Hh * 0.14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(127,214,196,0.5)';
      ctx.fillRect(-shoulderW * 0.38, hipY - 8, shoulderW * 0.76, 6);
    }
    if (a.costume === 'bride') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo(-shoulderW * 0.8 + i * 28, -Hh * 0.14);
        ctx.quadraticCurveTo(-shoulderW * 0.7 + i * 28, -Hh * 0.3, -shoulderW * 0.8 + i * 28, -Hh * 0.45);
        ctx.stroke();
      }
    }
  }

  // torso
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(-shoulderW * 0.5, shoulderY);
  ctx.quadraticCurveTo(0, shoulderY - Hh * 0.03, shoulderW * 0.5, shoulderY);
  ctx.lineTo(shoulderW * 0.42, hipY + 4);
  ctx.quadraticCurveTo(0, hipY + 9, -shoulderW * 0.42, hipY + 4);
  ctx.closePath();
  ctx.fill();

  // shirt / waistcoat
  if (a.costume === 'scientist') {
    ctx.fillStyle = '#efe6d4';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.2, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.2, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.14, hipY);
    ctx.lineTo(-shoulderW * 0.14, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3b2a2a';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.24, shoulderY + 2);
    ctx.lineTo(-shoulderW * 0.02, shoulderY + Hh * 0.09);
    ctx.lineTo(-shoulderW * 0.16, shoulderY + Hh * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(shoulderW * 0.24, shoulderY + 2);
    ctx.lineTo(shoulderW * 0.02, shoulderY + Hh * 0.09);
    ctx.lineTo(shoulderW * 0.16, shoulderY + Hh * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(0, shoulderY + Hh * 0.055);
    ctx.lineTo(shoulderW * 0.1, shoulderY + Hh * 0.075);
    ctx.lineTo(0, shoulderY + Hh * 0.1);
    ctx.lineTo(-shoulderW * 0.1, shoulderY + Hh * 0.075);
    ctx.closePath();
    ctx.fill();
    // coat outline
    ctx.strokeStyle = 'rgba(30,30,30,0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // buttons
    ctx.fillStyle = '#2b211e';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, shoulderY + Hh * 0.15 + i * Hh * 0.06, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (a.costume === 'creature') {
    ctx.fillStyle = '#2d3a2c';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.36, shoulderY + 6);
    ctx.lineTo(shoulderW * 0.36, shoulderY + 6);
    ctx.lineTo(shoulderW * 0.3, hipY);
    ctx.lineTo(-shoulderW * 0.3, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,190,140,0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(0, shoulderY + 10);
    ctx.lineTo(0, hipY - 4);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#4a5a42';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(shoulderW * 0.28, shoulderY + 22 + i * 14, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (a.costume === 'alice') {
    ctx.fillStyle = '#5b8fd6';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.42, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.42, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.3, hipY + 2);
    ctx.lineTo(-shoulderW * 0.3, hipY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,250,240,0.9)';
    ctx.fillRect(-shoulderW * 0.2, shoulderY + 8, shoulderW * 0.4, Hh * 0.09);
    ctx.fillStyle = '#7fb3e8';
    ctx.beginPath();
    ctx.ellipse(0, shoulderY + 8, shoulderW * 0.42, Hh * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'hatter') {
    ctx.fillStyle = '#4d2a63';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.5, shoulderY);
    ctx.lineTo(shoulderW * 0.5, shoulderY);
    ctx.lineTo(shoulderW * 0.36, hipY + 2);
    ctx.lineTo(-shoulderW * 0.36, hipY + 2);
    ctx.closePath();
    ctx.fill();
    // waistcoat
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.22, shoulderY + 12);
    ctx.lineTo(shoulderW * 0.22, shoulderY + 12);
    ctx.lineTo(shoulderW * 0.16, hipY);
    ctx.lineTo(-shoulderW * 0.16, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3b2330';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, shoulderY + 28 + i * 13, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // oversized bow tie
    ctx.fillStyle = '#c94b63';
    ctx.beginPath();
    ctx.ellipse(-shoulderW * 0.18, shoulderY + 8, shoulderW * 0.18, Hh * 0.028, 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(shoulderW * 0.18, shoulderY + 8, shoulderW * 0.18, Hh * 0.028, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a2438';
    ctx.beginPath();
    ctx.arc(0, shoulderY + 8, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'hare') {
    ctx.fillStyle = '#7a4e2f';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.46, shoulderY);
    ctx.lineTo(shoulderW * 0.46, shoulderY);
    ctx.lineTo(shoulderW * 0.34, hipY);
    ctx.lineTo(-shoulderW * 0.34, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c9a86a';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.2, shoulderY + 10);
    ctx.lineTo(shoulderW * 0.2, shoulderY + 10);
    ctx.lineTo(shoulderW * 0.14, hipY);
    ctx.lineTo(-shoulderW * 0.14, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3b2330';
    ctx.fillRect(-shoulderW * 0.3, hipY - 8, shoulderW * 0.6, 5);
  } else if (a.costume === 'queen') {
    ctx.fillStyle = '#9c1f3b';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.44, shoulderY);
    ctx.lineTo(shoulderW * 0.44, shoulderY);
    ctx.lineTo(shoulderW * 0.3, hipY);
    ctx.lineTo(-shoulderW * 0.3, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f0cf8b';
    ctx.beginPath();
    ctx.arc(0, shoulderY + Hh * 0.11, Hh * 0.035, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'prince') {
    ctx.fillStyle = '#232030';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.46, shoulderY);
    ctx.lineTo(shoulderW * 0.46, shoulderY);
    ctx.lineTo(shoulderW * 0.32, hipY);
    ctx.lineTo(-shoulderW * 0.32, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e9e2d4';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.2, shoulderY + 2);
    ctx.lineTo(0, shoulderY + Hh * 0.11);
    ctx.lineTo(shoulderW * 0.2, shoulderY + 2);
    ctx.lineTo(shoulderW * 0.12, shoulderY + Hh * 0.12);
    ctx.lineTo(-shoulderW * 0.12, shoulderY + Hh * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8e2b3d';
    ctx.fillRect(-shoulderW * 0.3, hipY - 6, shoulderW * 0.6, 5);
  } else if (a.costume === 'royal') {
    ctx.fillStyle = '#7a1b33';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.46, shoulderY);
    ctx.lineTo(shoulderW * 0.46, shoulderY);
    ctx.lineTo(shoulderW * 0.32, hipY);
    ctx.lineTo(-shoulderW * 0.32, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(245,235,220,0.9)';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.14, shoulderY + 4);
    ctx.lineTo(0, shoulderY + Hh * 0.1);
    ctx.lineTo(shoulderW * 0.14, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.08, hipY - 8);
    ctx.lineTo(-shoulderW * 0.08, hipY - 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d6ae6a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.26, shoulderY + 16);
    ctx.quadraticCurveTo(0, shoulderY + 34, shoulderW * 0.26, shoulderY + 16);
    ctx.stroke();
    ctx.fillStyle = '#f0cf8b';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * shoulderW * 0.1, shoulderY + 22 + Math.abs(i) * 3, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (a.costume === 'gown') {
    ctx.fillStyle = '#d8a7a0';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.44, shoulderY);
    ctx.lineTo(shoulderW * 0.44, shoulderY);
    ctx.lineTo(shoulderW * 0.3, hipY);
    ctx.lineTo(-shoulderW * 0.3, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,245,235,0.7)';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.18, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.18, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.1, hipY);
    ctx.lineTo(-shoulderW * 0.1, hipY);
    ctx.closePath();
    ctx.fill();
  } else if (a.costume === 'fairy_queen') {
    ctx.fillStyle = '#6a4a9a';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.42, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.42, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.3, hipY + 2);
    ctx.lineTo(-shoulderW * 0.3, hipY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(210,190,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.25, shoulderY + 14);
    ctx.quadraticCurveTo(0, shoulderY + 32, shoulderW * 0.25, shoulderY + 14);
    ctx.stroke();
    ctx.fillStyle = '#d2beff';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * shoulderW * 0.09, shoulderY + 20 + Math.abs(i) * 2, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (a.costume === 'fairy_king') {
    ctx.fillStyle = '#1f3a30';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.5, shoulderY);
    ctx.lineTo(shoulderW * 0.5, shoulderY);
    ctx.lineTo(shoulderW * 0.34, hipY + 2);
    ctx.lineTo(-shoulderW * 0.34, hipY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(127,214,196,0.35)';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.16, shoulderY + 4);
    ctx.lineTo(0, shoulderY + Hh * 0.1);
    ctx.lineTo(shoulderW * 0.16, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.08, hipY - 6);
    ctx.lineTo(-shoulderW * 0.08, hipY - 6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#7fd6c4';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.3, shoulderY + 20);
    ctx.quadraticCurveTo(0, shoulderY + 36, shoulderW * 0.3, shoulderY + 20);
    ctx.stroke();
  } else if (a.costume === 'puck') {
    ctx.fillStyle = '#3f6a2f';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.44, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.44, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.3, hipY + 2);
    ctx.lineTo(-shoulderW * 0.3, hipY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a4a1f';
    ctx.fillRect(-shoulderW * 0.34, hipY - 8, shoulderW * 0.68, 7);
    ctx.fillStyle = '#d6ae6a';
    ctx.beginPath();
    ctx.arc(0, hipY - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    // leaf collar
    ctx.fillStyle = 'rgba(140,210,110,0.65)';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.ellipse(i * shoulderW * 0.13, shoulderY + 10, shoulderW * 0.1, Hh * 0.025, i * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (a.costume === 'donkey') {
    ctx.fillStyle = '#5a3a22';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.46, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.46, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.32, hipY + 2);
    ctx.lineTo(-shoulderW * 0.32, hipY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c9a86a';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.18, shoulderY + 10);
    ctx.lineTo(shoulderW * 0.18, shoulderY + 10);
    ctx.lineTo(shoulderW * 0.12, hipY);
    ctx.lineTo(-shoulderW * 0.12, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3b2614';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, shoulderY + 26 + i * 14, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (a.costume === 'regency') {
    ctx.fillStyle = '#c9a7b8';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.42, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.42, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.3, hipY + 2);
    ctx.lineTo(-shoulderW * 0.3, hipY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,248,240,0.85)';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.2, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.2, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.12, hipY);
    ctx.lineTo(-shoulderW * 0.12, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = a.accent;
    ctx.fillRect(-shoulderW * 0.3, hipY - 10, shoulderW * 0.6, 6);
    // long gloves
    ctx.strokeStyle = 'rgba(255,245,235,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.42, shoulderY + 18);
    ctx.lineTo(-shoulderW * 0.55, hipY);
    ctx.moveTo(shoulderW * 0.42, shoulderY + 18);
    ctx.lineTo(shoulderW * 0.55, hipY);
    ctx.stroke();
  } else if (a.costume === 'dandy' || a.costume === 'victorian') {
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.46, shoulderY);
    ctx.lineTo(shoulderW * 0.46, shoulderY);
    ctx.lineTo(shoulderW * 0.32, hipY);
    ctx.lineTo(-shoulderW * 0.32, hipY);
    ctx.closePath();
    ctx.fill();
    // waistcoat
    ctx.fillStyle = a.costume === 'dandy' ? a.accent : '#7a5a3a';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.22, shoulderY + 10);
    ctx.lineTo(shoulderW * 0.22, shoulderY + 10);
    ctx.lineTo(shoulderW * 0.15, hipY);
    ctx.lineTo(-shoulderW * 0.15, hipY);
    ctx.closePath();
    ctx.fill();
    // cravat
    ctx.fillStyle = '#f6ead0';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.12, shoulderY + 2);
    ctx.lineTo(0, shoulderY + Hh * 0.08);
    ctx.lineTo(shoulderW * 0.12, shoulderY + 2);
    ctx.lineTo(shoulderW * 0.08, shoulderY + Hh * 0.11);
    ctx.lineTo(-shoulderW * 0.08, shoulderY + Hh * 0.11);
    ctx.closePath();
    ctx.fill();
    // watch chain
    ctx.strokeStyle = '#d6ae6a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.12, hipY - 16);
    ctx.quadraticCurveTo(0, hipY - 6, shoulderW * 0.1, hipY - 18);
    ctx.stroke();
  } else if (a.costume === 'vampire') {
    ctx.fillStyle = '#160d14';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.5, shoulderY);
    ctx.lineTo(shoulderW * 0.5, shoulderY);
    ctx.lineTo(shoulderW * 0.32, hipY + 2);
    ctx.lineTo(-shoulderW * 0.32, hipY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6b1227';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.18, shoulderY + 10);
    ctx.lineTo(shoulderW * 0.18, shoulderY + 10);
    ctx.lineTo(shoulderW * 0.12, hipY);
    ctx.lineTo(-shoulderW * 0.12, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,174,106,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.3, shoulderY + 16);
    ctx.quadraticCurveTo(0, shoulderY + 34, shoulderW * 0.3, shoulderY + 16);
    ctx.stroke();
    ctx.fillStyle = '#c94b63';
    ctx.beginPath();
    ctx.arc(0, shoulderY + Hh * 0.14, Hh * 0.028, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'bride') {
    ctx.fillStyle = '#d8d0e0';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.42, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.42, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.3, hipY + 2);
    ctx.lineTo(-shoulderW * 0.3, hipY + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.2, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.2, shoulderY + 4);
    ctx.lineTo(shoulderW * 0.12, hipY);
    ctx.lineTo(-shoulderW * 0.12, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,170,220,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.3, shoulderY + 18);
    ctx.quadraticCurveTo(0, shoulderY + 32, shoulderW * 0.3, shoulderY + 18);
    ctx.stroke();
  } else {
    ctx.fillStyle = coat2;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.4, shoulderY + 6);
    ctx.lineTo(shoulderW * 0.4, shoulderY + 6);
    ctx.lineTo(shoulderW * 0.28, hipY);
    ctx.lineTo(-shoulderW * 0.28, hipY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2a2430';
    ctx.fillRect(-shoulderW * 0.34, hipY - 7, shoulderW * 0.68, 6);
  }

  // ghost armor overlay
  if (a.costume === 'ghost') {
    ctx.strokeStyle = 'rgba(200,240,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.3, shoulderY + 14);
    ctx.lineTo(0, hipY - 4);
    ctx.lineTo(shoulderW * 0.3, shoulderY + 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.36, shoulderY + 40);
    ctx.lineTo(shoulderW * 0.36, shoulderY + 40);
    ctx.stroke();
  }

  // arms
  const armW = Hh * 0.052;
  const shoulderX = shoulderW * 0.46;
  const handY = hipY + 10;
  let right = { ex: shoulderX + 4, ey: shoulderY + Hh * 0.14, hx: shoulderX + 10, hy: handY };
  let left = { ex: -shoulderX - 4, ey: shoulderY + Hh * 0.14, hx: -shoulderX - 10, hy: handY };
  const gesture = a.gesture || 'idle';

  if (gesture === 'raise') {
    right = { ex: shoulderX + 22, ey: shoulderY - 6, hx: shoulderX + 16, hy: shoulderY - Hh * 0.2 };
  } else if (gesture === 'point') {
    right = { ex: shoulderX + 30, ey: shoulderY + 10, hx: shoulderX + 58, hy: shoulderY + 4 };
  } else if (gesture === 'beckon') {
    right = { ex: shoulderX + 26, ey: shoulderY - 2, hx: shoulderX + 42, hy: shoulderY - Hh * 0.13 };
  } else if (gesture === 'recoil') {
    right = { ex: shoulderX + 22, ey: shoulderY - 4, hx: shoulderX + 36, hy: shoulderY - Hh * 0.17 };
    left = { ex: -shoulderX - 22, ey: shoulderY - 4, hx: -shoulderX - 36, hy: shoulderY - Hh * 0.17 };
  } else if (gesture === 'clasp') {
    right = { ex: shoulderX + 10, ey: shoulderY + Hh * 0.16, hx: shoulderW * 0.12, hy: hipY - 12 };
    left = { ex: -shoulderX - 10, ey: shoulderY + Hh * 0.16, hx: -shoulderW * 0.12, hy: hipY - 12 };
  } else if (gesture === 'kneel') {
    right = { ex: shoulderX + 8, ey: shoulderY + Hh * 0.18, hx: shoulderX * 0.7, hy: hipY + 4 };
    left = { ex: -shoulderX - 8, ey: shoulderY + Hh * 0.18, hx: -shoulderX * 0.7, hy: hipY + 4 };
  } else if (walking) {
    const swing = Math.sin(a.walkPhase) * Hh * 0.09;
    right = { ex: shoulderX + 6, ey: shoulderY + Hh * 0.14, hx: shoulderX + 10, hy: handY + swing };
    left = { ex: -shoulderX - 6, ey: shoulderY + Hh * 0.14, hx: -shoulderX - 10, hy: handY - swing };
  } else if (a.talking) {
    right = { ex: shoulderX + 14, ey: shoulderY + Hh * 0.13, hx: shoulderX + 24, hy: shoulderY + Hh * 0.2 + Math.sin(t * 6) * 4 };
  }

  drawLimb(-shoulderX, shoulderY + 4, left.ex, left.ey, left.hx, left.hy, armW, coat);
  drawLimb(shoulderX, shoulderY + 4, right.ex, right.ey, right.hx, right.hy, armW, coat);
  // cuffs
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(left.hx - 5, left.hy - 3);
  ctx.lineTo(left.hx + 5, left.hy + 3);
  ctx.moveTo(right.hx - 5, right.hy - 3);
  ctx.lineTo(right.hx + 5, right.hy + 3);
  ctx.stroke();
  // hands
  ctx.fillStyle = skin;
  [left, right].forEach((arm) => {
    ctx.beginPath();
    ctx.arc(arm.hx, arm.hy, Hh * 0.032, 0, Math.PI * 2);
    ctx.fill();
  });

  // neck
  ctx.fillStyle = skin;
  ctx.fillRect(-headR * 0.45, shoulderY - headR * 1.15, headR * 0.9, headR * 0.9);

  // head group
  ctx.save();
  ctx.translate(0, headY);
  if (a.pose === 'bow') ctx.rotate(-0.15);

  // hair behind
  if (a.costume === 'alice') {
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    ctx.ellipse(0, 2, headR * 1.18, headR * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c08d2e';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.95, headR * 0.5, headR * 0.3, headR * 0.55, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'hatter') {
    ctx.fillStyle = '#b5622a';
    ctx.beginPath();
    ctx.ellipse(0, 0, headR * 1.3, headR * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-headR * 1.1, headR * 0.4, headR * 0.36, headR * 0.7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR * 1.1, headR * 0.4, headR * 0.36, headR * 0.7, -0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'hare') {
    ctx.fillStyle = '#9a6b45';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.5, -headR * 1.9, headR * 0.38, headR * 1.4, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR * 0.5, -headR * 1.9, headR * 0.38, headR * 1.4, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e3b7a1';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.5, -headR * 1.9, headR * 0.16, headR * 1.05, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR * 0.5, -headR * 1.9, headR * 0.16, headR * 1.05, 0.12, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'creature') {
    ctx.fillStyle = '#20241d';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.25, headR * 1.16, headR * 1.1, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-headR * 0.9, headR * 0.35, headR * 0.3, headR * 0.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'queen') {
    ctx.fillStyle = '#3a1c24';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.1, headR * 1.2, headR * 1.1, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -headR * 1.1, headR * 0.42, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'gown') {
    ctx.fillStyle = '#6b3a2a';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.05, headR * 1.14, headR * 1.15, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -headR * 1.15, headR * 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'fairy_queen') {
    ctx.fillStyle = '#d8d0ea';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.05, headR * 1.2, headR * 1.2, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -headR * 1.2, headR * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(200,190,240,0.6)';
    ctx.beginPath();
    ctx.ellipse(-headR * 1.0, headR * 0.5, headR * 0.28, headR * 0.6, 0.25, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'fairy_king') {
    ctx.fillStyle = '#1d2e24';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.1, headR * 1.16, headR * 1.1, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'puck') {
    ctx.fillStyle = '#5a3a1f';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.12, headR * 1.16, headR * 1.12, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-headR * 1.0, headR * 0.4, headR * 0.28, headR * 0.55, 0.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'regency') {
    ctx.fillStyle = '#5a3a28';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.1, headR * 1.16, headR * 1.15, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -headR * 1.18, headR * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d6ae6a';
    ctx.beginPath();
    ctx.ellipse(headR * 0.75, -headR * 1.0, headR * 0.35, headR * 0.12, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'bride') {
    ctx.fillStyle = '#241820';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.05, headR * 1.18, headR * 1.2, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(230,225,240,0.28)';
    ctx.beginPath();
    ctx.moveTo(-headR * 1.5, -headR * 0.2);
    ctx.quadraticCurveTo(0, -headR * 2.2, headR * 1.5, -headR * 0.2);
    ctx.lineTo(headR * 1.5, headR * 2.4);
    ctx.lineTo(-headR * 1.5, headR * 2.4);
    ctx.closePath();
    ctx.fill();
  } else if (a.costume === 'vampire') {
    ctx.fillStyle = '#0d080c';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.2, headR * 1.16, headR * 1.05, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-headR * 0.9, headR * 0.35, headR * 0.26, headR * 0.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'dandy' || a.costume === 'victorian') {
    ctx.fillStyle = a.costume === 'victorian' ? '#4a3020' : '#2a1f1c';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.2, headR * 1.12, headR * 1.05, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'ghost') {
    ctx.fillStyle = 'rgba(180,220,235,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.2, headR * 1.15, headR * 1.1, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = a.costume === 'scientist' ? '#2a1f1c' : a.costume === 'prince' ? '#1c1722' : '#3b2a22';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.25, headR * 1.14, headR * 1.05, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  }

  // face
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fill();
  // ears
  ctx.beginPath();
  ctx.arc(-headR * 0.98, 0, headR * 0.18, 0, Math.PI * 2);
  ctx.arc(headR * 0.98, 0, headR * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // face details
  const eyeY = -headR * 0.1;
  const eyeX = headR * 0.38;
  const blink = Math.sin(t * 0.7 + a.seed * 4) > 0.985 ? 0.15 : 1;
  ctx.fillStyle = '#24161a';
  ctx.beginPath();
  ctx.ellipse(-eyeX, eyeY, headR * 0.1, headR * 0.14 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeX, eyeY, headR * 0.1, headR * 0.14 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  // brows
  ctx.strokeStyle = a.costume === 'creature' ? '#121510' : '#3b2620';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (a.costume === 'creature' || a.costume === 'queen' || a.costume === 'royal') {
    ctx.moveTo(-eyeX - 4, eyeY - headR * 0.28);
    ctx.lineTo(-eyeX + 4, eyeY - headR * 0.2);
    ctx.moveTo(eyeX + 4, eyeY - headR * 0.28);
    ctx.lineTo(eyeX - 4, eyeY - headR * 0.2);
  } else {
    ctx.moveTo(-eyeX - 4, eyeY - headR * 0.25);
    ctx.quadraticCurveTo(-eyeX, eyeY - headR * 0.34, -eyeX + 4, eyeY - headR * 0.25);
    ctx.moveTo(eyeX - 4, eyeY - headR * 0.25);
    ctx.quadraticCurveTo(eyeX, eyeY - headR * 0.34, eyeX + 4, eyeY - headR * 0.25);
  }
  ctx.stroke();
  // nose
  ctx.strokeStyle = 'rgba(90,50,40,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, eyeY + 2);
  ctx.lineTo(-1.5, eyeY + headR * 0.32);
  ctx.lineTo(2, eyeY + headR * 0.34);
  ctx.stroke();
  // mouth
  const mouthY = headR * 0.55;
  if (a.talking) {
    const open = 1.5 + Math.abs(Math.sin(t * 10 + a.seed)) * 3.5;
    ctx.fillStyle = '#5a2530';
    ctx.beginPath();
    ctx.ellipse(0, mouthY, headR * 0.22, open, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0e2d0';
    ctx.fillRect(-headR * 0.16, mouthY - open + 1, headR * 0.32, 1.8);
  } else {
    ctx.strokeStyle = '#7a3a3f';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.18, mouthY);
    ctx.quadraticCurveTo(0, mouthY + headR * 0.12, headR * 0.18, mouthY);
    ctx.stroke();
  }

  // costume-specific head pieces
  if (a.costume === 'scientist') {
    // goggles
    ctx.strokeStyle = '#b08a46';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(-headR * 0.36, -headR * 0.55, headR * 0.26, 0, Math.PI * 2);
    ctx.arc(headR * 0.36, -headR * 0.55, headR * 0.26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(160,220,210,0.3)';
    ctx.beginPath();
    ctx.arc(-headR * 0.36, -headR * 0.55, headR * 0.2, 0, Math.PI * 2);
    ctx.arc(headR * 0.36, -headR * 0.55, headR * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#b08a46';
    ctx.beginPath();
    ctx.moveTo(-headR * 0.1, -headR * 0.55);
    ctx.lineTo(headR * 0.1, -headR * 0.55);
    ctx.stroke();
  } else if (a.costume === 'creature') {
    // stitches
    ctx.strokeStyle = 'rgba(40,60,35,0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.7, -headR * 0.35);
    ctx.lineTo(-headR * 0.25, -headR * 0.35);
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(-headR * 0.65 + i * 10, -headR * 0.42);
      ctx.lineTo(-headR * 0.65 + i * 10, -headR * 0.28);
    }
    ctx.stroke();
    // neck bolts
    ctx.fillStyle = '#6f7a6a';
    ctx.beginPath();
    ctx.arc(-headR * 1.1, headR * 1.02, headR * 0.17, 0, Math.PI * 2);
    ctx.arc(headR * 1.1, headR * 1.02, headR * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3b4237';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else if (a.costume === 'alice') {
    // ribbon
    ctx.fillStyle = '#3b2330';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.75, -headR * 0.85, headR * 0.32, headR * 0.16, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-headR * 0.3, -headR * 0.92, headR * 0.32, headR * 0.16, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7fb3e8';
    ctx.beginPath();
    ctx.arc(-headR * 0.52, -headR * 0.88, headR * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'hatter') {
    // top hat
    ctx.fillStyle = '#241726';
    ctx.fillRect(-headR * 0.85, -headR * 2.3, headR * 1.7, headR * 1.45);
    ctx.fillStyle = '#3a2338';
    ctx.fillRect(-headR * 0.72, -headR * 2.2, headR * 0.2, headR * 1.2);
    ctx.fillStyle = '#c94b63';
    ctx.fillRect(-headR * 0.85, -headR * 1.28, headR * 1.7, headR * 0.22);
    ctx.fillStyle = '#f6ead0';
    ctx.fillRect(headR * 0.15, -headR * 1.24, headR * 0.44, headR * 0.3);
    ctx.fillStyle = '#3b2330';
    ctx.font = `${Math.max(6, headR * 0.24)}px serif`;
    ctx.textAlign = 'center';
    ctx.fillText('10/6', headR * 0.37, -headR * 1.04);
    ctx.fillStyle = '#241726';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.92, headR * 1.35, headR * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'hare') {
    // muzzle
    ctx.fillStyle = '#e3b7a1';
    ctx.beginPath();
    ctx.ellipse(0, headR * 0.38, headR * 0.52, headR * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8c3a4a';
    ctx.beginPath();
    ctx.ellipse(0, headR * 0.28, headR * 0.14, headR * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,30,0.5)';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i += 2) {
      for (let j = 0; j < 3; j++) {
        ctx.beginPath();
        ctx.moveTo(i * headR * 0.3, headR * 0.4);
        ctx.lineTo(i * headR * 0.9, headR * 0.28 + j * 5);
        ctx.stroke();
      }
    }
    // monocle
    ctx.strokeStyle = '#d6ae6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(headR * 0.4, -headR * 0.05, headR * 0.22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(headR * 0.6, headR * 0.05);
    ctx.lineTo(headR * 0.9, headR * 0.5);
    ctx.stroke();
  } else if (a.costume === 'queen') {
    // crown
    ctx.fillStyle = '#e6b94f';
    ctx.beginPath();
    ctx.moveTo(-headR * 0.7, -headR * 1.05);
    ctx.lineTo(-headR * 0.5, -headR * 1.55);
    ctx.lineTo(-headR * 0.2, -headR * 1.22);
    ctx.lineTo(0, -headR * 1.7);
    ctx.lineTo(headR * 0.2, -headR * 1.22);
    ctx.lineTo(headR * 0.5, -headR * 1.55);
    ctx.lineTo(headR * 0.7, -headR * 1.05);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c94b63';
    ctx.beginPath();
    ctx.arc(0, -headR * 1.28, headR * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // high collar
    ctx.strokeStyle = 'rgba(240,207,139,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-headR * 1.1, headR * 0.8);
    ctx.quadraticCurveTo(-headR * 1.9, headR * 0.2, -headR * 1.4, -headR * 0.6);
    ctx.moveTo(headR * 1.1, headR * 0.8);
    ctx.quadraticCurveTo(headR * 1.9, headR * 0.2, headR * 1.4, -headR * 0.6);
    ctx.stroke();
  } else if (a.costume === 'royal') {
    ctx.fillStyle = '#e6b94f';
    ctx.beginPath();
    ctx.moveTo(-headR * 0.66, -headR * 1.0);
    ctx.lineTo(-headR * 0.5, -headR * 1.42);
    ctx.lineTo(-headR * 0.2, -headR * 1.16);
    ctx.lineTo(0, -headR * 1.55);
    ctx.lineTo(headR * 0.2, -headR * 1.16);
    ctx.lineTo(headR * 0.5, -headR * 1.42);
    ctx.lineTo(headR * 0.66, -headR * 1.0);
    ctx.closePath();
    ctx.fill();
  } else if (a.costume === 'prince') {
    ctx.strokeStyle = 'rgba(200,220,255,0.2)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, headR * 1.05, 0, Math.PI * 2);
    ctx.stroke();
  } else if (a.costume === 'ghost') {
    // helm visor
    ctx.strokeStyle = 'rgba(220,245,255,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.9, -headR * 0.25);
    ctx.lineTo(headR * 0.9, -headR * 0.25);
    ctx.moveTo(-headR * 0.75, -headR * 0.4);
    ctx.lineTo(-headR * 0.75, headR * 0.15);
    ctx.moveTo(headR * 0.75, -headR * 0.4);
    ctx.lineTo(headR * 0.75, headR * 0.15);
    ctx.stroke();
    ctx.fillStyle = 'rgba(190,245,255,0.9)';
    ctx.beginPath();
    ctx.arc(-eyeX, eyeY, headR * 0.13, 0, Math.PI * 2);
    ctx.arc(eyeX, eyeY, headR * 0.13, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'fairy_queen') {
    // flower crown
    ctx.fillStyle = '#d2beff';
    for (let i = -3; i <= 3; i++) {
      const a2 = -Math.PI / 2 + i * 0.22;
      ctx.beginPath();
      ctx.arc(Math.cos(a2) * headR * 1.05, Math.sin(a2) * headR * 1.05, headR * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#8fe6c0';
    ctx.beginPath();
    ctx.arc(0, -headR * 1.15, headR * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // pointed ears
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.95, -headR * 0.2);
    ctx.lineTo(-headR * 1.5, -headR * 0.7);
    ctx.lineTo(-headR * 0.85, headR * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headR * 0.95, -headR * 0.2);
    ctx.lineTo(headR * 1.5, -headR * 0.7);
    ctx.lineTo(headR * 0.85, headR * 0.2);
    ctx.closePath();
    ctx.fill();
    // glowing eyes
    ctx.fillStyle = 'rgba(190,255,220,0.85)';
    ctx.beginPath();
    ctx.arc(-eyeX, eyeY, headR * 0.05, 0, Math.PI * 2);
    ctx.arc(eyeX, eyeY, headR * 0.05, 0, Math.PI * 2);
    ctx.fill();
  } else if (a.costume === 'fairy_king') {
    // antler crown
    ctx.strokeStyle = '#8d6f3f';
    ctx.lineWidth = 3;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(side * headR * 0.45, -headR * 0.95);
      ctx.quadraticCurveTo(side * headR * 0.8, -headR * 1.8, side * headR * 0.55, -headR * 2.3);
      ctx.moveTo(side * headR * 0.65, -headR * 1.45);
      ctx.lineTo(side * headR * 1.05, -headR * 1.7);
      ctx.moveTo(side * headR * 0.58, -headR * 1.75);
      ctx.lineTo(side * headR * 0.95, -headR * 2.0);
      ctx.stroke();
    });
    ctx.fillStyle = '#7fd6c4';
    ctx.beginPath();
    ctx.arc(0, -headR * 1.1, headR * 0.08, 0, Math.PI * 2);
    ctx.fill();
    // pointed ears
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.95, -headR * 0.1);
    ctx.lineTo(-headR * 1.45, -headR * 0.55);
    ctx.lineTo(-headR * 0.85, headR * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headR * 0.95, -headR * 0.1);
    ctx.lineTo(headR * 1.45, -headR * 0.55);
    ctx.lineTo(headR * 0.85, headR * 0.25);
    ctx.closePath();
    ctx.fill();
  } else if (a.costume === 'puck') {
    // horns
    ctx.strokeStyle = '#d6c6a8';
    ctx.lineWidth = 4;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.moveTo(side * headR * 0.55, -headR * 0.85);
      ctx.quadraticCurveTo(side * headR * 0.95, -headR * 1.5, side * headR * 0.7, -headR * 1.95);
      ctx.stroke();
    });
    // pointed ears
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.95, 0);
    ctx.lineTo(-headR * 1.6, -headR * 0.5);
    ctx.lineTo(-headR * 0.8, headR * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headR * 0.95, 0);
    ctx.lineTo(headR * 1.6, -headR * 0.5);
    ctx.lineTo(headR * 0.8, headR * 0.3);
    ctx.closePath();
    ctx.fill();
    // freckles
    ctx.fillStyle = 'rgba(90,60,40,0.5)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc((i % 2 ? 1 : -1) * (headR * 0.3 + i * 2), headR * 0.22 + (i % 3) * 3, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (a.costume === 'regency') {
    // ribbon and feather
    ctx.fillStyle = '#7fd6c4';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.8, -headR * 0.95, headR * 0.28, headR * 0.12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f6ead0';
    ctx.beginPath();
    ctx.arc(headR * 0.88, -headR * 0.92, headR * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7fd6c4';
    ctx.beginPath();
    ctx.arc(headR * 0.88, -headR * 0.92, headR * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // pearl necklace
    ctx.fillStyle = 'rgba(255,250,235,0.85)';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * headR * 0.16, headR * 0.95 + Math.abs(i) * 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (a.costume === 'dandy' || a.costume === 'victorian') {
    // sideburns
    ctx.fillStyle = a.costume === 'victorian' ? '#4a3020' : '#2a1f1c';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.95, headR * 0.15, headR * 0.2, headR * 0.45, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR * 0.95, headR * 0.15, headR * 0.2, headR * 0.45, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // high collar
    ctx.strokeStyle = '#f6ead0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.5, headR * 0.9);
    ctx.quadraticCurveTo(0, headR * 1.2, headR * 0.5, headR * 0.9);
    ctx.stroke();
  } else if (a.costume === 'vampire') {
    // slicked hair
    ctx.fillStyle = '#0d080c';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.65, headR * 1.0, headR * 0.45, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // red eyes
    ctx.fillStyle = '#ff4f6d';
    ctx.beginPath();
    ctx.arc(-eyeX, eyeY, headR * 0.08, 0, Math.PI * 2);
    ctx.arc(eyeX, eyeY, headR * 0.08, 0, Math.PI * 2);
    ctx.fill();
    // fangs
    ctx.fillStyle = '#fff6ea';
    ctx.beginPath();
    ctx.moveTo(-headR * 0.14, mouthY);
    ctx.lineTo(-headR * 0.08, mouthY + headR * 0.18);
    ctx.lineTo(-headR * 0.02, mouthY);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(headR * 0.02, mouthY);
    ctx.lineTo(headR * 0.08, mouthY + headR * 0.18);
    ctx.lineTo(headR * 0.14, mouthY);
    ctx.closePath();
    ctx.fill();
    // high collar
    ctx.strokeStyle = '#5c0f1f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.9, headR * 0.9);
    ctx.quadraticCurveTo(-headR * 1.5, headR * 0.2, -headR * 1.2, -headR * 0.5);
    ctx.moveTo(headR * 0.9, headR * 0.9);
    ctx.quadraticCurveTo(headR * 1.5, headR * 0.2, headR * 1.2, -headR * 0.5);
    ctx.stroke();
  } else if (a.costume === 'bride') {
    // veil edge
    ctx.strokeStyle = 'rgba(240,235,250,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-headR * 1.1, -headR * 0.4);
    ctx.quadraticCurveTo(0, -headR * 1.9, headR * 1.1, -headR * 0.4);
    ctx.stroke();
    // red eyes
    ctx.fillStyle = '#d85a72';
    ctx.beginPath();
    ctx.arc(-eyeX, eyeY, headR * 0.06, 0, Math.PI * 2);
    ctx.arc(eyeX, eyeY, headR * 0.06, 0, Math.PI * 2);
    ctx.fill();
    // pale lips
    ctx.strokeStyle = '#a85a70';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.16, mouthY);
    ctx.quadraticCurveTo(0, mouthY + headR * 0.1, headR * 0.16, mouthY);
    ctx.stroke();
  } else if (a.costume === 'gown') {
    ctx.fillStyle = '#d6ae6a';
    ctx.beginPath();
    ctx.arc(0, headR * 0.95, headR * 0.07, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore(); // head

  // Bottom's donkey head sits over the human head for the transformation.
  if (a.costume === 'donkey') {
    ctx.save();
    ctx.translate(0, headY);
    // ears
    ctx.fillStyle = '#6a4a2a';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.55, -headR * 1.9, headR * 0.34, headR * 1.35, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR * 0.55, -headR * 1.9, headR * 0.34, headR * 1.35, 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9a27a';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.55, -headR * 1.9, headR * 0.14, headR * 1.0, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR * 0.55, -headR * 1.9, headR * 0.14, headR * 1.0, 0.18, 0, Math.PI * 2);
    ctx.fill();
    // head
    ctx.fillStyle = '#8a6a4a';
    ctx.beginPath();
    ctx.ellipse(0, 0, headR * 1.25, headR * 1.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // mane
    ctx.fillStyle = '#3b2614';
    ctx.beginPath();
    ctx.ellipse(0, -headR * 0.85, headR * 0.45, headR * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // muzzle
    ctx.fillStyle = '#c9a27a';
    ctx.beginPath();
    ctx.ellipse(0, headR * 0.55, headR * 0.68, headR * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    // nostrils
    ctx.fillStyle = '#4a2e1c';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.22, headR * 0.55, headR * 0.08, headR * 0.11, 0.2, 0, Math.PI * 2);
    ctx.ellipse(headR * 0.22, headR * 0.55, headR * 0.08, headR * 0.11, -0.2, 0, Math.PI * 2);
    ctx.fill();
    // mouth
    ctx.strokeStyle = '#3b2614';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-headR * 0.3, headR * 0.85);
    ctx.quadraticCurveTo(0, headR * 1.0, headR * 0.3, headR * 0.85);
    ctx.stroke();
    // eyes
    ctx.fillStyle = '#f6ead0';
    ctx.beginPath();
    ctx.ellipse(-headR * 0.5, -headR * 0.2, headR * 0.2, headR * 0.25, 0, 0, Math.PI * 2);
    ctx.ellipse(headR * 0.5, -headR * 0.2, headR * 0.2, headR * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#24161a';
    ctx.beginPath();
    ctx.arc(-headR * 0.45, -headR * 0.2, headR * 0.09, 0, Math.PI * 2);
    ctx.arc(headR * 0.45, -headR * 0.2, headR * 0.09, 0, Math.PI * 2);
    ctx.fill();
    // teeth
    ctx.fillStyle = '#fff6ea';
    ctx.fillRect(-headR * 0.18, headR * 0.82, headR * 0.1, headR * 0.18);
    ctx.fillRect(headR * 0.08, headR * 0.82, headR * 0.1, headR * 0.18);
    ctx.restore();
  }

  // props
  if (a.costume === 'queen') {
    ctx.strokeStyle = '#d6ae6a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shoulderW * 0.9, hipY - 20);
    ctx.lineTo(shoulderW * 0.9, shoulderY - Hh * 0.2);
    ctx.stroke();
    ctx.fillStyle = '#c94b63';
    ctx.beginPath();
    ctx.arc(shoulderW * 0.9, shoulderY - Hh * 0.23, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0cf8b';
    ctx.beginPath();
    ctx.arc(shoulderW * 0.9, shoulderY - Hh * 0.23, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (a.costume === 'fairy_king') {
    ctx.strokeStyle = '#8d6f3f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(shoulderW * 0.92, hipY - 10);
    ctx.lineTo(shoulderW * 0.92, shoulderY - Hh * 0.28);
    ctx.stroke();
    ctx.fillStyle = '#7fd6c4';
    ctx.shadowColor = 'rgba(127,214,196,0.8)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(shoulderW * 0.92, shoulderY - Hh * 0.3, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

/* ── Lighting ───────────────────────────────────────────────────────────── */

function drawLighting(now) {
  const l = stage.light.current;
  const rgb = { r: l.r, g: l.g, b: l.b };
  const intensity = l.intensity;

  // darkness
  ctx.fillStyle = `rgba(3,4,10,${(1 - intensity) * 0.52})`;
  ctx.fillRect(0, 0, W, H);

  // coloured wash
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = rgba(rgb, 0.14 * intensity);
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // beams
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const spots = [
    { x: 420, y: 760, w: 260 },
    { x: 800, y: 760, w: 300 },
    { x: 1180, y: 760, w: 260 },
  ];
  spots.forEach((s, i) => {
    const flicker = 0.92 + Math.sin(now / 700 + i * 2.1) * 0.06;
    const beam = ctx.createLinearGradient(0, 60, 0, s.y);
    beam.addColorStop(0, rgba(rgb, 0.22 * intensity * flicker));
    beam.addColorStop(0.55, rgba(rgb, 0.08 * intensity * flicker));
    beam.addColorStop(1, rgba(rgb, 0.015 * intensity));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(800 - 22, 60);
    ctx.lineTo(800 + 22, 60);
    ctx.lineTo(s.x + s.w, s.y);
    ctx.lineTo(s.x - s.w, s.y);
    ctx.closePath();
    ctx.fill();
    const pool = ctx.createRadialGradient(s.x, s.y, 8, s.x, s.y, s.w);
    pool.addColorStop(0, rgba(rgb, 0.16 * intensity * flicker));
    pool.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.w, s.w * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // lightning flash
  if (stage.flash > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(190,225,255,${stage.flash * 0.55})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // bolt
  if (stage.bolt && stage.bolt.life > 0) {
    const b = stage.bolt;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(190,235,255,${b.life * 0.85})`;
    ctx.lineWidth = 4;
    ctx.shadowColor = 'rgba(140,220,255,0.9)';
    ctx.shadowBlur = 22;
    ctx.beginPath();
    b.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = `rgba(255,255,255,${b.life})`;
    ctx.stroke();
    ctx.restore();
  }
}

/* ── Speech bubble ──────────────────────────────────────────────────────── */

function drawBubble(now) {
  const b = stage.bubble;
  if (!b || b.alpha <= 0.01) return;
  const actor = stage.actors.get(b.actorId);
  if (!actor) return;

  // On a phone the canvas is scaled down hard, so draw the bubble larger
  // in stage coordinates to keep the dialogue legible.
  const bs = canvas.clientWidth && canvas.clientWidth < 720 ? 2 : 1;
  const text = b.text;
  const shownCount = Math.min(text.length, Math.floor(b.chars));
  const font = `500 ${Math.round(22 * bs)}px "Cormorant Garamond", Georgia, serif`;
  ctx.save();
  ctx.font = font;
  const maxTextW = 386 * bs;
  const lines = wrapLines(ctx, text, maxTextW);
  let widest = 0;
  lines.forEach((line) => {
    widest = Math.max(widest, ctx.measureText(line).width);
  });
  const bubbleW = clamp(widest + 46 * bs, 250 * bs, 450 * bs);
  const lineH = 28 * bs;
  const nameH = 26 * bs;
  const bubbleH = (30 + 18) * bs + nameH + lines.length * lineH;
  const headTop = FLOOR_Y - 170 * actor.height;
  const bx = clamp(actor.x - bubbleW / 2, OPENING.x + 180, OPENING.x + OPENING.w - bubbleW - 24);
  let by = headTop - bubbleH - 26 * bs;
  by = clamp(by, OPENING.y + 24, OPENING.y + OPENING.h - bubbleH - 40);

  const scale = easeOutBack(clamp(b.age / 0.28, 0, 1));
  ctx.globalAlpha = b.alpha;
  ctx.translate(bx + bubbleW / 2, by + bubbleH);
  ctx.scale(0.88 + 0.12 * scale, 0.88 + 0.12 * scale);
  ctx.translate(-(bx + bubbleW / 2), -(by + bubbleH));

  // shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 26 * bs;
  ctx.shadowOffsetY = 10 * bs;
  ctx.fillStyle = '#f6ead0';
  roundRectPath(ctx, bx, by, bubbleW, bubbleH, 14 * bs);
  ctx.fill();
  ctx.restore();

  // paper
  const paper = ctx.createLinearGradient(bx, by, bx, by + bubbleH);
  paper.addColorStop(0, '#fbf2df');
  paper.addColorStop(1, '#e9d6b4');
  ctx.fillStyle = paper;
  roundRectPath(ctx, bx, by, bubbleW, bubbleH, 14 * bs);
  ctx.fill();
  ctx.strokeStyle = '#3b1f28';
  ctx.lineWidth = 2 * bs;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(166,124,66,0.5)';
  ctx.lineWidth = Math.max(1, bs);
  roundRectPath(ctx, bx + 5 * bs, by + 5 * bs, bubbleW - 10 * bs, bubbleH - 10 * bs, 10 * bs);
  ctx.stroke();

  // tail
  const tailX = clamp(actor.x, bx + 30 * bs, bx + bubbleW - 30 * bs);
  ctx.fillStyle = '#f3e3c6';
  ctx.beginPath();
  ctx.moveTo(tailX - 12 * bs, by + bubbleH - 2 * bs);
  ctx.lineTo(tailX + 12 * bs, by + bubbleH - 2 * bs);
  ctx.lineTo(actor.x + 4, headTop - 6 * bs);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#3b1f28';
  ctx.lineWidth = 2 * bs;
  ctx.beginPath();
  ctx.moveTo(tailX - 12 * bs, by + bubbleH);
  ctx.lineTo(actor.x + 4, headTop - 6 * bs);
  ctx.lineTo(tailX + 12 * bs, by + bubbleH);
  ctx.stroke();
  // hide the tail seam
  ctx.fillStyle = '#f3e3c6';
  ctx.fillRect(tailX - 11 * bs, by + bubbleH - 6 * bs, 22 * bs, 5 * bs);

  // name tag
  ctx.font = `700 ${Math.round(11 * bs)}px "Inter", sans-serif`;
  const tagW = Math.max(78 * bs, ctx.measureText(String(actor.short || actor.name)).width + 34 * bs);
  ctx.fillStyle = '#2a1219';
  roundRectPath(ctx, bx + 16 * bs, by + 12 * bs, tagW, nameH, 6 * bs);
  ctx.fill();
  ctx.fillStyle = actor.color;
  ctx.beginPath();
  ctx.arc(bx + 27 * bs, by + 25 * bs, 4 * bs, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f3d797';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(actor.short || actor.name).toUpperCase(), bx + 37 * bs, by + 26 * bs);

  // dialogue text
  ctx.fillStyle = '#2b1820';
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  const textTop = by + 12 * bs + nameH + 24 * bs;
  let remaining = shownCount;
  lines.forEach((line, i) => {
    const visible = line.slice(0, Math.max(0, remaining));
    remaining -= line.length + 1;
    ctx.fillText(visible, bx + 23 * bs, textTop + i * lineH);
  });

  // typewriter cursor
  if (shownCount < text.length) {
    const lastLine = Math.min(lines.length - 1, Math.max(0, Math.floor((shownCount || 1) / Math.max(1, Math.ceil(text.length / lines.length)))));
    const before = lines[lastLine] ? lines[lastLine].slice(0, Math.max(0, shownCount - lines.slice(0, lastLine).reduce((n, l) => n + l.length + 1, 0))) : '';
    const cursorX = bx + 24 * bs + ctx.measureText(before).width;
    const cursorY = textTop + lastLine * lineH;
    if (Math.sin(now / 160) > -0.3) {
      ctx.fillStyle = 'rgba(59,31,40,0.7)';
      ctx.fillRect(cursorX + bs, cursorY - 18 * bs, 2 * bs, 21 * bs);
    }
  } else {
    ctx.fillStyle = 'rgba(120,80,45,0.6)';
    ctx.font = `${Math.round(14 * bs)}px serif`;
    ctx.textAlign = 'right';
    ctx.fillText('❧', bx + bubbleW - 20 * bs, by + bubbleH - 14 * bs);
  }

  ctx.restore();
}


/* ── Particles & atmosphere ─────────────────────────────────────────────── */

function initMotes() {
  stage.motes = [];
  for (let i = 0; i < 54; i++) {
    stage.motes.push({
      x: rand(OPENING.x, OPENING.x + OPENING.w),
      y: rand(OPENING.y + 80, 800),
      r: rand(0.6, 2.2),
      vx: rand(-5, 5),
      vy: rand(-9, -2),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.4, 1.2),
    });
  }
}
initMotes();

function updateMotes(dt) {
  stage.motes.forEach((m) => {
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.phase += dt * m.speed;
    if (m.y < OPENING.y + 60) {
      m.y = 800;
      m.x = rand(OPENING.x, OPENING.x + OPENING.w);
    }
    if (m.x < OPENING.x) m.x = OPENING.x + OPENING.w;
    if (m.x > OPENING.x + OPENING.w) m.x = OPENING.x;
  });
}

function drawMotes(now) {
  const l = stage.light.current;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  stage.motes.forEach((m) => {
    const a = (0.06 + Math.abs(Math.sin(m.phase)) * 0.16) * l.intensity;
    ctx.fillStyle = rgba(l, a);
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function spawnFx(kind) {
  const t = performance.now();
  if (kind === 'sparks') {
    for (let i = 0; i < 46; i++) {
      stage.fxParticles.push({
        kind: 'spark',
        x: 860 + rand(-30, 30),
        y: 360 + rand(-20, 20),
        vx: rand(-260, 260),
        vy: rand(-280, 120),
        g: 420,
        life: rand(0.7, 1.7),
        maxLife: 1.7,
        size: rand(1.4, 3.6),
        color: pick(['#ffd27a', '#ffe9b0', '#ff9d5c', '#7fffe0']),
        rot: 0,
        vr: 0,
      });
    }
    stage.shake = Math.max(stage.shake, 7);
  } else if (kind === 'lightning') {
    stage.flash = 1;
    stage.shake = Math.max(stage.shake, 9);
    const points = [];
    let x = rand(820, 1000);
    let y = 100;
    points.push({ x, y });
    while (y < 560) {
      y += rand(30, 62);
      x += rand(-42, 42);
      points.push({ x, y });
    }
    stage.bolt = { points, life: 0.42 };
  } else if (kind === 'fog') {
    for (let i = 0; i < 9; i++) {
      stage.fog.push({
        x: rand(OPENING.x, OPENING.x + OPENING.w),
        y: rand(650, 790),
        r: rand(120, 240),
        vx: rand(-18, 18),
        life: rand(4, 8),
        maxLife: 8,
        alpha: rand(0.05, 0.11),
      });
    }
  } else if (kind === 'petals') {
    for (let i = 0; i < 40; i++) {
      stage.fxParticles.push({
        kind: 'petal',
        x: rand(OPENING.x, OPENING.x + OPENING.w),
        y: rand(OPENING.y, 300),
        vx: rand(-24, 24),
        vy: rand(28, 70),
        g: 4,
        life: rand(4, 7),
        maxLife: 7,
        size: rand(4, 9),
        color: pick(['#f3a6bb', '#e98aa4', '#ffd1dc', '#f7c6d3']),
        rot: rand(0, Math.PI * 2),
        vr: rand(-2, 2),
      });
    }
  } else if (kind === 'confetti') {
    for (let i = 0; i < 90; i++) {
      stage.fxParticles.push({
        kind: 'confetti',
        x: rand(OPENING.x, OPENING.x + OPENING.w),
        y: rand(OPENING.y, 260),
        vx: rand(-40, 40),
        vy: rand(40, 110),
        g: 14,
        life: rand(4, 7),
        maxLife: 7,
        size: rand(4, 9),
        color: pick(['#f3d797', '#d25a71', '#73d7c4', '#a78bfa', '#f6ead0']),
        rot: rand(0, Math.PI * 2),
        vr: rand(-4, 4),
      });
    }
  } else if (kind === 'embers') {
    for (let i = 0; i < 34; i++) {
      stage.fxParticles.push({
        kind: 'spark',
        x: rand(OPENING.x + 100, OPENING.x + OPENING.w - 100),
        y: rand(600, 780),
        vx: rand(-18, 18),
        vy: rand(-70, -30),
        g: -6,
        life: rand(2, 4),
        maxLife: 4,
        size: rand(1, 2.6),
        color: pick(['#ffb15c', '#ffd27a', '#ff7a3d']),
        rot: 0,
        vr: 0,
      });
    }
  } else if (kind === 'snow') {
    for (let i = 0; i < 70; i++) {
      stage.fxParticles.push({
        kind: 'snow',
        x: rand(OPENING.x, OPENING.x + OPENING.w),
        y: rand(OPENING.y, 260),
        vx: rand(-16, 16),
        vy: rand(20, 54),
        g: 0,
        life: rand(4, 8),
        maxLife: 8,
        size: rand(1.5, 4),
        color: '#e8f4ff',
        rot: 0,
        vr: 0,
      });
    }
  } else if (kind === 'cards') {
    for (let i = 0; i < 40; i++) {
      stage.fxParticles.push({
        kind: 'card',
        x: rand(OPENING.x, OPENING.x + OPENING.w),
        y: rand(OPENING.y, 260),
        vx: rand(-40, 40),
        vy: rand(30, 90),
        g: 8,
        life: rand(4, 7),
        maxLife: 7,
        size: rand(9, 16),
        color: '#f6ead0',
        suit: pick(['♥', '♠', '♦', '♣']),
        rot: rand(0, Math.PI * 2),
        vr: rand(-3, 3),
      });
    }
  } else if (kind === 'fireflies') {
    for (let i = 0; i < 34; i++) {
      stage.fxParticles.push({
        kind: 'spark',
        x: rand(OPENING.x + 60, OPENING.x + OPENING.w - 60),
        y: rand(300, 760),
        vx: rand(-10, 10),
        vy: rand(-24, -6),
        g: -3,
        life: rand(3, 7),
        maxLife: 7,
        size: rand(1.2, 2.8),
        color: pick(['#b6ffcf', '#e8ffb0', '#8fe6c0']),
        rot: 0,
        vr: 0,
      });
    }
  } else if (kind === 'bats') {
    for (let i = 0; i < 16; i++) {
      stage.fxParticles.push({
        kind: 'bat',
        x: rand(OPENING.x, OPENING.x + OPENING.w),
        y: rand(180, 520),
        vx: rand(-120, 120),
        vy: rand(-40, 40),
        g: 0,
        life: rand(2.4, 4.5),
        maxLife: 4.5,
        size: rand(7, 15),
        color: '#0b0610',
        rot: rand(-0.4, 0.4),
        vr: rand(-1.2, 1.2),
      });
    }
  }
  // avoid unused warning
  void t;
}

function spawnReaction(kind) {
  const colors = { applaud: '#f3d797', laugh: '#ffd27a', gasp: '#b9e6ff', rose: '#ff6b85' };
  if (kind === 'applaud') {
    for (let i = 0; i < 56; i++) {
      stage.reactionParticles.push({
        kind: 'sparkle',
        x: rand(0, W),
        y: rand(760, 900),
        vx: rand(-30, 30),
        vy: rand(-230, -90),
        g: 34,
        life: rand(1.2, 2.6),
        maxLife: 2.6,
        size: rand(1.4, 4),
        color: colors[kind],
        rot: rand(0, Math.PI * 2),
        vr: rand(-3, 3),
      });
    }
    for (let i = 0; i < 7; i++) {
      stage.reactionParticles.push({
        kind: 'emoji',
        x: rand(140, W - 140),
        y: rand(800, 900),
        vx: rand(-40, 40),
        vy: rand(-200, -130),
        g: 24,
        life: rand(1.6, 2.8),
        maxLife: 2.8,
        size: rand(22, 34),
        text: '👏',
        color: '#f3d797',
        rot: rand(-0.4, 0.4),
        vr: rand(-1, 1),
      });
    }
    stage.reactionParticles.push({
      kind: 'text',
      x: rand(400, 1200),
      y: 780,
      vx: 0,
      vy: -46,
      g: 0,
      life: 1.8,
      maxLife: 1.8,
      size: 34,
      text: 'BRAVO!',
      color: '#f3d797',
      rot: 0,
      vr: 0,
    });
  } else if (kind === 'laugh') {
    for (let i = 0; i < 15; i++) {
      stage.reactionParticles.push({
        kind: 'emoji',
        x: rand(160, W - 160),
        y: rand(790, 900),
        vx: rand(-55, 55),
        vy: rand(-260, -150),
        g: 30,
        life: rand(1.5, 2.7),
        maxLife: 2.7,
        size: rand(20, 36),
        text: '😂',
        color: colors[kind],
        rot: rand(-0.5, 0.5),
        vr: rand(-2, 2),
      });
    }
    stage.reactionParticles.push({
      kind: 'text', x: rand(500, 1100), y: 790, vx: 0, vy: -40, g: 0, life: 1.6, maxLife: 1.6,
      size: 30, text: 'HA HA!', color: '#ffd27a', rot: 0, vr: 0,
    });
  } else if (kind === 'gasp') {
    for (let i = 0; i < 7; i++) {
      stage.reactionParticles.push({
        kind: 'emoji',
        x: rand(240, W - 240),
        y: rand(780, 900),
        vx: rand(-25, 25),
        vy: rand(-190, -110),
        g: 20,
        life: rand(1.4, 2.4),
        maxLife: 2.4,
        size: rand(22, 34),
        text: '😱',
        color: colors[kind],
        rot: rand(-0.2, 0.2),
        vr: rand(-1, 1),
      });
    }
    for (let i = 0; i < 18; i++) {
      stage.reactionParticles.push({
        kind: 'ring',
        x: rand(300, W - 300),
        y: rand(600, 820),
        vx: 0,
        vy: -30,
        g: 0,
        life: rand(0.7, 1.3),
        maxLife: 1.3,
        size: rand(10, 30),
        color: colors[kind],
        rot: 0,
        vr: 0,
      });
    }
    stage.shake = Math.max(stage.shake, 5);
    stage.flash = Math.max(stage.flash, 0.18);
  } else if (kind === 'rose') {
    for (let i = 0; i < 9; i++) {
      const fromLeft = i % 2 === 0;
      stage.reactionParticles.push({
        kind: 'emoji',
        x: fromLeft ? rand(60, 240) : rand(W - 240, W - 60),
        y: rand(830, 900),
        vx: fromLeft ? rand(110, 210) : rand(-210, -110),
        vy: rand(-560, -420),
        g: 420,
        life: rand(2.2, 3.2),
        maxLife: 3.2,
        size: rand(24, 38),
        text: '🌹',
        color: colors[kind],
        rot: rand(-0.4, 0.4),
        vr: rand(-3, 3),
      });
    }
    stage.reactionParticles.push({
      kind: 'text', x: rand(500, 1100), y: 760, vx: 0, vy: -40, g: 0, life: 1.8, maxLife: 1.8,
      size: 30, text: 'ENCORE!', color: '#ff8fa3', rot: 0, vr: 0,
    });
  }

  // reaction particles cap
  if (stage.reactionParticles.length > 420) {
    stage.reactionParticles.splice(0, stage.reactionParticles.length - 420);
  }
}

function updateParticles(dt) {
  const upd = (p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.g || 0) * dt;
    p.rot += (p.vr || 0) * dt;
    p.life -= dt;
  };
  stage.fxParticles.forEach(upd);
  stage.reactionParticles.forEach(upd);
  stage.fxParticles = stage.fxParticles.filter((p) => p.life > 0);
  stage.reactionParticles = stage.reactionParticles.filter((p) => p.life > 0);
  stage.fog.forEach((f) => {
    f.x += f.vx * dt;
    f.life -= dt;
  });
  stage.fog = stage.fog.filter((f) => f.life > 0);
  if (stage.bolt) {
    stage.bolt.life -= dt * 2.2;
    if (stage.bolt.life <= 0) stage.bolt = null;
  }
}

function drawFxParticles() {
  stage.fxParticles.forEach((p) => {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    if (p.kind === 'spark') {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'petal') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'confetti') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else if (p.kind === 'snow') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'card') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      roundRectPath(ctx, -p.size * 0.7, -p.size, p.size * 1.4, p.size * 2, 2);
      ctx.fill();
      ctx.fillStyle = '#a83246';
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.suit, 0, p.size * 0.35);
    } else if (p.kind === 'bat') {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-s, -s * 0.9, -s * 2.2, -s * 0.1);
      ctx.quadraticCurveTo(-s * 1.2, 0, 0, s * 0.35);
      ctx.quadraticCurveTo(s * 1.2, 0, s * 2.2, -s * 0.1);
      ctx.quadraticCurveTo(s, -s * 0.9, 0, 0);
      ctx.fill();
    }
    ctx.restore();
  });

  // fog puffs
  stage.fog.forEach((f) => {
    const a = clamp(f.life / f.maxLife, 0, 1) * f.alpha;
    const g = ctx.createRadialGradient(f.x, f.y, 8, f.x, f.y, f.r);
    g.addColorStop(0, `rgba(190,210,230,${a})`);
    g.addColorStop(1, 'rgba(190,210,230,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y, f.r, f.r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawReactionParticles(now) {
  stage.reactionParticles.forEach((p) => {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot || 0);
    if (p.kind === 'sparkle') {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      const s = p.size;
      ctx.beginPath();
      ctx.moveTo(0, -s * 2.4);
      ctx.lineTo(s * 0.55, -s * 0.55);
      ctx.lineTo(s * 2.4, 0);
      ctx.lineTo(s * 0.55, s * 0.55);
      ctx.lineTo(0, s * 2.4);
      ctx.lineTo(-s * 0.55, s * 0.55);
      ctx.lineTo(-s * 2.4, 0);
      ctx.lineTo(-s * 0.55, -s * 0.55);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === 'emoji') {
      ctx.font = `${p.size}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text, 0, 0);
    } else if (p.kind === 'text') {
      ctx.font = `700 ${p.size}px "Cinzel", Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = p.color;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText(p.text, 0, 0);
    } else if (p.kind === 'ring') {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = a * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, p.size * (1 + (1 - a) * 2.4), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  });
  void now;
}

/* ── Proscenium frame, curtains, seat foreground ────────────────────────── */

function archPath(g) {
  const { x, y, w, h } = OPENING;
  g.beginPath();
  g.moveTo(x, y + h);
  g.lineTo(x, y + 190);
  g.quadraticCurveTo(x, y + 34, x + 218, y + 34);
  g.lineTo(x + w - 218, y + 34);
  g.quadraticCurveTo(x + w, y + 34, x + w, y + 190);
  g.lineTo(x + w, y + h);
  g.closePath();
}

function drawTheatreSurround() {
  const bg = ctx.createRadialGradient(W / 2, 430, 200, W / 2, 450, 1000);
  bg.addColorStop(0, '#2a0d17');
  bg.addColorStop(0.55, '#170810');
  bg.addColorStop(1, '#070307');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // wall panelling
  ctx.strokeStyle = 'rgba(214,174,106,0.06)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 90) {
    ctx.strokeRect(x + 8, 20, 74, H - 40);
  }
  // sconces
  [40, W - 40].forEach((x) => {
    const g = ctx.createRadialGradient(x, 300, 2, x, 300, 90);
    g.addColorStop(0, 'rgba(255,190,110,0.18)');
    g.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, 300, 90, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawProscenium(now) {
  const { x, y, w, h } = OPENING;

  // outer gold band
  ctx.save();
  archPath(ctx);
  const band = ctx.createLinearGradient(0, 0, 0, H);
  band.addColorStop(0, '#f3d797');
  band.addColorStop(0.3, '#b58a4a');
  band.addColorStop(0.65, '#6f4b22');
  band.addColorStop(1, '#d6ae6a');
  ctx.strokeStyle = band;
  ctx.lineWidth = 30;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20,8,12,0.85)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // inner dark lip
  ctx.save();
  archPath(ctx);
  ctx.strokeStyle = 'rgba(10,4,8,0.7)';
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.restore();

  // columns
  function column(cx) {
    const cw = 60;
    const top = 170;
    const bottom = 826;
    const grad = ctx.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
    grad.addColorStop(0, '#4a2c1a');
    grad.addColorStop(0.25, '#b58a4a');
    grad.addColorStop(0.45, '#f3d797');
    grad.addColorStop(0.6, '#a87a3d');
    grad.addColorStop(1, '#3c2212');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - cw / 2, top, cw, bottom - top);
    // fluting
    ctx.strokeStyle = 'rgba(60,35,15,0.35)';
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 11, top + 18);
      ctx.lineTo(cx + i * 11, bottom - 18);
      ctx.stroke();
    }
    // capitals
    ctx.fillStyle = '#c79a56';
    ctx.fillRect(cx - cw / 2 - 14, top - 18, cw + 28, 22);
    ctx.fillRect(cx - cw / 2 - 8, top + 2, cw + 16, 8);
    ctx.fillRect(cx - cw / 2 - 16, bottom - 6, cw + 32, 18);
    ctx.fillStyle = 'rgba(255,235,190,0.4)';
    ctx.fillRect(cx - cw / 2 - 14, top - 18, cw + 28, 4);
    // scrolls
    ctx.strokeStyle = '#8d6f3f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx - cw / 2 - 14, top - 6, 12, Math.PI * 0.4, Math.PI * 1.6);
    ctx.arc(cx + cw / 2 + 14, top - 6, 12, Math.PI * 1.4, Math.PI * 0.6, true);
    ctx.stroke();
  }
  column(72);
  column(W - 72);

  // valance
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 10, 58);
  ctx.lineTo(x + w + 10, 58);
  ctx.lineTo(x + w + 10, 108);
  for (let i = 0; i <= 12; i++) {
    const px = x + w - (i / 12) * w;
    const py = 108 + (i % 2 === 0 ? 42 : 18);
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x - 10, 108);
  ctx.closePath();
  const vel = ctx.createLinearGradient(0, 58, 0, 160);
  vel.addColorStop(0, '#7a1b33');
  vel.addColorStop(0.55, '#4a0d1e');
  vel.addColorStop(1, '#2b0711');
  ctx.fillStyle = vel;
  ctx.fill();
  ctx.strokeStyle = 'rgba(243,215,151,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // fringe
  ctx.strokeStyle = '#d6ae6a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const px = x + w - (i / 12) * w;
    const py = 108 + (i % 2 === 0 ? 42 : 18);
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + 9);
  }
  ctx.stroke();
  // folds
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 8;
  for (let i = 1; i < 12; i++) {
    const px = x + (i / 12) * w;
    ctx.beginPath();
    ctx.moveTo(px, 60);
    ctx.quadraticCurveTo(px + 8, 100, px + (i % 2 ? -10 : 10), 128);
    ctx.stroke();
  }
  ctx.restore();

  // crest
  const cx = W / 2;
  const cy = 82;
  const crestGlow = ctx.createRadialGradient(cx, cy, 2, cx, cy, 60);
  crestGlow.addColorStop(0, 'rgba(243,215,151,0.35)');
  crestGlow.addColorStop(1, 'rgba(243,215,151,0)');
  ctx.fillStyle = crestGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a0d17';
  ctx.beginPath();
  ctx.arc(cx, cy, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#d6ae6a';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#f3d797';
  ctx.font = '700 17px "Cinzel", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VP', cx, cy + 1);

  // footlights
  const footY = 802;
  const footGlow = ctx.createLinearGradient(0, footY, 0, footY + 40);
  footGlow.addColorStop(0, 'rgba(255,190,110,0.22)');
  footGlow.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = footGlow;
  ctx.fillRect(x, footY, w, 40);
  for (let i = 0; i < 19; i++) {
    const fx = x + 40 + (i / 18) * (w - 80);
    const flick = 0.7 + Math.sin(now / 420 + i * 1.7) * 0.2;
    const g = ctx.createRadialGradient(fx, footY, 1, fx, footY, 22);
    g.addColorStop(0, `rgba(255,220,150,${0.6 * flick})`);
    g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fx, footY, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,235,180,${0.75 * flick})`;
    ctx.beginPath();
    ctx.arc(fx, footY, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // footlight rail
  ctx.fillStyle = '#3b2614';
  ctx.fillRect(x, footY + 4, w, 6);
  ctx.fillStyle = 'rgba(243,215,151,0.3)';
  ctx.fillRect(x, footY + 4, w, 1.5);
}

function drawCurtains(now) {
  const open = clamp(stage.curtain.open, 0, 1);
  const { x, y, w, h } = OPENING;
  const panelW = lerp(w * 0.52, 138, open);
  const bottom = y + h + 4;

  function panel(side) {
    const px = side === 'left' ? x : x + w;
    const dir = side === 'left' ? 1 : -1;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(px, y - 4);
    ctx.lineTo(px + dir * panelW, y - 4);
    const folds = 7;
    for (let i = folds; i >= 0; i--) {
      const t = i / folds;
      const fx = px + dir * panelW * t;
      const sag = Math.sin(t * Math.PI) * 18;
      const gather = Math.sin(t * Math.PI * 2 + (side === 'left' ? 0 : 1)) * 10;
      ctx.lineTo(fx + gather, bottom - sag);
    }
    ctx.closePath();
    const grad = ctx.createLinearGradient(px, 0, px + dir * panelW, 0);
    grad.addColorStop(0, '#3b0714');
    grad.addColorStop(0.25, '#6b1227');
    grad.addColorStop(0.5, '#8d1e38');
    grad.addColorStop(0.75, '#5a0e20');
    grad.addColorStop(1, '#2a0510');
    ctx.fillStyle = grad;
    ctx.fill();
    // fold highlights
    for (let i = 0; i < folds; i++) {
      const t = (i + 0.5) / folds;
      const fx = px + dir * panelW * t;
      ctx.strokeStyle = `rgba(${i % 2 ? '255,180,150' : '0,0,0'},${i % 2 ? 0.06 : 0.18})`;
      ctx.lineWidth = i % 2 ? 9 : 12;
      ctx.beginPath();
      ctx.moveTo(fx, y + 10);
      ctx.quadraticCurveTo(fx + dir * 12, y + h * 0.5, fx + Math.sin(i * 2.1) * 10, bottom - 10);
      ctx.stroke();
    }
    // inner gold trim
    ctx.strokeStyle = 'rgba(214,174,106,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(px + dir * panelW, y - 4);
    ctx.lineTo(px + dir * panelW, bottom - 8);
    ctx.stroke();
    ctx.restore();
  }

  panel('left');
  panel('right');

  // tiebacks when mostly open
  if (open > 0.45) {
    const a = clamp((open - 0.45) / 0.55, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#d6ae6a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + 8, 430);
    ctx.quadraticCurveTo(x + 60, 452, x + 112, 430);
    ctx.moveTo(x + w - 8, 430);
    ctx.quadraticCurveTo(x + w - 60, 452, x + w - 112, 430);
    ctx.stroke();
    ctx.fillStyle = '#f3d797';
    ctx.beginPath();
    ctx.arc(x + 60, 447, 7, 0, Math.PI * 2);
    ctx.arc(x + w - 60, 447, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  void now;
}

function drawSeatForeground(now) {
  const seat = stage.seat;
  if (seat === 'balcony') {
    // foreground balcony rail
    const railY = 786;
    ctx.save();
    // velvet swag
    ctx.fillStyle = '#3b0714';
    ctx.beginPath();
    ctx.moveTo(0, railY + 22);
    ctx.lineTo(W, railY + 22);
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,174,106,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const sx = (i / 7) * W;
      ctx.beginPath();
      ctx.moveTo(sx, railY + 22);
      ctx.quadraticCurveTo(sx + W / 14, railY + 60, sx + W / 7, railY + 22);
      ctx.stroke();
    }
    // gold rail
    const rail = ctx.createLinearGradient(0, railY, 0, railY + 22);
    rail.addColorStop(0, '#f3d797');
    rail.addColorStop(0.5, '#a87a3d');
    rail.addColorStop(1, '#4a2c1a');
    ctx.fillStyle = rail;
    ctx.fillRect(0, railY, W, 22);
    ctx.fillStyle = 'rgba(255,240,200,0.35)';
    ctx.fillRect(0, railY + 2, W, 3);
    // posts
    [160, 480, 800, 1120, 1440].forEach((px) => {
      ctx.fillStyle = '#2a0d17';
      ctx.fillRect(px - 7, railY + 22, 14, H - railY);
      ctx.fillStyle = 'rgba(214,174,106,0.35)';
      ctx.fillRect(px - 2, railY + 22, 4, H - railY);
    });
    // heads silhouettes
    [[90, 40], [1310, 44], [400, 34]].forEach(([hx, r]) => {
      ctx.fillStyle = 'rgba(8,3,6,0.9)';
      ctx.beginPath();
      ctx.arc(hx, H - 8, r, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(hx - r * 1.8, H - 8, r * 3.6, 40);
    });
    ctx.restore();
  } else if (seat === 'box') {
    // side drape
    ctx.save();
    const drapeW = 172;
    const grad = ctx.createLinearGradient(0, 0, drapeW, 0);
    grad.addColorStop(0, '#2a0510');
    grad.addColorStop(0.45, '#6b1227');
    grad.addColorStop(0.8, '#8d1e38');
    grad.addColorStop(1, 'rgba(60,8,20,0.1)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(drapeW, 0);
    for (let y = 0; y <= H; y += 40) {
      ctx.lineTo(drapeW - 18 + Math.sin(y * 0.03) * 12, y);
    }
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(214,174,106,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(drapeW, 0);
    ctx.quadraticCurveTo(drapeW - 26, H * 0.5, drapeW - 8, H);
    ctx.stroke();
    // tassel
    ctx.strokeStyle = '#d6ae6a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(20, 320);
    ctx.quadraticCurveTo(80, 350, 140, 322);
    ctx.stroke();
    ctx.fillStyle = '#f3d797';
    ctx.beginPath();
    ctx.arc(80, 344, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8d1e38';
    ctx.beginPath();
    ctx.moveTo(72, 350);
    ctx.lineTo(88, 350);
    ctx.lineTo(96, 402);
    ctx.lineTo(64, 402);
    ctx.closePath();
    ctx.fill();
    // gilt box ledge bottom right
    const ledge = ctx.createLinearGradient(0, 820, 0, 900);
    ledge.addColorStop(0, '#d6ae6a');
    ledge.addColorStop(0.4, '#8d6f3f');
    ledge.addColorStop(1, '#3b2614');
    ctx.fillStyle = ledge;
    ctx.beginPath();
    ctx.moveTo(W, 792);
    ctx.lineTo(W - 260, 792);
    ctx.quadraticCurveTo(W - 300, 830, W - 340, 900);
    ctx.lineTo(W, 900);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else {
    // front row: silhouetted heads at the very edge
    ctx.save();
    [[70, 46], [150, 38], [1450, 44], [1530, 36]].forEach(([hx, r]) => {
      ctx.fillStyle = 'rgba(7,2,5,0.92)';
      ctx.beginPath();
      ctx.arc(hx, H + 18, r, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(hx - r * 1.7, H + 16, r * 3.4, 60);
      ctx.strokeStyle = 'rgba(214,174,106,0.13)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, H + 18, r - 2, Math.PI * 1.15, Math.PI * 1.7);
      ctx.stroke();
    });
    ctx.restore();
  }
  void now;
}

/* ── Main scene composition ─────────────────────────────────────────────── */

function drawScene(now) {
  const bg = stage.backdrop;
  const current = getBackdrop(bg.current);
  if (bg.prev && bg.mix < 1) {
    const prev = getBackdrop(bg.prev);
    ctx.globalAlpha = 1;
    ctx.drawImage(prev, 0, 0);
    ctx.globalAlpha = easeInOutCubic(clamp(bg.mix, 0, 1));
    ctx.drawImage(current, 0, 0);
    ctx.globalAlpha = 1;
  } else {
    ctx.drawImage(current, 0, 0);
  }
  drawBackdropFX(bg.current, now);
  drawFloor(now);
  drawActors(now);
  drawFxParticles();
  drawLighting(now);
  drawMotes(now);
  drawBubble(now);
}

function drawActors(now) {
  const actors = Array.from(stage.actors.values()).filter((a) => a.visible);
  actors.sort((a, b) => a.scale - b.scale || a.y - b.y);
  actors.forEach((a) => drawActor(a, now));
}

function applyCamera() {
  const c = stage.camera;
  const cx = OPENING.x + OPENING.w / 2;
  const cy = OPENING.y + OPENING.h / 2;
  ctx.translate(cx + c.tx + (stage.shake ? rand(-stage.shake, stage.shake) : 0), cy + c.ty + (stage.shake ? rand(-stage.shake, stage.shake) : 0));
  ctx.scale(c.zoom, c.zoom);
  if (c.skew) ctx.transform(1, 0, c.skew, 1, 0, 0);
  if (c.rot) ctx.rotate(c.rot);
  ctx.translate(-cx, -cy);
}

function drawVignette() {
  const vg = ctx.createRadialGradient(W / 2, H / 2, 320, W / 2, H / 2, 980);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.7, 'rgba(0,0,0,0.18)');
  vg.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

let lastFrame = performance.now();
let lastHud = 0;

function render(now) {
  const rawDt = Math.min(0.05, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  stage.time = now;
  update(rawDt);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  drawTheatreSurround();

  // stage opening, camera transformed
  ctx.save();
  archPath(ctx);
  ctx.clip();
  applyCamera();
  drawScene(now);
  ctx.restore();

  // frame, curtains, seat, reactions
  drawCurtains(now);
  drawProscenium(now);
  drawSeatForeground(now);
  drawReactionParticles(now);
  drawVignette();

  if (now - lastHud > 90) {
    updateHud();
    lastHud = now;
  }
  requestAnimationFrame(render);
}

/* ─────────────────────────────────────────────────────────────────────────────
   05. PLAYBACK ENGINE
   ────────────────────────────────────────────────────────────────────────── */

const ACTION_TYPES = new Set([
  'ENTER', 'EXIT', 'MOVE', 'FACE', 'DIALOGUE', 'LIGHTING', 'SOUND', 'BACKDROP',
  'EFFECT', 'GESTURE', 'BOW', 'CAPTION', 'WAIT', 'PAUSE', 'CURTAIN', 'AMBIENT', 'SCENE',
]);

const SOUND_CUES = new Set([
  'thunder_clap', 'thunder', 'rain', 'wind', 'magic_chime', 'door_creak', 'heartbeat',
  'clock_tick', 'bell', 'sword_clash', 'crowd_gasp', 'applause', 'laugh', 'rose',
  'waltz', 'wolf_howl', 'organ',
]);

const EFFECTS = new Set(['sparks', 'lightning', 'fog', 'petals', 'confetti', 'embers', 'snow', 'cards', 'fireflies', 'bats']);

const CAST_PALETTE = ['#7fd6c4', '#a9d98d', '#e7a9b8', '#b98cff', '#ffb36b', '#8fc7ff', '#ff8fa3', '#c9a86a'];

const COSTUME_STYLES = {
  scientist: { coat: '#e8e2d4', coat2: '#c9c0ae', pants: '#2a2420', boots: '#171210' },
  creature: { coat: '#3f4a3a', coat2: '#2d3a2c', pants: '#232a20', boots: '#141812' },
  alice: { coat: '#5b8fd6', coat2: '#4a7cbd', pants: '#f0e6d6', boots: '#2a2030' },
  hatter: { coat: '#4d2a63', coat2: '#3b1f4d', pants: '#2a1a2e', boots: '#1a101c' },
  hare: { coat: '#7a4e2f', coat2: '#5e3a22', pants: '#4a2e1c', boots: '#241610' },
  queen: { coat: '#9c1f3b', coat2: '#7a152d', pants: '#6b1227', boots: '#2a0d14' },
  prince: { coat: '#232030', coat2: '#17141f', pants: '#1c1924', boots: '#0f0c14' },
  ghost: { coat: '#8fa6b5', coat2: '#6b7f8d', pants: '#5b6b78', boots: '#3a454e' },
  royal: { coat: '#7a1b33', coat2: '#5c1226', pants: '#3b0d1a', boots: '#1a060c' },
  gown: { coat: '#d8a7a0', coat2: '#c08d88', pants: '#e8d6c8', boots: '#6b3a3a' },
  fairy_queen: { coat: '#7a5aa8', coat2: '#5a3a88', pants: '#3a2a4a', boots: '#2a1a30' },
  fairy_king: { coat: '#2f5a4a', coat2: '#1f3a30', pants: '#1a2a24', boots: '#0f1a16' },
  puck: { coat: '#4a7a3a', coat2: '#2f5a2a', pants: '#2a3a1a', boots: '#1a2410' },
  donkey: { coat: '#6a4a2a', coat2: '#4a321c', pants: '#3a2a1a', boots: '#241a10' },
  regency: { coat: '#d8b8c8', coat2: '#b898a8', pants: '#f0e6d8', boots: '#6a4a4a' },
  dandy: { coat: '#2a2a3a', coat2: '#1a1a28', pants: '#2a2430', boots: '#141018' },
  vampire: { coat: '#1a1018', coat2: '#0f080e', pants: '#1a1018', boots: '#0a0508' },
  bride: { coat: '#d8d0e0', coat2: '#b8b0c8', pants: '#e8e0f0', boots: '#5a4a5a' },
  victorian: { coat: '#4a3a2a', coat2: '#32261a', pants: '#2a2018', boots: '#14100c' },
  default: { coat: '#3b2a3a', coat2: '#2a1d2a', pants: '#2a2220', boots: '#171210' },
};

const SEAT_PRESETS = {
  front: { zoom: 1, tx: 0, ty: 0, skew: 0, rot: 0 },
  balcony: { zoom: 0.9, tx: 54, ty: 28, skew: 0, rot: 0 },
  box: { zoom: 1.035, tx: -50, ty: 5, skew: -0.028, rot: -0.008 },
};

const plays = ACTS.slice();
let currentPlayIndex = 0;
let fileTarget = 'stage';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildActor(def, index) {
  const costume = def.costume || guessCostume(def.name);
  const style = COSTUME_STYLES[costume] || COSTUME_STYLES.default;
  const color = def.color || CAST_PALETTE[index % CAST_PALETTE.length];
  const x = positionToX(def.position);
  const name = def.name || def.id || 'Player';
  const female = ['alice', 'queen', 'gown', 'fairy_queen', 'regency', 'bride'].includes(costume)
    || /(alice|elizabeth|ophelia|juliet|cleopatra|portia|beatrice|desdemona|miranda|rosalind|viola|titania|queen|lady|ladies|woman|girl|mother|sister|bride)/i.test(name);
  const pitchMap = {
    scientist: 0.92,
    creature: 0.55,
    alice: 1.42,
    hatter: 1.06,
    hare: 1.28,
    queen: 1.12,
    prince: 0.9,
    ghost: 0.62,
    royal: 0.82,
    gown: 1.18,
    fairy_queen: 1.34,
    fairy_king: 0.8,
    puck: 1.26,
    donkey: 0.66,
    regency: 1.2,
    dandy: 0.9,
    vampire: 0.5,
    bride: 1.14,
    victorian: 0.94,
    default: 1,
  };
  const rateMap = {
    scientist: 0.96,
    creature: 0.78,
    alice: 1.1,
    hatter: 1.06,
    hare: 1.12,
    queen: 0.94,
    prince: 0.9,
    ghost: 0.72,
    royal: 0.86,
    gown: 0.98,
    fairy_queen: 1.0,
    fairy_king: 0.9,
    puck: 1.15,
    donkey: 0.84,
    regency: 1.0,
    dandy: 0.92,
    vampire: 0.76,
    bride: 0.86,
    victorian: 0.95,
    default: 1,
  };
  return {
    id: def.id || slugify(def.name),
    name,
    short: def.short || shortName(name),
    costume,
    color,
    height: clamp(Number(def.height) || 1, 0.8, 1.3),
    x,
    targetX: x,
    y: FLOOR_Y,
    scale: 1,
    facing: x < 800 ? 1 : -1,
    seed: rand(0, 10),
    phase: rand(0, Math.PI * 2),
    walkPhase: rand(0, 10),
    visible: false,
    exiting: false,
    walking: false,
    alpha: 1,
    pose: 'idle',
    gesture: 'idle',
    poseT: 0,
    talking: false,
    skin: COSTUME_SKINS[costume] || COSTUME_SKINS.default,
    coat: style.coat,
    coat2: style.coat2,
    pants: style.pants,
    boots: style.boots,
    accent: color,
    voiceGender: female ? 'female' : 'male',
    voiceIndex: index,
    voicePitch: pitchMap[costume] || pitchMap.default,
    voiceRate: rateMap[costume] || rateMap.default,
  };
}

function resolveActor(name) {
  const key = normalizeKey(name);
  if (!key) return null;
  const actors = Array.from(stage.actors.values());
  for (const a of actors) {
    if (normalizeKey(a.id) === key || normalizeKey(a.name) === key || normalizeKey(a.short) === key) return a;
  }
  const first = normalizeKey(String(name).split(/\s+/)[0]);
  for (const a of actors) {
    if (normalizeKey(a.short) === first || normalizeKey(a.id) === first) return a;
  }
  return null;
}

function ensureActor(name) {
  let actor = resolveActor(name);
  if (actor) return actor;
  const clean = String(name || 'Player').trim() || 'Player';
  const def = {
    id: `${slugify(clean)}-${stage.actors.size}`,
    name: clean,
    short: shortName(clean),
    costume: guessCostume(clean),
    color: CAST_PALETTE[stage.actors.size % CAST_PALETTE.length],
    position: 'center',
    height: 1,
  };
  actor = buildActor(def, stage.actors.size);
  stage.actors.set(actor.id, actor);
  return actor;
}

function faceCenter(actor) {
  if (!actor) return;
  actor.facing = actor.x <= 800 ? 1 : -1;
}

function applyActionStart(action, duration) {
  const type = action.type;
  if (type === 'CAPTION') {
    setCaption(action.text || '');
    return;
  }
  if (type === 'DIALOGUE') {
    const actor = ensureActor(action.actor);
    if (!actor) return;
    if (!actor.visible) {
      actor.visible = true;
      actor.x = actor.targetX;
    }
    actor.walking = false;
    actor.exiting = false;
    faceCenter(actor);
    const text = String(action.text || '');
    const timing = dialogueTiming(text, actor);
    stage.bubble = {
      actorId: actor.id,
      text,
      chars: 0,
      age: 0,
      typeDur: timing.typeDur,
      total: duration,
      alpha: 1,
      speech: false,
    };
    stage.lastClickChar = 0;
    setCaption(`${actor.short}: “${text}”`);
    const spoke = voice.speak(text, actor, {
      onBoundary: (charIndex, charLength) => {
        const bubble = stage.bubble;
        if (!bubble || bubble.actorId !== actor.id) return;
        bubble.chars = Math.max(bubble.chars, Math.min(text.length, charIndex + (charLength || 0)));
      },
      onEnd: () => {
        const bubble = stage.bubble;
        if (bubble && bubble.actorId === actor.id) bubble.chars = text.length;
      },
      onError: () => {
        const bubble = stage.bubble;
        if (bubble && bubble.actorId === actor.id) bubble.speech = false;
      },
    });
    stage.bubble.speech = spoke;
    return;
  }
  if (type === 'LIGHTING') {
    const rgb = hexToRgb(action.color || '#d6ae6a');
    stage.light.target = {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      intensity: clamp(Number(action.intensity) || 0.7, 0, 1),
    };
    return;
  }
  if (type === 'SOUND') {
    audio.play(action.cue);
    return;
  }
  if (type === 'BACKDROP') {
    const next = BACKDROP_LABELS[action.backdrop] ? action.backdrop : 'grand_hall';
    if (next !== stage.backdrop.current) {
      stage.backdrop.prev = stage.backdrop.current;
      stage.backdrop.current = next;
      stage.backdrop.mix = 0;
    }
    const label = BACKDROP_LABELS[next] || 'Grand Hall';
    $('#sceneBadge').textContent = label;
    return;
  }
  if (type === 'ENTER') {
    const actor = ensureActor(action.actor);
    if (!actor) return;
    const target = positionToX(action.position || action.to || 'center');
    actor.visible = true;
    actor.alpha = 1;
    actor.exiting = false;
    actor.pose = 'idle';
    actor.gesture = 'idle';
    actor.targetX = target;
    const from = String(action.from || (target < 800 ? 'left' : 'right')).toLowerCase();
    if (!actor.walking && Math.abs(actor.x - target) < 2) {
      actor.x = from === 'left' ? OPENING.x - 70 : from === 'right' ? OPENING.x + OPENING.w + 70 : actor.x;
    }
    if (from === 'left') actor.x = OPENING.x - 80;
    else if (from === 'right') actor.x = OPENING.x + OPENING.w + 80;
    actor.facing = target < actor.x ? -1 : 1;
    actor.walking = true;
    return;
  }
  if (type === 'EXIT') {
    const actor = ensureActor(action.actor);
    if (!actor) return;
    const left = actor.x < 800;
    actor.exiting = true;
    actor.targetX = left ? OPENING.x - 230 : OPENING.x + OPENING.w + 230;
    actor.facing = actor.targetX > actor.x ? 1 : -1;
    actor.walking = true;
    return;
  }
  if (type === 'MOVE') {
    const actor = ensureActor(action.actor);
    if (!actor) return;
    actor.visible = true;
    actor.exiting = false;
    actor.targetX = positionToX(action.position || action.to || 'center');
    actor.walking = true;
    actor.facing = actor.targetX > actor.x ? 1 : -1;
    return;
  }
  if (type === 'FACE') {
    const actor = ensureActor(action.actor);
    if (!actor) return;
    const targetName = String(action.target || '').toLowerCase();
    if (!targetName || targetName === 'audience' || targetName === 'house') {
      actor.facing = 1;
    } else {
      const target = resolveActor(action.target);
      if (target) actor.facing = target.x > actor.x ? 1 : -1;
      else faceCenter(actor);
    }
    return;
  }
  if (type === 'GESTURE') {
    const actor = ensureActor(action.actor);
    if (!actor) return;
    actor.visible = true;
    actor.walking = false;
    actor.gesture = String(action.gesture || 'raise').toLowerCase();
    actor.pose = actor.gesture === 'kneel' ? 'kneel' : 'gesture';
    actor.poseT = duration;
    return;
  }
  if (type === 'BOW') {
    const actor = ensureActor(action.actor);
    if (!actor) return;
    // A player who has already exited returns for the curtain call.
    if (!actor.visible || actor.x < OPENING.x + 30 || actor.x > OPENING.x + OPENING.w - 30) {
      const idx = Math.max(0, stage.cast.findIndex((c) => c.id === actor.id));
      const t = stage.cast.length <= 1 ? 0.5 : 0.24 + 0.52 * (idx / (stage.cast.length - 1));
      actor.x = STAGE_LEFT + t * (STAGE_RIGHT - STAGE_LEFT);
      actor.targetX = actor.x;
    }
    actor.visible = true;
    actor.walking = false;
    actor.pose = 'bow';
    actor.gesture = 'idle';
    actor.poseT = duration;
    return;
  }
  if (type === 'EFFECT') {
    const effect = String(action.effect || 'sparks').toLowerCase();
    if (EFFECTS.has(effect)) spawnFx(effect);
    return;
  }
  if (type === 'CURTAIN') {
    const open = action.state ? String(action.state).toLowerCase() === 'open' : action.open !== false;
    stage.curtain.target = open ? 1 : 0;
    return;
  }
  if (type === 'AMBIENT') {
    stage.ambient = String(action.mood || 'none').toLowerCase();
    if (audio.ctx && audio.ambientEnabled) audio.setAmbient(stage.ambient);
    return;
  }
  if (type === 'SCENE') {
    const label = String(action.name || action.setting || '');
    if (label) {
      $('#sceneBadge').textContent = label;
      setCaption(label);
    }
  }
}

function dialogueTiming(text, actor) {
  const speech = voice.enabled ? voice.estimateDuration(text, actor) : 0;
  const typeDur = speech ? speech * 1.02 : clamp(text.length / 44, 0.45, 3.2);
  const hold = speech ? 0.7 : clamp(text.length * 0.025, 0.9, 2.8);
  return { speech, typeDur, hold, duration: 1.0 + typeDur + hold };
}

function actionDuration(action) {
  const type = action.type;
  if (type === 'DIALOGUE') {
    return dialogueTiming(String(action.text || ''), resolveActor(action.actor)).duration;
  }
  if (type === 'ENTER' || type === 'EXIT') return 1.45;
  if (type === 'MOVE') return 1.15;
  if (type === 'LIGHTING') return 1.35;
  if (type === 'BACKDROP') return 1.5;
  if (type === 'SOUND') return 0.85;
  if (type === 'EFFECT') return 1.6;
  if (type === 'GESTURE') return 1.5;
  if (type === 'BOW') return 2.1;
  if (type === 'CAPTION') return 2.7;
  if (type === 'CURTAIN') return 2.0;
  if (type === 'WAIT' || type === 'PAUSE') return clamp(Number(action.duration || action.seconds) || 1.2, 0.1, 30);
  return 1.1;
}

function startAction() {
  if (stage.index >= stage.actions.length) {
    endAct();
    return;
  }
  const action = stage.actions[stage.index];
  stage.currentAction = action;
  stage.elapsed = 0;
  stage.duration = actionDuration(action);
  applyActionStart(action, stage.duration);
  updateHud();
}

function updateBubble(dt) {
  const b = stage.bubble;
  if (!b) return;
  b.age += dt;
  const shown = Math.min(b.text.length, (b.age / b.typeDur) * b.text.length);
  b.chars = shown;
  if (b.age > b.total) {
    b.alpha = clamp(1 - (b.age - b.total) / 0.5, 0, 1);
  } else {
    b.alpha = 1;
  }
  if (b.age > b.total + 0.65) {
    stage.bubble = null;
    return;
  }
  const count = Math.floor(shown);
  if (count - stage.lastClickChar >= 3 && count < b.text.length) {
    const actor = stage.actors.get(b.actorId);
    if (!b.speech) {
      if (actor) audio.voiceTick(actor.voicePitch || 170);
      if (count % 6 === 0) audio.typeClick();
    }
    stage.lastClickChar = count;
  }
}

function updateTalking() {
  const b = stage.bubble;
  stage.actors.forEach((a) => {
    a.talking = !!b && b.actorId === a.id && b.alpha > 0.1 && b.age < b.typeDur + 0.45;
  });
}

function updateActors(dt) {
  stage.actors.forEach((actor) => {
    if (!actor.visible) return;
    if (dt > 0 && Math.abs(actor.targetX - actor.x) > 0.9) {
      const dir = Math.sign(actor.targetX - actor.x);
      const step = 265 * dt;
      actor.x += dir * Math.min(Math.abs(actor.targetX - actor.x), step);
      actor.walkPhase += dt * 10.5;
      actor.facing = dir;
      actor.walking = true;
      if (Math.abs(actor.targetX - actor.x) <= 0.9) {
        actor.walking = false;
        if (actor.exiting) {
          actor.visible = false;
          actor.exiting = false;
        }
      }
    } else {
      actor.walking = false;
      if (actor.exiting) {
        actor.visible = false;
        actor.exiting = false;
      }
    }
    if (actor.poseT > 0 && dt > 0) {
      actor.poseT -= dt;
      if (actor.poseT <= 0) {
        actor.pose = 'idle';
        actor.gesture = 'idle';
      }
    }
  });
  updateTalking();
}

function updateCurtain(dt) {
  const c = stage.curtain;
  const f = 1 - Math.exp(-dt * 2.8);
  c.open = lerp(c.open, c.target, f);
  if (Math.abs(c.target - c.open) < 0.001) c.open = c.target;
}

function updateLight(dt) {
  const f = 1 - Math.exp(-dt * 3.6);
  const cur = stage.light.current;
  const tgt = stage.light.target;
  cur.r = lerp(cur.r, tgt.r, f);
  cur.g = lerp(cur.g, tgt.g, f);
  cur.b = lerp(cur.b, tgt.b, f);
  cur.intensity = lerp(cur.intensity, tgt.intensity, f);
}

function updateCamera(dt) {
  const f = 1 - Math.exp(-dt * 4.2);
  const c = stage.camera;
  const t = stage.cameraTarget;
  c.zoom = lerp(c.zoom, t.zoom, f);
  c.tx = lerp(c.tx, t.tx, f);
  c.ty = lerp(c.ty, t.ty, f);
  c.skew = lerp(c.skew, t.skew, f);
  c.rot = lerp(c.rot, t.rot, f);
}

function updateBackdrop(dt) {
  if (stage.backdrop.prev && stage.backdrop.mix < 1) {
    stage.backdrop.mix = Math.min(1, stage.backdrop.mix + dt / 1.25);
    if (stage.backdrop.mix >= 1) stage.backdrop.prev = null;
  }
}

function update(dt) {
  updateCurtain(dt);
  updateLight(dt);
  updateCamera(dt);
  updateBackdrop(dt);
  updateParticles(dt);
  updateMotes(dt);
  if (stage.flash > 0) stage.flash = Math.max(0, stage.flash - dt * 2.4);
  if (stage.shake > 0) stage.shake = Math.max(0, stage.shake - dt * 28);

  if (stage.startDelay > 0) {
    stage.startDelay -= dt;
    if (stage.startDelay <= 0) {
      stage.startDelay = 0;
      stage.playing = true;
      startAction();
    }
    return;
  }

  if (stage.ended) {
    stage.endTimer += dt;
    if (!stage.endShown && stage.endTimer > 2.05) showEndCard();
    return;
  }

  if (stage.playing) {
    stage.elapsed += dt * stage.speed;
    updateBubble(dt * stage.speed);
    updateActors(dt * stage.speed);
    stage.energy = Math.max(0.06, stage.energy - dt * 0.0015);
    if (stage.elapsed >= stage.duration) {
      stage.index += 1;
      if (stage.index >= stage.actions.length) endAct();
      else startAction();
    }
  } else {
    updateActors(0);
  }
}

function endAct() {
  if (stage.ended) return;
  stage.ended = true;
  stage.playing = false;
  stage.endTimer = 0;
  stage.endShown = false;
  stage.index = stage.actions.length;
  stage.bubble = null;
  stage.curtain.target = 0;
  stage.energy = clamp(stage.energy + 0.18, 0, 1);
  voice.cancel();
  audio.applause(0.95);
  spawnReaction('applaud');
  spawnFx('confetti');
  updateHud();
}

function showEndCard() {
  if (stage.endShown || !stage.play) return;
  stage.endShown = true;
  const isLast = currentPlayIndex >= plays.length - 1;
  $('#endTitle').textContent = `${stage.play.act || 'Special Engagement'} — ${stage.play.title || 'Untitled Play'}`;
  $('#endSubtitle').textContent = stage.play.subtitle || stage.play.setting || 'The company thanks you for attending.';
  $('#endNextBtn').innerHTML = isLast ? 'Open Playbill <span aria-hidden="true">▸</span>' : 'Next Act <span aria-hidden="true">▸</span>';
  $('#endCard').hidden = false;
}

function describeAction(action) {
  if (!action) return stage.ended ? 'Curtain call' : 'Overture';
  const short = (text, n) => (text.length > n ? `${text.slice(0, n).trim()}…` : text);
  switch (action.type) {
    case 'DIALOGUE': return `${shortName(action.actor)}: “${short(String(action.text || ''), 58)}”`;
    case 'CAPTION': return short(String(action.text || ''), 76);
    case 'ENTER': return `${shortName(action.actor)} enters`;
    case 'EXIT': return `${shortName(action.actor)} exits`;
    case 'MOVE': return `${shortName(action.actor)} crosses the stage`;
    case 'LIGHTING': return 'Lighting cue';
    case 'SOUND': return `Sound: ${action.cue || 'cue'}`;
    case 'BACKDROP': return `Scene change: ${BACKDROP_LABELS[action.backdrop] || action.backdrop || 'new backdrop'}`;
    case 'EFFECT': return `Stage effect: ${action.effect || 'effect'}`;
    case 'GESTURE': return `${shortName(action.actor)} ${action.gesture || 'gestures'}`;
    case 'BOW': return `${shortName(action.actor)} bows`;
    case 'CURTAIN': return 'Curtain cue';
    case 'AMBIENT': return `Ambience: ${action.mood || 'none'}`;
    case 'WAIT':
    case 'PAUSE': return 'A held breath';
    default: return action.type || 'Stage business';
  }
}

function updateHud() {
  const total = stage.actions.length || 1;
  const within = stage.duration ? clamp(stage.elapsed / stage.duration, 0, 1) : 0;
  const progress = stage.ended ? 1 : clamp((stage.index + within) / total, 0, 1);
  const fill = $('#timelineFill');
  const knob = $('#timelineKnob');
  const track = $('#timelineTrack');
  if (fill) fill.style.width = `${progress * 100}%`;
  if (knob) knob.style.left = `${progress * 100}%`;
  if (track) track.setAttribute('aria-valuenow', String(Math.round(progress * 100)));

  const nowEl = $('#lineNow');
  const countEl = $('#lineCount');
  if (nowEl) nowEl.textContent = describeAction(stage.currentAction);
  if (countEl) countEl.textContent = `${Math.min(stage.index + 1, total)} / ${total}`;

  const energyPct = Math.round(stage.energy * 100);
  const energyFill = $('#energyFill');
  const energyValue = $('#energyValue');
  if (energyFill) energyFill.style.width = `${energyPct}%`;
  if (energyValue) energyValue.textContent = `${energyPct}%`;

  const playBtn = $('#playBtn');
  if (playBtn) {
    playBtn.textContent = stage.playing ? '❚❚' : '▶';
    playBtn.setAttribute('aria-label', stage.playing ? 'Pause' : 'Play');
  }
}

function setCaption(text) {
  stage.caption = text || '';
  const el = $('#captionText');
  if (el) el.textContent = text || '';
  const bar = $('#captionBar');
  if (bar) bar.classList.toggle('is-hidden', !text);
}

function resetActorState() {
  stage.actors = new Map();
  stage.cast.forEach((def, i) => {
    stage.actors.set(def.id, buildActor(def, i));
  });
  voice.assignCast(stage.actors.values());
}

function applyImmediate(action) {
  const type = action.type;
  if (type === 'ENTER' || type === 'MOVE') {
    const actor = ensureActor(action.actor);
    if (!actor) return;
    actor.visible = true;
    actor.x = positionToX(action.position || action.to || 'center');
    actor.targetX = actor.x;
    actor.walking = false;
    actor.exiting = false;
    actor.alpha = 1;
    faceCenter(actor);
  } else if (type === 'EXIT') {
    const actor = ensureActor(action.actor);
    if (actor) {
      actor.visible = false;
      actor.exiting = false;
    }
  } else if (type === 'DIALOGUE' || type === 'GESTURE' || type === 'BOW' || type === 'FACE') {
    const actor = ensureActor(action.actor);
    if (!actor) return;
    actor.visible = true;
    actor.walking = false;
    if (type === 'DIALOGUE' || type === 'FACE') faceCenter(actor);
    if (type === 'GESTURE') {
      actor.gesture = String(action.gesture || 'raise').toLowerCase();
      actor.pose = actor.gesture === 'kneel' ? 'kneel' : 'gesture';
    }
    if (type === 'BOW') {
      if (!actor.visible || actor.x < OPENING.x + 30 || actor.x > OPENING.x + OPENING.w - 30) {
        const idx = Math.max(0, stage.cast.findIndex((c) => c.id === actor.id));
        const t = stage.cast.length <= 1 ? 0.5 : 0.24 + 0.52 * (idx / (stage.cast.length - 1));
        actor.x = STAGE_LEFT + t * (STAGE_RIGHT - STAGE_LEFT);
        actor.targetX = actor.x;
      }
      actor.visible = true;
      actor.pose = 'bow';
    }
  } else if (type === 'LIGHTING') {
    const rgb = hexToRgb(action.color || '#d6ae6a');
    stage.light.current = { r: rgb.r, g: rgb.g, b: rgb.b, intensity: clamp(Number(action.intensity) || 0.7, 0, 1) };
    stage.light.target = { ...stage.light.current };
  } else if (type === 'BACKDROP') {
    stage.backdrop.current = BACKDROP_LABELS[action.backdrop] ? action.backdrop : 'grand_hall';
    stage.backdrop.prev = null;
    stage.backdrop.mix = 1;
    $('#sceneBadge').textContent = BACKDROP_LABELS[stage.backdrop.current] || 'Grand Hall';
  } else if (type === 'CAPTION') {
    setCaption(action.text || '');
  } else if (type === 'CURTAIN') {
    const open = action.state ? String(action.state).toLowerCase() === 'open' : action.open !== false;
    stage.curtain.open = open ? 1 : 0;
    stage.curtain.target = open ? 1 : 0;
  } else if (type === 'AMBIENT') {
    stage.ambient = String(action.mood || 'none').toLowerCase();
  }
}

function seekTo(index) {
  if (!stage.actions.length) return;
  if (stage.awaitingEntry) enterTheatre(true);
  voice.cancel();
  const target = clamp(index, 0, stage.actions.length - 1);
  resetActorState();
  stage.backdrop = { current: stage.play.backdrop || 'gothic_lab', prev: null, mix: 1 };
  const firstLight = stage.actions.find((a) => a.type === 'LIGHTING');
  const rgb = hexToRgb(firstLight ? firstLight.color : '#d6ae6a');
  const intensity = firstLight ? clamp(Number(firstLight.intensity) || 0.7, 0, 1) : 0.7;
  stage.light.current = { r: rgb.r, g: rgb.g, b: rgb.b, intensity };
  stage.light.target = { ...stage.light.current };
  stage.curtain = { open: 1, target: 1 };
  stage.bubble = null;
  stage.fxParticles = [];
  stage.fog = [];
  stage.bolt = null;
  stage.flash = 0;
  stage.shake = 0;
  for (let i = 0; i < target; i++) applyImmediate(stage.actions[i]);
  stage.index = target;
  stage.elapsed = 0;
  stage.ended = false;
  stage.endShown = false;
  stage.endTimer = 0;
  stage.startDelay = 0;
  stage.playing = true;
  $('#endCard').hidden = true;
  startAction();
}

function loadPlay(script, options = {}) {
  const result = normalizeScript(script);
  if (!result.ok) {
    toast('Script rejected', result.errors[0] || 'The play could not be parsed.', 'error');
    return false;
  }
  const awaiting = stage.awaitingEntry;
  voice.cancel();
  const play = result.script;
  stage.play = play;
  stage.cast = play.cast;
  stage.actions = play.actions;
  stage.index = 0;
  stage.elapsed = 0;
  stage.duration = 1;
  stage.currentAction = null;
  stage.playing = false;
  stage.startDelay = awaiting ? 0 : 1.35;
  stage.ended = false;
  stage.endShown = false;
  stage.endTimer = 0;
  stage.bubble = null;
  stage.fxParticles = [];
  stage.reactionParticles = [];
  stage.fog = [];
  stage.bolt = null;
  stage.flash = 0;
  stage.shake = 0;
  stage.energy = 0.32;
  stage.backdrop = { current: play.backdrop || 'gothic_lab', prev: null, mix: 1 };
  const firstLight = play.actions.find((a) => a.type === 'LIGHTING');
  const rgb = hexToRgb(firstLight ? firstLight.color : '#d6ae6a');
  const intensity = firstLight ? clamp(Number(firstLight.intensity) || 0.7, 0, 1) : 0.7;
  stage.light.current = { r: rgb.r, g: rgb.g, b: rgb.b, intensity };
  stage.light.target = { ...stage.light.current };
  stage.curtain = awaiting ? { open: 0, target: 0 } : { open: 0, target: 1 };
  stage.ambient = play.ambient || 'none';
  resetActorState();
  $('#endCard').hidden = true;
  $('#actBadge').textContent = play.act || 'Special Engagement';
  $('#sceneBadge').textContent = BACKDROP_LABELS[play.backdrop] || 'Grand Hall';
  setCaption('The house lights dim. The curtain rises…');
  updateProgram(play);
  const editor = $('#scriptEditor');
  if (editor) editor.value = JSON.stringify(play, null, 2);
  if (audio.ctx && audio.ambientEnabled) audio.setAmbient(stage.ambient);
  updateHud();
  if (options.autoplay === false || awaiting) {
    stage.startDelay = 0;
  }
  return true;
}

function updateProgram(play) {
  if (!play) return;
  $('#programTitle').textContent = play.title || 'Untitled Play';
  $('#programSubtitle').textContent = play.subtitle || play.setting || 'A new play for the Virtual Playhouse.';
  $('#programCast').innerHTML = (play.cast || []).map((c) => {
    const color = c.color || CAST_PALETTE[0];
    return `<span class="cast-chip"><span class="cast-dot" style="background:${escapeHtml(color)}"></span>${escapeHtml(c.short || c.name)}</span>`;
  }).join('');
}

function loadIndex(index) {
  const target = clamp(index, 0, plays.length - 1);
  currentPlayIndex = target;
  stage.playingCustom = target >= ACTS.length;
  loadPlay(plays[target]);
}

function restartAct() {
  if (!stage.play) return;
  loadPlay(stage.play);
}

function nextAct() {
  loadIndex((currentPlayIndex + 1) % plays.length);
}

function prevAct() {
  loadIndex((currentPlayIndex - 1 + plays.length) % plays.length);
}

function togglePlay() {
  if (stage.awaitingEntry) {
    enterTheatre(true);
    return;
  }
  if (stage.ended) {
    restartAct();
    return;
  }
  if (stage.startDelay > 0) {
    stage.startDelay = 0;
    stage.playing = true;
    startAction();
    return;
  }
  stage.playing = !stage.playing;
  if (stage.playing) {
    voice.resume();
    if (!stage.currentAction) startAction();
  } else {
    voice.pause();
  }
  updateHud();
}

function setSeat(seat, instant = false) {
  if (!SEAT_PRESETS[seat]) return;
  stage.seat = seat;
  stage.cameraTarget = { ...SEAT_PRESETS[seat] };
  if (instant) stage.camera = { ...SEAT_PRESETS[seat] };
  $$('.seat-btn').forEach((btn) => {
    const active = btn.dataset.seat === seat;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
}

function react(kind) {
  if (stage.awaitingEntry) enterTheatre(true);
  audio.unlock();
  const amount = { applaud: 0.13, laugh: 0.09, gasp: 0.08, rose: 0.15 }[kind] || 0.08;
  stage.energy = clamp(stage.energy + amount, 0, 1);
  spawnReaction(kind);
  if (kind === 'applaud') audio.applause(0.6 + stage.energy * 0.5);
  else if (kind === 'laugh') audio.laugh();
  else if (kind === 'gasp') audio.gasp();
  else if (kind === 'rose') audio.rose();
  const btn = $(`.reaction-btn[data-reaction="${kind}"]`);
  if (btn) {
    btn.classList.remove('is-firing');
    void btn.offsetWidth;
    btn.classList.add('is-firing');
    setTimeout(() => btn.classList.remove('is-firing'), 520);
  }
  updateHud();
}

/* ─────────────────────────────────────────────────────────────────────────────
   Script parser / validator
   ────────────────────────────────────────────────────────────────────────── */

function normalizeScript(input) {
  const errors = [];
  const warnings = [];
  let raw = input;
  try {
    raw = typeof input === 'string' ? JSON.parse(input) : JSON.parse(JSON.stringify(input));
  } catch (err) {
    return { ok: false, errors: ['That is not valid JSON.'], warnings, script: null };
  }
  if (raw && raw.script && !raw.actions) raw = raw.script;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['The script must be a JSON object with an "actions" array.'], warnings, script: null };
  }
  const rawActions = raw.actions;
  if (!Array.isArray(rawActions) || rawActions.length === 0) {
    return { ok: false, errors: ['The script needs a non-empty "actions" array.'], warnings, script: null };
  }

  const actions = [];
  rawActions.forEach((action, i) => {
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      errors.push(`Action ${i + 1} must be an object.`);
      return;
    }
    const type = String(action.type || '').toUpperCase().trim();
    if (!ACTION_TYPES.has(type)) {
      errors.push(`Action ${i + 1}: unknown type "${action.type || '?'}".`);
      return;
    }
    const next = { ...action, type };
    if (type === 'DIALOGUE') {
      if (!action.actor) errors.push(`Action ${i + 1}: DIALOGUE needs an actor.`);
      if (!action.text || !String(action.text).trim()) errors.push(`Action ${i + 1}: DIALOGUE needs text.`);
      next.text = String(action.text || '').trim();
    }
    if (['ENTER', 'EXIT', 'MOVE', 'FACE', 'GESTURE', 'BOW'].includes(type) && !action.actor) {
      errors.push(`Action ${i + 1}: ${type} needs an actor.`);
    }
    if (type === 'CAPTION' && !String(action.text || '').trim()) {
      errors.push(`Action ${i + 1}: CAPTION needs text.`);
    }
    if (type === 'LIGHTING' && action.color && !/^#?[0-9a-f]{3,8}$/i.test(String(action.color).replace('#', ''))) {
      warnings.push(`Action ${i + 1}: lighting colour may not be a hex value.`);
    }
    if (type === 'SOUND' && action.cue && !SOUND_CUES.has(String(action.cue).toLowerCase())) {
      warnings.push(`Action ${i + 1}: sound cue "${action.cue}" is not in the orchestra's book — it will be silent.`);
    }
    if (type === 'BACKDROP' && action.backdrop && !BACKDROP_LABELS[action.backdrop]) {
      warnings.push(`Action ${i + 1}: unknown backdrop "${action.backdrop}" — the Grand Hall will be used.`);
    }
    if (type === 'EFFECT' && action.effect && !EFFECTS.has(String(action.effect).toLowerCase())) {
      warnings.push(`Action ${i + 1}: unknown effect "${action.effect}".`);
    }
    actions.push(next);
  });

  const usedIds = new Set();
  const uniqueId = (base) => {
    let id = base || 'player';
    let n = 2;
    while (usedIds.has(id)) id = `${base}-${n++}`;
    usedIds.add(id);
    return id;
  };

  const cast = [];
  const rawCast = Array.isArray(raw.cast) ? raw.cast : [];
  rawCast.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object') {
      warnings.push(`Cast entry ${i + 1} was ignored.`);
      return;
    }
    const name = String(entry.name || entry.id || '').trim();
    if (!name) {
      warnings.push(`Cast entry ${i + 1} has no name and was ignored.`);
      return;
    }
    const id = uniqueId(slugify(entry.id || name));
    const costume = entry.costume || guessCostume(name);
    cast.push({
      id,
      name,
      short: entry.short || shortName(name),
      costume,
      color: entry.color || CAST_PALETTE[cast.length % CAST_PALETTE.length],
      position: entry.position || 'center',
      height: clamp(Number(entry.height) || 1, 0.8, 1.3),
    });
  });

  const castMatches = (name) => {
    const key = normalizeKey(name);
    return cast.some((c) => normalizeKey(c.id) === key || normalizeKey(c.name) === key || normalizeKey(c.short) === key);
  };
  const addMissing = (name) => {
    const clean = String(name || '').trim();
    if (!clean || castMatches(clean)) return;
    const id = uniqueId(slugify(clean));
    cast.push({
      id,
      name: clean,
      short: shortName(clean),
      costume: guessCostume(clean),
      color: CAST_PALETTE[cast.length % CAST_PALETTE.length],
      position: ['left', 'center-left', 'center-right', 'right'][cast.length % 4],
      height: 1,
    });
  };

  actions.forEach((action) => {
    if (action.actor) addMissing(action.actor);
    if (action.type === 'FACE' && action.target && !/^(audience|house)$/i.test(action.target)) addMissing(action.target);
  });

  if (!cast.length) errors.push('The script has no cast. Add a "cast" array or name an actor in an action.');

  const backdrop = BACKDROP_LABELS[raw.backdrop] ? raw.backdrop : 'grand_hall';
  if (raw.backdrop && !BACKDROP_LABELS[raw.backdrop]) warnings.push(`Unknown backdrop "${raw.backdrop}" — using the Grand Hall.`);
  const ambient = ['gothic', 'wonderland', 'tragedy', 'enchanted', 'ballroom', 'horror', 'none'].includes(raw.ambient) ? raw.ambient : 'none';

  const script = {
    schema: 'virtual-playhouse/1',
    title: String(raw.title || 'Untitled Play'),
    act: String(raw.act || 'Special Engagement'),
    setting: String(raw.setting || BACKDROP_LABELS[backdrop] || 'The Stage'),
    subtitle: String(raw.subtitle || raw.description || 'A new play for the Virtual Playhouse.'),
    backdrop,
    ambient,
    cast,
    actions,
  };

  return { ok: errors.length === 0, errors, warnings, script };
}

/* ─────────────────────────────────────────────────────────────────────────────
   06. AUDIENCE & UI
   ────────────────────────────────────────────────────────────────────────── */

function toast(title, message, kind = '') {
  const stack = $('#toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast${kind ? ` is-${kind}` : ''}`;
  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.textContent = kind === 'error' ? '⚠' : kind === 'ok' ? '✓' : '❦';
  const body = document.createElement('div');
  body.className = 'toast-body';
  const t = document.createElement('div');
  t.className = 'toast-title';
  t.textContent = title;
  const m = document.createElement('div');
  m.textContent = message;
  body.append(t, m);
  el.append(icon, body);
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 320);
  }, 4200);
}

function buildPlaybill() {
  const grid = $('#playbillGrid');
  if (!grid) return;
  grid.innerHTML = ACTS.map((act, i) => {
    const cast = act.cast.slice(0, 5).map((c) => `<span>${escapeHtml(c.short || c.name)}</span>`).join('');
    return `
      <article class="act-card">
        <div class="act-art act-art-${escapeHtml(act.art)}">
          <span class="act-number">${escapeHtml(act.act)}</span>
        </div>
        <div class="act-body">
          <h3 class="act-title">${escapeHtml(act.title)}</h3>
          <p class="act-setting">${escapeHtml(act.setting)} · ${escapeHtml(act.duration)}</p>
          <div class="act-cast">${cast}</div>
          <button class="btn" data-act="${i}">Take Your Seat</button>
        </div>
      </article>`;
  }).join('');
}

function openPlaybill() {
  buildPlaybill();
  const modal = $('#playbillModal');
  if (modal && !modal.open) modal.showModal();
}

function openScriptLab(tab = 'editor') {
  const modal = $('#scriptModal');
  const editor = $('#scriptEditor');
  if (editor && stage.play) editor.value = JSON.stringify(stage.play, null, 2);
  if (modal && !modal.open) modal.showModal();
  activateTab(tab);
}

function openHelp() {
  const modal = $('#helpModal');
  if (modal && !modal.open) modal.showModal();
}

function activateTab(name) {
  const map = {
    editor: ['#tabEditor', '#panelEditor'],
    ai: ['#tabAi', '#panelAi'],
    schema: ['#tabSchema', '#panelSchema'],
  };
  const active = map[name] || map.editor;
  Object.entries(map).forEach(([key, [tabSel, panelSel]]) => {
    const tab = $(tabSel);
    const panel = $(panelSel);
    const isActive = key === name;
    if (tab) {
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    }
    if (panel) {
      panel.hidden = !isActive;
      panel.classList.toggle('is-active', isActive);
    }
  });
  void active;
}

function setEditorStatus(text, kind = '') {
  const el = $('#editorStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-error', 'is-ok');
  if (kind) el.classList.add(`is-${kind}`);
}

function parseEditor() {
  const editor = $('#scriptEditor');
  if (!editor) return null;
  try {
    return JSON.parse(editor.value);
  } catch (err) {
    setEditorStatus(`JSON error: ${err.message}`, 'error');
    toast('The script will not parse', err.message, 'error');
    return null;
  }
}

function validateEditor(verbose = true) {
  const raw = parseEditor();
  if (!raw) return null;
  const result = normalizeScript(raw);
  if (!result.ok) {
    setEditorStatus(`✕ ${result.errors.length} problem${result.errors.length === 1 ? '' : 's'}: ${result.errors.slice(0, 3).join(' ')}`, 'error');
    if (verbose) toast('Script needs work', result.errors[0], 'error');
    return null;
  }
  const warn = result.warnings.length ? ` ${result.warnings.length} note${result.warnings.length === 1 ? '' : 's'}.` : '';
  setEditorStatus(`✓ Valid — ${result.script.actions.length} actions, ${result.script.cast.length} players.${warn}`, 'ok');
  if (verbose) toast('Script is stage-ready', `${result.script.actions.length} actions, ${result.script.cast.length} players.${warn}`, 'ok');
  return result.script;
}

function addCustomPlay(script) {
  if (plays.length > ACTS.length) plays[plays.length - 1] = script;
  else plays.push(script);
  currentPlayIndex = plays.length - 1;
  stage.playingCustom = true;
  loadPlay(script);
  updateProgram(stage.play);
}

function saveCurrentPlay() {
  if (!stage.play) {
    toast('Nothing to save', 'Load a play first.', 'error');
    return;
  }
  downloadJSON('theatre_play.json', stage.play);
  toast('Play saved', 'The script was exported as theatre_play.json.', 'ok');
}

function readPlayFile(file, target = 'stage') {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = normalizeScript(String(reader.result || ''));
    if (!result.ok) {
      toast('Could not load that play', result.errors[0] || 'Invalid script.', 'error');
      return;
    }
    if (target === 'editor') {
      const editor = $('#scriptEditor');
      if (editor) editor.value = JSON.stringify(result.script, null, 2);
      setEditorStatus(`✓ Loaded ${result.script.title} — ${result.script.actions.length} actions.`, 'ok');
      if (!$('#scriptModal').open) openScriptLab('editor');
      toast('Script loaded into the editor', result.script.title, 'ok');
    } else {
      addCustomPlay(result.script);
      const modal = $('#scriptModal');
      if (modal && modal.open) modal.close();
      toast('A new play takes the stage', result.script.title, 'ok');
    }
  };
  reader.onerror = () => toast('Could not read that file', 'The browser refused the file.', 'error');
  reader.readAsText(file);
}

function setAiStatus(text, kind = '') {
  const el = $('#aiStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-busy', 'is-error', 'is-ok');
  if (kind) el.classList.add(`is-${kind}`);
}

function buildAiPrompt() {
  const userPrompt = $('#aiPrompt').value.trim();
  const backdrop = $('#aiBackdrop').value;
  const backdropLabel = BACKDROP_LABELS[backdrop] || 'Grand Hall';
  return `Write a complete, performable short stage play for The Virtual Playhouse.

The audience prompt:
"""${userPrompt}"""

Setting/backdrop: ${backdropLabel} (use "${backdrop}").
Use 2 to 4 actors. Give each a distinct name and costume. Build 24 to 40 sequential actions.
Start with CAPTION, BACKDROP and LIGHTING, then ENTER your actors before they speak.
Include at least 12 DIALOGUE lines with real dramatic conflict, at least 3 SOUND cues, at least 3 LIGHTING shifts, and one EFFECT. Finish with a BOW for each principal actor.
Keep every dialogue line under 220 characters. Do not include markdown or commentary — return only the JSON object.`;
}

const AI_SYSTEM_PROMPT = `You are the resident playwright of The Virtual Playhouse, an AI classic-theatre simulator. You write tight, theatrical scenes with clear blocking, vivid lights and sound cues.

Return ONLY a JSON object with this exact shape:
{
  "title": "string",
  "act": "Act IV",
  "setting": "short location",
  "subtitle": "one sentence",
  "backdrop": "gothic_lab" | "tea_garden" | "ramparts" | "fairy_wood" | "ballroom" | "dracula_castle" | "grand_hall",
  "ambient": "gothic" | "wonderland" | "tragedy" | "enchanted" | "ballroom" | "horror" | "none",
  "cast": [
    { "id": "unique-id", "name": "Full Name", "short": "Short", "costume": "scientist|creature|alice|hatter|hare|queen|prince|ghost|royal|gown|fairy_queen|fairy_king|puck|donkey|regency|dandy|vampire|bride|victorian|default", "color": "#7fd6c4", "position": "left|center-left|center|center-right|right|far-left|far-right", "height": 1.0 }
  ],
  "actions": [
    { "type": "ENTER", "actor": "Short", "position": "left" },
    { "type": "DIALOGUE", "actor": "Short", "text": "Line of dialogue." }
  ]
}

Allowed action types and fields:
- ENTER {actor, position, from?}
- EXIT {actor}
- MOVE {actor, position}
- FACE {actor, target}
- DIALOGUE {actor, text}
- LIGHTING {color: "#rrggbb", intensity: 0..1}
- SOUND {cue: thunder_clap|rain|wind|magic_chime|door_creak|heartbeat|clock_tick|bell|sword_clash|crowd_gasp|applause|laugh|rose|waltz|wolf_howl|organ}
- BACKDROP {backdrop}
- EFFECT {effect: sparks|lightning|fog|petals|confetti|embers|snow|cards|fireflies|bats}
- GESTURE {actor, gesture: raise|point|beckon|recoil|clasp|kneel|talk}
- BOW {actor}
- CAPTION {text}
- WAIT {duration}
- CURTAIN {state: open|closed}
- AMBIENT {mood}

Every actor who speaks must have a cast entry. Use the cast "short" name in actions. No comments, no markdown, no trailing text.`;

async function callDeepSeek({ apiKey, model, temperature, prompt, signal }) {
  const url = 'https://api.deepseek.com/chat/completions';
  const body = {
    model,
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  };
  const doFetch = (payload) => fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
    signal,
  });
  let res = await doFetch(body);
  if (res.status === 400) {
    const fallback = { ...body };
    delete fallback.response_format;
    res = await doFetch(fallback);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const data = await res.json();
      detail = data?.error?.message || '';
    } catch (_) {
      detail = '';
    }
    throw new Error(`DeepSeek returned HTTP ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  return res.json();
}

async function generatePlay() {
  const apiKey = $('#apiKeyInput').value.trim();
  const model = $('#modelInput').value.trim() || 'deepseek-v4.1-flash';
  const temperature = parseFloat($('#aiTemperature').value) || 0.8;
  const prompt = buildAiPrompt();
  if (!apiKey) {
    setAiStatus('Add a DeepSeek API key first.', 'error');
    toast('An empty prompt booth', 'Enter your DeepSeek API key to summon the AI playwright.', 'error');
    return;
  }
  if ($('#rememberKey').checked) {
    try { localStorage.setItem('vp.deepseek.key', apiKey); } catch (_) { /* private mode */ }
  } else {
    try { localStorage.removeItem('vp.deepseek.key'); } catch (_) { /* private mode */ }
  }

  const btn = $('#generateBtn');
  btn.disabled = true;
  setAiStatus('The playwright is thinking…', 'busy');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75000);
  try {
    const data = await callDeepSeek({ apiKey, model, temperature, prompt, signal: controller.signal });
    clearTimeout(timeout);
    let content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error('DeepSeek returned an empty manuscript.');
    if (typeof content === 'object') {
      content = JSON.stringify(content);
    }
    content = String(content).replace(/```json/gi, '').replace(/```/g, '').trim();
    const first = content.indexOf('{');
    const last = content.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('The manuscript was not valid JSON.');
    const parsed = JSON.parse(content.slice(first, last + 1));
    const result = normalizeScript(parsed);
    if (!result.ok) throw new Error(result.errors.slice(0, 3).join(' '));
    addCustomPlay(result.script);
    setAiStatus(`✓ "${result.script.title}" is ready — ${result.script.actions.length} actions.`, 'ok');
    toast('The AI playwright bows', `"${result.script.title}" is now on stage.`, 'ok');
    setTimeout(() => {
      const modal = $('#scriptModal');
      if (modal && modal.open) modal.close();
    }, 700);
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'The request timed out.' : err.message || 'The playwright dropped their pen.';
    setAiStatus(`✕ ${message}`, 'error');
    toast('The AI playwright stumbled', message, 'error');
  } finally {
    clearTimeout(timeout);
    btn.disabled = false;
  }
}

function updateMuteUI() {
  const muted = audio.muted;
  const icon = $('#muteIcon');
  const btn = $('#muteBtn');
  if (icon) icon.textContent = muted ? '🔇' : '🔊';
  if (btn) {
    btn.setAttribute('aria-pressed', String(muted));
    btn.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
  }
}

function showSoundGate() {
  const gate = $('#soundGate');
  if (!gate) return;
  gate.hidden = false;
  const note = $('#gateNote');
  const btn = $('#enterTheatreBtn');
  if (!voice.supported) {
    if (btn) btn.innerHTML = 'Enter the Theatre <span aria-hidden="true">· Sound On</span>';
    if (note) note.textContent = 'Speech synthesis is unavailable in this browser; the orchestra will still play.';
  } else {
    if (btn) btn.innerHTML = 'Enter the Theatre <span aria-hidden="true">· Voices On</span>';
    if (note) {
      note.textContent = voice.voices.length
        ? `Browsers require one click before voices and music can play. ${voice.voices.length} system voices ready.`
        : 'Browsers require one click before voices and music can play. Your browser will use its default voice.';
    }
  }
  setTimeout(() => btn?.focus(), 150);
}

function enterTheatre(withSound = true) {
  const gate = $('#soundGate');
  const wasAwaiting = stage.awaitingEntry;
  if (!wasAwaiting && gate && gate.hidden) {
    if (withSound) {
      audio.unlock();
      if (audio.muted) {
        audio.setMuted(false);
        updateMuteUI();
      }
    }
    return;
  }
  stage.awaitingEntry = false;
  if (gate) gate.hidden = true;
  if (withSound) {
    audio.unlock();
    if (audio.muted) {
      audio.setMuted(false);
      updateMuteUI();
    }
    if (audio.ambientEnabled) audio.setAmbient(stage.ambient);
    audio.magic();
    if (voice.enabled) voice.prime();
    voice.resume();
  } else {
    audio.ensure();
    audio.setMuted(true);
    updateMuteUI();
    voice.cancel();
  }
  stage.curtain.target = 1;
  stage.startDelay = 1.45;
  stage.playing = false;
  stage.ended = false;
  stage.endShown = false;
  stage.endTimer = 0;
  const endCard = $('#endCard');
  if (endCard) endCard.hidden = true;
  updateHud();
  toast(
    withSound ? 'The house is live' : 'Watching in silence',
    withSound
      ? 'Voices and orchestra are on. The curtain is rising.'
      : 'The play will continue without voices or sound. Press M to bring the house back.',
    'ok',
  );
}

function soundCheck() {
  if (!audio.ensure()) {
    toast('Audio unavailable', 'This browser could not start the Web Audio context.', 'error');
    return;
  }
  audio.unlock();
  if (audio.muted) {
    audio.setMuted(false);
    updateMuteUI();
  }
  audio.thunder();
  setTimeout(() => audio.applause(1), 480);
  setTimeout(() => audio.magic(), 1250);
  toast('Sound check', 'Thunder, applause and a chime. The orchestra is live.', 'ok');
}

function updateVoiceBadge() {
  const badge = $('#voiceBtn');
  if (!badge) return;
  const on = voice.supported && voice.enabled;
  badge.classList.toggle('is-on', on);
  badge.classList.toggle('is-off', !on);
  badge.textContent = on ? '🗣 Voices On' : '🗣 Voices Off';
  badge.setAttribute('aria-pressed', String(on));
  badge.title = voice.supported
    ? 'Open the voice cast (V)'
    : 'Speech synthesis is not available in this browser';
}

function buildVoiceCast() {
  const status = $('#voiceStatus');
  const toggle = $('#voiceEnabled');
  const volume = $('#voiceVolume');
  const container = $('#voiceCast');
  if (!status || !toggle || !container) return;

  status.classList.remove('is-ok', 'is-warn');
  if (!voice.supported) {
    status.textContent = 'Speech synthesis is not available in this browser. The typewriter, orchestra and crowd still work.';
    status.classList.add('is-warn');
  } else if (!voice.voices.length) {
    status.textContent = 'Using the browser default voice. More system voices will appear when they finish loading.';
  } else {
    status.textContent = `${voice.voices.length} system voice${voice.voices.length === 1 ? '' : 's'} available. The cast is assigned automatically.`;
    status.classList.add('is-ok');
  }
  if (voice.lastError === 'not-allowed') {
    status.textContent = 'The browser blocked speech. Click “Enter the Theatre · Voices On” again to grant permission.';
    status.classList.remove('is-ok');
    status.classList.add('is-warn');
  }
  toggle.checked = voice.enabled;
  toggle.disabled = !voice.supported;
  if (volume) volume.value = String(voice.volume);
  const ambientToggle = $('#ambientEnabled');
  if (ambientToggle) ambientToggle.checked = audio.ambientEnabled;

  const cast = stage.cast || [];
  if (!cast.length) {
    container.innerHTML = '<p class="fineprint">Load a play to cast voices.</p>';
    return;
  }
  container.innerHTML = cast.map((member, index) => {
    const actor = stage.actors.get(member.id) || buildActor(member, index);
    const chosen = voice.voiceFor(actor);
    const voiceName = chosen ? chosen.name : 'System default';
    const color = member.color || CAST_PALETTE[index % CAST_PALETTE.length];
    return `
      <div class="voice-row">
        <span class="cast-dot" style="background:${escapeHtml(color)}"></span>
        <div class="voice-row-info">
          <div class="voice-row-name">${escapeHtml(member.short || member.name)}</div>
          <div class="voice-row-voice" title="${escapeHtml(voiceName)}">${escapeHtml(voiceName)} · ${escapeHtml(actor.voiceGender)} · pitch ${actor.voicePitch.toFixed(2)}</div>
        </div>
        <button class="btn btn-ghost btn-small" data-voice-actor="${escapeHtml(member.id)}">Hear</button>
      </div>`;
  }).join('');
}

function openVoiceModal() {
  buildVoiceCast();
  const modal = $('#voiceModal');
  if (modal && !modal.open) modal.showModal();
}

function setVoiceEnabled(enabled) {
  voice.enabled = !!enabled && voice.supported;
  if (!voice.enabled) voice.cancel();
  updateVoiceBadge();
  buildVoiceCast();
  toast(
    voice.enabled ? 'The company has voices' : 'Voices are off',
    voice.enabled ? 'Each player will speak on their next line.' : 'Dialogue will continue as typewriter text and tone.',
    voice.enabled ? 'ok' : '',
  );
}

async function testVoice() {
  if (!voice.supported) {
    toast('No voice available', 'This browser does not support speech synthesis.', 'error');
    return;
  }
  if (audio.muted) {
    audio.setMuted(false);
    updateMuteUI();
  }
  const cast = (stage.cast || []).slice(0, 4);
  if (!cast.length) {
    toast('No cast to voice', 'Load a play first.', 'error');
    return;
  }
  const btn = $('#voiceTestBtn');
  if (btn) btn.disabled = true;
  toast('Voice check', 'Hear the company introduce themselves.', 'ok');
  for (const member of cast) {
    const actor = stage.actors.get(member.id) || buildActor(member, 0);
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 5000);
      const ok = voice.preview(actor, `I am ${actor.short}. The play is the thing.`, () => {
        clearTimeout(timer);
        resolve();
      });
      if (!ok) {
        clearTimeout(timer);
        resolve();
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  if (btn) btn.disabled = false;
  toast('The company is ready', 'Each player has a distinct voice and pace.', 'ok');
}

function toggleMute() {
  audio.ensure();
  audio.setMuted(!audio.muted);
  if (audio.muted) voice.cancel();
  else if (audio.ambientEnabled) audio.setAmbient(stage.ambient);
  updateMuteUI();
  toast(
    audio.muted ? 'House muted' : 'House live',
    audio.muted ? 'The orchestra, crowd and voices are silent.' : 'Sound is back in the room. Voices return on the next line.',
    'ok',
  );
}

let audioUnlocked = false;
function unlockAudio() {
  audio.unlock();
  if (!audioUnlocked) {
    audioUnlocked = true;
    if (!stage.awaitingEntry && audio.ambientEnabled && stage.ambient && stage.ambient !== 'none') {
      audio.setAmbient(stage.ambient);
    }
  }
}

function toggleFullscreen() {
  const shell = $('#stageShell');
  if (!document.fullscreenElement) {
    if (shell.requestFullscreen) shell.requestFullscreen().catch(() => toast('Fullscreen unavailable', 'Your browser declined the request.', 'error'));
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}

function copyAiPrompt() {
  const text = `${AI_SYSTEM_PROMPT}\n\n---\n\n${buildAiPrompt()}`;
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast('Prompt copied', 'Paste it into any capable model, then load the JSON.', 'ok'),
      () => toast('Could not copy', 'Select the prompt text manually.', 'error'),
    );
  } else {
    toast('Clipboard unavailable', 'Select the prompt text manually.', 'error');
  }
}

function bindUI() {
  // top bar
  $('#playbillBtn').addEventListener('click', openPlaybill);
  $('#scriptBtn').addEventListener('click', () => openScriptLab('editor'));
  $('#helpBtn').addEventListener('click', openHelp);
  $('#muteBtn').addEventListener('click', toggleMute);
  $('#fullscreenBtn').addEventListener('click', toggleFullscreen);
  $('#soundCheckBtn').addEventListener('click', soundCheck);
  $('#helpSoundBtn').addEventListener('click', soundCheck);
  $('#voiceBtn').addEventListener('click', openVoiceModal);
  $('#enterTheatreBtn').addEventListener('click', () => enterTheatre(true));
  $('#silentModeBtn').addEventListener('click', () => enterTheatre(false));

  voice.onVoicesChanged = () => {
    voice.assignCast(stage.actors.values());
    updateVoiceBadge();
    const gate = $('#soundGate');
    if (gate && !gate.hidden) showSoundGate();
    const modal = $('#voiceModal');
    if (modal && modal.open) buildVoiceCast();
  };
  updateVoiceBadge();

  // seats
  $$('.seat-btn').forEach((btn) => {
    btn.addEventListener('click', () => setSeat(btn.dataset.seat));
  });

  // transport
  $('#playBtn').addEventListener('click', togglePlay);
  $('#restartBtn').addEventListener('click', restartAct);
  $('#prevActBtn').addEventListener('click', prevAct);
  $('#nextActBtn').addEventListener('click', nextAct);
  $('#speedSelect').addEventListener('change', (e) => {
    stage.speed = clamp(parseFloat(e.target.value) || 1, 0.25, 3);
    voice.rate = clamp(stage.speed, 0.75, 1.5);
  });
  $('#saveBtn').addEventListener('click', saveCurrentPlay);
  $('#loadBtn').addEventListener('click', () => {
    fileTarget = 'stage';
    $('#fileInput').click();
  });

  // reactions
  $$('.reaction-btn').forEach((btn) => {
    btn.addEventListener('click', () => react(btn.dataset.reaction));
  });

  // timeline seek
  const track = $('#timelineTrack');
  const seekFromEvent = (e) => {
    if (!stage.actions.length) return;
    const rect = track.getBoundingClientRect();
    const ratio = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    seekTo(Math.min(stage.actions.length - 1, Math.floor(ratio * stage.actions.length)));
  };
  track.addEventListener('click', seekFromEvent);
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      seekTo(stage.index + (e.key === 'ArrowRight' ? 1 : -1));
    }
  });

  // playbill delegation
  $('#playbillGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const index = Number(btn.dataset.act);
    if (!Number.isFinite(index)) return;
    loadIndex(index);
    const modal = $('#playbillModal');
    if (modal && modal.open) modal.close();
  });
  $('#playbillCustomBtn').addEventListener('click', () => {
    const modal = $('#playbillModal');
    if (modal && modal.open) modal.close();
    openScriptLab('ai');
  });

  // modal close buttons
  $$('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.dataset.close);
      if (modal && modal.open) modal.close();
    });
  });
  $$('dialog.modal').forEach((dialog) => {
    dialog.addEventListener('click', (e) => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        dialog.close();
      }
    });
  });

  // script lab tabs
  $('#tabEditor').addEventListener('click', () => activateTab('editor'));
  $('#tabAi').addEventListener('click', () => activateTab('ai'));
  $('#tabSchema').addEventListener('click', () => activateTab('schema'));

  // editor actions
  $('#formatBtn').addEventListener('click', () => {
    const raw = parseEditor();
    if (!raw) return;
    $('#scriptEditor').value = JSON.stringify(raw, null, 2);
    setEditorStatus('Beautified. The prompt booth approves.', 'ok');
  });
  $('#validateBtn').addEventListener('click', () => validateEditor(true));
  $('#stageItBtn').addEventListener('click', () => {
    const script = validateEditor(false);
    if (!script) return;
    addCustomPlay(script);
    const modal = $('#scriptModal');
    if (modal && modal.open) modal.close();
    toast('Curtain up', `"${script.title}" is now playing.`, 'ok');
  });
  $('#editorSaveBtn').addEventListener('click', () => {
    const script = validateEditor(false);
    if (!script) return;
    downloadJSON('theatre_play.json', script);
    toast('Play saved', 'The script was exported as theatre_play.json.', 'ok');
  });
  $('#editorLoadBtn').addEventListener('click', () => {
    fileTarget = 'editor';
    $('#fileInput').click();
  });

  // AI panel
  $('#generateBtn').addEventListener('click', generatePlay);
  $('#copyPromptBtn').addEventListener('click', copyAiPrompt);

  // voice cast
  $('#voiceEnabled').addEventListener('change', (e) => setVoiceEnabled(e.target.checked));
  $('#ambientEnabled').addEventListener('change', (e) => {
    audio.setAmbientEnabled(e.target.checked);
    if (e.target.checked) audio.setAmbient(stage.ambient);
    toast(
      e.target.checked ? 'Ambient bed on' : 'Ambient bed off',
      e.target.checked ? 'A very quiet drone will sit under the scene.' : 'The stage is now carried by cues and voices alone.',
      e.target.checked ? '' : 'ok',
    );
  });
  $('#voiceVolume').addEventListener('input', (e) => {
    voice.volume = clamp(parseFloat(e.target.value) || 0, 0, 1);
  });
  $('#voiceTestBtn').addEventListener('click', testVoice);
  $('#voiceCast').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-voice-actor]');
    if (!btn) return;
    const actor = stage.actors.get(btn.dataset.voiceActor);
    if (!actor) return;
    if (audio.muted) {
      audio.setMuted(false);
      updateMuteUI();
    }
    const chosen = voice.voiceFor(actor);
    voice.preview(actor);
    toast('Voice check', `${actor.short} — ${chosen ? chosen.name : 'system default'}`, 'ok');
  });
  $('#rememberKey').addEventListener('change', (e) => {
    try {
      if (e.target.checked) {
        const key = $('#apiKeyInput').value.trim();
        if (key) localStorage.setItem('vp.deepseek.key', key);
      } else {
        localStorage.removeItem('vp.deepseek.key');
      }
    } catch (_) { /* private mode */ }
  });
  $('#apiKeyInput').addEventListener('input', (e) => {
    try {
      if ($('#rememberKey').checked) {
        if (e.target.value.trim()) localStorage.setItem('vp.deepseek.key', e.target.value.trim());
        else localStorage.removeItem('vp.deepseek.key');
      }
    } catch (_) { /* private mode */ }
  });

  // end card
  $('#endReplayBtn').addEventListener('click', restartAct);
  $('#endNextBtn').addEventListener('click', () => {
    if (currentPlayIndex < plays.length - 1) {
      loadIndex(currentPlayIndex + 1);
    } else {
      $('#endCard').hidden = true;
      openPlaybill();
    }
  });

  // file input
  $('#fileInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    readPlayFile(file, fileTarget);
    e.target.value = '';
  });

  // drag and drop a script onto the stage
  const shell = $('#stageShell');
  ['dragenter', 'dragover'].forEach((evt) => {
    shell.addEventListener(evt, (e) => {
      e.preventDefault();
      shell.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    shell.addEventListener(evt, (e) => {
      e.preventDefault();
      shell.classList.remove('is-dragover');
    });
  });
  shell.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) readPlayFile(file, 'stage');
  });

  // keyboard
  document.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      prevAct();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      nextAct();
    } else if (e.code === 'KeyR') {
      restartAct();
    } else if (e.code === 'KeyP') {
      openPlaybill();
    } else if (e.code === 'KeyS') {
      openScriptLab('editor');
    } else if (e.code === 'KeyM') {
      toggleMute();
    } else if (e.code === 'KeyV') {
      openVoiceModal();
    } else if (e.code === 'KeyF') {
      toggleFullscreen();
    } else if (e.code === 'KeyH') {
      openHelp();
    } else if (e.code === 'Digit1') {
      react('applaud');
    } else if (e.code === 'Digit2') {
      react('laugh');
    } else if (e.code === 'Digit3') {
      react('gasp');
    } else if (e.code === 'Digit4') {
      react('rose');
    }
  });

  // unlock the orchestra on the first gesture
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  document.addEventListener('keydown', unlockAudio);

  // load remembered key
  try {
    const remembered = localStorage.getItem('vp.deepseek.key');
    if (remembered) {
      $('#apiKeyInput').value = remembered;
      $('#rememberKey').checked = true;
    }
  } catch (_) { /* private mode */ }

  // preload backdrops off the critical path
  setTimeout(() => {
    Object.keys(BACKDROP_LABELS).forEach((name) => getBackdrop(name));
  }, 300);
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

buildPlaybill();
bindUI();
setSeat('front', true);
stage.awaitingEntry = true;
loadPlay(ACTS[0], { autoplay: false });
updateMuteUI();
updateVoiceBadge();
showSoundGate();
requestAnimationFrame(render);

// Keep the stage alive when the tab returns, and pause the company's voices.
document.addEventListener('visibilitychange', () => {
  lastFrame = performance.now();
  if (document.hidden) voice.pause();
  else if (stage.playing) voice.resume();
});

window.addEventListener('beforeunload', () => voice.cancel());


