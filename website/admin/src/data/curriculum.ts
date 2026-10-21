import type { ContentStatus, Lesson, LessonVersion, Teacher, Topic, Unit, VideoState } from '@/types';
import { AVATARS, THUMBS } from '@/utils/images';
import { createRng, daysAgo, daysAhead } from '@/utils/random';

/* Iraqi Ministry of Education — 6th Scientific Grade (السادس العلمي) curriculum excerpt.
   Each subject → 3 units → 2 topics → 2 lessons = 60 lessons. */

type L = [en: string, ar: string];
type T = { en: string; ar: string; lessons: [L, L] };
type U = { en: string; ar: string; topics: [T, T] };

const CURRICULUM: Record<string, U[]> = {
  sub_math: [
    {
      en: 'Complex Numbers',
      ar: 'الأعداد المركبة',
      topics: [
        {
          en: 'Operations on Complex Numbers',
          ar: 'العمليات على الأعداد المركبة',
          lessons: [
            ['Introduction to Complex Numbers and i', 'مقدمة في الأعداد المركبة والعدد i'],
            ['Conjugates and Division', 'المرافق وقسمة الأعداد المركبة'],
          ],
        },
        {
          en: "Polar Form & De Moivre's Theorem",
          ar: 'الصيغة القطبية ومبرهنة ديموافر',
          lessons: [
            ['Polar Form of a Complex Number', 'الصيغة القطبية للعدد المركب'],
            ["De Moivre's Theorem and Roots", 'مبرهنة ديموافر والجذور'],
          ],
        },
      ],
    },
    {
      en: 'Conic Sections',
      ar: 'القطوع المخروطية',
      topics: [
        {
          en: 'The Parabola',
          ar: 'القطع المكافئ',
          lessons: [
            ['The Parabola: Standard Equation', 'القطع المكافئ: المعادلة القياسية'],
            ['Graphing Parabolas and Applications', 'رسم القطع المكافئ وتطبيقاته'],
          ],
        },
        {
          en: 'Ellipse & Hyperbola',
          ar: 'القطع الناقص والقطع الزائد',
          lessons: [
            ['The Ellipse', 'القطع الناقص'],
            ['The Hyperbola', 'القطع الزائد'],
          ],
        },
      ],
    },
    {
      en: 'Integration',
      ar: 'التكامل',
      topics: [
        {
          en: 'Indefinite Integrals',
          ar: 'التكامل غير المحدد',
          lessons: [
            ['Antiderivatives and Basic Rules', 'المشتقات العكسية والقواعد الأساسية'],
            ['Integration by Substitution', 'التكامل بالتعويض'],
          ],
        },
        {
          en: 'Definite Integrals & Area',
          ar: 'التكامل المحدد والمساحات',
          lessons: [
            ['The Definite Integral', 'التكامل المحدد'],
            ['Area Between Two Curves', 'المساحة المحصورة بين منحنيين'],
          ],
        },
      ],
    },
  ],
  sub_phys: [
    {
      en: 'Capacitors',
      ar: 'المتسعات',
      topics: [
        {
          en: 'Capacitance',
          ar: 'السعة',
          lessons: [
            ['What Is a Capacitor?', 'ما هي المتسعة؟'],
            ['Parallel-Plate Capacitors and Dielectrics', 'المتسعة ذات الصفيحتين المتوازيتين والعوازل'],
          ],
        },
        {
          en: 'Combining Capacitors',
          ar: 'ربط المتسعات',
          lessons: [
            ['Capacitors in Series', 'ربط المتسعات على التوالي'],
            ['Capacitors in Parallel and Stored Energy', 'ربط المتسعات على التوازي والطاقة المختزنة'],
          ],
        },
      ],
    },
    {
      en: 'Electromagnetic Induction',
      ar: 'الحث الكهرومغناطيسي',
      topics: [
        {
          en: "Faraday's Law",
          ar: 'قانون فراداي',
          lessons: [
            ['Magnetic Flux', 'الفيض المغناطيسي'],
            ["Faraday's Law and Lenz's Law", 'قانون فراداي وقانون لنز'],
          ],
        },
        {
          en: 'Motional EMF & Self-Induction',
          ar: 'القوة الدافعة الحركية والحث الذاتي',
          lessons: [
            ['Motional EMF', 'القوة الدافعة الكهربائية الحركية'],
            ['Self-Inductance and Inductors', 'الحث الذاتي والملفات'],
          ],
        },
      ],
    },
    {
      en: 'Alternating Current',
      ar: 'التيار المتناوب',
      topics: [
        {
          en: 'AC Fundamentals',
          ar: 'أساسيات التيار المتناوب',
          lessons: [
            ['AC Fundamentals and RMS Values', 'أساسيات التيار المتناوب والقيم المؤثرة'],
            ['Phasor Diagrams', 'المخططات الطورية'],
          ],
        },
        {
          en: 'RLC Circuits',
          ar: 'دوائر RLC',
          lessons: [
            ['RLC Series Circuits', 'دائرة RLC على التوالي'],
            ['Resonance and Power Factor', 'الرنين وعامل القدرة'],
          ],
        },
      ],
    },
  ],
  sub_chem: [
    {
      en: 'Chemical Equilibrium',
      ar: 'الاتزان الكيميائي',
      topics: [
        {
          en: 'The Equilibrium Constant',
          ar: 'ثابت الاتزان',
          lessons: [
            ['Reversible Reactions', 'التفاعلات الانعكاسية'],
            ['Equilibrium Constants Kc and Kp', 'ثابتا الاتزان Kc و Kp'],
          ],
        },
        {
          en: "Le Chatelier's Principle",
          ar: 'قاعدة لو شاتليه',
          lessons: [
            ["Le Chatelier's Principle", 'قاعدة لو شاتليه'],
            ['Factors Affecting Equilibrium', 'العوامل المؤثرة في الاتزان'],
          ],
        },
      ],
    },
    {
      en: 'Ionic Equilibrium',
      ar: 'الاتزان الأيوني',
      topics: [
        {
          en: 'Acids and Bases',
          ar: 'الحوامض والقواعد',
          lessons: [
            ['Theories of Acids and Bases', 'نظريات الحوامض والقواعد'],
            ['pH and pOH Calculations', 'حسابات pH و pOH'],
          ],
        },
        {
          en: 'Hydrolysis & Buffers',
          ar: 'التحلل المائي والمحاليل المنظمة',
          lessons: [
            ['Hydrolysis of Salts', 'التحلل المائي للأملاح'],
            ['Buffer Solutions', 'المحاليل المنظمة'],
          ],
        },
      ],
    },
    {
      en: 'Electrochemistry',
      ar: 'الكيمياء الكهربائية',
      topics: [
        {
          en: 'Galvanic Cells',
          ar: 'الخلايا الكلفانية',
          lessons: [
            ['Oxidation–Reduction Reactions', 'تفاعلات التأكسد والاختزال'],
            ['Galvanic Cells and Cell Potential', 'الخلايا الكلفانية وجهد الخلية'],
          ],
        },
        {
          en: 'Electrolysis',
          ar: 'التحليل الكهربائي',
          lessons: [
            ['Electrolytic Cells', 'خلايا التحليل الكهربائي'],
            ["Faraday's Laws of Electrolysis", 'قوانين فراداي للتحليل الكهربائي'],
          ],
        },
      ],
    },
  ],
  sub_bio: [
    {
      en: 'Human Reproduction',
      ar: 'التكاثر في الإنسان',
      topics: [
        {
          en: 'Reproductive Systems',
          ar: 'الأجهزة التناسلية',
          lessons: [
            ['The Male Reproductive System', 'الجهاز التناسلي الذكري'],
            ['The Female Reproductive System', 'الجهاز التناسلي الأنثوي'],
          ],
        },
        {
          en: 'Fertilization & Development',
          ar: 'الإخصاب والتكوين الجنيني',
          lessons: [
            ['Fertilization and Embryonic Development', 'الإخصاب والتكوين الجنيني'],
            ['Hormones of the Menstrual Cycle', 'هرمونات الدورة الشهرية'],
          ],
        },
      ],
    },
    {
      en: 'Genetics',
      ar: 'الوراثة',
      topics: [
        {
          en: 'Mendelian Inheritance',
          ar: 'الوراثة المندلية',
          lessons: [
            ["Mendel's Laws of Inheritance", 'قوانين مندل في الوراثة'],
            ['Monohybrid and Dihybrid Crosses', 'التضريب الأحادي والثنائي'],
          ],
        },
        {
          en: 'Beyond Mendel',
          ar: 'ما بعد مندل',
          lessons: [
            ['Incomplete Dominance and Codominance', 'السيادة غير التامة والسيادة المشتركة'],
            ['Sex-Linked Inheritance', 'الوراثة المرتبطة بالجنس'],
          ],
        },
      ],
    },
    {
      en: 'Molecular Genetics',
      ar: 'الوراثة الجزيئية',
      topics: [
        {
          en: 'DNA & Transcription',
          ar: 'الدنا والاستنساخ',
          lessons: [
            ['DNA Structure and Replication', 'تركيب الدنا وتضاعفه'],
            ['Transcription', 'عملية الاستنساخ'],
          ],
        },
        {
          en: 'Protein Synthesis & Mutation',
          ar: 'بناء البروتين والطفرات',
          lessons: [
            ['Translation and Protein Synthesis', 'الترجمة وبناء البروتين'],
            ['Gene Mutations', 'الطفرات الجينية'],
          ],
        },
      ],
    },
  ],
  sub_eng: [
    {
      en: 'Global Issues',
      ar: 'قضايا عالمية',
      topics: [
        {
          en: 'Reading Skills',
          ar: 'مهارات القراءة',
          lessons: [
            ['Reading: Climate Change Around Us', 'القراءة: التغير المناخي من حولنا'],
            ['Vocabulary in Context', 'المفردات في السياق'],
          ],
        },
        {
          en: 'Grammar Focus',
          ar: 'القواعد',
          lessons: [
            ['Past Perfect vs Past Simple', 'الماضي التام مقابل الماضي البسيط'],
            ['Reported Speech', 'الكلام المنقول'],
          ],
        },
      ],
    },
    {
      en: 'Science & Innovation',
      ar: 'العلوم والابتكار',
      topics: [
        {
          en: 'Reading & Vocabulary',
          ar: 'القراءة والمفردات',
          lessons: [
            ['Reading: Inventions that Changed the World', 'القراءة: اختراعات غيّرت العالم'],
            ['Phrasal Verbs', 'الأفعال المركبة'],
          ],
        },
        {
          en: 'Grammar in Use',
          ar: 'القواعد التطبيقية',
          lessons: [
            ['The Passive Voice', 'المبني للمجهول'],
            ['Conditionals: Types 1–3', 'الجمل الشرطية: الأنواع 1–3'],
          ],
        },
      ],
    },
    {
      en: 'Writing & Literature',
      ar: 'الكتابة والأدب',
      topics: [
        {
          en: 'Writing',
          ar: 'الكتابة',
          lessons: [
            ['Writing a Formal Letter', 'كتابة رسالة رسمية'],
            ['Paragraph and Essay Structure', 'بناء الفقرة والمقال'],
          ],
        },
        {
          en: 'Literature & Exam Skills',
          ar: 'الأدب ومهارات الامتحان',
          lessons: [
            ['Literature: The Short Story', 'الأدب: القصة القصيرة'],
            ['Exam Skills: Comprehension Strategies', 'مهارات الامتحان: استراتيجيات الفهم'],
          ],
        },
      ],
    },
  ],
};

