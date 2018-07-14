'use strict';

System.register(['lodash', 'moment', 'angular', 'app/core/utils/datemath', 'app/core/table_model', './querier', 'rxjs/Observable'], function (_export, _context) {
  "use strict";

  var _, moment, angular, dateMath, TableModel, SumologicQuerier, Observable, _createClass, SumologicDatasource;

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
    }, function (_querier) {
      SumologicQuerier = _querier.SumologicQuerier;
    }, function (_rxjsObservable) {
      Observable = _rxjsObservable.default;
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
          this.timeoutSec = instanceSettings.jsonData.timeout || 30;
          this.$q = $q;
          this.backendSrv = backendSrv;
          this.templateSrv = templateSrv;
          this.timeSrv = timeSrv;
          this.fieldIndex = {
            tagKeys: new Set(),
            tagValues: {}
          };
          // Rate limiting, https://help.sumologic.com/APIs/Search-Job-API/About-the-Search-Job-API
          this.MAX_AVAILABLE_TOKEN = 4; // 4 api calls per second
          this.token = this.MAX_AVAILABLE_TOKEN;
          this.tokenTimer = null;
          this.excludeFieldList = ['_raw', '_collectorid', '_sourceid', '_messageid', '_messagecount', '_messagetime', '_receipttime', '_size', '_timeslice', 'processing_time_ms'];
        }

        _createClass(SumologicDatasource, [{
          key: 'provideToken',
          value: function provideToken() {
            if (this.token < this.MAX_AVAILABLE_TOKEN) {
              this.token += 1;
              if (this.token === this.MAX_AVAILABLE_TOKEN) {
                clearInterval(this.tokenTimer);
                this.tokenTimer = null;
              }
            }
          }
        }, {
          key: 'query',
          value: function query(options) {
            var _this = this;

            var self = this;
            var queries = _.chain(options.targets).filter(function (target) {
              return !target.hide && target.query;
            }).map(function (target) {
              var params = {
                query: _this.templateSrv.replace(_this.stripComment(target.query), options.scopedVars),
                from: _this.convertTime(options.range.from, false),
                to: _this.convertTime(options.range.to, true),
                timeZone: 'Etc/UTC'
              };
              var adhocFilters = _this.templateSrv.getAdhocFilters(_this.name);
              if (adhocFilters.length > 0) {
                var filterQuery = ' | where ' + adhocFilters.map(function (f) {
                  switch (f.operator) {
                    case '=~':
                      return f.key + ' ' + 'matches' + ' "' + f.value + '"';
                    case '!~':
                      return '!(' + f.key + ' ' + 'matches' + ' "' + f.value + '"' + ')';
                    default:
                      return f.key + ' ' + f.operator + ' "' + f.value + '"';
                  }
                }).join(' and ');
                if (params.query.indexOf('|') === -1) {
                  params.query += filterQuery;
                } else {
                  params.query = params.query.replace(/\|/, filterQuery + ' |');
                }
              }
              return _this.logQuery(params, target.format, true).mergeMap(function (value) {
                return value;
              }).scan(function (acc, one) {
                acc.fields = one.fields;
                if (one.records) {
                  acc.records = (acc.records || []).concat(one.records);
                } else if (one.messages) {
                  acc.messages = (acc.messages || []).concat(one.messages);
                }
                return acc;
              }, {});
            }).value();
            return Observable.combineLatest(queries).map(function (responses) {
              responses = responses.filter(function (r) {
                return !_.isEmpty(r);
              });

              if (_this.hasAdhocFilter()) {
                _this.fieldIndex = {
                  tagKeys: new Set(),
                  tagValues: {}
                };

                // build fieldIndex
                responses.forEach(function (r) {
                  r.fields.map(function (f) {
                    return f.name;
                  }).filter(function (name) {
                    return !_this.excludeFieldList.includes(name);
                  }).forEach(function (name) {
                    _this.fieldIndex.tagKeys.add(name);
                  });
                });

                responses.forEach(function (r) {
                  (r.records || r.messages).forEach(function (d) {
                    Object.keys(d.map).filter(function (tagKey) {
                      return !_this.excludeFieldList.includes(tagKey);
                    }).forEach(function (tagKey) {
                      if (!_this.fieldIndex.tagValues[tagKey]) {
                        _this.fieldIndex.tagValues[tagKey] = new Set();
                      }
                      _this.fieldIndex.tagValues[tagKey].add(d.map[tagKey]);
                    });
                  });
                });
              }

              var tableResponses = _.chain(responses).filter(function (response, index) {
                return options.targets[index].format === 'records' || options.targets[index].format === 'messages';
              }).flatten().value();

              if (tableResponses.length > 0) {
                return { data: [self.transformDataToTable(tableResponses)] };
              } else {
                return {
                  data: responses.map(function (response, index) {
                    if (options.targets[index].format === 'time_series_records') {
                      return self.transformRecordsToTimeSeries(response, options.targets[index].format, options.range.to.valueOf());
                    }
                    return data;
                  }).flatten()
                };
              }
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
              return this.logQuery(params, 'records', false).then(function (result) {
                if (_.isEmpty(result)) {
                  return [];
                }
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
            return this.logQuery(params, 'messages', false).then(function (result) {
              if (_.isEmpty(result)) {
                return [];
              }

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
            return this.logQuery(params, 'records', false).then(function (response) {
              return { status: 'success', message: 'Data source is working', title: 'Success' };
            });
          }
        }, {
          key: 'logQuery',
          value: function logQuery(params, format, useObservable) {
            var querier = new SumologicQuerier(params, format, this.timeoutSec, useObservable, this, this.backendSrv);
            return querier.getResult();
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
              return { text: c, filterable: true };
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
          value: function transformRecordsToTimeSeries(response, target, defaultValue) {
            var _this3 = this;

            var metricLabel = '';
            var dps = [];
            var fields = response.fields;
            var records = response.records;

            if (records.length === 0) {
              return { target: metricLabel, datapoints: dps };
            }

            var keyField = fields.find(function (f) {
              return f.fieldType != 'string' && f.keyField;
            });
            keyField = keyField ? keyField.name : '';
            var valueField = fields.find(function (f) {
              return f.fieldType != 'string' && !f.keyField;
            });
            if (!valueField) {
              return { target: metricLabel, datapoints: dps };
            }
            valueField = valueField.name;

            var result = {};
            records.sort(function (a, b) {
              if (keyField === '') {
                return 0;
              }
              if (a.map[keyField] < b.map[keyField]) {
                return -1;
              } else if (a.map[keyField] > b.map[keyField]) {
                return 1;
              } else {
                return 0;
              }
            }).forEach(function (r) {
              metricLabel = _this3.createMetricLabel(r.map, target);
              result[metricLabel] = result[metricLabel] || [];
              result[metricLabel].push([parseFloat(r.map[valueField]), parseFloat(r.map[keyField] || defaultValue)]);
            });

            return _.map(result, function (v, k) {
              return { target: k, datapoints: v };
            });
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
        }, {
          key: 'hasAdhocFilter',
          value: function hasAdhocFilter() {
            return _.some(this.templateSrv.variables, function (variable) {
              return variable.type === 'adhoc';
            });
          }
        }, {
          key: 'getTagKeys',
          value: function getTagKeys(options) {
            return Promise.resolve(Array.from(this.fieldIndex.tagKeys).map(function (k) {
              return {
                type: 'key',
                text: k
              };
            }));
          }
        }, {
          key: 'getTagValues',
          value: function getTagValues(options) {
            return Promise.resolve(Array.from(this.fieldIndex.tagValues[options.key]).map(function (v) {
              return {
                type: 'value',
                text: v
              };
            }));
          }
        }]);

        return SumologicDatasource;
      }());

      _export('SumologicDatasource', SumologicDatasource);
    }
  };
});
//# sourceMappingURL=datasource.js.map
