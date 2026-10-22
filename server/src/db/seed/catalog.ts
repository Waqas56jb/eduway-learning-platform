/**
 * Catalog: subjects → units → topics (chapters) → lessons (+ external archive.org video assets, PDF resources),
 * tags, 52 questions with options/LaTeX/explanations, quiz rules, exam blueprints, packages (+subjects/features),
 * promotions. Catalog rows are upserted (content refreshed on re-seed); ids are deterministic.
 */
import { T } from '../../config/constants.js';
import type { TxClient } from '../../config/db.js';
import { sha256 } from '../../common/utils/crypto.js';
import { daysAgo, daysAhead, insertMany, loadJson, rebase, sid, updateSet } from './helpers.js';
import type { AdminMock, UserExam, UserLesson, UserPackage, UserQuestion, UserSubject } from './types.js';

export const SUBJECT_BY_ADMIN: Record<string, string> = { sub_math: 'math', sub_phys: 'physics', sub_chem: 'chemistry', sub_bio: 'biology', sub_eng: 'english' };
export const PACKAGE_BY_ADMIN: Record<string, string> = { pkg_full: 'full', pkg_sci: 'science', pkg_math: 'single', pkg_sprint: 'sprint' };
export const subjectId = (slug: string) => sid('subject', slug);
export const lessonId = (slug: string) => sid('lesson', slug);
export const questionId = (legacy: string) => sid('question', legacy);
export const packageId = (slug: string) => sid('package', slug);
export const blueprintId = (slug: string) => sid('blueprint', slug);
export const optionId = (legacyQ: string, i: number) => sid('option', `${legacyQ}:${i}`);
export const SAMPLE_PDF = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

const sizeBytes = (s: string) => Math.round(parseFloat(s) * (/(GB)/i.test(s) ? 1024 ** 3 : /(MB)/i.test(s) ? 1024 ** 2 : 1024));

const TEACHER_META: Record<string, { years: number; students: number; rating: number; bio: [string, string] }> = {
  math: { years: 18, students: 14200, rating: 4.9, bio: ['Ministerial-exam specialist who turns calculus into step-by-step habits.', 'متخصص بالأسئلة الوزارية يحوّل التفاضل والتكامل إلى خطوات واضحة.'] },
  physics: { years: 15, students: 11800, rating: 4.8, bio: ['Explains every law with a real experiment before the equations.', 'يشرح كل قانون بتجربة حقيقية قبل المعادلات.'] },
  chemistry: { years: 12, students: 9600, rating: 4.9, bio: ['Makes equilibrium and organic reactions intuitive with visual models.', 'يجعل الاتزان والتفاعلات العضوية سهلة بنماذج مرئية.'] },
  biology: { years: 14, students: 10400, rating: 4.8, bio: ['Medical-track mentor focused on genetics and human physiology.', 'مرشدة طلاب المجموعة الطبية مع تركيز على الوراثة وفسلجة الإنسان.'] },
  english: { years: 10, students: 12900, rating: 4.9, bio: ['Grammar and writing coach for the ministerial English paper.', 'مدرّبة القواعد والكتابة لامتحان اللغة الإنكليزية الوزاري.'] },
};

export interface CatalogMaps {
  lessonsBySlug: Map<string, UserLesson>;
  questions: UserQuestion[];
  topicByChapter: Map<string, string>;
}

