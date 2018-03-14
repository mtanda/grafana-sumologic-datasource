'use strict';

System.register([], function (_export, _context) {
  "use strict";

  var SumologicConfigCtrl;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  return {
    setters: [],
    execute: function () {
      _export('SumologicConfigCtrl', SumologicConfigCtrl = function SumologicConfigCtrl($scope) {
        _classCallCheck(this, SumologicConfigCtrl);

        this.current.jsonData.timeout = this.current.jsonData.timeout || 30;
      });

      _export('SumologicConfigCtrl', SumologicConfigCtrl);

      SumologicConfigCtrl.templateUrl = 'public/plugins/mtanda-sumologic-datasource/partials/config.html';
    }
  };
});
//# sourceMappingURL=config_ctrl.js.map
