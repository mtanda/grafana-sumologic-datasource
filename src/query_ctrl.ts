import 'angular';
import './query_parameter_ctrl';
import { QueryCtrl } from 'grafana/app/plugins/sdk';
import './mode-sumologic';
import './snippets/sumologic';

export class SumologicQueryCtrl extends QueryCtrl {
    static templateUrl = 'partials/query.editor.html';

    constructor($scope, $injector) {
        super($scope, $injector);
    }
}

