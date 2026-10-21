/* Question bank — 150 questions across every topic of the 6th Scientific curriculum.
   Math / Physics / Chemistry use parametric generators (6 per topic) so numbers vary but the
   wording reads like ministerial-exam items. Biology / English are hand-written. */
import type { Difficulty, Question, QuestionOption, QuestionStatus, QuestionType } from '@/types';
import { createRng, daysAgo, type Rng } from '@/utils/random';
import { IMAGES } from '@/utils/images';
import { topics, units } from './curriculum';

type Txt = string | [string, string];
const EN = (x: Txt) => (typeof x === 'string' ? x : x[0]);
const AR = (x: Txt) => (typeof x === 'string' ? x : x[1]);

interface Draft {
  en: string;
  ar: string;
  correct: Txt;
  wrong: Txt[];
  exEn: string;
  exAr: string;
  tags: string[];
  type?: QuestionType;
  difficulty?: Difficulty;
  image?: string | null;
}

const TRUE: Txt = ['True', 'صح'];
const FALSE: Txt = ['False', 'خطأ'];

/** Trim float noise: 0.30000000004 → "0.3". */
const n = (x: number) => String(+x.toFixed(3));
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const frac = (a: number, b: number) => {
  const g = gcd(a, b) || 1;
  const [p, q] = [a / g, b / g];
  if (q === 1) return `${p}`;
  return `${p < 0 ? '-' : ''}\\frac{${Math.abs(p)}}{${q}}`;
};
/** Format a + bi in LaTeX. */
const cx = (re: number, im: number) => {
  if (im === 0) return `${re}`;
  const imPart = Math.abs(im) === 1 ? 'i' : `${Math.abs(im)}i`;
  if (re === 0) return `${im < 0 ? '-' : ''}${imPart}`;
  return `${re} ${im < 0 ? '-' : '+'} ${imPart}`;
};
const m = (s: string | number) => `$${s}$`;

type Gen = (r: Rng, v: number) => Draft;

// ─── Mathematics ─────────────────────────────────────────────────────────────
const MATH: Record<string, Gen> = {
  unit_math_1_t1: (r, v) => {
    if (v % 2 === 0) {
      const a = r.int(1, 5), b = r.int(1, 5), c = r.int(1, 4), d = r.int(1, 4);
      const re = a * c + b * d, im = b * c - a * d;
      return {
        en: `Simplify $(${a} + ${b}i)(${c} - ${d}i)$.`,
        ar: `بسّط المقدار $(${a} + ${b}i)(${c} - ${d}i)$.`,
        correct: m(cx(re, im)),
        wrong: [m(cx(a * c - b * d, im === 0 ? 1 : -im)), m(cx(a * c, -b * d)), m(cx(re + 1, b * c + a * d))],
        exEn: `Expand and use $i^2 = -1$: $${a * c} - ${a * d}i + ${b * c}i - ${b * d}i^2 = ${cx(re, im)}$.`,
        exAr: `نفكّ الأقواس ونعوّض $i^2 = -1$ فنحصل على $${cx(re, im)}$.`,
        tags: ['complex-numbers', 'multiplication'],
      };
    }
    const p = r.int(14, 97);
    const vals = ['1', 'i', '-1', '-i'];
    return {
      en: `Find the value of $i^{${p}}$.`,
      ar: `جد قيمة $i^{${p}}$.`,
      correct: m(vals[p % 4]),
      wrong: vals.filter((_, j) => j !== p % 4).map(m),
      exEn: `Divide the exponent by 4: $${p} = 4(${Math.floor(p / 4)}) + ${p % 4}$, so $i^{${p}} = i^{${p % 4}} = ${vals[p % 4]}$.`,
      exAr: `نقسم الأس على 4 فيكون الباقي ${p % 4}، إذن $i^{${p}} = ${vals[p % 4]}$.`,
      tags: ['complex-numbers', 'powers-of-i'],
    };
  },
  unit_math_1_t2: (r, v) => {
    if (v % 2 === 0) {
      const [a, b, c] = r.pick([[3, 4, 5], [5, 12, 13], [6, 8, 10], [8, 15, 17], [7, 24, 25], [9, 12, 15]] as const);
      return {
        en: `Find the modulus of $z = ${a} + ${b}i$.`,
        ar: `جد مقياس العدد المركب $z = ${a} + ${b}i$.`,
        correct: m(`|z| = ${c}`),
        wrong: [m(`|z| = ${a + b}`), m(`|z| = ${c * c}`), m(`|z| = ${Math.abs(b - a)}`)],
        exEn: `$|z| = \\sqrt{${a}^2 + ${b}^2} = \\sqrt{${c * c}} = ${c}$.`,
        exAr: `$|z| = \\sqrt{${a}^2 + ${b}^2} = ${c}$.`,
        tags: ['polar-form', 'modulus'],
      };
    }
    const [den, pow, ans] = r.pick([[6, 3, 'i'], [4, 4, '-1'], [3, 6, '1'], [4, 6, '-i'], [2, 3, '-i'], [6, 12, '1']] as const);
    return {
      en: `Using De Moivre's theorem, $\\left(\\cos\\frac{\\pi}{${den}} + i\\sin\\frac{\\pi}{${den}}\\right)^{${pow}}$ equals:`,
      ar: `باستخدام مبرهنة ديموافر، فإن $\\left(\\cos\\frac{\\pi}{${den}} + i\\sin\\frac{\\pi}{${den}}\\right)^{${pow}}$ يساوي:`,
      correct: m(ans),
      wrong: ['1', '-1', 'i', '-i'].filter((x) => x !== ans).map(m),
      exEn: `By De Moivre: $\\cos\\frac{${pow}\\pi}{${den}} + i\\sin\\frac{${pow}\\pi}{${den}} = ${ans}$.`,
      exAr: `حسب ديموافر نضرب الزاوية في ${pow} فنحصل على $${ans}$.`,
      tags: ['de-moivre', 'polar-form'],
    };
  },
  unit_math_2_t1: (r, v) => {
    const p = v + 2 + r.int(0, 1) * 6;
    if (v % 2 === 0) {
      return {
        en: `Find the focus of the parabola $y^2 = ${4 * p}x$.`,
        ar: `جد بؤرة القطع المكافئ $y^2 = ${4 * p}x$.`,
        correct: m(`F(${p}, 0)`),
        wrong: [m(`F(0, ${p})`), m(`F(${4 * p}, 0)`), m(`F(-${p}, 0)`)],
        exEn: `Compare with $y^2 = 4px$: $4p = ${4 * p} \\Rightarrow p = ${p}$, so the focus is $(${p}, 0)$.`,
        exAr: `بالمقارنة مع $y^2 = 4px$ نجد $p = ${p}$ فتكون البؤرة $(${p}, 0)$.`,
        tags: ['parabola', 'focus'],
      };
    }
    return {
      en: `The equation of the directrix of the parabola $x^2 = ${4 * p}y$ is:`,
      ar: `معادلة دليل القطع المكافئ $x^2 = ${4 * p}y$ هي:`,
      correct: m(`y = -${p}`),
      wrong: [m(`y = ${p}`), m(`x = -${p}`), m(`y = -${4 * p}`)],
      exEn: `For $x^2 = 4py$ the directrix is $y = -p$; here $p = ${p}$.`,
      exAr: `للقطع $x^2 = 4py$ يكون الدليل $y = -p$ حيث $p = ${p}$.`,
      tags: ['parabola', 'directrix'],
    };
  },
  unit_math_2_t2: (r, v) => {
    if (v % 2 === 0) {
      const [a, b, c] = r.pick([[5, 3, 4], [5, 4, 3], [13, 12, 5], [10, 8, 6], [17, 15, 8], [10, 6, 8]] as const);
      return {
        en: `The foci of the ellipse $\\frac{x^2}{${a * a}} + \\frac{y^2}{${b * b}} = 1$ are:`,
        ar: `بؤرتا القطع الناقص $\\frac{x^2}{${a * a}} + \\frac{y^2}{${b * b}} = 1$ هما:`,
        correct: m(`(\\pm ${c}, 0)`),
        wrong: [m(`(\\pm ${a}, 0)`), m(`(0, \\pm ${c})`), m(`(\\pm ${b}, 0)`)],
        exEn: `$c^2 = a^2 - b^2 = ${a * a} - ${b * b} = ${c * c}$, so $c = ${c}$ on the major (x) axis.`,
        exAr: `$c^2 = a^2 - b^2 = ${c * c}$ إذن $c = ${c}$ والبؤرتان على المحور السيني.`,
        tags: ['ellipse', 'foci'],
      };
    }
    const [a, b, c] = r.pick([[3, 4, 5], [4, 3, 5], [5, 12, 13], [6, 8, 10], [8, 6, 10], [12, 5, 13]] as const);
    return {
      en: `The eccentricity of the hyperbola $\\frac{x^2}{${a * a}} - \\frac{y^2}{${b * b}} = 1$ is:`,
      ar: `الاختلاف المركزي للقطع الزائد $\\frac{x^2}{${a * a}} - \\frac{y^2}{${b * b}} = 1$ هو:`,
      correct: m(`e = ${frac(c, a)}`),
      wrong: [m(`e = ${frac(a, c)}`), m(`e = ${frac(b, a)}`), m(`e = ${frac(c, b)}`)],
      exEn: `$c^2 = a^2 + b^2 = ${c * c} \\Rightarrow c = ${c}$, and $e = \\frac{c}{a} = ${frac(c, a)}$.`,
      exAr: `$c = \\sqrt{a^2 + b^2} = ${c}$ و $e = \\frac{c}{a} = ${frac(c, a)}$.`,
      tags: ['hyperbola', 'eccentricity'],
    };
  },
  unit_math_3_t1: (r, v) => {
    if (v % 2 === 0) {
      const p = r.int(2, 6);
      const k = (p + 1) * r.int(1, 4);
      const co = k / (p + 1);
      const coS = co === 1 ? '' : `${co}`;
      return {
        en: `Find $\\int ${k}x^{${p}}\\,dx$.`,
        ar: `جد $\\int ${k}x^{${p}}\\,dx$.`,
        correct: m(`${coS}x^{${p + 1}} + C`),
        wrong: [m(`${k * p}x^{${p - 1}} + C`), m(`${k}x^{${p + 1}} + C`), m(`${coS}x^{${p + 1}}`)],
        exEn: `Power rule: $\\int x^n dx = \\frac{x^{n+1}}{n+1} + C$, so $\\frac{${k}}{${p + 1}}x^{${p + 1}} + C$. Never drop the constant $C$.`,
        exAr: `قاعدة القوة: نرفع الأس بواحد ونقسم على الأس الجديد، ولا ننسى ثابت التكامل $C$.`,
        tags: ['integration', 'power-rule'],
      };
    }
    const a = r.int(1, 9), p = r.int(2, 5);
    return {
      en: `Using substitution, find $\\int 2x\\,(x^2 + ${a})^{${p}}\\,dx$.`,
      ar: `باستخدام التعويض، جد $\\int 2x\\,(x^2 + ${a})^{${p}}\\,dx$.`,
      correct: m(`\\frac{(x^2 + ${a})^{${p + 1}}}{${p + 1}} + C`),
      wrong: [m(`(x^2 + ${a})^{${p + 1}} + C`), m(`\\frac{2x(x^2 + ${a})^{${p + 1}}}{${p + 1}} + C`), m(`\\frac{(x^2 + ${a})^{${p - 1}}}{${p - 1}} + C`)],
      exEn: `Let $u = x^2 + ${a}$, $du = 2x\\,dx$: $\\int u^{${p}}du = \\frac{u^{${p + 1}}}{${p + 1}} + C$.`,
      exAr: `نفرض $u = x^2 + ${a}$ فيكون $du = 2x\\,dx$ ويصبح التكامل $\\frac{u^{${p + 1}}}{${p + 1}} + C$.`,
      tags: ['integration', 'substitution'],
    };
  },
  unit_math_3_t2: (r, v) => {
    if (v % 2 === 0) {
      const a = r.int(1, 4);
      return {
        en: `Evaluate $\\int_0^{${a}} 3x^2\\,dx$.`,
        ar: `احسب قيمة $\\int_0^{${a}} 3x^2\\,dx$.`,
        correct: m(a ** 3),
        wrong: [m(6 * a), m(3 * a ** 3), m(frac(a ** 3, 3))],
        exEn: `$\\int_0^{${a}} 3x^2dx = \\left[x^3\\right]_0^{${a}} = ${a ** 3}$.`,
        exAr: `$\\left[x^3\\right]_0^{${a}} = ${a ** 3}$.`,
        tags: ['definite-integral'],
      };
    }
    const a = r.int(2, 6);
    return {
      en: `Find the area enclosed between $y = x^2$ and $y = ${a}x$.`,
      ar: `جد مساحة المنطقة المحصورة بين المنحنيين $y = x^2$ و $y = ${a}x$.`,
      correct: m(`${frac(a ** 3, 6)}\\ \\text{unit}^2`),
      wrong: [m(`${frac(a ** 3, 3)}\\ \\text{unit}^2`), m(`${frac(a ** 3, 2)}\\ \\text{unit}^2`), m(`${frac(a * a, 6)}\\ \\text{unit}^2`)],
      exEn: `Intersections at $x = 0$ and $x = ${a}$; $A = \\int_0^{${a}} (${a}x - x^2)dx = ${frac(a ** 3, 6)}$.`,
      exAr: `نقاط التقاطع $x = 0$ و $x = ${a}$، والمساحة $\\int_0^{${a}} (${a}x - x^2)dx = ${frac(a ** 3, 6)}$.`,
      tags: ['area', 'definite-integral'],
    };
  },
};

