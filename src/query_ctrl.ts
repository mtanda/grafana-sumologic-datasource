import { QueryCtrl } from 'grafana/app/plugins/sdk';
import _ from 'lodash';

export class SumologicQueryCtrl extends QueryCtrl {
  static templateUrl = 'query.editor.html';
  formats: any;

  /** @ngInject */
  constructor($scope, $injector) {
    super($scope, $injector);
    this.target.query = this.target.query || '';
    this.target.aliasFormat = this.target.aliasFormat || '';

    $scope.formats = [
      { text: 'Time series (Records)', value: 'time_series_records' },
      { text: 'Records', value: 'records' },
      { text: 'Messages', value: 'messages' },
    ];
    if (!_.includes(_.map($scope.formats, 'value'), this.target.format)) {
      this.target.format = this.getDefaultFormat();
    }

    if (!$scope.onChange) {
      $scope.onChange = () => {
        // call explore query editor onQueryChange()
        if (this.panelCtrl.onQueryChange) {
          this.panelCtrl.onQueryChange();
        }
      };
    }
  }

  getDefaultFormat() {
    if (this.panelCtrl.panel.type === 'table') {
      return 'records';
    }
    return 'time_series_records';
  }
}
