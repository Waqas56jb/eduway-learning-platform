-- =====================================================================================================
-- 005_content — subjects → units → topics (chapters) → lessons, versions, videos, resources, workflow.
-- Stable slugs (e.g. subject `math`, unit `math-u1`, topic `math-u1-c1`, lesson `math-l1`) are kept for
-- deep links and idempotent seeding; the API exposes both `id` (uuid) and `slug`.
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_subjects (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  slug               text NOT NULL,
  name_en            text NOT NULL,
  name_ar            text NOT NULL,
  tagline_en         text NOT NULL DEFAULT '',
  tagline_ar         text NOT NULL DEFAULT '',
  description_en     text NOT NULL DEFAULT '',
  description_ar     text NOT NULL DEFAULT '',
  color              text NOT NULL DEFAULT '#2563EB',
  icon               text NOT NULL DEFAULT 'Book',
  image_url          text,
  teacher_name_en    text NOT NULL DEFAULT '',
  teacher_name_ar    text NOT NULL DEFAULT '',
  hours              integer NOT NULL DEFAULT 0,
  questions_count_label integer,
  sort_order         integer NOT NULL DEFAULT 0,
  status             text NOT NULL DEFAULT 'active',
  sequential_unlock  boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz,
  CONSTRAINT eduway_platform_subjects_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_subjects_slug_key UNIQUE (slug),
  CONSTRAINT eduway_platform_subjects_status_check CHECK (status IN ('active', 'hidden'))
);
SELECT eduway_platform_fn_secure_table('eduway_platform_subjects');

