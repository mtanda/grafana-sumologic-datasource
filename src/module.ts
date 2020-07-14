import { DataSource } from './datasource';
import { ConfigEditor, QueryEditor } from './components';
import SumologicQueryField from './components/SumologicQueryField';
import SumologicStartPage from './components/SumologicStartPage';
import { DataSourcePlugin } from '@grafana/data';
import { SumologicQuery, SumologicOptions } from './types';

class SumologicAnnotationsQueryCtrl {
  static templateUrl = 'annotations.editor.html';
}

export const plugin = new DataSourcePlugin<DataSource, SumologicQuery, SumologicOptions>(DataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor)
  .setAnnotationQueryCtrl(SumologicAnnotationsQueryCtrl)
  .setExploreLogsQueryField(SumologicQueryField)
  .setExploreStartPage(SumologicStartPage);
