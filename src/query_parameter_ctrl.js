import angular from 'angular';
import _ from 'lodash';

angular.module('grafana.directives').directive('sumologicQueryParameter', () => {
  return {
    templateUrl: 'public/plugins/mtanda-sumologic-datasource/partials/query.parameter.html',
    controller: 'SumologicQueryParameterCtrl',
    restrict: 'E',
    scope: {
      target: "=",
      datasource: "=",
      panelType: "=",
      isLastQuery: "=",
      onChange: "&",
    }
  };
});

angular.module('grafana.controllers').controller('SumologicQueryParameterCtrl', ($scope) => {
  $scope.init = function () {
    let target = $scope.target;
    target.query = target.query || '';
    target.aliasFormat = target.aliasFormat || '';
    target.format = target.format || $scope.getDefaultFormat();

    this.formats = [
      { text: 'Time series', value: 'time_series' },
      { text: 'Records', value: 'records' },
      { text: 'Messages', value: 'messages' },
    ];

    if (!$scope.onChange) {
      $scope.onChange = function () { };
    }
  };

  $scope.getDefaultFormat = function() {
    if (this.panelType === 'table') {
      return 'records';
    }
    return 'time_series';
  };

  $scope.init();
});
