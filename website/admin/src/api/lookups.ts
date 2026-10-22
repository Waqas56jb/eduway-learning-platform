/* GET /admin/lookups (ADM-ME-09): one cached call for every filter dropdown / name resolution.
 * Replaces store/core.ts lookups. Items carry both `name: Localized` and flat `name_en/name_ar`
 * so `useLocalize()(item, 'name')` keeps working. */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { qk } from './keys';
import type { AdminRef, GovernorateDto, ID, Localized, MarketerRef, PackageRef, SchoolRef, SubjectRef, TeacherRef, TopicRef, UnitRef } from './types';

export interface LookupsDto {
  governorates: GovernorateDto[];
  subjects: SubjectRef[];
  units: (UnitRef & { subjectId: ID })[];
  topics: TopicRef[];
  packages: (PackageRef & { status: string })[];
  schools: (SchoolRef & { marketerId: ID | null; status: string })[];
  marketers: (MarketerRef & { status: string })[];
  teachers: (TeacherRef & { subjectId: ID })[];
  admins: AdminRef[];
  roles: { id: ID; key: string; name: Localized }[];
  gateways: { id: string; name: Localized; color: string }[];
  aiModels: Record<'openai' | 'anthropic' | 'azure', { value: string; label: string }[]>;
}

type Flat<T extends { name: Localized }> = T & { name_en: string; name_ar: string };
const flat = <T extends { name: Localized }>(x: T): Flat<T> => ({ ...x, name_en: x.name?.en ?? '', name_ar: x.name?.ar ?? '' });

export type LookupSubject = Flat<SubjectRef> & { key: string };
export type LookupUnit = Flat<UnitRef & { subjectId: ID }>;
export type LookupTopic = Flat<TopicRef>;
export type LookupPackage = Flat<PackageRef & { status: string }>;
export type LookupSchool = Flat<SchoolRef & { marketerId: ID | null; status: string }>;
export type LookupMarketer = Flat<MarketerRef & { status: string }>;
export type LookupTeacher = Flat<TeacherRef & { subjectId: ID }> & { avatar: string };
export type LookupGovernorate = Flat<GovernorateDto>;
export type LookupAdmin = Flat<AdminRef>;

const EMPTY: LookupsDto = {
  governorates: [],
  subjects: [],
  units: [],
  topics: [],
  packages: [],
  schools: [],
  marketers: [],
  teachers: [],
  admins: [],
  roles: [],
  gateways: [],
  aiModels: { openai: [], anthropic: [], azure: [] },
};

export const fetchLookups = () => api.get<LookupsDto>('/admin/lookups');

export function useLookups() {
  const q = useQuery({ queryKey: qk.lookups, queryFn: fetchLookups, staleTime: 5 * 60_000 });
  const raw = q.data ?? EMPTY;
  const value = useMemo(() => {
    const subjects: LookupSubject[] = [...raw.subjects].map((s) => ({ ...flat(s), key: s.slug }));
    const units = raw.units.map(flat).sort((a, b) => a.order - b.order);
    const topics = raw.topics.map(flat).sort((a, b) => a.order - b.order);
    const packages = raw.packages.map(flat);
    const schools = raw.schools.map(flat);
    const marketers = raw.marketers.map(flat);
    const teachers: LookupTeacher[] = raw.teachers.map((t) => ({ ...flat(t), avatar: t.avatarUrl ?? '' }));
    const governorates = raw.governorates.map(flat);
    const admins = raw.admins.map(flat);
    const by = <T extends { id: ID }>(arr: T[]) => {
      const m = new Map(arr.map((x) => [x.id, x]));
      return (id: ID | null | undefined) => (id ? m.get(id) : undefined);
    };
    return {
      raw,
      subjects,
      units,
      topics,
      packages,
      schools,
      marketers,
      teachers,
      governorates,
      admins,
      roles: raw.roles.map(flat),
      gateways: raw.gateways.map(flat),
      aiModels: raw.aiModels,
      subject: by(subjects),
      unit: by(units),
      topic: by(topics),
      pkg: by(packages),
      school: by(schools),
      marketer: by(marketers),
      teacher: by(teachers),
      governorate: by(governorates),
      admin: by(admins),
    };
  }, [raw]);
  return { ...value, isLoading: q.isLoading, error: q.error, refetch: q.refetch };
}

export type Lookups = ReturnType<typeof useLookups>;
