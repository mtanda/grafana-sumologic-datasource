export class SumologicConfigCtrl {
  constructor($scope) {
    this.current.jsonData.timeout = this.current.jsonData.timeout || 30;
  }
}
SumologicConfigCtrl.templateUrl = 'public/plugins/mtanda-sumologic-datasource/partials/config.html';
