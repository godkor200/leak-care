import { GENERAL_URGENCY_LEVELS, LeakLocation } from './dto/leak-report.enums';

const TEXT_FIELDS = [
  'name',
  'phone',
  'address',
  'location',
  'occurredAt',
  'damageScope',
  'urgency',
  'description',
] as const;

type FormField = (typeof TEXT_FIELDS)[number];
export type FormValues = Partial<Record<FormField, string>>;

export const FIELD_LABELS: Record<FormField, string> = {
  name: '이름',
  phone: '연락처',
  address: '주소',
  location: '발생 장소',
  occurredAt: '발생 시점',
  damageScope: '피해 범위',
  urgency: '긴급도',
  description: '상황 설명',
};

export const REATTACH_FILES_NOTE = '첨부 파일은 다시 선택해주세요.';

// 요청 body에서 폼 텍스트 필드만 문자열로 골라낸다 (다시 그릴 때 입력값 유지용)
export function pickFormValues(body: unknown): FormValues {
  const values: FormValues = {};
  if (!body || typeof body !== 'object') {
    return values;
  }
  for (const field of TEXT_FIELDS) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === 'string') {
      values[field] = value;
    }
  }
  return values;
}

function options(all: readonly string[], selected?: string) {
  return all.map((value) => ({ value, selected: value === selected }));
}

export function formViewModel(error?: string, values: FormValues = {}) {
  return {
    locations: options(Object.values(LeakLocation), values.location),
    urgencies: options(GENERAL_URGENCY_LEVELS, values.urgency),
    values,
    error,
  };
}

export function emergencyFormViewModel(error?: string, values: FormValues = {}) {
  return {
    locations: options(Object.values(LeakLocation), values.location),
    values,
    error,
  };
}
