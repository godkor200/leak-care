import { LeakLocation, UrgencyLevel } from './dto/leak-report.enums';

export function formViewModel(error?: string) {
  return {
    locations: Object.values(LeakLocation),
    urgencies: Object.values(UrgencyLevel),
    error,
  };
}
