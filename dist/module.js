'use strict';

System.register(['./datasource', './query_ctrl'], function (_export, _context) {
  "use strict";

  var SumologicDatasource, SumologicQueryCtrl, SumologicConfigCtrl;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  return {
    setters: [function (_datasource) {
      SumologicDatasource = _datasource.SumologicDatasource;
    }, function (_query_ctrl) {
      SumologicQueryCtrl = _query_ctrl.SumologicQueryCtrl;
    }],
    execute: function () {
      _export('ConfigCtrl', SumologicConfigCtrl = function SumologicConfigCtrl() {
        _classCallCheck(this, SumologicConfigCtrl);
      });

      SumologicConfigCtrl.templateUrl = 'partials/config.html';

      _export('Datasource', SumologicDatasource);

      _export('ConfigCtrl', SumologicConfigCtrl);

      _export('QueryCtrl', SumologicQueryCtrl);
    }
  };
});
//# sourceMappingURL=module.js.map
