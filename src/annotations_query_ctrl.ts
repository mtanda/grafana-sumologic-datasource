export class SumologicAnnotationsQueryCtrl {
  scope: any;
  static templateUrl = 'annotations.editor.html';

  /** @ngInject */
  constructor($scope, $injector) {
    this.scope = $scope;
  }
}
