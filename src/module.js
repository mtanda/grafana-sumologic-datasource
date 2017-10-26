import {SumologicDatasource} from './datasource';
import {SumologicQueryCtrl} from './query_ctrl';

class SumologicConfigCtrl {}
SumologicConfigCtrl.templateUrl = 'partials/config.html';

export {
  SumologicDatasource as Datasource,
  SumologicConfigCtrl as ConfigCtrl,
  SumologicQueryCtrl as QueryCtrl
};
