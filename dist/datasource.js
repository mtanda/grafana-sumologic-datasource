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
        function SumologicDatasource(instanceSettings, $q, backendSrv, templateSrv, timeSrv) {
          _classCallCheck(this, SumologicDatasource);

          this.type = instanceSettings.type;
          this.name = instanceSettings.name;
          this.url = instanceSettings.url;
          this.basicAuth = instanceSettings.basicAuth;
          this.withCredentials = instanceSettings.withCredentials;
          this.$q = $q;
          this.backendSrv = backendSrv;
          this.templateSrv = templateSrv;
          this.timeSrv = timeSrv;
        }

        _createClass(SumologicDatasource, [{
          key: 'query',
          value: function query(options) {
            var _this = this;

            var queries = _.map(options.targets, function (target) {
              var params = {
                query: _this.templateSrv.replace(_this.stripComment(target.query), options.scopedVars),
                from: _this.convertTime(options.range.from, false),
                to: _this.convertTime(options.range.to, true),
                timeZone: 'Etc/UTC'
              };
              return _this.logQuery(params, target.format);
            });

            return Promise.all(queries).then(function (responses) {
              var result = [];

              _.each(responses, function (response, index) {
                if (options.targets[index].format === 'time_series_records') {
                  result.push(_this.transformRecordsToTimeSeries(response.records, options.targets[index]));
                }
              });

              var tableResponses = _.filter(responses, function (response, index) {
                return options.targets[index].format === 'records' || options.targets[index].format === 'messages';
              }).flatten();
              if (tableResponses.length > 0) {
                result.push(_this.transformDataToTable(tableResponses));
              }

              return { data: result };
            });
          }
        }, {
          key: 'metricFindQuery',
          value: function metricFindQuery(query) {
            var range = this.timeSrv.timeRange();

            var recordValuesQuery = query.match(/^record_values\(([^,]+?),\s?([^\)]+?)\)/);
            if (recordValuesQuery) {
              var recordKey = recordValuesQuery[1].toLowerCase();
              var _query = recordValuesQuery[2];
              var params = {
                query: this.templateSrv.replace(this.stripComment(_query)),
                from: String(this.convertTime(range.from, false)),
                to: String(this.convertTime(range.to, true)),
                timeZone: 'Etc/UTC'
              };
              return this.logQuery(params, 'records').then(function (result) {
                return result.records.map(function (r) {
                  return {
                    text: r.map[recordKey],
                    value: r.map[recordKey]
                  };
                });
              });
            }
          }
        }, {
          key: 'annotationQuery',
          value: function annotationQuery(options) {
            var _this2 = this;

            var annotation = options.annotation;
            var query = annotation.query || '';
            var tagKeys = annotation.tagKeys || '';
            tagKeys = tagKeys.split(',');
            var titleFormat = annotation.titleFormat || '';
            var textFormat = annotation.textFormat || '';

            if (!query) {
              return Promise.resolve([]);
            }

            var params = {
              query: this.templateSrv.replace(this.stripComment(query)),
              from: String(this.convertTime(options.range.from, false)),
              to: String(this.convertTime(options.range.to, true)),
              timeZone: 'Etc/UTC'
            };
            return this.logQuery(params, 'messages').then(function (result) {
              var eventList = result.messages.map(function (message) {
                var tags = _.chain(message.map).filter(function (v, k) {
                  return _.includes(tagKeys, k);
                }).value();

                return {
                  annotation: annotation,
                  time: parseInt(message.map['_messagetime'], 10),
                  title: _this2.renderTemplate(titleFormat, message.map),
                  tags: tags,
                  text: _this2.renderTemplate(textFormat, message.map)
                };
              });

              return eventList;
            });
          }
        }, {
          key: 'testDatasource',
          value: function testDatasource() {
            var params = {
              query: '| count _sourceCategory',
              from: new Date().getTime() - 10 * 60 * 1000,
              to: new Date().getTime(),
              timeZone: 'Etc/UTC'
            };
            return this.logQuery(params, 'records').then(function (response) {
              return { status: 'success', message: 'Data source is working', title: 'Success' };
            });
          }
        }, {
          key: 'logQuery',
          value: function logQuery(params, format) {
            var _this3 = this;

            var timeoutSec = 30;
            var startTime = new Date();
            return this.doRequest('POST', '/v1/search/jobs', params).then(function (job) {
              var loop = function loop() {
                return _this3.doRequest('GET', '/v1/search/jobs/' + job.data.id).then(function (status) {
                  var now = new Date();
                  if (now - startTime > timeoutSec * 1000) {
                    return _this3.doRequest('DELETE', '/v1/search/jobs/' + job.data.id).then(function (result) {
                      return Promise.reject({ message: 'timeout' });
                    });
                  }

                  if (status.data.state !== 'DONE GATHERING RESULTS') {
                    return _this3.delay(loop, 1000);
                  }

                  if (format === 'time_series_records' || format === 'records') {
                    if (status.data.recordCount === 0) {
                      return Promise.resolve([]);
                    }
                    var limit = Math.min(10000, status.data.recordCount);
                    return _this3.doRequest('GET', '/v1/search/jobs/' + job.data.id + '/records?offset=0&limit=' + limit).then(function (response) {
                      return response.data;
                    });
                  } else if (format === 'messages') {
                    if (status.data.messageCount === 0) {
                      return Promise.resolve([]);
                    }
                    var _limit = Math.min(10000, status.data.messageCount);
                    return _this3.doRequest('GET', '/v1/search/jobs/' + job.data.id + '/messages?offset=0&limit=' + _limit).then(function (response) {
                      return response.data;
                    });
                  } else {
                    return Promise.reject({ message: 'unsupported type' });
                  }
                }).catch(function (err) {
                  // need to wait until job is created and registered
                  if (err.data.code === 'searchjob.jobid.invalid') {
                    return _this3.delay(loop, 1000);
                  } else {
                    return Promise.reject(err);
                  }
                });
              };

              return _this3.delay(function () {
                return loop().then(function (result) {
                  return result;
                });
              }, 0);
            });
          }
        }, {
          key: 'doRequest',
          value: function doRequest(method, path, params) {
            var _this4 = this;

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

            return this.backendSrv.datasourceRequest(options).catch(function (err) {
              if (err.data.code === 'rate.limit.exceeded') {
                return _this4.delay(function () {
                  return _this4.backendSrv.datasourceRequest(options);
                }, 5000);
              } else {
                return Promise.reject(err);
              }
            });
          }
        }, {
          key: 'delay',
          value: function delay(func, wait) {
            return new Promise(function (resolve, reject) {
              setTimeout(function () {
                func().then(resolve, reject);
              }, wait);
            });
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
            data.forEach(function (d) {
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
            dps = records.map(function (r) {
              return [parseFloat(r.map['_count']), parseInt(r.map['_timeslice'], 10)];
            }).sort(function (a, b) {
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
          key: 'stripComment',
          value: function stripComment(query) {
            return query.split("\n").map(function (q) {
              return q.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');
            }).filter(function (q) {
              return q !== "";
            }).join("\n");
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
