import './query_parameter_ctrl';
import _ from 'lodash';
import {QueryCtrl} from 'app/plugins/sdk';

export class SumologicQueryCtrl extends QueryCtrl {
  constructor($scope, $injector) {
    super($scope, $injector);
  }
}

SumologicQueryCtrl.templateUrl = 'partials/query.editor.html';
