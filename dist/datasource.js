'use strict';

System.register(['lodash', 'moment', 'angular', 'app/core/utils/datemath', 'app/core/table_model'], function (_export, _context) {
  "use strict";

  var _, moment, angular, dateMath, TableModel, _createClass, SumologicDatasource;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  return {
    setters: [function (_lodash) {
      _ = _lodash.default;
    }, function (_moment) {
      moment = _moment.default;
    }, function (_angular) {
      angular = _angular.default;
    }, function (_appCoreUtilsDatemath) {
      dateMath = _appCoreUtilsDatemath.default;
    }, function (_appCoreTable_model) {
      TableModel = _appCoreTable_model.default;
    }],
    execute: function () {
      _createClass = function () {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }

        return function (Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      }();

      _export('SumologicDatasource', SumologicDatasource = function () {
        function SumologicDatasource(instanceSettings, $q, backendSrv, templateSrv) {
          _classCallCheck(this, SumologicDatasource);

          this.type = instanceSettings.type;
          this.name = instanceSettings.name;
          this.url = instanceSettings.url;
          this.basicAuth = instanceSettings.basicAuth;
          this.withCredentials = instanceSettings.withCredentials;
          this.$q = $q;
          this.backendSrv = backendSrv;
          this.templateSrv = templateSrv;
        }

        _createClass(SumologicDatasource, [{
          key: 'query',
          value: function query(options) {
            var _this = this;

            var timeoutSec = 30;

            var queries = _.map(options.targets, function (target) {
              var params = {
                query: _this.templateSrv.replace(target.query, options.scopedVars),
                from: String(_this.convertTime(options.range.from, false)),
                to: String(_this.convertTime(options.range.to, true)),
                timeZone: 'Etc/UTC'
              };
              var startTime = new Date();
              return _this.doRequest('POST', '/search/jobs', params).then(function (job) {
                if (job.status !== 202) {
                  return _this.$q.reject({ message: 'error' });
                }

                var loop = function loop() {
                  return _this.doRequest('GET', '/search/jobs/' + job.data.id).then(function (status) {
                    var now = new Date();
                    if (now - startTime > timeoutSec * 1000) {
                      return _this.doRequest('DELETE', '/search/jobs/' + job.data.id).then(function (result) {
                        return _this.$q.reject({ message: 'timeout' });
                      });
                    }

                    if (status.data.state !== 'DONE GATHERING RESULTS') {
                      return new Promise(function (resolve) {
                        setTimeout(function () {
                          loop().then(resolve);
                        }, 1000);
                      });
                    }

                    if (target.format === 'time_series' || target.format === 'records') {
                      return _this.doRequest('GET', '/search/jobs/' + job.data.id + '/records?offset=0&limit=10000').then(function (records) {
                        return records;
                      });
                    } else if (target.format === 'messages') {
                      return _this.doRequest('GET', '/search/jobs/' + job.data.id + '/messages?offset=0&limit=10000').then(function (messages) {
                        return messages;
                      });
                    } else {
                      return _this.$q.reject({ message: 'unsupported type' });
                    }
                  });
                };

                return loop().then(function (result) {
                  return result;
                });
              });
            });

            return this.$q.all(queries).then(function (responses) {
              var result = [];

              _.each(responses, function (response, index) {
                if (options.targets[index].format === 'time_series') {
                  result.push(_this.transformRecordsToTimeSeries(response.data.records, options.targets[index]));
                }
              });

              var tableResponses = _.filter(responses, function (response, index) {
                return options.targets[index].format === 'records' || options.targets[index].format === 'messages';
              }).map(function (response) {
                return response.data;
              }).flatten();
              if (tableResponses.length > 0) {
                result.push(_this.transformDataToTable(tableResponses));
              }

              return { data: result };
            });
          }
        }, {
          key: 'testDatasource',
          value: function testDatasource() {
            return this.$q.when({ status: 'success', message: 'Data source is working', title: 'Success' });
          }
        }, {
          key: 'doRequest',
          value: function doRequest(method, path, params) {
            var options = {
              method: method,
              url: this.url + path,
              data: params,
              headers: {},
              inspect: { type: 'sumologic' }
            };

            if (this.basicAuth || this.withCredentials) {
              options.withCredentials = true;
            }
            if (this.basicAuth) {
              options.headers.Authorization = this.basicAuth;
            }
            options.headers['Content-Type'] = 'application/json';

            return this.backendSrv.datasourceRequest(options);
          }
        }, {
          key: 'transformDataToTable',
          value: function transformDataToTable(data) {
            var table = new TableModel();

            if (data.length === 0) {
              return table;
            }

            var type = data[0].records ? 'records' : 'messages';

            var fields = _.chain(data).map(function (d) {
              return _.map(d.fields, 'name');
            }).flatten().uniq().value();

            // columns
            table.columns = fields.map(function (c) {
              return { text: c };
            });

            // rows
            _.each(data, function (d) {
              var _iteratorNormalCompletion = true;
              var _didIteratorError = false;
              var _iteratorError = undefined;

              try {
                for (var _iterator = d[type][Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
                  var r = _step.value;

                  var row = [];
                  var _iteratorNormalCompletion2 = true;
                  var _didIteratorError2 = false;
                  var _iteratorError2 = undefined;

                  try {
                    for (var _iterator2 = fields[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                      var key = _step2.value;

                      row.push(r.map[key] || '');
                    }
                  } catch (err) {
                    _didIteratorError2 = true;
                    _iteratorError2 = err;
                  } finally {
                    try {
                      if (!_iteratorNormalCompletion2 && _iterator2.return) {
                        _iterator2.return();
                      }
                    } finally {
                      if (_didIteratorError2) {
                        throw _iteratorError2;
                      }
                    }
                  }

                  table.rows.push(row);
                }
              } catch (err) {
                _didIteratorError = true;
                _iteratorError = err;
              } finally {
                try {
                  if (!_iteratorNormalCompletion && _iterator.return) {
                    _iterator.return();
                  }
                } finally {
                  if (_didIteratorError) {
                    throw _iteratorError;
                  }
                }
              }
            });

            return table;
          }
        }, {
          key: 'transformRecordsToTimeSeries',
          value: function transformRecordsToTimeSeries(records, target) {
            var metricLabel = '';
            var dps = [];

            if (records.length === 0) {
              return { target: metricLabel, datapoints: dps };
            }

            metricLabel = this.createMetricLabel(records[0].map, target);
            _.each(records, function (r) {
              dps.push([parseFloat(r.map['_count']), parseInt(r.map['_timeslice'], 10)]);
            });
            dps = dps.sort(function (a, b) {
              if (a[1] < b[1]) {
                return -1;
              } else if (a[1] > b[1]) {
                return 1;
              } else {
                return 0;
              }
            });

            return { target: metricLabel, datapoints: dps };
          }
        }, {
          key: 'createMetricLabel',
          value: function createMetricLabel(record, target) {
            if (_.isUndefined(target) || _.isEmpty(target.aliasFormat)) {
              return '';
            }

            return this.renderTemplate(this.templateSrv.replace(target.aliasFormat), record) || '{}';
          }
        }, {
          key: 'renderTemplate',
          value: function renderTemplate(aliasPattern, aliasData) {
            var aliasRegex = /\{\{\s*(.+?)\s*\}\}/g;
            return aliasPattern.replace(aliasRegex, function (match, g1) {
              if (aliasData[g1]) {
                return aliasData[g1];
              }
              return g1;
            });
          }
        }, {
          key: 'convertTime',
          value: function convertTime(date, roundUp) {
            if (_.isString(date)) {
              date = dateMath.parse(date, roundUp);
            }
            return date.valueOf();
          }
        }]);

        return SumologicDatasource;
      }());

      _export('SumologicDatasource', SumologicDatasource);
    }
  };
});
//# sourceMappingURL=datasource.js.map