export const teachers: Teacher[] = [
  { id: 'tch_1', name_en: 'Haider Al-Jubouri', name_ar: 'أ. حيدر الجبوري', subjectId: 'sub_math', avatar: AVATARS[0] },
  { id: 'tch_2', name_en: 'Zainab Al-Mousawi', name_ar: 'أ. زينب الموسوي', subjectId: 'sub_phys', avatar: AVATARS[1] },
  { id: 'tch_3', name_en: 'Ali Al-Rubaie', name_ar: 'أ. علي الربيعي', subjectId: 'sub_chem', avatar: AVATARS[2] },
  { id: 'tch_4', name_en: 'Dr. Noor Al-Saadi', name_ar: 'د. نور الهدى الساعدي', subjectId: 'sub_bio', avatar: AVATARS[3] },
  { id: 'tch_5', name_en: 'Sarah Al-Khafaji', name_ar: 'أ. سارة الخفاجي', subjectId: 'sub_eng', avatar: AVATARS[5] },
  { id: 'tch_6', name_en: 'Mustafa Al-Obaidi', name_ar: 'أ. مصطفى العبيدي', subjectId: 'sub_math', avatar: AVATARS[4] },
  { id: 'tch_7', name_en: 'Rana Al-Tamimi', name_ar: 'أ. رنا التميمي', subjectId: 'sub_chem', avatar: AVATARS[7] },
];

