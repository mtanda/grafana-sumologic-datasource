import { DataSource } from './datasource';
import { SumologicAnnotationsQueryCtrl } from './annotations_query_ctrl';
import { ConfigEditor, QueryEditor } from './components';
import SumologicQueryField from './components/SumologicQueryField';
import SumologicStartPage from './components/SumologicStartPage';
import { DataSourcePlugin } from '@grafana/data';
import { SumologicQuery, SumologicOptions } from './types';

export const plugin = new DataSourcePlugin<DataSource, SumologicQuery, SumologicOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor)
  .setAnnotationQueryCtrl(SumologicAnnotationsQueryCtrl)
  .setExploreLogsQueryField(SumologicQueryField)
  .setExploreStartPage(SumologicStartPage);
