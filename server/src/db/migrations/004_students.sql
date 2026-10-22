-- =====================================================================================================
-- 004_students — student profile + school attribution.
-- =====================================================================================================

CREATE TABLE IF NOT EXISTS eduway_platform_student_profiles (
  user_id            uuid NOT NULL,
  first_name_en      text NOT NULL DEFAULT '',
  first_name_ar      text NOT NULL DEFAULT '',
  gender             text,
  birth_date         date,
  governorate_id     uuid,
  school_id          uuid,
  school_name        text,
  grade              text NOT NULL DEFAULT 'grade_12_scientific',
  source             text NOT NULL DEFAULT 'organic',
  referral_code      text,
  marketer_id        uuid,
  registered_platform eduway_platform_enum_platform,
  profile_completed  boolean NOT NULL DEFAULT false,
  ai_disabled        boolean NOT NULL DEFAULT false,
  ai_disabled_reason text,
  last_lesson_id     uuid,
  daily_goal_minutes integer NOT NULL DEFAULT 120,
  avatar_preset      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_student_profiles_pkey PRIMARY KEY (user_id),
  CONSTRAINT eduway_platform_student_profiles_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_student_profiles_gov_fkey FOREIGN KEY (governorate_id) REFERENCES eduway_platform_governorates (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_student_profiles_school_fkey FOREIGN KEY (school_id) REFERENCES eduway_platform_schools (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_student_profiles_mkt_fkey FOREIGN KEY (marketer_id) REFERENCES eduway_platform_marketers (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_student_profiles_gender_check CHECK (gender IS NULL OR gender IN ('male', 'female')),
  CONSTRAINT eduway_platform_student_profiles_source_check CHECK (source IN ('organic', 'school', 'marketer', 'referral', 'campaign'))
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_student_profiles_gov ON eduway_platform_student_profiles (governorate_id);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_student_profiles_school ON eduway_platform_student_profiles (school_id);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_student_profiles_mkt ON eduway_platform_student_profiles (marketer_id);
SELECT eduway_platform_fn_secure_table('eduway_platform_student_profiles');

-- Attribution of a student to a school (one school per student); verified_paid_at set on first paid payment.
CREATE TABLE IF NOT EXISTS eduway_platform_school_students (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL,
  user_id             uuid NOT NULL,
  marketer_id         uuid,
  source              text NOT NULL DEFAULT 'picker',
  referral_code_used  text,
  attributed_at       timestamptz NOT NULL DEFAULT now(),
  verified_paid_at    timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eduway_platform_school_students_pkey PRIMARY KEY (id),
  CONSTRAINT eduway_platform_school_students_user_key UNIQUE (user_id),
  CONSTRAINT eduway_platform_school_students_sch_fkey FOREIGN KEY (school_id) REFERENCES eduway_platform_schools (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_school_students_user_fkey FOREIGN KEY (user_id) REFERENCES eduway_platform_users (id) ON DELETE CASCADE,
  CONSTRAINT eduway_platform_school_students_mkt_fkey FOREIGN KEY (marketer_id) REFERENCES eduway_platform_marketers (id) ON DELETE SET NULL,
  CONSTRAINT eduway_platform_school_students_source_check CHECK (source IN ('picker', 'code', 'link', 'admin'))
);
CREATE INDEX IF NOT EXISTS eduway_platform_idx_school_students_school ON eduway_platform_school_students (school_id, attributed_at DESC);
SELECT eduway_platform_fn_secure_table('eduway_platform_school_students');