// ─── Physics ─────────────────────────────────────────────────────────────────
const PLATE_CONCEPTS: [Txt, Txt, Txt, Txt[]][] = [
  [
    ['If the plate separation of a parallel-plate capacitor is doubled (charge kept constant), its capacitance:', 'إذا ضوعفت المسافة بين صفيحتي متسعة ذات صفيحتين متوازيتين، فإن سعتها:'],
    ['Since $C = \\frac{\\varepsilon_0 A}{d}$, doubling $d$ halves $C$.', 'لأن $C = \\frac{\\varepsilon_0 A}{d}$ فمضاعفة $d$ تنصّف السعة.'],
    ['Halves', 'تقل إلى النصف'],
    [['Doubles', 'تتضاعف'], ['Remains unchanged', 'تبقى ثابتة'], ['Becomes four times', 'تصبح أربعة أمثالها']],
  ],
  [
    ['If the plate area of a parallel-plate capacitor is doubled, its capacitance:', 'إذا ضوعفت مساحة صفيحتي المتسعة، فإن سعتها:'],
    ['$C$ is directly proportional to the plate area $A$.', 'السعة تتناسب طردياً مع مساحة الصفيحتين $A$.'],
    ['Doubles', 'تتضاعف'],
    [['Halves', 'تقل إلى النصف'], ['Remains unchanged', 'تبقى ثابتة'], ['Becomes a quarter', 'تصبح ربع قيمتها']],
  ],
  [
    ['Inserting a dielectric of constant $\\kappa = 3$ between the plates of an isolated charged capacitor makes the potential difference:', 'إدخال عازل ثابت عزله $\\kappa = 3$ بين صفيحتي متسعة مشحونة ومعزولة يجعل فرق الجهد:'],
    ['$C$ becomes $3C$ while $Q$ is constant, so $V = \\frac{Q}{C}$ drops to one third.', 'تصبح السعة $3C$ والشحنة ثابتة، لذا يقل $V = \\frac{Q}{C}$ إلى الثلث.'],
    ['One third of its original value', 'ثلث قيمته الأصلية'],
    [['Three times its original value', 'ثلاثة أمثال قيمته'], ['Unchanged', 'ثابتاً'], ['Zero', 'صفراً']],
  ],
];

const RLC_CONCEPTS: Draft[] = [
  {
    en: 'At resonance in a series RLC circuit, which statement is correct?',
    ar: 'عند الرنين في دائرة RLC على التوالي، أي العبارات صحيحة؟',
    correct: ['$X_L = X_C$ and $Z = R$', '$X_L = X_C$ و $Z = R$'],
    wrong: [['The current is minimum', 'التيار في أقل قيمة'], ['The power factor is zero', 'عامل القدرة يساوي صفراً'], ['The impedance is maximum', 'الممانعة في أكبر قيمة']],
    exEn: 'At resonance the reactances cancel, the impedance equals $R$ (minimum) and the current is maximum.',
    exAr: 'عند الرنين تتساوى الرادتان فتصبح الممانعة مساوية لـ $R$ ويكون التيار أعظم ما يمكن.',
    tags: ['resonance', 'rlc'],
  },
  {
    en: 'The resonant frequency is $f_0 = \\frac{1}{2\\pi\\sqrt{LC}}$. If the capacitance is quadrupled, $f_0$:',
    ar: 'التردد الرنيني $f_0 = \\frac{1}{2\\pi\\sqrt{LC}}$. إذا أصبحت السعة أربعة أمثالها فإن $f_0$:',
    correct: ['Halves', 'يقل إلى النصف'],
    wrong: [['Doubles', 'يتضاعف'], ['Becomes four times', 'يصبح أربعة أمثاله'], ['Becomes a quarter', 'يصبح ربع قيمته']],
    exEn: '$f_0 \\propto \\frac{1}{\\sqrt{C}}$, and $\\sqrt{4} = 2$, so $f_0$ halves.',
    exAr: '$f_0$ يتناسب عكسياً مع $\\sqrt{C}$ و $\\sqrt{4} = 2$ فيقل التردد إلى النصف.',
    tags: ['resonance', 'frequency'],
  },
  {
    en: 'In a series RLC circuit at resonance, the power factor $\\cos\\phi$ equals 1.',
    ar: 'في دائرة RLC على التوالي عند الرنين يكون عامل القدرة $\\cos\\phi$ مساوياً للواحد.',
    correct: TRUE,
    wrong: [FALSE],
    type: 'true_false',
    exEn: 'Voltage and current are in phase ($\\phi = 0$), so $\\cos\\phi = 1$.',
    exAr: 'الفولتية والتيار بالطور نفسه ($\\phi = 0$) لذا $\\cos\\phi = 1$.',
    tags: ['power-factor', 'resonance'],
  },
];

