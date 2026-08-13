import type { OperationReportResponse } from './types';
import { get } from '@/utils/request';

export function getOperationReport(reportCode: string) {
  return get<OperationReportResponse>(`/fault/report/${encodeURIComponent(reportCode)}`).json();
}

export * from './types';
