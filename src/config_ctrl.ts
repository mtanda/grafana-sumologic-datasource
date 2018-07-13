export class SumologicConfigCtrl {
  current: any;
  static templateUrl = 'public/plugins/mtanda-sumologic-datasource/partials/config.html';

  constructor($scope) {
    this.current.jsonData.timeout = this.current.jsonData.timeout || 30;
  }
}
