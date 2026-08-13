import type { OperationReportResponse } from './types';
import { get } from '@/utils/request';

interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}

export function getOperationReport(reportCode: string) {
  return get<ApiResponse<OperationReportResponse>>(`/fault/report/${encodeURIComponent(reportCode)}`)
    .json()
    .then(response => response.data);
}

export * from './types';