const PHYS: Record<string, Gen> = {
  unit_phys_1_t1: (r, v) => {
    if (v % 2 === 0) {
      const C = r.pick([2, 3, 4, 5, 8, 10]);
      const V = r.pick([6, 10, 12, 20, 24, 50]);
      const Q = C * V;
      return {
        en: `A capacitor stores a charge of $${Q}\\,\\mu C$ when connected to a $${V}\\,V$ battery. Its capacitance is:`,
        ar: `متسعة تختزن شحنة مقدارها $${Q}\\,\\mu C$ عند ربطها بمصدر فرق جهده $${V}\\,V$. سعتها تساوي:`,
        correct: m(`${C}\\,\\mu F`),
        wrong: [m(`${Q * V}\\,\\mu F`), m(`${2 * C}\\,\\mu F`), m(`${C * 10}\\,\\mu F`)],
        exEn: `$C = \\frac{Q}{V} = \\frac{${Q}}{${V}} = ${C}\\,\\mu F$.`,
        exAr: `$C = \\frac{Q}{V} = \\frac{${Q}}{${V}} = ${C}\\,\\mu F$.`,
        tags: ['capacitance', 'C=Q/V'],
      };
    }
    const [q, ex, c, w] = PLATE_CONCEPTS[Math.floor(v / 2) % PLATE_CONCEPTS.length];
    return { en: EN(q), ar: AR(q), correct: c, wrong: w, exEn: EN(ex), exAr: AR(ex), tags: ['parallel-plate', 'dielectric'] };
  },
  unit_phys_1_t2: (r, v) => {
    if (v % 2 === 0) {
      const [c1, c2] = r.pick([[3, 6], [4, 12], [6, 12], [2, 6], [10, 15], [6, 3]] as const);
      const ceq = (c1 * c2) / (c1 + c2);
      return {
        en: `Two capacitors $C_1 = ${c1}\\,\\mu F$ and $C_2 = ${c2}\\,\\mu F$ are connected in series. The equivalent capacitance is:`,
        ar: `ربطت المتسعتان $C_1 = ${c1}\\,\\mu F$ و $C_2 = ${c2}\\,\\mu F$ على التوالي. السعة المكافئة تساوي:`,
        correct: m(`${n(ceq)}\\,\\mu F`),
        wrong: [m(`${c1 + c2}\\,\\mu F`), m(`${n((c1 + c2) / 2 + 0.5)}\\,\\mu F`), m(`${c1 * c2}\\,\\mu F`)],
        exEn: `$\\frac{1}{C_{eq}} = \\frac{1}{${c1}} + \\frac{1}{${c2}} \\Rightarrow C_{eq} = \\frac{${c1} \\times ${c2}}{${c1} + ${c2}} = ${n(ceq)}\\,\\mu F$.`,
        exAr: `في التوالي: $C_{eq} = \\frac{C_1 C_2}{C_1 + C_2} = ${n(ceq)}\\,\\mu F$.`,
        tags: ['series', 'equivalent-capacitance'],
      };
    }
    const C = r.pick([2, 4, 6, 8, 10]);
    const V = r.pick([10, 20, 30]);
    return {
      en: `A $${C}\\,\\mu F$ capacitor is charged to $${V}\\,V$. The energy stored is:`,
      ar: `متسعة سعتها $${C}\\,\\mu F$ شحنت إلى فرق جهد $${V}\\,V$. الطاقة المختزنة فيها:`,
      correct: m(`${n(0.5 * C * V * V)}\\,\\mu J`),
      wrong: [m(`${C * V * V}\\,\\mu J`), m(`${n(0.5 * C * V)}\\,\\mu J`), m(`${C * V}\\,\\mu J`)],
      exEn: `$U = \\frac{1}{2}CV^2 = \\frac{1}{2}(${C})(${V})^2 = ${n(0.5 * C * V * V)}\\,\\mu J$.`,
      exAr: `$U = \\frac{1}{2}CV^2 = ${n(0.5 * C * V * V)}\\,\\mu J$.`,
      tags: ['energy', 'capacitor'],
    };
  },
  unit_phys_2_t1: (r, v) => {
    if (v % 2 === 0) {
      const B = r.pick([0.2, 0.4, 0.5, 0.8]);
      const A = r.pick([0.1, 0.2, 0.3, 0.5]);
      const phi = 0.5 * B * A;
      return {
        en: `A uniform field $B = ${B}\\,T$ makes an angle of $60^\\circ$ with the normal to a loop of area $${A}\\,m^2$. The magnetic flux is:`,
        ar: `مجال مغناطيسي منتظم $B = ${B}\\,T$ يصنع زاوية $60^\\circ$ مع العمود على حلقة مساحتها $${A}\\,m^2$. الفيض المغناطيسي يساوي:`,
        correct: m(`${n(phi)}\\,Wb`),
        wrong: [m(`${n(B * A)}\\,Wb`), m(`${n(2 * B * A)}\\,Wb`), m(`${n(B * A / 4)}\\,Wb`)],
        exEn: `$\\Phi = BA\\cos\\theta = ${B} \\times ${A} \\times \\cos 60^\\circ = ${n(phi)}\\,Wb$.`,
        exAr: `$\\Phi = BA\\cos\\theta = ${n(phi)}\\,Wb$.`,
        tags: ['magnetic-flux'],
      };
    }
    const N = r.pick([50, 100, 200]);
    const dphi = r.pick([0.02, 0.04, 0.05]);
    const dt = r.pick([0.1, 0.2, 0.5]);
    return {
      en: `A coil of $${N}$ turns experiences a flux change of $${dphi}\\,Wb$ in $${dt}\\,s$. The magnitude of the induced emf is:`,
      ar: `ملف عدد لفاته $${N}$ تغيّر الفيض خلاله بمقدار $${dphi}\\,Wb$ خلال $${dt}\\,s$. مقدار القوة الدافعة المحتثة:`,
      correct: m(`${n((N * dphi) / dt)}\\,V`),
      wrong: [m(`${n(dphi / dt)}\\,V`), m(`${n(N * dphi * dt)}\\,V`), m(`${n(N * dphi)}\\,V`)],
      exEn: `Faraday's law: $\\varepsilon = N\\frac{\\Delta\\Phi}{\\Delta t} = ${N} \\times \\frac{${dphi}}{${dt}} = ${n((N * dphi) / dt)}\\,V$.`,
      exAr: `حسب قانون فراداي: $\\varepsilon = N\\frac{\\Delta\\Phi}{\\Delta t} = ${n((N * dphi) / dt)}\\,V$.`,
      tags: ['faraday', 'induced-emf'],
    };
  },
  unit_phys_2_t2: (r, v) => {
    if (v % 2 === 0) {
      const B = r.pick([0.2, 0.5, 0.8]);
      const L = r.pick([0.2, 0.4, 0.5]);
      const vel = r.pick([2, 4, 5, 10]);
      return {
        en: `A rod of length $${L}\\,m$ moves at $${vel}\\,m/s$ perpendicular to a field of $${B}\\,T$. The motional emf is:`,
        ar: `ساق طولها $${L}\\,m$ تتحرك بسرعة $${vel}\\,m/s$ عمودياً على مجال مقداره $${B}\\,T$. القوة الدافعة الحركية تساوي:`,
        correct: m(`${n(B * L * vel)}\\,V`),
        wrong: [m(`${n((B * L) / vel)}\\,V`), m(`${n(B * L)}\\,V`), m(`${n(2 * B * L * vel)}\\,V`)],
        exEn: `$\\varepsilon = BLv = ${B} \\times ${L} \\times ${vel} = ${n(B * L * vel)}\\,V$.`,
        exAr: `$\\varepsilon = BLv = ${n(B * L * vel)}\\,V$.`,
        tags: ['motional-emf'],
      };
    }
    const L = r.pick([0.1, 0.2, 0.5]);
    const dI = r.pick([2, 4, 6]);
    const dt = r.pick([0.05, 0.1, 0.2]);
    return {
      en: `The current in a $${L}\\,H$ inductor changes by $${dI}\\,A$ in $${dt}\\,s$. The self-induced emf is:`,
      ar: `تغيّر التيار في ملف محاثته $${L}\\,H$ بمقدار $${dI}\\,A$ خلال $${dt}\\,s$. القوة الدافعة المحتثة الذاتية:`,
      correct: m(`${n((L * dI) / dt)}\\,V`),
      wrong: [m(`${n(L * dI * dt)}\\,V`), m(`${n(dI / dt)}\\,V`), m(`${n(L / dt)}\\,V`)],
      exEn: `$\\varepsilon = L\\frac{\\Delta I}{\\Delta t} = ${L} \\times \\frac{${dI}}{${dt}} = ${n((L * dI) / dt)}\\,V$.`,
      exAr: `$\\varepsilon = L\\frac{\\Delta I}{\\Delta t} = ${n((L * dI) / dt)}\\,V$.`,
      tags: ['self-inductance'],
    };
  },
  unit_phys_3_t1: (r, v) => {
    if (v % 2 === 0) {
      const V = r.pick([12, 50, 100, 110, 220, 240]);
      return {
        en: `An AC source has a peak voltage $V_{max} = ${V}\\sqrt{2}\\,V$. Its effective (rms) voltage is:`,
        ar: `مصدر تيار متناوب فولتيته العظمى $V_{max} = ${V}\\sqrt{2}\\,V$. الفولتية المؤثرة تساوي:`,
        correct: m(`${V}\\,V`),
        wrong: [m(`${V}\\sqrt{2}\\,V`), m(`${2 * V}\\,V`), m(`${n(V / 2)}\\,V`)],
        exEn: `$V_{rms} = \\frac{V_{max}}{\\sqrt{2}} = ${V}\\,V$.`,
        exAr: `$V_{rms} = \\frac{V_{max}}{\\sqrt{2}} = ${V}\\,V$.`,
        tags: ['rms', 'ac'],
      };
    }
    const a = r.pick([0.1, 0.2, 0.5, 1]);
    return {
      en: `An inductor of $L = \\frac{${a}}{\\pi}\\,H$ is connected to a $50\\,Hz$ source. Its inductive reactance is:`,
      ar: `ملف محاثته $L = \\frac{${a}}{\\pi}\\,H$ ربط بمصدر تردده $50\\,Hz$. رادة الحث تساوي:`,
      correct: m(`${n(100 * a)}\\,\\Omega`),
      wrong: [m(`${n(50 * a)}\\,\\Omega`), m(`${n(200 * a)}\\,\\Omega`), m(`${n(100 * a)}\\pi\\,\\Omega`)],
      exEn: `$X_L = 2\\pi f L = 2\\pi(50)\\frac{${a}}{\\pi} = ${n(100 * a)}\\,\\Omega$.`,
      exAr: `$X_L = 2\\pi f L = ${n(100 * a)}\\,\\Omega$.`,
      tags: ['reactance', 'inductor'],
    };
  },
  unit_phys_3_t2: (r, v) => {
    if (v % 2 === 0) {
      const s = r.pick([2, 4, 5, 10]);
      const R = 3 * s;
      const XC = r.int(1, 4) * s;
      const XL = XC + 4 * s;
      return {
        en: `A series RLC circuit has $R = ${R}\\,\\Omega$, $X_L = ${XL}\\,\\Omega$ and $X_C = ${XC}\\,\\Omega$. The impedance is:`,
        ar: `دائرة RLC على التوالي فيها $R = ${R}\\,\\Omega$ و $X_L = ${XL}\\,\\Omega$ و $X_C = ${XC}\\,\\Omega$. الممانعة تساوي:`,
        correct: m(`${5 * s}\\,\\Omega`),
        wrong: [m(`${R + XL + XC}\\,\\Omega`), m(`${R + XL - XC}\\,\\Omega`), m(`${n(Math.round(Math.sqrt(R * R + XL * XL)))}\\,\\Omega`)],
        exEn: `$Z = \\sqrt{R^2 + (X_L - X_C)^2} = \\sqrt{${R}^2 + ${4 * s}^2} = ${5 * s}\\,\\Omega$.`,
        exAr: `$Z = \\sqrt{R^2 + (X_L - X_C)^2} = ${5 * s}\\,\\Omega$.`,
        tags: ['impedance', 'rlc'],
      };
    }
    return RLC_CONCEPTS[Math.floor(v / 2) % RLC_CONCEPTS.length];
  },
};

