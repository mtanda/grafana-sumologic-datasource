import _ from 'lodash';
import angular from 'angular';

angular.module('grafana.directives').directive('sumologicQueryParameter', () => {
  return {
    templateUrl: 'public/plugins/mtanda-sumologic-datasource/partials/query.parameter.html',
    controller: 'SumologicQueryParameterCtrl',
    restrict: 'E',
    scope: {
      target: '=',
      datasource: '=',
      panelType: '=',
      isLastQuery: '=',
      onChange: '&',
    },
  };
});

angular.module('grafana.controllers').controller('SumologicQueryParameterCtrl', $scope => {
  $scope.init = function() {
    const target = $scope.target;
    target.query = target.query || '';
    target.aliasFormat = target.aliasFormat || '';

    this.formats = [
      { text: 'Time series (Records)', value: 'time_series_records' },
      { text: 'Records', value: 'records' },
      { text: 'Messages', value: 'messages' },
    ];
    if (!_.includes(_.map(this.formats, 'value'), target.format)) {
      target.format = $scope.getDefaultFormat();
    }

    if (!$scope.onChange) {
      $scope.onChange = () => {};
    }
  };

  $scope.getDefaultFormat = () => {
    if ($scope.panelType === 'table') {
      return 'records';
    }
    return 'time_series_records';
  };

  $scope.init();
});
