import { DataQuery, DataSourceJsonData } from '@grafana/data';

export interface SumologicOptions extends DataSourceJsonData {
  timeout: number;
}

export interface SumologicQuery extends DataQuery {
  refId: string;
  format?: 'records' | 'messages' | 'time_series_records' | 'logs';
  query: string;
  aliasFormat?: string;
  hide?: boolean;
}

export interface BackendResponse<T = any> {
  data: T;
}

export interface CreateSearchJobRequest {
  query: string;
  from: string | number;
  to: string | number;
  timeZone: string;
  byReceiptTime?: boolean;
  autoParsingMode?: string;
}

export interface CreateSearchJobResponse {
  status: number;
  id: string;
  code: string;
  message: string;
}

export interface GetSearchJobStatusResponse {
  state: string;
  messageCount: number;
  histogramBuckets: Array<{
    length: number;
    count: number;
    startTimestamp: number;
  }>;
  pendingErrors: string[];
  pendingWarnings: string[];
  recordCount: number;
}

export interface GetResultsResponse {
  fields: Array<{
    name: string;
    fieldType: string;
    keyField: boolean;
  }>;
  messages?: Array<{
    map: Array<{ [key: string]: string }>;
  }>;
  records?: Array<{
    map: Array<{ [key: string]: string }>;
  }>;
  done?: boolean;
}