// ─── Chemistry ───────────────────────────────────────────────────────────────
const LE_CHATELIER: Draft[] = [
  {
    en: 'For $N_2(g) + 3H_2(g) \\rightleftharpoons 2NH_3(g)$, $\\Delta H < 0$. Increasing the total pressure shifts the equilibrium:',
    ar: 'للتفاعل $N_2(g) + 3H_2(g) \\rightleftharpoons 2NH_3(g)$ حيث $\\Delta H < 0$. زيادة الضغط الكلي تزيح الاتزان:',
    correct: ['Towards the products ($NH_3$)', 'نحو النواتج ($NH_3$)'],
    wrong: [['Towards the reactants', 'نحو المتفاعلات'], ['It has no effect', 'لا يتأثر'], ['It stops the reaction', 'يتوقف التفاعل']],
    exEn: 'Higher pressure favours the side with fewer gas moles: 4 mol → 2 mol, so the forward reaction is favoured.',
    exAr: 'زيادة الضغط ترجّح الجهة ذات عدد المولات الغازية الأقل (2 مقابل 4) فينزاح الاتزان نحو تكوين الأمونيا.',
    tags: ['le-chatelier', 'pressure'],
  },
  {
    en: 'For the exothermic Haber process, raising the temperature:',
    ar: 'في عملية هابر الباعثة للحرارة، رفع درجة الحرارة:',
    correct: ['Shifts equilibrium left and decreases $K_c$', 'يزيح الاتزان نحو اليسار ويقلل $K_c$'],
    wrong: [['Shifts equilibrium right and increases $K_c$', 'يزيح الاتزان نحو اليمين ويزيد $K_c$'], ['Has no effect on $K_c$', 'لا يؤثر في $K_c$'], ['Increases the yield of $NH_3$', 'يزيد من ناتج $NH_3$']],
    exEn: 'For an exothermic reaction heat acts as a product; adding heat favours the reverse reaction and lowers $K_c$.',
    exAr: 'في التفاعل الباعث تُعامل الحرارة كناتج، فرفع درجة الحرارة يرجّح التفاعل العكسي ويقل $K_c$.',
    tags: ['le-chatelier', 'temperature'],
  },
  {
    en: 'Adding a catalyst to a system at equilibrium:',
    ar: 'إضافة عامل مساعد إلى نظام في حالة اتزان:',
    correct: ['Does not shift the equilibrium position', 'لا يغيّر موضع الاتزان'],
    wrong: [['Shifts it towards the products', 'يزيحه نحو النواتج'], ['Increases $K_c$', 'يزيد قيمة $K_c$'], ['Shifts it towards the reactants', 'يزيحه نحو المتفاعلات']],
    exEn: 'A catalyst speeds up the forward and reverse reactions equally; equilibrium is reached faster but its position is unchanged.',
    exAr: 'العامل المساعد يسرّع التفاعلين الأمامي والعكسي بالقدر نفسه، فيصل النظام للاتزان أسرع دون تغيير موضعه.',
    tags: ['catalyst', 'equilibrium'],
  },
  {
    en: 'For $H_2(g) + I_2(g) \\rightleftharpoons 2HI(g)$, decreasing the volume of the container:',
    ar: 'للتفاعل $H_2(g) + I_2(g) \\rightleftharpoons 2HI(g)$، تقليل حجم الإناء:',
    correct: ['Has no effect on the equilibrium position', 'لا يؤثر في موضع الاتزان'],
    wrong: [['Shifts it to the right', 'يزيحه نحو اليمين'], ['Shifts it to the left', 'يزيحه نحو اليسار'], ['Changes the value of $K_c$', 'يغيّر قيمة $K_c$']],
    exEn: 'Both sides contain 2 mol of gas ($\\Delta n_g = 0$), so pressure changes do not shift the equilibrium.',
    exAr: 'عدد المولات الغازية متساوٍ في الجهتين ($\\Delta n_g = 0$) لذا لا يؤثر الضغط في موضع الاتزان.',
    tags: ['le-chatelier', 'pressure'],
  },
  {
    en: 'Continuously removing $NH_3$ from the Haber process mixture:',
    ar: 'إزالة $NH_3$ باستمرار من خليط عملية هابر:',
    correct: ['Shifts the equilibrium to the right', 'يزيح الاتزان نحو اليمين'],
    wrong: [['Shifts the equilibrium to the left', 'يزيح الاتزان نحو اليسار'], ['Decreases $K_c$', 'يقلل $K_c$'], ['Has no effect', 'لا يؤثر']],
    exEn: 'Removing a product lowers its concentration; the system responds by producing more of it.',
    exAr: 'إزالة الناتج تقلل تركيزه، فيستجيب النظام بإنتاج المزيد منه فينزاح الاتزان نحو اليمين.',
    tags: ['le-chatelier', 'concentration'],
  },
  {
    en: 'Increasing the temperature of an endothermic reaction at equilibrium increases the value of $K_c$.',
    ar: 'رفع درجة حرارة تفاعل ماص للحرارة في حالة اتزان يزيد قيمة $K_c$.',
    correct: TRUE,
    wrong: [FALSE],
    type: 'true_false',
    exEn: 'For endothermic reactions heat acts as a reactant; raising $T$ favours the forward reaction and increases $K_c$.',
    exAr: 'في التفاعل الماص تُعامل الحرارة كمتفاعل، فرفع درجة الحرارة يرجّح التفاعل الأمامي ويزيد $K_c$.',
    tags: ['le-chatelier', 'temperature'],
  },
];

const ELECTRODES: [string, string, number][] = [
  ['Cu', 'Cu^{2+}', 0.34],
  ['Zn', 'Zn^{2+}', -0.76],
  ['Ag', 'Ag^{+}', 0.8],
  ['Fe', 'Fe^{2+}', -0.44],
  ['Ni', 'Ni^{2+}', -0.25],
  ['Mg', 'Mg^{2+}', -2.37],
  ['Pb', 'Pb^{2+}', -0.13],
];

const GALVANIC_CONCEPTS: Draft[] = [
  {
    en: 'In a galvanic cell, oxidation takes place at the:',
    ar: 'في الخلية الكلفانية يحدث التأكسد عند:',
    correct: ['Anode', 'المصعد (الأنود)'],
    wrong: [['Cathode', 'المهبط (الكاثود)'], ['Salt bridge', 'القنطرة الملحية'], ['External wire', 'السلك الخارجي']],
    exEn: 'Oxidation always occurs at the anode; in a galvanic cell the anode is the negative electrode.',
    exAr: 'يحدث التأكسد دائماً عند المصعد، وهو القطب السالب في الخلية الكلفانية.',
    tags: ['galvanic-cell', 'electrodes'],
  },
  {
    en: 'The main function of the salt bridge in a galvanic cell is to:',
    ar: 'الوظيفة الرئيسة للقنطرة الملحية في الخلية الكلفانية هي:',
    correct: ['Maintain electrical neutrality of the half-cells', 'الحفاظ على التعادل الكهربائي لنصفي الخلية'],
    wrong: [['Carry electrons between electrodes', 'نقل الإلكترونات بين القطبين'], ['Increase the cell voltage', 'زيادة جهد الخلية'], ['Act as a catalyst', 'العمل كعامل مساعد']],
    exEn: 'Ions migrate through the salt bridge to balance charge; electrons travel only through the external circuit.',
    exAr: 'تهاجر الأيونات عبر القنطرة لموازنة الشحنات، بينما تنتقل الإلكترونات عبر الدائرة الخارجية فقط.',
    tags: ['salt-bridge', 'galvanic-cell'],
  },
  {
    en: 'In the external circuit of a galvanic cell, electrons flow from:',
    ar: 'في الدائرة الخارجية للخلية الكلفانية تنتقل الإلكترونات من:',
    correct: ['Anode to cathode', 'المصعد إلى المهبط'],
    wrong: [['Cathode to anode', 'المهبط إلى المصعد'], ['Salt bridge to anode', 'القنطرة الملحية إلى المصعد'], ['They do not flow', 'لا تنتقل']],
    exEn: 'Electrons are released by oxidation at the anode and consumed by reduction at the cathode.',
    exAr: 'تتحرر الإلكترونات بالتأكسد عند المصعد وتُستهلك بالاختزال عند المهبط.',
    tags: ['galvanic-cell', 'electron-flow'],
  },
];