export async function seedCatalog(c: TxClient, mock: AdminMock): Promise<CatalogMaps> {
  const subjects = loadJson<UserSubject[]>('subjects.json');
  const lessons = loadJson<UserLesson[]>('lessons.json');
  const questions = loadJson<UserQuestion[]>('questions.json');
  const adminSubj = new Map(mock.subjects.map((s) => [SUBJECT_BY_ADMIN[s.id] as string, s]));

  // ── subjects ──
  await insertMany(
    c,
    T.subjects,
    ['id', 'slug', 'name_en', 'name_ar', 'tagline_en', 'tagline_ar', 'description_en', 'description_ar', 'color', 'icon', 'image_url', 'teacher_name_en', 'teacher_name_ar', 'hours', 'questions_count_label', 'sort_order', 'status', 'sequential_unlock'],
    subjects.map((s, i) => {
      const a = adminSubj.get(s.id);
      return [subjectId(s.id), s.id, s.name.en, s.name.ar, s.tagline.en, s.tagline.ar, s.description.en, s.description.ar, s.color, s.icon, s.image, s.teacher.en, s.teacher.ar, s.hours, s.questionsCount, a?.order ?? i + 1, a?.status ?? 'active', a?.sequentialUnlock ?? false];
    }),
    updateSet('(slug)', ['name_en', 'name_ar', 'tagline_en', 'tagline_ar', 'description_en', 'description_ar', 'color', 'icon', 'image_url', 'teacher_name_en', 'teacher_name_ar', 'hours', 'questions_count_label']),
  );

  // ── teachers: lead teacher per subject (student apps) + the admin portal's teacher roster ──
  const teacherRows: unknown[][] = subjects.map((s, i) => {
    const m = TEACHER_META[s.id] ?? { years: 10, students: 5000, rating: 4.7, bio: ['', ''] };
    return [sid('teacher', `${s.id}-lead`), `${s.id}-lead`, s.teacher.en, s.teacher.ar, subjectId(s.id), null, m.bio[0], m.bio[1], m.years, m.students, m.rating, true, i + 1];
  });
  for (const [i, t] of mock.teachers.entries()) {
    const subj = SUBJECT_BY_ADMIN[t.subjectId];
    if (!subj) continue;
    teacherRows.push([sid('teacher', t.id), t.id, t.name_en, t.name_ar, subjectId(subj), t.avatar, '', '', 8 + (i % 6), 3000 + i * 850, 4.6 + (i % 4) / 10, true, 10 + i]);
  }
  await insertMany(c, T.teachers, ['id', 'slug', 'name_en', 'name_ar', 'subject_id', 'avatar_url', 'bio_en', 'bio_ar', 'years_experience', 'students_count', 'rating', 'active', 'sort_order'], teacherRows, updateSet('(slug)', ['name_en', 'name_ar', 'subject_id', 'bio_en', 'bio_ar']));

  // ── units & topics ("chapters") ──
  const unitRows: unknown[][] = [];
  const topicRows: unknown[][] = [];
  const topicByChapter = new Map<string, string>();
  for (const s of subjects) {
    s.units.forEach((u, ui) => {
      unitRows.push([sid('unit', u.id), subjectId(s.id), u.id, u.title.en, u.title.ar, ui + 1, 'published']);
      u.chapters.forEach((ch, ci) => {
        topicRows.push([sid('topic', ch.id), sid('unit', u.id), ch.id, ch.title.en, ch.title.ar, ci + 1, 'published']);
        topicByChapter.set(ch.id, sid('topic', ch.id));
      });
    });
  }
  await insertMany(c, T.units, ['id', 'subject_id', 'slug', 'title_en', 'title_ar', 'sort_order', 'status'], unitRows, updateSet('(slug)', ['title_en', 'title_ar', 'sort_order']));
  await insertMany(c, T.topics, ['id', 'unit_id', 'slug', 'title_en', 'title_ar', 'sort_order', 'status'], topicRows, updateSet('(slug)', ['title_en', 'title_ar', 'sort_order']));

  // ── video assets (external archive.org sources) + lessons + resources ──
  await insertMany(
    c,
    T.video_assets,
    ['id', 'asset_ref', 'provider', 'source_url', 'duration_sec', 'resolution', 'stream_status', 'cdn_status', 'views', 'replays', 'uploaded_at'],
    lessons.map((l, i) => [sid('video', l.id), `ext-${l.id}`, 'external', l.videoUrl, l.duration, '720p', 'ready', 'synced', 400 + ((i * 137) % 2600), 60 + ((i * 53) % 700), daysAgo(30 + (i % 90))]),
    updateSet('(asset_ref)', ['source_url', 'duration_sec']),
  );
  const lessonRows: unknown[][] = [];
  for (const l of [...lessons].sort((a, b) => (a.subjectId === b.subjectId ? a.order - b.order : a.subjectId.localeCompare(b.subjectId)))) {
    lessonRows.push([
      lessonId(l.id),
      subjectId(l.subjectId),
      sid('unit', l.unitId),
      sid('topic', l.chapterId),
      l.id,
      l.title.en,
      l.title.ar,
      l.description.en,
      l.description.ar,
      sid('teacher', `${l.subjectId}-lead`),
      l.order,
      l.duration,
      l.thumbnail,
      sid('video', l.id),
      80,
      // The demo catalogue is open (as in the original apps); admins can still set prerequisites per lesson.
      null,
      l.order === 1,
      'published',
      daysAgo(60 - Math.min(l.order, 50)),
      `${l.title.en}. ${l.description.en}`,
      `${l.title.ar}. ${l.description.ar}`,
    ]);
  }
  await insertMany(
    c,
    T.lessons,
    ['id', 'subject_id', 'unit_id', 'topic_id', 'slug', 'title_en', 'title_ar', 'description_en', 'description_ar', 'teacher_id', 'sort_order', 'duration_sec', 'thumbnail_url', 'video_asset_id', 'completion_threshold', 'prerequisite_lesson_id', 'is_free_preview', 'status', 'published_at', 'transcript_en', 'transcript_ar'],
    lessonRows,
    updateSet('(slug)', ['title_en', 'title_ar', 'description_en', 'description_ar', 'sort_order', 'duration_sec', 'thumbnail_url', 'video_asset_id', 'teacher_id', 'prerequisite_lesson_id']),
  );
  await c.query(`UPDATE ${T.video_assets} v SET lesson_id = l.id FROM ${T.lessons} l WHERE l.video_asset_id = v.id AND v.lesson_id IS NULL`);
  await insertMany(
    c,
    T.lesson_versions,
    ['id', 'lesson_id', 'version', 'snapshot', 'note', 'status', 'author_name'],
    lessons.map((l) => [sid('lesson-version', `${l.id}:1`), lessonId(l.id), 1, { title: l.title, duration: l.duration }, 'Initial import', 'published', 'EDUWAY Content Team']),
    '(lesson_id, version) DO NOTHING',
  );
  const resRows: unknown[][] = [];
  for (const l of lessons) {
    l.resources.forEach((r, i) => resRows.push([sid('resource', `${l.id}:${i}`), lessonId(l.id), r.title.en, r.title.ar, 'pdf', SAMPLE_PDF, 'application/pdf', sizeBytes(r.size), r.pages, i + 1]));
  }
  await insertMany(c, T.lesson_resources, ['id', 'lesson_id', 'title_en', 'title_ar', 'kind', 'external_url', 'mime_type', 'size_bytes', 'pages', 'sort_order'], resRows, updateSet('(id)', ['title_en', 'title_ar', 'size_bytes', 'pages']));

  // ── tags + questions ──
  const tagSlugs = [...new Set(questions.flatMap((q) => q.tags))];
  const tagLabel: Record<string, [string, string]> = {
    ministerial: ['Ministerial', 'وزاري'],
    basics: ['Basics', 'أساسيات'],
    application: ['Application', 'تطبيق'],
    concept: ['Concept', 'مفهوم'],
    calculation: ['Calculation', 'حسابي'],
    formula: ['Formula', 'قانون'],
    grammar: ['Grammar', 'قواعد'],
    vocabulary: ['Vocabulary', 'مفردات'],
    reading: ['Reading', 'قراءة'],
    definition: ['Definition', 'تعريف'],
    tricky: ['Tricky', 'سؤال دقيق'],
  };
  await insertMany(
    c,
    T.tags,
    ['id', 'slug', 'name_en', 'name_ar'],
    tagSlugs.map((t) => [sid('tag', t), t, tagLabel[t]?.[0] ?? t.replace(/(^|-)(\w)/g, (_, s: string, ch: string) => `${s ? ' ' : ''}${ch.toUpperCase()}`), tagLabel[t]?.[1] ?? t]),
    '(slug) DO NOTHING',
  );
  const lessonsBySlug = new Map(lessons.map((l) => [l.id, l]));
  const firstTopicOfUnit = new Map<string, string>();
  for (const s of subjects) for (const u of s.units) if (u.chapters[0]) firstTopicOfUnit.set(u.id, sid('topic', u.chapters[0].id));
  await insertMany(
    c,
    T.questions,
    ['id', 'code', 'subject_id', 'unit_id', 'topic_id', 'lesson_id', 'type', 'difficulty', 'topic_label_en', 'topic_label_ar', 'body_en', 'body_ar', 'formula', 'explanation_en', 'explanation_ar', 'source', 'year', 'status', 'content_hash', 'published_at', 'attempts_count', 'correct_count', 'usage_count'],
    questions.map((q, i) => {
      const lesson = q.lessonId ? lessonsBySlug.get(q.lessonId) : undefined;
      const topic = lesson ? sid('topic', lesson.chapterId) : (firstTopicOfUnit.get(q.unitId) ?? null);
      const attempts = 120 + ((i * 97) % 900);
      return [
        questionId(q.id),
        `${q.subjectId.slice(0, 4).toUpperCase()}-${q.id.toUpperCase()}`,
        subjectId(q.subjectId),
        sid('unit', q.unitId),
        topic,
        lesson ? lessonId(lesson.id) : null,
        'mcq',
        q.difficulty,
        q.topic.en,
        q.topic.ar,
        q.text.en,
        q.text.ar,
        q.formula ?? null,
        q.explanation.en,
        q.explanation.ar,
        q.tags.includes('ministerial') ? 'Ministerial Exam' : 'EDUWAY Original',
        q.tags.includes('ministerial') ? 2019 + (i % 6) : null,
        'published',
        sha256(q.text.en.toLowerCase().replace(/\s+/g, ' ').trim()),
        daysAgo(90),
        attempts,
        Math.round(attempts * (q.difficulty === 'easy' ? 0.82 : q.difficulty === 'medium' ? 0.64 : 0.47)),
        attempts,
      ];
    }),
    updateSet('(code)', ['body_en', 'body_ar', 'formula', 'explanation_en', 'explanation_ar', 'difficulty', 'topic_label_en', 'topic_label_ar', 'topic_id', 'lesson_id']),
  );
  await insertMany(
    c,
    T.question_options,
    ['id', 'question_id', 'sort_order', 'text_en', 'text_ar', 'is_correct'],
    questions.flatMap((q) => q.options.map((o, i) => [optionId(q.id, i), questionId(q.id), i + 1, o.en, o.ar, i === q.correctIndex])),
    updateSet('(question_id, sort_order)', ['text_en', 'text_ar', 'is_correct']),
  );
  await insertMany(c, T.question_tags, ['question_id', 'tag_id'], questions.flatMap((q) => q.tags.map((t) => [questionId(q.id), sid('tag', t)])), 'DO NOTHING');

  // ── quiz rules: global default + per-subject rules from the admin portal ──
  await c.query(
    `INSERT INTO ${T.quiz_rules} (id, scope, question_count, pool_size, alternative_sets, pass_threshold, retry_policy, max_retries, show_explanation)
     VALUES ($1, 'global', 5, 15, 3, 60, 'unlimited', 0, true) ON CONFLICT DO NOTHING`,
    [sid('quiz-rule', 'global')],
  );
  for (const r of mock.quizRules.filter((x) => x.scope === 'subject')) {
    const slug = SUBJECT_BY_ADMIN[r.subjectId];
    if (!slug) continue;
    await c.query(
      `INSERT INTO ${T.quiz_rules} (id, scope, subject_id, question_count, pool_size, randomize_questions, randomize_options, alternative_sets, pass_threshold, retry_policy, max_retries, cooldown_minutes, show_explanation, require_completion_to_unlock)
       VALUES ($1,'subject',$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT DO NOTHING`,
      [sid('quiz-rule', r.id), subjectId(slug), Math.min(r.questionCount, 5), r.poolSize, r.randomize, Math.min(5, Math.max(1, r.alternativeSets)), Math.min(r.passThreshold, 60), r.retryPolicy, r.maxRetries, r.retryPolicy === 'cooldown' ? 30 : 0, r.showExplanation, false],
    );
  }

  // ── exam blueprints: the student apps' exams (fixed question sets) + the admin portal's mixed blueprints ──
  const exams = loadJson<UserExam[]>('exams.json');
  const qByLegacy = new Map(questions.map((q) => [q.id, q]));
  const extras = loadJson<{ upcomingExams: { examId: string; date: string }[] }>('student-extras.json');
  for (const e of exams) {
    const qs = e.questionIds.map((id) => qByLegacy.get(id)).filter((q): q is UserQuestion => !!q);
    const count = (d: string) => qs.filter((q) => q.difficulty === d).length;
    const upcoming = extras.upcomingExams.find((u) => u.examId === e.id);
    await c.query(
      `INSERT INTO ${T.exam_blueprints} (id, slug, subject_id, title_en, title_ar, description_en, description_ar, duration_min, question_count, pass_mark, randomize, attempt_limit, fixed_question_ids, available_from, available_to, scheduled_at, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11,$12,$13,$14,$15,'published')
       ON CONFLICT (slug) DO UPDATE SET title_en = EXCLUDED.title_en, title_ar = EXCLUDED.title_ar, description_en = EXCLUDED.description_en, description_ar = EXCLUDED.description_ar,
         fixed_question_ids = EXCLUDED.fixed_question_ids, available_to = EXCLUDED.available_to, scheduled_at = EXCLUDED.scheduled_at`,
      [blueprintId(e.id), e.id, subjectId(e.subjectId), e.title.en, e.title.ar, e.description.en, e.description.ar, e.durationMin, qs.length, e.passMark, e.attemptsTotal, qs.map((q) => questionId(q.id)), daysAgo(30), daysAhead(180), rebase(upcoming?.date ?? null)],
    );
    await c.query(
      `INSERT INTO ${T.exam_blueprint_sections} (id, blueprint_id, subject_id, question_count, easy_count, medium_count, hard_count, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,1) ON CONFLICT (id) DO NOTHING`,
      [sid('bp-section', `${e.id}:1`), blueprintId(e.id), subjectId(e.subjectId), qs.length, count('easy'), count('medium'), count('hard')],
    );
  }
  for (const b of mock.blueprints) {
    const rows = b.rows.filter((r) => SUBJECT_BY_ADMIN[r.subjectId]);
    const split = (r: (typeof rows)[number]) => {
      const easy = Math.round((r.count * r.easy) / 100);
      const hard = Math.round((r.count * r.hard) / 100);
      return { easy, medium: r.count - easy - hard, hard };
    };
    const total = rows.reduce((s, r) => s + r.count, 0);
    const primary = SUBJECT_BY_ADMIN[rows[0]?.subjectId ?? ''] ?? null;
    await c.query(
      `INSERT INTO ${T.exam_blueprints} (id, slug, subject_id, title_en, title_ar, description_en, description_ar, duration_min, question_count, pass_mark, randomize, scoring, attempt_limit, review_before_submit, available_from, available_to, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,50,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT (slug) DO NOTHING`,
      [blueprintId(b.id), b.id, primary ? subjectId(primary) : null, b.name_en, b.name_ar, `Full ministerial-style simulation across ${rows.length} subject(s).`, `محاكاة كاملة بنمط الامتحان الوزاري تشمل ${rows.length} مادة.`, b.durationMin, total, b.randomize, b.scoring, b.attemptLimit, b.reviewBeforeSubmit, rebase(b.availableFrom), rebase(b.availableTo), b.status === 'published' ? 'published' : b.status === 'archived' ? 'archived' : 'draft'],
    );
    for (const [i, r] of rows.entries()) {
      const s = split(r);
      await c.query(
        `INSERT INTO ${T.exam_blueprint_sections} (id, blueprint_id, subject_id, question_count, easy_count, medium_count, hard_count, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [sid('bp-section', r.id), blueprintId(b.id), subjectId(SUBJECT_BY_ADMIN[r.subjectId] as string), r.count, s.easy, s.medium, s.hard, i + 1],
      );
    }
  }

  // ── packages ──
  const pkgs = loadJson<UserPackage[]>('packages.json');
  const sprint = mock.packages.find((p) => p.id === 'pkg_sprint');
  const pkgRows: unknown[][] = pkgs.map((p, i) => [
    packageId(p.id),
    p.id,
    p.name.en,
    p.name.ar,
    p.tagline.en,
    p.tagline.ar,
    mock.packages.find((m) => PACKAGE_BY_ADMIN[m.id] === p.id)?.description_en ?? p.tagline.en,
    mock.packages.find((m) => PACKAGE_BY_ADMIN[m.id] === p.id)?.description_ar ?? p.tagline.ar,
    p.priceMonthly,
    p.priceYearly,
    365,
    'months',
    1,
    null,
    'manual',
    'immediate',
    null,
    p.aiQuota,
    p.popular ?? false,
    i + 1,
    'active',
    p.currency.en,
    p.currency.ar,
  ]);
  if (sprint) {
    pkgRows.push([packageId('sprint'), 'sprint', sprint.name_en, sprint.name_ar, 'Three months of intensive revision', 'ثلاثة أشهر من المراجعة المكثفة', sprint.description_en, sprint.description_ar, sprint.price, null, 365, sprint.validityType, sprint.validityValue, null, sprint.renewal, sprint.accessStart, rebase(sprint.accessStartDate), 60, false, 4, sprint.status, 'IQD', 'د.ع']);
  }
  await insertMany(
    c,
    T.packages,
    ['id', 'slug', 'name_en', 'name_ar', 'tagline_en', 'tagline_ar', 'description_en', 'description_ar', 'price', 'yearly_price', 'yearly_validity_days', 'validity_type', 'validity_value', 'valid_until', 'renewal', 'access_start', 'access_start_date', 'ai_quota', 'is_featured', 'sort_order', 'status', 'currency_label_en', 'currency_label_ar'],
    pkgRows,
    updateSet('(slug)', ['name_en', 'name_ar', 'tagline_en', 'tagline_ar']),
  );
  const pkgSubjects: unknown[][] = pkgs.flatMap((p) => p.subjects.map((s) => [packageId(p.id), subjectId(s)]));
  if (sprint) pkgSubjects.push(...sprint.subjectIds.map((s) => [packageId('sprint'), subjectId(SUBJECT_BY_ADMIN[s] as string)]));
  await insertMany(c, T.package_subjects, ['package_id', 'subject_id'], pkgSubjects, 'DO NOTHING');
  await insertMany(
    c,
    T.package_features,
    ['id', 'package_id', 'text_en', 'text_ar', 'sort_order'],
    pkgs.flatMap((p) => p.features.map((f, i) => [sid('pkg-feature', `${p.id}:${i}`), packageId(p.id), f.en, f.ar, i + 1])),
    updateSet('(package_id, sort_order)', ['text_en', 'text_ar']),
  );

  return { lessonsBySlug, questions, topicByChapter };
}

export async function seedPromotions(c: TxClient, mock: AdminMock): Promise<void> {
  for (const p of mock.promotions) {
    const schoolOwner = p.ownerId?.startsWith('sch_') ? sid('school', p.ownerId) : null;
    await c.query(
      `INSERT INTO ${T.promotions} (id, code, type, discount_type, discount_value, eligibility, usage_limit, used_count, valid_from, valid_to, enabled, school_id, description)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
        WHERE NOT EXISTS (SELECT 1 FROM ${T.promotions} WHERE upper(code) = upper($2) AND deleted_at IS NULL)`,
      [sid('promotion', p.id), p.code, p.type, p.discountType, p.discountValue, p.eligibility, p.usageLimit, p.used, rebase(p.validFrom), rebase(p.validTo), p.enabled, schoolOwner, `${p.code} — ${p.discountType === 'percent' ? `${p.discountValue}%` : `${p.discountValue} IQD`} off`],
    );
    for (const pk of p.packageIds) {
      const slug = PACKAGE_BY_ADMIN[pk];
      if (slug) await c.query(`INSERT INTO ${T.promotion_packages} (promotion_id, package_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [sid('promotion', p.id), packageId(slug)]);
    }
  }
}