CREATE TABLE IF NOT EXISTS eduway_platform_teachers (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  slug        text NOT NULL,
  name_en     text NOT NULL,
  name_ar     text NOT NULL,
  subject_id  uuid,
  avatar_url  text,
  bio_en      text NOT NULL DEFAULT '',
  bio_ar      text NOT NULL DEFAULT '',
  years_experience integer,
  students_count   integer,
  rating      numeric(2,1),
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_teachers_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_teachers_slug_key UNIQUE (slug),
  CONSTRAINT eduway_platform_teachers_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_teachers');

CREATE TABLE IF NOT EXISTS eduway_platform_units (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  subject_id  uuid NOT NULL,
  slug        text NOT NULL,
  title_en    text NOT NULL,
  title_ar    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  status      eduway_platform_enum_content_status NOT NULL DEFAULT 'published',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT eduway_platform_units_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_units_slug_key UNIQUE (slug),
  CONSTRAINT eduway_platform_units_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_units_subject ON eduway_platform_units (subject_id, sort_order);
SELECT eduway_platform_fn_secure_table('eduway_platform_units');

-- "Chapters" in the student apps.
CREATE TABLE IF NOT EXISTS eduway_platform_topics (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_id     uuid NOT NULL,
  slug        text NOT NULL,
  title_en    text NOT NULL,
  title_ar    text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  status      eduway_platform_enum_content_status NOT NULL DEFAULT 'published',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CONSTRAINT eduway_platform_topics_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_topics_slug_key UNIQUE (slug),
  CONSTRAINT eduway_platform_topics_unit_fkey FOREIGN KEY (unit_id) REFERENCES eduway_platform_units (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_topics_unit ON eduway_platform_topics (unit_id, sort_order);
SELECT eduway_platform_fn_secure_table('eduway_platform_topics');

-- Video assets: uploaded to the prefixed `eduway-platform-videos` bucket, or an external URL (e.g. archive.org).
CREATE TABLE IF NOT EXISTS eduway_platform_video_assets (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  asset_ref       text NOT NULL,
  provider        text NOT NULL DEFAULT 'storage',
  source_url      text,
  storage_bucket  text,
  storage_path    text,
  hls_path        text,
  captions_path   text,
  size_bytes      bigint NOT NULL DEFAULT 0,
  duration_sec    integer NOT NULL DEFAULT 0,
  resolution      text,
  stream_status   text NOT NULL DEFAULT 'processing',
  cdn_status      text NOT NULL DEFAULT 'pending',
  views           integer NOT NULL DEFAULT 0,
  replays         integer NOT NULL DEFAULT 0,
  error           text,
  uploaded_by     uuid,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_video_assets_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_video_assets_ref_key UNIQUE (asset_ref),
  CONSTRAINT eduway_platform_video_assets_provider_check CHECK (provider IN ('storage', 'external')),
  CONSTRAINT eduway_platform_video_assets_bucket_check CHECK (storage_bucket IS NULL OR storage_bucket LIKE 'eduway-platform-%'),
  CONSTRAINT eduway_platform_video_assets_stream_check CHECK (stream_status IN ('uploading', 'processing', 'ready', 'failed')),
  CONSTRAINT eduway_platform_video_assets_cdn_check CHECK (cdn_status IN ('synced', 'pending', 'error')),
  CONSTRAINT eduway_platform_video_assets_by_fkey FOREIGN KEY (uploaded_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_video_assets');

CREATE TABLE IF NOT EXISTS eduway_platform_lessons (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  subject_id              uuid NOT NULL,
  unit_id                 uuid NOT NULL,
  topic_id                uuid,
  slug                    text NOT NULL,
  title_en                text NOT NULL,
  title_ar                text NOT NULL,
  description_en          text NOT NULL DEFAULT '',
  description_ar          text NOT NULL DEFAULT '',
  teacher_id              uuid,
  sort_order              integer NOT NULL DEFAULT 0,
  duration_sec            integer NOT NULL DEFAULT 0,
  thumbnail_url           text,
  video_asset_id          uuid,
  captions_url            text,
  transcript_en           text,
  transcript_ar           text,
  completion_threshold    integer NOT NULL DEFAULT 80,
  prerequisite_lesson_id  uuid,
  is_free_preview         boolean NOT NULL DEFAULT false,
  status                  eduway_platform_enum_content_status NOT NULL DEFAULT 'draft',
  publish_at              timestamptz,
  published_at            timestamptz,
  current_version         integer NOT NULL DEFAULT 1,
  views_count             integer NOT NULL DEFAULT 0,
  created_by              uuid,
  updated_by              uuid,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  deleted_at              timestamptz,
  CONSTRAINT eduway_platform_lessons_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_lessons_slug_key UNIQUE (slug),
  CONSTRAINT eduway_platform_lessons_subject_fkey FOREIGN KEY (subject_id) REFERENCES eduway_platform_subjects (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_lessons_unit_fkey FOREIGN KEY (unit_id) REFERENCES eduway_platform_units (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_lessons_topic_fkey FOREIGN KEY (topic_id) REFERENCES eduway_platform_topics (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_lessons_teacher_fkey FOREIGN KEY (teacher_id) REFERENCES eduway_platform_teachers (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_lessons_video_fkey FOREIGN KEY (video_asset_id) REFERENCES eduway_platform_video_assets (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_lessons_prereq_fkey FOREIGN KEY (prerequisite_lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_lessons_created_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_lessons_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_lessons_threshold_check CHECK (completion_threshold BETWEEN 1 AND 100)
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_lessons_subject ON eduway_platform_lessons (subject_id, sort_order);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_lessons_unit ON eduway_platform_lessons (unit_id, sort_order);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_lessons_topic ON eduway_platform_lessons (topic_id);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_lessons_status ON eduway_platform_lessons (status, publish_at);
SELECT eduway_platform_fn_secure_table('eduway_platform_lessons');

-- Link video assets back to their lesson (added after lessons exists).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
                 AND table_name = 'eduway_platform_video_assets' AND column_name = 'lesson_id') THEN
    ALTER TABLE eduway_platform_video_assets ADD COLUMN lesson_id uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_video_assets_lesson_fkey') THEN
    ALTER TABLE eduway_platform_video_assets ADD CONSTRAINT eduway_platform_video_assets_lesson_fkey
      FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'eduway_platform_student_profiles_last_lesson_fkey') THEN
    ALTER TABLE eduway_platform_student_profiles ADD CONSTRAINT eduway_platform_student_profiles_last_lesson_fkey
      FOREIGN KEY (last_lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE SET NULL;
  END IF;
END
$$;
CREATE INDEX IF NOT EXISTS eduway_platform_idx_video_assets_lesson ON eduway_platform_video_assets (lesson_id);

CREATE TABLE IF NOT EXISTS eduway_platform_lesson_versions (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id   uuid NOT NULL,
  version     integer NOT NULL,
  snapshot    jsonb NOT NULL,
  note        text NOT NULL DEFAULT '',
  status      eduway_platform_enum_content_status NOT NULL,
  author_id   uuid,
  author_name text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_lesson_versions_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_lesson_versions_lesson_ver_key UNIQUE (lesson_id, version),
  CONSTRAINT eduway_platform_lesson_versions_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_lesson_versions_author_fkey FOREIGN KEY (author_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
SELECT eduway_platform_fn_secure_table('eduway_platform_lesson_versions');

CREATE TABLE IF NOT EXISTS eduway_platform_lesson_resources (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL,
  title_en        text NOT NULL,
  title_ar        text NOT NULL,
  kind            text NOT NULL DEFAULT 'pdf',
  storage_bucket  text,
  storage_path    text,
  external_url    text,
  mime_type       text,
  size_bytes      bigint NOT NULL DEFAULT 0,
  pages           integer,
  sort_order      integer NOT NULL DEFAULT 0,
  downloads       integer NOT NULL DEFAULT 0,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_lesson_resources_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_lesson_resources_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_lesson_resources_by_fkey FOREIGN KEY (created_by) REFERENCES eduway_platform_users (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_lesson_resources_kind_check CHECK (kind IN ('pdf', 'image', 'link', 'doc', 'other')),
  CONSTRAINT eduway_platform_lesson_resources_bucket_check CHECK (storage_bucket IS NULL OR storage_bucket LIKE 'eduway-platform-%')
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_lesson_resources_lesson ON eduway_platform_lesson_resources (lesson_id, sort_order);
SELECT eduway_platform_fn_secure_table('eduway_platform_lesson_resources');

-- Status transitions for lessons/questions/blueprints (draft → in_review → approved → scheduled → published → archived).
CREATE TABLE IF NOT EXISTS eduway_platform_content_workflow_log (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  from_status  text,
  to_status    text NOT NULL,
  actor_id     uuid,
  actor_name   text NOT NULL DEFAULT '',
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_content_workflow_log_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_content_workflow_log_type_check CHECK (entity_type IN ('lesson', 'question', 'exam_blueprint', 'subject', 'unit', 'topic')),
  CONSTRAINT eduway_platform_content_workflow_log_actor_fkey FOREIGN KEY (actor_id) REFERENCES eduway_platform_users (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_workflow_log_entity ON eduway_platform_content_workflow_log (entity_type, entity_id, created_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_content_workflow_log');

-- Caption tracks per lesson & language (signed .vtt URLs are served to students).
CREATE TABLE IF NOT EXISTS eduway_platform_lesson_caption_tracks (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  lesson_id       uuid NOT NULL,
  lang            text NOT NULL,
  label_en        text NOT NULL DEFAULT '',
  label_ar        text NOT NULL DEFAULT '',
  storage_bucket  text,
  storage_path    text,
  external_url    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_lesson_caption_tracks_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_lesson_captions_lesson_lang_key UNIQUE (lesson_id, lang),
  CONSTRAINT eduway_platform_lesson_captions_lang_check CHECK (lang IN ('en', 'ar')),
  CONSTRAINT eduway_platform_lesson_captions_bucket_check CHECK (storage_bucket IS NULL OR storage_bucket LIKE 'eduway-platform-%'),
  CONSTRAINT eduway_platform_lesson_captions_lesson_fkey FOREIGN KEY (lesson_id) REFERENCES eduway_platform_lessons (id) ON DELETE CASCADE
);
SELECT eduway_platform_fn_secure_table('eduway_platform_lesson_caption_tracks');
