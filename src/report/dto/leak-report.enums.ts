export enum LeakLocation {
  CEILING = '천장 누수',
  BATHROOM = '욕실 누수',
  PIPE = '배관 누수',
  EXTERIOR_WALL = '외벽 누수',
  CONDENSATION = '결로 의심',
  OTHER = '기타',
}

export enum UrgencyLevel {
  LOW = '낮음',
  MEDIUM = '보통',
  HIGH = '긴급',
}

// 일반 접수 폼에서 고를 수 있는 긴급도. '긴급'은 긴급 출동 경로(/emergency)에서만 저장한다.
export const GENERAL_URGENCY_LEVELS: UrgencyLevel[] = [
  UrgencyLevel.LOW,
  UrgencyLevel.MEDIUM,
];
