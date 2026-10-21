import { attempts, blueprints, quizRules } from '@/data/assessments';
import { createCollection } from './createCollection';

export const useQuizRules = createCollection('quiz_rule', quizRules, (r) => (r.lessonId ? `lesson ${r.lessonId}` : `subject ${r.subjectId}`));
export const useBlueprints = createCollection('exam_blueprint', blueprints, (b) => b.name_en);
export const useAttempts = createCollection('attempt', attempts, (a) => a.id);