const SALTS: [string, Txt][] = [
  ['NH_4Cl', ['Acidic', 'حامضي']],
  ['CH_3COONa', ['Basic', 'قاعدي']],
  ['NaCl', ['Neutral', 'متعادل']],
  ['Na_2CO_3', ['Basic', 'قاعدي']],
  ['KNO_3', ['Neutral', 'متعادل']],
  ['(NH_4)_2SO_4', ['Acidic', 'حامضي']],
];
const SALT_OPTS: Txt[] = [['Acidic', 'حامضي'], ['Basic', 'قاعدي'], ['Neutral', 'متعادل'], ['Amphoteric', 'أمفوتيري']];

const CHEM: Record<string, Gen> = {
  unit_chem_1_t1: (r, v) => {
    if (v % 2 === 0) {
      const x = r.pick([0.04, 0.1, 0.2, 0.5]);
      const y = r.pick([0.2, 0.4, 0.1, 0.6]);
      const kc = (y * y) / x;
      return {
        en: `For $N_2O_4(g) \\rightleftharpoons 2NO_2(g)$ at equilibrium, $[N_2O_4] = ${x}\\,M$ and $[NO_2] = ${y}\\,M$. Calculate $K_c$.`,
        ar: `للتفاعل $N_2O_4(g) \\rightleftharpoons 2NO_2(g)$ عند الاتزان كان $[N_2O_4] = ${x}\\,M$ و $[NO_2] = ${y}\\,M$. احسب $K_c$.`,
        correct: m(n(kc)),
        wrong: [m(n(y / x)), m(n(x / (y * y))), m(n((2 * y) / x))],
        exEn: `$K_c = \\frac{[NO_2]^2}{[N_2O_4]} = \\frac{(${y})^2}{${x}} = ${n(kc)}$.`,
        exAr: `$K_c = \\frac{[NO_2]^2}{[N_2O_4]} = ${n(kc)}$.`,
        tags: ['equilibrium-constant', 'Kc'],
      };
    }
    const [eq, dn] = r.pick([
      ['N_2(g) + 3H_2(g) \\rightleftharpoons 2NH_3(g)', -2],
      ['2SO_2(g) + O_2(g) \\rightleftharpoons 2SO_3(g)', -1],
      ['PCl_5(g) \\rightleftharpoons PCl_3(g) + Cl_2(g)', 1],
      ['2NO_2(g) \\rightleftharpoons N_2O_4(g)', -1],
      ['CaCO_3(s) \\rightleftharpoons CaO(s) + CO_2(g)', 1],
      ['N_2O_4(g) \\rightleftharpoons 2NO_2(g)', 1],
    ] as const);
    const opts = [dn + 1, dn - 1, (dn as number) === 0 ? 2 : -dn].filter((o) => o !== dn);
    return {
      en: `In the relation $K_p = K_c(RT)^{\\Delta n_g}$, the value of $\\Delta n_g$ for $${eq}$ is:`,
      ar: `في العلاقة $K_p = K_c(RT)^{\\Delta n_g}$ قيمة $\\Delta n_g$ للتفاعل $${eq}$ هي:`,
      correct: m(dn),
      wrong: opts.map(m),
      exEn: '$\\Delta n_g$ = moles of gaseous products − moles of gaseous reactants (solids are ignored).',
      exAr: '$\\Delta n_g$ = مولات النواتج الغازية − مولات المتفاعلات الغازية (تُهمل المواد الصلبة).',
      tags: ['Kp', 'Kc'],
    };
  },
  unit_chem_1_t2: (_r, v) => LE_CHATELIER[v % LE_CHATELIER.length],
  unit_chem_2_t1: (r, v) => {
    const p = r.int(1, 4);
    const c = n(10 ** -p);
    if (v % 2 === 0) {
      return {
        en: `Calculate the pH of a $${c}\\,M$ $HCl$ solution.`,
        ar: `احسب قيمة pH لمحلول $HCl$ تركيزه $${c}\\,M$.`,
        correct: m(p),
        wrong: [m(14 - p), m(p + 1), m(p === 1 ? 0.1 : p - 1)],
        exEn: `$HCl$ is a strong acid: $[H^+] = ${c}$, so $pH = -\\log[H^+] = ${p}$.`,
        exAr: `$HCl$ حامض قوي يتأين تماماً: $pH = -\\log[H^+] = ${p}$.`,
        tags: ['pH', 'strong-acid'],
      };
    }
    return {
      en: `Calculate the pH of a $${c}\\,M$ $NaOH$ solution at $25^\\circ C$.`,
      ar: `احسب قيمة pH لمحلول $NaOH$ تركيزه $${c}\\,M$ عند $25^\\circ C$.`,
      correct: m(14 - p),
      wrong: [m(p), m(7), m(14 - p + 1)],
      exEn: `$pOH = -\\log[OH^-] = ${p}$, and $pH = 14 - pOH = ${14 - p}$.`,
      exAr: `$pOH = ${p}$ إذن $pH = 14 - pOH = ${14 - p}$.`,
      tags: ['pH', 'pOH', 'strong-base'],
    };
  },
  unit_chem_2_t2: (r, v) => {
    if (v % 2 === 0) {
      const [salt, ans] = SALTS[(v / 2 + r.int(0, 1) * 3) % SALTS.length];
      return {
        en: `An aqueous solution of the salt $${salt}$ is:`,
        ar: `المحلول المائي للملح $${salt}$ يكون:`,
        correct: ans,
        wrong: SALT_OPTS.filter((o) => EN(o) !== EN(ans)),
        exEn: 'Classify the salt by its parent acid and base: strong acid + weak base → acidic; weak acid + strong base → basic; strong + strong → neutral.',
        exAr: 'نصنّف الملح حسب الحامض والقاعدة المشتق منهما: حامض قوي + قاعدة ضعيفة ← حامضي، حامض ضعيف + قاعدة قوية ← قاعدي.',
        tags: ['hydrolysis', 'salts'],
      };
    }
    const [ratio, ph] = r.pick([[1, '4.74'], [10, '5.74'], [0.1, '3.74']] as const);
    return {
      en: `A buffer contains $CH_3COOH$ and $CH_3COONa$ with $\\frac{[salt]}{[acid]} = ${ratio}$. Given $pK_a = 4.74$, the pH is:`,
      ar: `محلول منظم يحتوي $CH_3COOH$ و $CH_3COONa$ بنسبة $\\frac{[salt]}{[acid]} = ${ratio}$. إذا كان $pK_a = 4.74$ فإن pH يساوي:`,
      correct: m(ph),
      wrong: ['4.74', '5.74', '3.74', '7.00'].filter((x) => x !== ph).map(m),
      exEn: `Henderson–Hasselbalch: $pH = pK_a + \\log\\frac{[salt]}{[acid]} = 4.74 + \\log ${ratio} = ${ph}$.`,
      exAr: `معادلة هندرسون: $pH = pK_a + \\log\\frac{[salt]}{[acid]} = ${ph}$.`,
      tags: ['buffer', 'henderson-hasselbalch'],
    };
  },
  unit_chem_3_t1: (r, v) => {
    if (v % 2 === 0) {
      const pair = r.shuffle(ELECTRODES).slice(0, 2).sort((a, b) => b[2] - a[2]);
      const [cat, an] = pair;
      const e = cat[2] - an[2];
      const sign = (x: number) => (x > 0 ? `+${x.toFixed(2)}` : x.toFixed(2));
      return {
        en: `Calculate $E^\\circ_{cell}$ for a galvanic cell made of $${an[0]}|${an[1]}$ and $${cat[0]}|${cat[1]}$, given $E^\\circ_{${an[1]}/${an[0]}} = ${sign(an[2])}\\,V$ and $E^\\circ_{${cat[1]}/${cat[0]}} = ${sign(cat[2])}\\,V$.`,
        ar: `احسب $E^\\circ_{cell}$ لخلية كلفانية مكوّنة من $${an[0]}|${an[1]}$ و $${cat[0]}|${cat[1]}$ علماً أن $E^\\circ_{${an[1]}/${an[0]}} = ${sign(an[2])}\\,V$ و $E^\\circ_{${cat[1]}/${cat[0]}} = ${sign(cat[2])}\\,V$.`,
        correct: m(`${sign(+e.toFixed(2))}\\,V`),
        wrong: [m(`${sign(+(-e).toFixed(2))}\\,V`), m(`${sign(+(cat[2] + an[2]).toFixed(2) || 0.01)}\\,V`), m(`${sign(+(e + 0.5).toFixed(2))}\\,V`)],
        exEn: `$E^\\circ_{cell} = E^\\circ_{cathode} - E^\\circ_{anode} = ${sign(cat[2])} - (${sign(an[2])}) = ${sign(+e.toFixed(2))}\\,V$.`,
        exAr: `$E^\\circ_{cell} = E^\\circ_{cathode} - E^\\circ_{anode} = ${sign(+e.toFixed(2))}\\,V$.`,
        tags: ['cell-potential', 'galvanic-cell'],
        image: v === 0 ? IMAGES.chemistryLab : null,
      };
    }
    return GALVANIC_CONCEPTS[Math.floor(v / 2) % GALVANIC_CONCEPTS.length];
  },
  unit_chem_3_t2: (r, v) => {
    if (v % 2 === 0) {
      const [Q, I] = r.pick([[1930, 2], [3860, 2], [9650, 5], [19300, 10], [9650, 10], [3860, 4]] as const);
      const t = Q / I;
      const mass = (Q / 96500 / 2) * 63.5;
      return {
        en: `A current of $${I}\\,A$ passes through $CuSO_4$ solution for $${t}\\,s$. The mass of copper deposited is ($M_{Cu} = 63.5\\,g/mol$, $F = 96500\\,C$):`,
        ar: `مرّ تيار شدته $${I}\\,A$ في محلول $CuSO_4$ لمدة $${t}\\,s$. كتلة النحاس المترسبة ($M_{Cu} = 63.5\\,g/mol$ و $F = 96500\\,C$):`,
        correct: m(`${n(mass)}\\,g`),
        wrong: [m(`${n(mass * 2)}\\,g`), m(`${n(mass / 2)}\\,g`), m(`${n(mass * 3)}\\,g`)],
        exEn: `$Q = It = ${Q}\\,C$; moles of $e^- = \\frac{${Q}}{96500} = ${n(Q / 96500)}$; $Cu^{2+}$ needs 2 e⁻, so $m = \\frac{${n(Q / 96500)}}{2} \\times 63.5 = ${n(mass)}\\,g$.`,
        exAr: `$Q = It = ${Q}\\,C$ وعدد مولات الإلكترونات $${n(Q / 96500)}$، والنحاس ثنائي التكافؤ فتكون الكتلة $${n(mass)}\\,g$.`,
        tags: ['faraday-law', 'electrolysis'],
      };
    }
    const [ion, metal, z] = r.pick([['Al^{3+}', 'Al', 3], ['Cu^{2+}', 'Cu', 2], ['Ag^{+}', 'Ag', 1], ['Mg^{2+}', 'Mg', 2], ['Na^{+}', 'Na', 1], ['Fe^{3+}', 'Fe', 3]] as const);
    return {
      en: `The number of faradays required to deposit 1 mol of $${metal}$ from $${ion}$ ions is:`,
      ar: `عدد الفارادايات اللازمة لترسيب 1 mol من $${metal}$ من أيونات $${ion}$ هو:`,
      correct: m(`${z}\\,F`),
      wrong: [1, 2, 3, 4, 6].filter((x) => x !== z).slice(0, 3).map((x) => m(`${x}\\,F`)),
      exEn: `Each $${ion}$ gains ${z} electron(s), so 1 mol of metal needs ${z} mol of electrons = ${z} F.`,
      exAr: `كل أيون $${ion}$ يكتسب ${z} إلكترون، لذا يلزم ${z} فاراداي لترسيب مول واحد.`,
      tags: ['faraday-law', 'electrolysis'],
    };
  },
};