const SUBJECT_TEACHERS: Record<string, string[]> = {
  sub_math: ['tch_1', 'tch_6'],
  sub_phys: ['tch_2'],
  sub_chem: ['tch_3', 'tch_7'],
  sub_bio: ['tch_4'],
  sub_eng: ['tch_5'],
};

const SUBJECT_THUMBS: Record<string, string[]> = {
  sub_math: [THUMBS[0], THUMBS[8]],
  sub_phys: [THUMBS[1], THUMBS[9]],
  sub_chem: [THUMBS[2], THUMBS[3]],
  sub_bio: [THUMBS[4], THUMBS[5]],
  sub_eng: [THUMBS[6], THUMBS[7]],
};

const rng = createRng(2026);

export const units: Unit[] = [];
export const topics: Topic[] = [];
export const lessons: Lesson[] = [];

const AUTHORS = ['Haider Al-Jubouri', 'Dr. Sami Al-Hashimi', 'Zainab Al-Mousawi', 'Ali Al-Rubaie'];

function versionsFor(status: ContentStatus, updatedDaysAgo: number): LessonVersion[] {
  const steps: ContentStatus[] = ['draft', 'in_review', 'approved', 'published'];
  const upto = status === 'archived' || status === 'scheduled' ? 3 : Math.max(0, steps.indexOf(status));
  const out: LessonVersion[] = [];
  for (let i = 0; i <= upto; i++) {
    out.push({
      id: `ver_${lessons.length}_${i}`,
      version: i + 1,
      author: rng.pick(AUTHORS),
      note: ['Initial draft', 'Submitted for academic review', 'Approved by supervisor', 'Published to students'][i],
      status: steps[i],
      createdAt: daysAgo(updatedDaysAgo + (upto - i) * rng.int(2, 6)),
    });
  }
  if (status === 'scheduled' || status === 'archived') {
    out.push({
      id: `ver_${lessons.length}_x`,
      version: out.length + 1,
      author: rng.pick(AUTHORS),
      note: status === 'scheduled' ? 'Scheduled for release' : 'Archived — replaced by updated lesson',
      status,
      createdAt: daysAgo(updatedDaysAgo),
    });
  }
  return out.reverse();
}

