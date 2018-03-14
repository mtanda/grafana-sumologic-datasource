'use strict';

System.register(['./datasource', './query_ctrl', './annotations_query_ctrl', './config_ctrl'], function (_export, _context) {
  "use strict";

  var SumologicDatasource, SumologicQueryCtrl, SumologicAnnotationsQueryCtrl, SumologicConfigCtrl;
  return {
    setters: [function (_datasource) {
      SumologicDatasource = _datasource.SumologicDatasource;
    }, function (_query_ctrl) {
      SumologicQueryCtrl = _query_ctrl.SumologicQueryCtrl;
    }, function (_annotations_query_ctrl) {
      SumologicAnnotationsQueryCtrl = _annotations_query_ctrl.SumologicAnnotationsQueryCtrl;
    }, function (_config_ctrl) {
      SumologicConfigCtrl = _config_ctrl.SumologicConfigCtrl;
    }],
    execute: function () {
      _export('Datasource', SumologicDatasource);

      _export('ConfigCtrl', SumologicConfigCtrl);

      _export('QueryCtrl', SumologicQueryCtrl);

      _export('AnnotationsQueryCtrl', SumologicAnnotationsQueryCtrl);
    }
  };
});
//# sourceMappingURL=module.js.map