// ─── Biology & English (hand-written) ────────────────────────────────────────
type Hand = [en: string, ar: string, correct: Txt, wrong: Txt[], exEn: string, exAr: string, tags: string[], type?: QuestionType];

const HAND: Record<string, Hand[]> = {
  unit_bio_1_t1: [
    ['Where are sperm cells produced?', 'أين تُنتج النطف (الحيامن)؟', ['Seminiferous tubules', 'الأنابيب المنوية'], [['Epididymis', 'البربخ'], ['Vas deferens', 'الوعاء الناقل'], ['Prostate gland', 'غدة البروستات']], 'Spermatogenesis takes place in the seminiferous tubules of the testes; sperm mature in the epididymis.', 'تحدث عملية تكوين النطف في الأنابيب المنوية داخل الخصيتين، وتنضج في البربخ.', ['male-system', 'spermatogenesis']],
    ['Which cells secrete testosterone?', 'أي الخلايا تفرز هرمون التستوستيرون؟', ['Leydig (interstitial) cells', 'الخلايا البينية (خلايا لايدك)'], [['Sertoli cells', 'خلايا سرتولي'], ['Spermatogonia', 'أمهات المني'], ['Follicle cells', 'الخلايا الجريبية']], 'Interstitial (Leydig) cells between the tubules secrete testosterone under LH stimulation.', 'تفرز الخلايا البينية الواقعة بين الأنابيب المنوية التستوستيرون بتحفيز من هرمون LH.', ['hormones', 'male-system']],
    ['Fertilization in humans normally takes place in the:', 'يحدث الإخصاب في الإنسان عادةً في:', ['Fallopian tube (oviduct)', 'قناة البيض'], [['Uterus', 'الرحم'], ['Ovary', 'المبيض'], ['Cervix', 'عنق الرحم']], 'The ovum is fertilized in the upper third of the fallopian tube before moving to the uterus.', 'تُخصّب البيضة في الثلث العلوي من قناة البيض ثم تنتقل إلى الرحم.', ['female-system', 'fertilization']],
    ['Which hormone stimulates the growth of ovarian follicles?', 'أي هرمون يحفّز نمو الجريبات في المبيض؟', 'FSH', ['LH', ['Progesterone', 'البروجسترون'], ['Oxytocin', 'الأوكسيتوسين']], 'Follicle-stimulating hormone (FSH) from the anterior pituitary drives follicle development.', 'الهرمون المحفّز للجريب FSH الذي تفرزه الغدة النخامية الأمامية ينمّي الجريبات.', ['hormones', 'female-system']],
  ],
  unit_bio_1_t2: [
    ['The diploid cell formed immediately after fertilization is called the:', 'الخلية ثنائية المجموعة الكروموسومية الناتجة مباشرة بعد الإخصاب تسمى:', ['Zygote', 'البيضة المخصبة (اللاقحة)'], [['Morula', 'التوتية'], ['Blastocyst', 'الكيسة الأريمية'], ['Gastrula', 'المعيدة']], 'Fusion of sperm and ovum produces the zygote (2n), which then cleaves into the morula.', 'اتحاد النطفة والبيضة يكوّن اللاقحة (2n) التي تنقسم لاحقاً لتكوين التوتية.', ['fertilization', 'development']],
    ['Ovulation is triggered by a surge in which hormone?', 'يُحفَّز التبويض بارتفاع مفاجئ في أي هرمون؟', 'LH', ['FSH', ['Progesterone', 'البروجسترون'], ['Prolactin', 'البرولاكتين']], 'A mid-cycle LH surge causes the mature Graafian follicle to rupture and release the ovum.', 'الارتفاع المفاجئ في هرمون LH منتصف الدورة يؤدي إلى تمزق جريب كراف وتحرير البيضة.', ['menstrual-cycle', 'hormones']],
    ['The corpus luteum secretes progesterone, which maintains the uterine lining.', 'يفرز الجسم الأصفر هرمون البروجسترون الذي يحافظ على بطانة الرحم.', TRUE, [FALSE], 'After ovulation the corpus luteum secretes progesterone to keep the endometrium ready for implantation.', 'بعد التبويض يفرز الجسم الأصفر البروجسترون ليحافظ على بطانة الرحم مهيأة للانغراس.', ['menstrual-cycle', 'hormones'], 'true_false'],
  ],
  unit_bio_2_t1: [
    ['In pea plants, tall (T) is dominant over short (t). The phenotypic ratio from $Tt \\times Tt$ is:', 'في نبات البازلاء صفة الطول (T) سائدة على القصر (t). النسبة المظهرية لنواتج التضريب $Tt \\times Tt$ هي:', '3 : 1', ['1 : 2 : 1', '1 : 1', '9 : 3 : 3 : 1'], 'Genotypes TT : Tt : tt = 1 : 2 : 1, giving 3 tall : 1 short.', 'النسب الجينية 1 : 2 : 1 فتكون النسبة المظهرية 3 طويل : 1 قصير.', ['monohybrid', 'mendel']],
    ['The phenotypic ratio of a dihybrid cross $AaBb \\times AaBb$ is:', 'النسبة المظهرية للتضريب الثنائي $AaBb \\times AaBb$ هي:', '9 : 3 : 3 : 1', ['3 : 1', '1 : 1 : 1 : 1', '1 : 2 : 1'], 'Independent assortment of two genes gives 16 combinations in a 9 : 3 : 3 : 1 ratio.', 'التوزيع الحر لجينين يعطي 16 تركيباً بنسبة 9 : 3 : 3 : 1.', ['dihybrid', 'mendel']],
    ['A test cross is made between an individual of unknown genotype and one that is:', 'التضريب الاختباري يكون بين فرد مجهول التركيب الجيني وفرد:', ['Homozygous recessive', 'متماثل الجينات متنحٍ'], [['Homozygous dominant', 'متماثل الجينات سائد'], ['Heterozygous', 'متباين الجينات'], ['An F1 hybrid', 'هجين من الجيل الأول']], 'Only a homozygous recessive parent reveals the unknown alleles directly in the offspring phenotypes.', 'الأب المتنحي المتماثل وحده يكشف أليلات الفرد المجهول من خلال مظاهر الأبناء.', ['test-cross', 'mendel']],
    ['What is the probability of obtaining $aa$ offspring from $Aa \\times Aa$?', 'ما احتمال ظهور أبناء بتركيب $aa$ من التضريب $Aa \\times Aa$؟', '$\\frac{1}{4}$', ['$\\frac{1}{2}$', '$\\frac{3}{4}$', '$0$'], 'Each parent passes $a$ with probability $\\frac{1}{2}$: $\\frac{1}{2} \\times \\frac{1}{2} = \\frac{1}{4}$.', 'احتمال انتقال $a$ من كل أب هو $\\frac{1}{2}$ فيكون الاحتمال $\\frac{1}{4}$.', ['probability', 'mendel']],
  ],
  unit_bio_2_t2: [
    ['Crossing red and white snapdragons produces pink flowers. This is an example of:', 'تضريب نبات حنك السبع الأحمر مع الأبيض أعطى أزهاراً وردية. هذا مثال على:', ['Incomplete dominance', 'السيادة غير التامة'], [['Codominance', 'السيادة المشتركة'], ['Complete dominance', 'السيادة التامة'], ['Multiple alleles', 'الأليلات المتعددة']], 'Neither allele is fully dominant, so heterozygotes show an intermediate phenotype.', 'لا يسود أي أليل سيادة تامة فيظهر الفرد الهجين بصفة وسطية.', ['incomplete-dominance']],
    ['The AB blood group is an example of:', 'فصيلة الدم AB مثال على:', ['Codominance', 'السيادة المشتركة'], [['Incomplete dominance', 'السيادة غير التامة'], ['Recessive inheritance', 'الوراثة المتنحية'], ['Sex-linked inheritance', 'الوراثة المرتبطة بالجنس']], 'Both $I^A$ and $I^B$ are fully expressed together on red blood cells.', 'يظهر الأليلان $I^A$ و $I^B$ معاً بشكل كامل على كريات الدم الحمراء.', ['codominance', 'blood-groups']],
    ['A colour-blind father and a carrier mother have a son. The probability that he is colour-blind is:', 'أب مصاب بعمى الألوان وأم حاملة للصفة أنجبا ولداً. احتمال إصابته بعمى الألوان:', '$\\frac{1}{2}$', ['$\\frac{1}{4}$', '$0$', '$1$'], 'Sons receive their X from the mother; a carrier mother ($X^CX^c$) passes $X^c$ half the time.', 'يرث الذكر الكروموسوم X من الأم، والأم الحاملة تنقل $X^c$ باحتمال النصف.', ['sex-linked', 'probability']],
  ],
  unit_bio_3_t1: [
    ['In a DNA molecule, adenine always pairs with:', 'في جزيئة الدنا تقترن القاعدة الأدينين دائماً مع:', ['Thymine', 'الثايمين'], [['Uracil', 'اليوراسيل'], ['Guanine', 'الكوانين'], ['Cytosine', 'السايتوسين']], 'A pairs with T by two hydrogen bonds; G pairs with C by three.', 'يقترن A مع T بآصرتين هيدروجينيتين، و G مع C بثلاث أواصر.', ['dna', 'base-pairing']],
    ['DNA replication is described as:', 'يوصف تضاعف الدنا بأنه:', ['Semi-conservative', 'شبه محافظ'], [['Conservative', 'محافظ'], ['Dispersive', 'مبعثر'], ['Random', 'عشوائي']], 'Each new DNA molecule contains one original strand and one newly synthesized strand (Meselson–Stahl).', 'كل جزيئة دنا جديدة تحتوي سلسلة أصلية وأخرى جديدة (تجربة ميسلسون وستال).', ['replication']],
    ['The enzyme that synthesizes mRNA during transcription is:', 'الإنزيم الذي يبني mRNA أثناء الاستنساخ هو:', ['RNA polymerase', 'إنزيم بلمرة RNA'], [['DNA polymerase', 'إنزيم بلمرة DNA'], ['DNA ligase', 'إنزيم الربط'], ['Helicase', 'الهيليكيز']], 'RNA polymerase reads the template strand 3′→5′ and builds mRNA 5′→3′.', 'يقرأ إنزيم بلمرة RNA السلسلة القالب ويبني mRNA بالاتجاه 5′←3′.', ['transcription', 'enzymes']],
    ["The mRNA codon transcribed from the DNA template 3′-TAC-5′ is:", "الشفرة على mRNA المستنسخة من القالب 3′-TAC-5′ هي:", "5′-AUG-3′", ["5′-ATG-3′", "5′-UAC-3′", "5′-TAC-3′"], 'Complementary pairing with U replacing T: TAC → AUG (the start codon).', 'بالاقتران التكميلي مع استبدال T بـ U نحصل على AUG وهي شفرة البدء.', ['transcription', 'codons']],
  ],
  unit_bio_3_t2: [
    ['Translation (protein synthesis) takes place on the:', 'تحدث عملية الترجمة (بناء البروتين) على:', ['Ribosomes', 'الرايبوسومات'], [['Nucleus', 'النواة'], ['Golgi apparatus', 'جهاز كولجي'], ['Lysosomes', 'الأجسام الحالة']], 'mRNA leaves the nucleus and is read by ribosomes in the cytoplasm.', 'يغادر mRNA النواة ويُقرأ بواسطة الرايبوسومات في السايتوبلازم.', ['translation']],
    ['The universal start codon is:', 'شفرة البدء العامة هي:', 'AUG', ['UAA', 'UGA', 'GUA'], 'AUG codes for methionine and signals the start of translation; UAA and UGA are stop codons.', 'الشفرة AUG تشفّر للمثيونين وتعلن بدء الترجمة، أما UAA و UGA فهي شفرات توقف.', ['codons', 'translation']],
    ['A point mutation that changes a codon into a stop codon is called a:', 'الطفرة النقطية التي تحوّل شفرة إلى شفرة توقف تسمى طفرة:', ['Nonsense mutation', 'عديمة المعنى'], [['Missense mutation', 'خاطئة المعنى'], ['Silent mutation', 'صامتة'], ['Frameshift mutation', 'إزاحة الإطار']], 'A premature stop codon truncates the protein — a nonsense mutation.', 'ظهور شفرة توقف مبكرة يؤدي إلى بروتين مبتور، وهذه طفرة عديمة المعنى.', ['mutations']],
  ],
  unit_eng_1_t1: [
    ['Rising sea levels pose a serious ______ to coastal cities.', 'اختر الكلمة المناسبة: Rising sea levels pose a serious ______ to coastal cities.', 'threat', ['treat', 'threaten', 'thread'], 'A noun is needed after "a serious": "threat" (danger). "Threaten" is a verb.', 'نحتاج اسماً بعد "a serious" وهو threat بمعنى تهديد، أما threaten فهي فعل.', ['vocabulary', 'climate']],
    ['The word "sustainable" in the passage means:', 'معنى كلمة "sustainable" في النص:', 'able to continue without harming the environment', ['very expensive to maintain', 'lasting only a short time', 'harmful to nature'], 'Sustainable practices can continue long-term without damaging natural resources.', 'الممارسات المستدامة هي التي تستمر دون الإضرار بالموارد الطبيعية.', ['vocabulary', 'reading']],
    ['"Deforestation" refers to:', 'كلمة "Deforestation" تعني:', 'cutting down large areas of forest', ['planting new trees', 'flooding farmland', 'building dams on rivers'], 'The prefix "de-" means removal: deforestation is the removal of forests.', 'البادئة de- تعني الإزالة، فالكلمة تعني إزالة الغابات.', ['vocabulary', 'prefixes']],
    ['Complete the sentence: Greenhouse gases ______ heat in the atmosphere.', 'أكمل الجملة: Greenhouse gases ______ heat in the atmosphere.', 'trap', [], 'Greenhouse gases "trap" heat, warming the planet.', 'غازات الاحتباس الحراري تحبس (trap) الحرارة في الغلاف الجوي.', ['vocabulary', 'climate'], 'fill_blank'],
  ],
  unit_eng_1_t2: [
    ['By the time we arrived at the cinema, the film ______.', 'اختر الإجابة الصحيحة: By the time we arrived at the cinema, the film ______.', 'had started', ['has started', 'starts', 'was starting'], 'The earlier of two past actions takes the past perfect: had + past participle.', 'الحدث الأسبق من حدثين في الماضي يأتي بزمن الماضي التام (had + التصريف الثالث).', ['past-perfect', 'grammar']],
    ['She said, "I am tired." → She said that she ______ tired.', 'حوّل إلى الكلام المنقول: She said, "I am tired." → She said that she ______ tired.', 'was', ['is', 'has been', 'will be'], 'In reported speech the present simple "am" moves back to the past simple "was".', 'في الكلام المنقول يتحول المضارع البسيط am إلى الماضي البسيط was.', ['reported-speech', 'grammar']],
    ['He asked me where I ______.', 'اختر الإجابة الصحيحة: He asked me where I ______.', 'lived', ['do live', 'live', 'am living'], 'Reported questions use statement word order and back-shifted tense: "where I lived".', 'السؤال المنقول يأخذ ترتيب الجملة الخبرية مع إرجاع الزمن: where I lived.', ['reported-speech', 'questions']],
  ],
  unit_eng_2_t1: [
    ['After months of research, the scientists finally came ______ a solution.', 'اختر الإجابة الصحيحة: After months of research, the scientists finally came ______ a solution.', 'up with', ['across', 'down with', 'out of'], '"Come up with" means to think of or produce an idea or solution.', 'الفعل المركب come up with يعني ابتكار فكرة أو حل.', ['phrasal-verbs']],
    ['The meeting has been put ______ until next week.', 'اختر الإجابة الصحيحة: The meeting has been put ______ until next week.', 'off', ['on', 'up', 'out'], '"Put off" means to postpone.', 'الفعل put off يعني يؤجّل.', ['phrasal-verbs']],
    ['According to the passage, who invented the telephone?', 'حسب النص، من اخترع الهاتف؟', 'Alexander Graham Bell', ['Thomas Edison', 'Nikola Tesla', 'James Watt'], 'The passage credits Bell with the first practical telephone patent in 1876.', 'ينسب النص اختراع الهاتف إلى ألكسندر غراهام بيل عام 1876.', ['reading', 'inventions']],
    ['Complete: If you do not know a word, look it ______ in the dictionary.', 'أكمل: If you do not know a word, look it ______ in the dictionary.', 'up', [], '"Look up" means to search for information in a reference book.', 'الفعل look up يعني البحث عن معلومة في مرجع.', ['phrasal-verbs'], 'fill_blank'],
  ],
  unit_eng_2_t2: [
    ['Choose the passive form of: "They built this bridge in 1990."', 'اختر صيغة المبني للمجهول: "They built this bridge in 1990."', 'This bridge was built in 1990.', ['This bridge built in 1990.', 'This bridge has been built in 1990.', 'This bridge is built in 1990.'], 'Past simple passive: was/were + past participle.', 'المبني للمجهول في الماضي البسيط: was/were + التصريف الثالث.', ['passive-voice']],
    ['If I ______ rich, I would travel around the world.', 'اختر الإجابة الصحيحة: If I ______ rich, I would travel around the world.', 'were', ['am', 'will be', 'had been'], 'Second conditional (unreal present): If + past simple ("were" for all persons), would + verb.', 'الشرطية الثانية: If + ماضٍ بسيط (were مع جميع الضمائر) ثم would + الفعل.', ['conditionals']],
    ['If she had studied harder, she ______ the exam.', 'اختر الإجابة الصحيحة: If she had studied harder, she ______ the exam.', 'would have passed', ['would pass', 'will pass', 'passed'], 'Third conditional (unreal past): If + past perfect, would have + past participle.', 'الشرطية الثالثة: If + ماضٍ تام ثم would have + التصريف الثالث.', ['conditionals']],
  ],
  unit_eng_3_t1: [
    ['Which closing is correct in a formal letter when you know the recipient\'s name?', 'أي خاتمة صحيحة في الرسالة الرسمية عندما تعرف اسم المرسل إليه؟', 'Yours sincerely', ['Yours faithfully', 'Cheers', 'Love'], '"Yours sincerely" pairs with "Dear Mr/Ms + name"; "Yours faithfully" pairs with "Dear Sir or Madam".', 'تُستخدم Yours sincerely مع ذكر الاسم، و Yours faithfully عند عدم معرفته.', ['formal-letter', 'writing']],
    ['The topic sentence of a paragraph usually:', 'الجملة الرئيسة في الفقرة عادةً:', 'states the main idea', ['gives a supporting detail', 'concludes the essay', 'lists the references'], 'The topic sentence introduces the main idea; the following sentences support it.', 'تقدّم الجملة الرئيسة الفكرة العامة، وتأتي بعدها الجمل الداعمة.', ['paragraph', 'writing']],
    ['How should you open a formal letter when you do not know the recipient\'s name?', 'كيف تبدأ رسالة رسمية عندما لا تعرف اسم المرسل إليه؟', 'Dear Sir or Madam,', ['Hi there,', 'Dear friend,', 'Hello,'], 'Use the neutral formal greeting "Dear Sir or Madam".', 'نستخدم التحية الرسمية المحايدة Dear Sir or Madam.', ['formal-letter', 'writing']],
    ['Which linking word introduces a contrasting idea?', 'أي أداة ربط تُستخدم لتقديم فكرة معاكسة؟', 'However', ['Moreover', 'Therefore', 'Furthermore'], '"However" shows contrast; "moreover/furthermore" add information; "therefore" shows result.', 'However تفيد التضاد، بينما Moreover و Furthermore للإضافة و Therefore للنتيجة.', ['linking-words', 'writing']],
  ],
  unit_eng_3_t2: [
    ['The turning point of a short story, where tension is highest, is called the:', 'نقطة التحول في القصة القصيرة حيث يبلغ التوتر ذروته تسمى:', 'climax', ['exposition', 'resolution', 'setting'], 'The climax is the moment of greatest tension before the resolution.', 'الذروة هي لحظة التوتر الأعلى قبل الحل.', ['literature', 'plot']],
    ['Skimming a text means reading it quickly to:', 'القراءة السريعة (Skimming) تعني قراءة النص بسرعة من أجل:', 'get the general idea', ['find a specific detail', 'memorize it', 'translate every word'], 'Skimming gives the gist; scanning locates specific information.', 'القراءة السريعة لأخذ الفكرة العامة، أما المسح (scanning) فللبحث عن معلومة محددة.', ['exam-skills', 'reading']],
    ['Scanning is reading quickly to find specific information such as names or dates.', 'المسح (Scanning) هو القراءة السريعة للعثور على معلومة محددة كالأسماء أو التواريخ.', TRUE, [FALSE], 'Correct — scanning targets specific facts, unlike skimming.', 'صحيح، المسح يستهدف معلومات محددة بخلاف القراءة السريعة.', ['exam-skills', 'reading'], 'true_false'],
  ],
};