for (const [subjectId, unitDefs] of Object.entries(CURRICULUM)) {
  unitDefs.forEach((u, ui) => {
    const unitId = `unit_${subjectId.slice(4)}_${ui + 1}`;
    units.push({ id: unitId, subjectId, name_en: u.en, name_ar: u.ar, order: ui + 1 });
    u.topics.forEach((t, ti) => {
      const topicId = `${unitId}_t${ti + 1}`;
      topics.push({ id: topicId, unitId, name_en: t.en, name_ar: t.ar, order: ti + 1 });
      t.lessons.forEach(([en, ar], li) => {
        const idx = lessons.length;
        const order = ui * 4 + ti * 2 + li + 1;
        // Earlier units are published; the latest unit has work in progress.
        const status: ContentStatus =
          ui === 0
            ? 'published'
            : ui === 1
              ? rng.weighted<ContentStatus>([['published', 7], ['scheduled', 1], ['approved', 1]])
              : rng.weighted<ContentStatus>([['draft', 3], ['in_review', 3], ['approved', 2], ['published', 2], ['archived', 0.4]]);
        const updated = rng.int(1, 60);
        const videoState: VideoState =
          status === 'draft' ? rng.pick<VideoState>(['none', 'uploading', 'processing', 'ready']) : 'ready';
        const prev = li > 0 || ti > 0 ? lessons[idx - 1] : null;
        lessons.push({
          id: `les_${String(idx + 1).padStart(3, '0')}`,
          subjectId,
          unitId,
          topicId,
          title_en: en,
          title_ar: ar,
          description_en: `${en} — a focused lesson from the "${t.en}" topic with worked ministerial-exam examples and a short practice quiz.`,
          description_ar: `${ar} — درس مركّز من موضوع «${t.ar}» مع أمثلة محلولة من أسئلة الامتحانات الوزارية واختبار قصير للتدريب.`,
          teacherId: rng.pick(SUBJECT_TEACHERS[subjectId]),
          order,
          durationSec: rng.int(11, 34) * 60 + rng.int(0, 59),
          thumbnail: SUBJECT_THUMBS[subjectId][idx % 2],
          videoState,
          captions: videoState === 'ready' ? `${en.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.vtt` : null,
          resources:
            rng.bool(0.7)
              ? [
                  { id: `res_${idx}_1`, name: `${en} — Summary Notes.pdf`, sizeKb: rng.int(240, 1800) },
                  ...(rng.bool(0.5) ? [{ id: `res_${idx}_2`, name: 'Ministerial Questions 2019–2025.pdf', sizeKb: rng.int(600, 3200) }] : []),
                ]
              : [],
          completionThreshold: rng.pick([70, 80, 80, 90]),
          prerequisiteId: prev ? prev.id : null,
          status,
          publishAt:
            status === 'published' ? daysAgo(updated + rng.int(5, 40)) : status === 'scheduled' ? daysAhead(rng.int(2, 20)) : null,
          updatedAt: daysAgo(updated),
          views: status === 'published' ? rng.int(800, 14000) : 0,
          versions: versionsFor(status, updated),
        });
      });
    });
  });
}

export const teacherById = (id: string | null | undefined) => teachers.find((t) => t.id === id);
