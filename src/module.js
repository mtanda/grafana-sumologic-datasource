import {SumologicDatasource} from './datasource';
import {SumologicQueryCtrl} from './query_ctrl';
import {SumologicAnnotationsQueryCtrl} from './annotations_query_ctrl';

class SumologicConfigCtrl {}
SumologicConfigCtrl.templateUrl = 'partials/config.html';

export {
  SumologicDatasource as Datasource,
  SumologicConfigCtrl as ConfigCtrl,
  SumologicQueryCtrl as QueryCtrl,
  SumologicAnnotationsQueryCtrl as AnnotationsQueryCtrl
};
