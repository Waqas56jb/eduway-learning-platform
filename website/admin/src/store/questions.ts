import { questions } from '@/data/questions';
import { createCollection } from './createCollection';

export const useQuestions = createCollection('question', questions, (q) => q.code);
