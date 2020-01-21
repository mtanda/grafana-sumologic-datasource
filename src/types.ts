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
