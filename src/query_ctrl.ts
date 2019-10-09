import './query_parameter_ctrl';
import { QueryCtrl } from 'grafana/app/plugins/sdk';

export class SumologicQueryCtrl extends QueryCtrl {
  static templateUrl = 'partials/query.editor.html';

  /** @ngInject */
  constructor($scope, $injector) {
    super($scope, $injector);
  }
}
