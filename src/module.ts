import SumologicDatasource from './datasource';
import { SumologicQueryCtrl } from './query_ctrl';
import { SumologicAnnotationsQueryCtrl } from './annotations_query_ctrl';
import { SumologicConfigCtrl } from './config_ctrl';
import { DataSourcePlugin } from '@grafana/ui';
import { SumologicQuery, SumologicOptions } from './types';

export const plugin = new DataSourcePlugin<SumologicDatasource, SumologicQuery, SumologicOptions>(SumologicDatasource)
  .setConfigCtrl(SumologicConfigCtrl)
  .setQueryCtrl(SumologicQueryCtrl)
  .setAnnotationQueryCtrl(SumologicAnnotationsQueryCtrl);
