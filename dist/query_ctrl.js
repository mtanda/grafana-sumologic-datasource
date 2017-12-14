'use strict';

System.register(['./query_parameter_ctrl', 'lodash', 'app/plugins/sdk', './mode-sumologic', './snippets/sumologic'], function (_export, _context) {
  "use strict";

  var _, QueryCtrl, SumologicQueryCtrl;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  function _possibleConstructorReturn(self, call) {
    if (!self) {
      throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    }

    return call && (typeof call === "object" || typeof call === "function") ? call : self;
  }

  function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
      throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
    }

    subClass.prototype = Object.create(superClass && superClass.prototype, {
      constructor: {
        value: subClass,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
    if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
  }

  return {
    setters: [function (_query_parameter_ctrl) {}, function (_lodash) {
      _ = _lodash.default;
    }, function (_appPluginsSdk) {
      QueryCtrl = _appPluginsSdk.QueryCtrl;
    }, function (_modeSumologic) {}, function (_snippetsSumologic) {}],
    execute: function () {
      _export('SumologicQueryCtrl', SumologicQueryCtrl = function (_QueryCtrl) {
        _inherits(SumologicQueryCtrl, _QueryCtrl);

        function SumologicQueryCtrl($scope, $injector) {
          _classCallCheck(this, SumologicQueryCtrl);

          return _possibleConstructorReturn(this, (SumologicQueryCtrl.__proto__ || Object.getPrototypeOf(SumologicQueryCtrl)).call(this, $scope, $injector));
        }

        return SumologicQueryCtrl;
      }(QueryCtrl));

      _export('SumologicQueryCtrl', SumologicQueryCtrl);

      SumologicQueryCtrl.templateUrl = 'partials/query.editor.html';
    }
  };
});
//# sourceMappingURL=query_ctrl.js.map