// ─── Assembly ────────────────────────────────────────────────────────────────
const GENERATORS: Record<string, Gen> = { ...MATH, ...PHYS, ...CHEM };
const SUBJ_CODE: Record<string, string> = { sub_math: 'MATH', sub_phys: 'PHYS', sub_chem: 'CHEM', sub_bio: 'BIO', sub_eng: 'ENG' };
/** Topics whose 6th generated item is a near-duplicate of the 2nd (flagged in the bank). */
const DUPLICATE_TOPICS = new Set(['unit_math_1_t1', 'unit_phys_1_t1', 'unit_chem_2_t1', 'unit_math_3_t1']);
const AUTHORS = ['adm_4', 'adm_6', 'adm_3'];

const unitAbbr = (name: string) => {
  const words = name.split(/\s+/).filter((w) => !['&', 'and', 'of'].includes(w.toLowerCase()));
  return words.length === 1 ? words[0].slice(0, 2).toUpperCase() : words.map((w) => w[0]).join('').toUpperCase();
};

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 17);

const rng = createRng(31337);

function toOptions(qid: string, d: Draft, r: Rng): QuestionOption[] {
  const type = d.type ?? 'mcq';
  const correct: QuestionOption = { id: `${qid}_c`, text_en: EN(d.correct), text_ar: AR(d.correct), correct: true };
  if (type === 'fill_blank') return [correct];
  const seen = new Set([EN(d.correct)]);
  const wrong = d.wrong
    .filter((w) => !seen.has(EN(w)) && seen.add(EN(w)))
    .map((w, i) => ({ id: `${qid}_w${i}`, text_en: EN(w), text_ar: AR(w), correct: false }));
  if (type === 'true_false') {
    // Keep True first for readability.
    return [correct, ...wrong].sort((a) => (a.text_en === 'True' ? -1 : 1));
  }
  return r.shuffle([correct, ...wrong.slice(0, 3)]);
}

function buildQuestions(): Question[] {
  const out: Question[] = [];
  for (const topic of topics) {
    const unit = units.find((u) => u.id === topic.unitId)!;
    const subjectId = unit.subjectId;
    const gen = GENERATORS[topic.id] as Gen | undefined;
    const hand = HAND[topic.id] as Hand[] | undefined;
    const count = gen ? 6 : (hand?.length ?? 0);
    const firstIdx: number[] = [];

    for (let k = 0; k < count; k++) {
      const seq = out.length + 1;
      const id = `q_${String(seq).padStart(4, '0')}`;
      const isDup = !!gen && DUPLICATE_TOPICS.has(topic.id) && k === 5;
      const v = isDup ? 1 : k;
      let d: Draft;
      if (gen) {
        d = gen(createRng(hash(topic.id) + v * 7919), v);
      } else {
        const [en, ar, correct, wrong, exEn, exAr, tags, type] = hand![k];
        d = { en, ar, correct, wrong, exEn, exAr, tags, type };
      }
      if (isDup) {
        d = { ...d, en: `Choose the correct answer: ${d.en.charAt(0).toLowerCase()}${d.en.slice(1)}`, ar: `اختر الإجابة الصحيحة: ${d.ar}` };
      }
      firstIdx.push(out.length);

      const difficulty: Difficulty = d.difficulty ?? (gen ? (k < 2 ? 'easy' : k < 4 ? 'medium' : 'hard') : (['easy', 'medium', 'hard', 'medium'] as Difficulty[])[k % 4]);
      const status: QuestionStatus = isDup
        ? 'in_review'
        : rng.weighted<QuestionStatus>([['published', 55], ['approved', 12], ['in_review', 13], ['draft', 13], ['archived', 7]]);
      const ministerial = rng.bool(0.42);
      const year = ministerial ? rng.int(2019, 2025) : null;
      const authorId = rng.pick(AUTHORS);
      const reviewed = status === 'approved' || status === 'published' || status === 'archived';
      const accBase = difficulty === 'easy' ? [70, 92] : difficulty === 'medium' ? [50, 75] : [30, 56];
      const created = rng.int(25, 320);
      out.push({
        id,
        code: `${SUBJ_CODE[subjectId]}-${unitAbbr(unit.name_en)}-${String(seq).padStart(4, '0')}`,
        subjectId,
        unitId: unit.id,
        topicId: topic.id,
        type: d.type ?? 'mcq',
        difficulty,
        body_en: d.en,
        body_ar: d.ar,
        image: d.image ?? null,
        options: toOptions(id, d, rng),
        explanation_en: d.exEn,
        explanation_ar: d.exAr,
        tags: ministerial ? [...d.tags, 'ministerial'] : d.tags,
        source: ministerial ? 'Ministerial Exam' : rng.pick(['EDUWAY Original', 'EDUWAY Original', 'Teacher Submission']),
        year,
        status,
        authorId,
        reviewerId: reviewed ? 'adm_3' : null,
        usageCount: status === 'published' || status === 'archived' ? rng.int(60, 2400) : status === 'approved' ? rng.int(0, 40) : 0,
        accuracy: status === 'published' || status === 'archived' ? rng.float(accBase[0], accBase[1], 1) : 0,
        duplicateOf: isDup ? out[firstIdx[1]].id : null,
        reviewComment:
          status === 'draft' && rng.bool(0.35)
            ? rng.pick([
                'Option C is ambiguous — please rephrase the distractor.',
                'Arabic wording does not match the English stem.',
                'Explanation skips a step; add the intermediate calculation.',
              ])
            : null,
        createdAt: daysAgo(created, rng.int(0, 20)),
        updatedAt: daysAgo(Math.max(0, created - rng.int(5, 120)) % 30, rng.int(0, 20)),
      });
    }
  }
  return out;
}

export const questions: Question[] = buildQuestions();

export const QUESTION_SOURCES = ['Ministerial Exam', 'EDUWAY Original', 'Teacher Submission', 'Textbook Exercise'] as const;
